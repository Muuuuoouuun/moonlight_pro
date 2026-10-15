-- Frozen measured reports and operator decisions. AI originals stay in Office.
create table if not exists public.report_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('weekly','evaluation','qa')),
  scope text not null check (scope in ('personal','company','content')),
  title text not null check (length(title) between 1 and 180),
  period_start date, period_end date,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  decision text not null default '' check (length(decision)<=5000),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,source_key),
  check ((kind='weekly' and scope in ('personal','company') and period_start is not null and period_end is not null and period_end>=period_start and period_end-period_start<31)
    or (kind<>'weekly' and period_start is null and period_end is null))
);
create index if not exists report_documents_created_idx on public.report_documents(workspace_id,created_at desc,id desc);
create table if not exists public.report_command_receipts (
  request_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.report_documents enable row level security;
alter table public.report_command_receipts enable row level security;
revoke all on public.report_documents,public.report_command_receipts from public,anon,authenticated,service_role;
grant select on public.report_documents to service_role;

create or replace function public.report_command_v1(p_workspace_id uuid,p_request_id uuid,p_request_hash text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_receipt public.report_command_receipts%rowtype;v_row public.report_documents%rowtype;v_result jsonb;
  v_action text;v_scope text;v_kind text;v_key text;v_start date;v_end date;v_id uuid;v_expected integer;
begin
  if p_workspace_id is null or p_request_id is null or coalesce(p_request_hash,'') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>180000 then
    return jsonb_build_object('status','invalid-input','error','invalid-report-command');
  end if;
  perform 1 from public.workspaces where id=p_workspace_id;
  if not found then return jsonb_build_object('status','invalid-input','error','invalid-workspace');end if;
  perform pg_advisory_xact_lock(hashtextextended('report-request:'||p_request_id::text,0));
  select * into v_receipt from public.report_command_receipts where request_id=p_request_id;
  if found then
    if v_receipt.workspace_id<>p_workspace_id or v_receipt.request_hash<>p_request_hash then
      return jsonb_build_object('status','conflict','error','request-id-reuse');
    end if;
    return v_receipt.result||jsonb_build_object('status','duplicate');
  end if;
  v_action:=p_command->>'action';
  if v_action='record-decision' then
    v_id:=(p_command->>'reportId')::uuid;v_expected:=(p_command->>'expectedRevision')::integer;
    if v_id is null or v_expected is null or v_expected<1 or jsonb_typeof(p_command->'decision') is distinct from 'string'
      or length(p_command->>'decision')>5000 then return jsonb_build_object('status','invalid-input','error','invalid-decision');end if;
    select * into v_row from public.report_documents where workspace_id=p_workspace_id and id=v_id for update;
    if not found then return jsonb_build_object('status','not-found','error','report-not-found');end if;
    if v_row.revision<>v_expected then return jsonb_build_object('status','conflict','error','stale-revision','revision',v_row.revision);end if;
    update public.report_documents set decision=p_command->>'decision',revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_row;
    v_result:=jsonb_build_object('status','saved','reportId',v_row.id,'revision',v_row.revision);
  elsif v_action in ('capture-weekly','save-document') then
    v_kind:=p_command->>'kind';v_scope:=p_command->>'scope';
    if v_kind is null or v_scope is null or v_scope not in ('personal','company','content')
      or length(coalesce(p_command->>'title','')) not between 1 and 180 or jsonb_typeof(p_command->'payload') is distinct from 'object'
      or jsonb_typeof(p_command->'payload'->'facts') is distinct from 'object' then
      return jsonb_build_object('status','invalid-input','error','invalid-report-payload');end if;
    if v_action='capture-weekly' then
      v_start:=(p_command->>'periodStart')::date;v_end:=(p_command->>'periodEnd')::date;
      if v_kind<>'weekly' or v_scope not in ('personal','company') or v_start is null or v_end is null
        or v_end<v_start or v_end-v_start>=31 or v_end>=(now() at time zone 'Asia/Seoul')::date then
        return jsonb_build_object('status','invalid-input','error','invalid-weekly-period');end if;
      v_key:='weekly:'||v_scope||':'||v_start::text||':'||v_end::text;
    else
      if v_kind not in ('evaluation','qa') or length(coalesce(p_command->'payload'->'facts'->>'body','')) not between 1 and 40000 then
        return jsonb_build_object('status','invalid-input','error','invalid-document');end if;
      v_key:='document:'||p_request_id::text;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('report-source:'||p_workspace_id::text||':'||v_key,0));
    select * into v_row from public.report_documents where workspace_id=p_workspace_id and source_key=v_key;
    if found then v_result:=jsonb_build_object('status','duplicate','reportId',v_row.id,'revision',v_row.revision);
    else
      insert into public.report_documents(workspace_id,source_key,kind,scope,title,period_start,period_end,payload)
        values(p_workspace_id,v_key,v_kind,v_scope,p_command->>'title',v_start,v_end,p_command->'payload') returning * into v_row;
      v_result:=jsonb_build_object('status','saved','reportId',v_row.id,'revision',v_row.revision);
    end if;
  else return jsonb_build_object('status','invalid-input','error','unknown-report-action');end if;
  insert into public.report_command_receipts(request_id,workspace_id,request_hash,result) values(p_request_id,p_workspace_id,p_request_hash,v_result);
  return v_result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('status','invalid-input','error','invalid-report-command');
end;$$;

-- Project only successful, unexpired results belonging to this operator.
-- Never return context/input snapshots, identity keys, attempt tokens or commands.
create or replace function public.report_office_weeklies_v1(p_workspace_id uuid,p_actor_id text,p_limit integer default 51)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  if p_workspace_id is null or coalesce(p_actor_id,'') !~ '^[a-zA-Z0-9._:@/-]{1,128}$' then return jsonb_build_object('status','error','reports','[]'::jsonb);end if;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_rows from (
    select id,created_at,jsonb_build_object('id',id,'scope',scope,'origin_ref',origin_ref,'created_at',created_at,
      'result',jsonb_build_object('summary',result->>'summary','artifact',result->'artifact','evidence',result->'evidence','nextStep',result->'nextStep','context',jsonb_build_object('missing',result->'context'->'missing'))) as item
    from public.office_requests where workspace_id=p_workspace_id and actor_id=p_actor_id and intent='weekly_report' and state='generated' and expires_at>now()
    order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,51),101))
  ) rows;
  return jsonb_build_object('status','live','reports',v_rows);
