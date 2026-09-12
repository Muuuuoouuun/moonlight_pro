-- Opportunity discovery is an exploratory ledger, separate from CRM leads/deals.
begin;
create table if not exists public.discovery_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  revision bigint not null check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id)
);
create index if not exists discovery_records_workspace_updated_idx on public.discovery_records(workspace_id,updated_at desc,id);
create table if not exists public.discovery_revisions (
  workspace_id uuid not null,
  record_id uuid not null,
  revision bigint not null,
  snapshot jsonb not null,
  updated_at timestamptz not null,
  primary key(workspace_id,record_id,revision),
  foreign key(workspace_id,record_id) references public.discovery_records(workspace_id,id) on delete cascade
);
create table if not exists public.discovery_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  record_id uuid not null,
  request_payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,request_id),
  foreign key(workspace_id,record_id) references public.discovery_records(workspace_id,id) on delete cascade
);
alter table public.discovery_records enable row level security;
alter table public.discovery_revisions enable row level security;
alter table public.discovery_receipts enable row level security;
revoke all on public.discovery_records,public.discovery_revisions,public.discovery_receipts from public,anon,authenticated,service_role;
-- All writes go through the RPC so audit history cannot accidentally be bypassed.
grant select on public.discovery_records,public.discovery_revisions,public.discovery_receipts to service_role;