end;$$;
create or replace function public.report_receipt_v1(p_workspace_id uuid,p_request_id uuid,p_request_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.report_command_receipts%rowtype;
begin
  if p_workspace_id is null or p_request_id is null or coalesce(p_request_hash,'') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid-input','error','invalid-report-request');end if;
  select * into v_row from public.report_command_receipts where request_id=p_request_id;
  if not found then return jsonb_build_object('status','not-found');end if;
  if v_row.workspace_id<>p_workspace_id or v_row.request_hash<>p_request_hash then return jsonb_build_object('status','conflict','error','request-id-reuse');end if;
  return v_row.result||jsonb_build_object('status','duplicate');
end;$$;
revoke all on function public.report_command_v1(uuid,uuid,text,jsonb),public.report_office_weeklies_v1(uuid,text,integer),public.report_receipt_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.report_command_v1(uuid,uuid,text,jsonb),public.report_office_weeklies_v1(uuid,text,integer),public.report_receipt_v1(uuid,uuid,text) to service_role;

-- One transaction and one chronological cursor for all existing report sources.
create or replace function public.report_archive_v1(p_workspace_id uuid,p_actor_id text,p_limit integer default 100,p_before jsonb default null,p_ref text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;v_items jsonb;v_cursor jsonb;v_time timestamptz;v_ref text;
begin
  if p_workspace_id is null or coalesce(p_actor_id,'') !~ '^[a-zA-Z0-9._:@/-]{1,128}$' or p_limit is null or p_limit not between 1 and 100
    or (p_ref is not null and p_ref !~ '^(stored|research|office):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    return jsonb_build_object('status','invalid-input','items','[]'::jsonb);end if;
  if p_before is not null then
    if jsonb_typeof(p_before) is distinct from 'object' then return jsonb_build_object('status','invalid-input','items','[]'::jsonb);end if;
    v_time:=(p_before->>'createdAt')::timestamptz;v_ref:=p_before->>'id';
    if v_time is null or coalesce(v_ref,'') !~ '^(stored|research|office):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','invalid-input','items','[]'::jsonb);end if;
  end if;
  with reports as (
    select d.created_at,'stored:'||d.id::text as ref,'snapshot'::text as source,
      to_jsonb(d)-array['workspace_id','source_key','updated_at'] as row
      from public.report_documents d where d.workspace_id=p_workspace_id
    union all
    select r.created_at,'research:'||r.id::text,'research',b.payload||jsonb_build_object('id',r.id,'brandId',r.brand_id,'createdAt',r.created_at,'state',r.state,
      'promotion',(select jsonb_build_object('content_id',p.content_id,'variant_id',p.variant_id,'destination',p.destination) from public.research_promotions p where p.workspace_id=p_workspace_id and p.brief_id=r.id limit 1))
      from public.research_briefs r join public.research_brief_revisions b on b.brief_id=r.id and b.workspace_id=r.workspace_id and b.revision=r.latest_revision
      where r.workspace_id=p_workspace_id
    union all
    select o.created_at,'office:'||o.id::text,'office',jsonb_build_object('id',o.id,'scope',o.scope,'origin_ref',o.origin_ref,'created_at',o.created_at,
      'result',jsonb_build_object('summary',o.result->>'summary','artifact',o.result->'artifact','evidence',o.result->'evidence','nextStep',o.result->'nextStep','context',jsonb_build_object('missing',o.result->'context'->'missing')))
      from public.office_requests o where o.workspace_id=p_workspace_id and o.actor_id=p_actor_id and o.intent='weekly_report' and o.state='generated' and o.expires_at>now()
  ), page as (
    select * from reports where (p_ref is null or ref=p_ref) and (p_ref is not null or p_before is null or (created_at,ref)<(v_time,v_ref))
      order by created_at desc,ref desc limit p_limit+1
  ) select coalesce(jsonb_agg(jsonb_build_object('source',source,'ref',ref,'createdAt',created_at,'row',row) order by created_at desc,ref desc),'[]'::jsonb) into v_rows from page;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality where ordinality<=p_limit;
  if p_ref is null and jsonb_array_length(v_rows)>p_limit then v_cursor:=jsonb_build_object('createdAt',v_items->(p_limit-1)->>'createdAt','id',v_items->(p_limit-1)->>'ref');end if;
  return jsonb_build_object('status','live','items',v_items,'nextCursor',v_cursor);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status','invalid-input','items','[]'::jsonb);
end;$$;
revoke all on function public.report_archive_v1(uuid,text,integer,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.report_archive_v1(uuid,text,integer,jsonb,text) to service_role;