create or replace function public.save_discovery_v1(p_workspace_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_id uuid; v_request uuid; v_expected bigint; v_date date;
  v_key text; v_link jsonb; v_target uuid; v_title text; v_href text; v_target_exists boolean;
  v_links jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_record public.discovery_records%rowtype;
  v_receipt public.discovery_receipts%rowtype;
  v_response jsonb;
  v_invalid jsonb := '{"status":"invalid-input","record":null}'::jsonb;
begin
  if p_workspace_id is null or not exists(select 1 from public.workspaces where id=p_workspace_id)
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not p_payload ?& array['id','requestId','expectedRevision','title','orgScope','discoveryMode','status','evidence','hypothesis','experiment','findings','decisionReason','resumeCondition','reviewDate','links']
    or (p_payload - array['id','requestId','expectedRevision','title','orgScope','discoveryMode','status','evidence','hypothesis','experiment','findings','decisionReason','resumeCondition','reviewDate','links']) <> '{}'::jsonb
  then return v_invalid; end if;
  begin
    if jsonb_typeof(p_payload->'requestId')<>'string' or (p_payload->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (p_payload->'id'<>'null'::jsonb and (jsonb_typeof(p_payload->'id')<>'string' or (p_payload->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      or jsonb_typeof(p_payload->'expectedRevision')<>'number' or (p_payload->>'expectedRevision') !~ '^[0-9]+$'
    then return v_invalid;end if;
    v_id:=(p_payload->>'id')::uuid;v_request:=(p_payload->>'requestId')::uuid;v_expected:=(p_payload->>'expectedRevision')::bigint;
    if v_expected<0 or v_expected>=9007199254740991 or (v_id is null and v_expected<>0) then return v_invalid;end if;
    if jsonb_typeof(p_payload->'title')<>'string' or length(p_payload->>'title')>300 or (p_payload->>'title') ~ '^[[:space:]]*$'
      or (p_payload->>'orgScope') is null or (p_payload->>'orgScope') not in ('personal','classin')
      or (p_payload->>'discoveryMode') is null or (p_payload->>'discoveryMode') not in ('capture','research')
      or (p_payload->>'status') is null or (p_payload->>'status') not in ('captured','exploring','validating','connected','paused','closed')
    then return v_invalid;end if;
    foreach v_key in array array['evidence','hypothesis','experiment','findings','decisionReason','resumeCondition'] loop
      if jsonb_typeof(p_payload->v_key)<>'string' or length(p_payload->>v_key)>4000 then return v_invalid;end if;
    end loop;
    if p_payload->'reviewDate'<>'null'::jsonb then
      if jsonb_typeof(p_payload->'reviewDate')<>'string' or (p_payload->>'reviewDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return v_invalid;end if;
      v_date:=(p_payload->>'reviewDate')::date;
      if v_date<date '0001-01-01' or v_date>date '9999-12-31' then return v_invalid;end if;
    end if;
    if (p_payload->>'status'='paused' and v_date is null and (p_payload->>'resumeCondition') ~ '^[[:space:]]*$')
      or (p_payload->>'status'='closed' and (p_payload->>'decisionReason') ~ '^[[:space:]]*$')
      or jsonb_typeof(p_payload->'links')<>'array' then return v_invalid;end if;
    if jsonb_array_length(p_payload->'links')>30 then return v_invalid;end if;
    for v_link in select value from jsonb_array_elements(p_payload->'links') loop
      if jsonb_typeof(v_link)<>'object' or not v_link ?& array['type','id'] or (v_link-array['type','id'])<>'{}'::jsonb
        or (v_link->>'type') is null or (v_link->>'type') not in ('task','project','lead','deal')
        or jsonb_typeof(v_link->'id')<>'string' or (v_link->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then return v_invalid;end if;
    end loop;
    if (select count(*)<>count(distinct (value->>'type')||':'||lower(value->>'id')) from jsonb_array_elements(p_payload->'links')) then return v_invalid;end if;
    if p_payload->>'status'='connected' and not exists(select 1 from jsonb_array_elements(p_payload->'links') where value->>'type' in ('project','lead','deal')) then return v_invalid;end if;
  exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return v_invalid;
  end;

  -- One request lock followed by one record lock prevents retries/create/edit races.
  perform pg_advisory_xact_lock(hashtextextended('discovery-request:'||p_workspace_id::text||':'||v_request::text,0));
  select * into v_receipt from public.discovery_receipts where workspace_id=p_workspace_id and request_id=v_request;
  if v_receipt.request_id is not null then
    select * into v_record from public.discovery_records where workspace_id=p_workspace_id and id=v_receipt.record_id;
    if v_receipt.request_payload is distinct from p_payload then
      return jsonb_build_object('status','conflict','record',null,'error','request-id-reused');
    end if;
    return jsonb_build_object('status','duplicate','record',to_jsonb(v_record));
  end if;
  v_id:=coalesce(v_id,gen_random_uuid());
  perform pg_advisory_xact_lock(hashtextextended('discovery-record:'||v_id::text,0));
  select * into v_record from public.discovery_records where id=v_id for update;
  if v_record.id is not null and v_record.workspace_id<>p_workspace_id then
    return jsonb_build_object('status','conflict','record',null);
  end if;
  if (v_record.id is null and v_expected<>0) or (v_record.id is not null and v_record.revision<>v_expected) then
    return jsonb_build_object('status','conflict','record',case when v_record.id is null then null else to_jsonb(v_record) end);
  end if;

  -- Lock actual target rows through commit. Caller-supplied labels/URLs are never trusted.
  for v_link in select value from jsonb_array_elements(p_payload->'links') order by value->>'type',value->>'id' loop
    v_target:=(v_link->>'id')::uuid;v_title:=null;v_target_exists:=false;
    case v_link->>'type'
      when 'task' then select title,true into v_title,v_target_exists from public.tasks where id=v_target and workspace_id=p_workspace_id for share;v_href:='/dashboard/work/my?task=';
      when 'project' then select name,true into v_title,v_target_exists from public.projects where id=v_target and workspace_id=p_workspace_id for share;v_href:='/dashboard/work/projects?project=';
      when 'lead' then select name,true into v_title,v_target_exists from public.leads where id=v_target and workspace_id=p_workspace_id for share;v_href:='/dashboard/revenue/leads?lead=';
      when 'deal' then select title,true into v_title,v_target_exists from public.deals where id=v_target and workspace_id=p_workspace_id for share;v_href:='/dashboard/revenue/deals?deal=';
    end case;
    if v_target_exists is distinct from true then return v_invalid;end if;
    -- Match JavaScript String.trim, including Unicode spaces independent of DB locale.
    v_title:=coalesce(nullif(btrim(v_title,E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),''),'이름 없음');
    v_links:=v_links||jsonb_build_array(jsonb_build_object('type',v_link->>'type','id',v_target,'title',v_title,'href',v_href||v_target::text));
  end loop;
  v_snapshot:=(p_payload-array['id','requestId','expectedRevision'])||jsonb_build_object('links',v_links);
  if v_record.id is null then
    insert into public.discovery_records(id,workspace_id,snapshot,revision) values(v_id,p_workspace_id,v_snapshot,1) returning * into v_record;
  else
    update public.discovery_records set snapshot=v_snapshot,revision=revision+1,updated_at=clock_timestamp() where id=v_id and workspace_id=p_workspace_id returning * into v_record;
  end if;
  insert into public.discovery_revisions(workspace_id,record_id,revision,snapshot,updated_at) values(p_workspace_id,v_id,v_record.revision,v_record.snapshot,v_record.updated_at);
  v_response:=jsonb_build_object('status','saved','record',to_jsonb(v_record));
  insert into public.discovery_receipts(workspace_id,request_id,record_id,request_payload,response) values(p_workspace_id,v_request,v_id,p_payload,v_response);
  return v_response;
end;
$$;
revoke all on function public.save_discovery_v1(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_discovery_v1(uuid,jsonb) to service_role;
commit;
