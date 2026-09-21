-- Measurable operating goals. Existing task/content/CRM ledgers remain authoritative.
-- All mutations and their receipts commit together; automatic measurements are read-only.
begin;
create extension if not exists pgcrypto;
create table if not exists public.operating_objectives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 300),
  description text not null default '' check(length(description)<=4000),
  scope text not null check(scope in ('personal','company')),
  period_start date not null, period_end date not null,
  timezone text not null,
  status text not null default 'active' check(status in ('active','archived')),
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(period_start between date '0001-01-01' and date '9999-12-31' and period_end between period_start and date '9999-12-31'),
  unique(workspace_id,id)
);
create table if not exists public.operating_metrics (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  objective_id uuid not null,
  name text not null check(length(btrim(name)) between 1 and 300),
  unit text not null check(length(btrim(unit)) between 1 and 40),
  role text not null check(role in ('outcome','driver','guardrail')),
  direction text not null check(direction in ('increase','decrease','range')),
  baseline numeric, target numeric, target_min numeric, target_max numeric,
  source_key text not null check(source_key in ('manual','tasks_completed','contacts_recorded','content_published','reviews_completed')),
  status text not null default 'active' check(status in ('active','archived')),
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  foreign key(workspace_id,objective_id) references public.operating_objectives(workspace_id,id),
  unique(workspace_id,id),
  check(baseline is null or abs(baseline)<=1e15), check(target is null or abs(target)<=1e15),
  check(target_min is null or abs(target_min)<=1e15), check(target_max is null or abs(target_max)<=1e15),
  check((direction='range' and target is null and ((target_min is null and target_max is null) or (target_min is not null and target_max is not null and target_min<=target_max)))
    or (direction in ('increase','decrease') and target_min is null and target_max is null
      and (baseline is null or target is null or (direction='increase' and target>=baseline) or (direction='decrease' and target<=baseline))))
);
create table if not exists public.operating_observations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  metric_id uuid not null, value numeric,
  observed_at timestamptz not null, period_start date not null, period_end date not null,
  coverage text not null check(coverage in ('complete','partial','unmeasured')),
  evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=20),
  note text not null default '' check(length(note)<=4000),
  source_key text not null default 'manual' check(source_key='manual'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(workspace_id,metric_id) references public.operating_metrics(workspace_id,id),
  check(value is null or abs(value)<=1e15),
  check((coverage='complete' and value is not null and jsonb_array_length(evidence)>0) or coverage='partial' or (coverage='unmeasured' and value is null)),
  check(period_start<=period_end), unique(workspace_id,id)
);
create table if not exists public.operating_goal_links (
  workspace_id uuid not null, objective_id uuid not null,
  entity_type text not null check(entity_type in ('projects','tasks','campaigns','brands','content_items','deals','leads','customer_accounts','memos','journal_entries')),
  entity_id uuid not null, created_at timestamptz not null default clock_timestamp(),
  foreign key(workspace_id,objective_id) references public.operating_objectives(workspace_id,id),
  primary key(workspace_id,objective_id,entity_type,entity_id)
);
create table if not exists public.operating_goal_receipts (
  workspace_id uuid not null references public.workspaces(id),
  actor_id text not null, command_id uuid not null,
  request_hash text not null, response jsonb not null,
  before_snapshot jsonb, created_at timestamptz not null default clock_timestamp(),
  primary key(workspace_id,actor_id,command_id)
);
create index if not exists operating_objectives_scope_idx on public.operating_objectives(workspace_id,scope,status,created_at desc,id);
create index if not exists operating_metrics_objective_idx on public.operating_metrics(workspace_id,objective_id,status);
create index if not exists operating_observations_latest_idx on public.operating_observations(workspace_id,metric_id,period_start,period_end,created_at desc,id desc);
create index if not exists operating_goal_links_entity_idx on public.operating_goal_links(workspace_id,entity_type,entity_id);
alter table public.operating_objectives enable row level security;
alter table public.operating_metrics enable row level security;
alter table public.operating_observations enable row level security;
alter table public.operating_goal_links enable row level security;
alter table public.operating_goal_receipts enable row level security;
revoke all on public.operating_objectives,public.operating_metrics,public.operating_observations,public.operating_goal_links,public.operating_goal_receipts from public,anon,authenticated,service_role;
grant select on public.operating_objectives,public.operating_metrics,public.operating_observations,public.operating_goal_links to service_role;

create or replace function public.operating_goal_immutable_v1() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_table_name='operating_observations' then raise exception 'observations-append-only'; end if;
  if tg_table_name='operating_metrics' and (to_jsonb(new)-array['status','revision','updated_at']) is distinct from (to_jsonb(old)-array['status','revision','updated_at']) then raise exception 'metric-definition-immutable'; end if;
  if tg_table_name='operating_objectives' and (new.workspace_id,new.scope,new.period_start,new.period_end,new.timezone) is distinct from (old.workspace_id,old.scope,old.period_start,old.period_end,old.timezone) then raise exception 'objective-period-immutable'; end if;
  return new;
end; $$;
drop trigger if exists operating_observations_immutable on public.operating_observations;
create trigger operating_observations_immutable before update or delete on public.operating_observations for each row execute function public.operating_goal_immutable_v1();
drop trigger if exists operating_metrics_immutable on public.operating_metrics;
create trigger operating_metrics_immutable before update on public.operating_metrics for each row execute function public.operating_goal_immutable_v1();
drop trigger if exists operating_objectives_immutable on public.operating_objectives;
create trigger operating_objectives_immutable before update on public.operating_objectives for each row execute function public.operating_goal_immutable_v1();
revoke all on function public.operating_goal_immutable_v1() from public,anon,authenticated,service_role;

create or replace function public.operating_goal_project_v1(p_kind text,p_row jsonb) returns jsonb language sql immutable set search_path=pg_catalog,public as $$
select case p_kind
when 'objective' then jsonb_build_object('id',p_row->'id','title',p_row->'title','description',p_row->'description','scope',p_row->'scope','periodStart',p_row->'period_start','periodEnd',p_row->'period_end','timezone',p_row->'timezone','status',p_row->'status','revision',p_row->'revision')
when 'metric' then jsonb_build_object('id',p_row->'id','objectiveId',p_row->'objective_id','name',p_row->'name','unit',p_row->'unit','role',p_row->'role','direction',p_row->'direction','baseline',p_row->'baseline','target',p_row->'target','targetMin',p_row->'target_min','targetMax',p_row->'target_max','sourceKey',p_row->'source_key','status',p_row->'status','revision',p_row->'revision')
when 'observation' then jsonb_build_object('id',p_row->'id','metricId',p_row->'metric_id','value',p_row->'value','observedAt',p_row->'observed_at','periodStart',p_row->'period_start','periodEnd',p_row->'period_end','coverage',p_row->'coverage','evidence',p_row->'evidence','note',p_row->'note','sourceKey',p_row->'source_key','createdAt',p_row->'created_at')
else p_row end;
$$;
revoke all on function public.operating_goal_project_v1(text,jsonb) from public,anon,authenticated,service_role;

-- Match source adapters and the canonical CRM account classification. Explicit
-- scope/account kind wins over brand and CRM company fallback. Share locks keep
-- the checked ancestry stable; names/keywords never infer company ownership.
create or replace function public.operating_goal_entity_scope_v1(p_workspace_id uuid,p_type text,p_id uuid,p_seen text[] default '{}')
returns text language plpgsql set search_path=pg_catalog,public as $$
declare v_row jsonb;v_meta jsonb;v_value text;v_identity text:=p_type||':'||p_id::text;v_table text;v_crm boolean:=p_type in ('deals','leads','customer_accounts');
begin
  if p_type not in ('projects','tasks','campaigns','brands','content_items','deals','leads','customer_accounts','memos','journal_entries') or cardinality(p_seen)>6 or v_identity=any(p_seen) then return null; end if;
  v_table:=case when p_type='memos' then 'journal_entries' else p_type end;
  if to_regclass('public.'||v_table) is null then return null; end if;
  execute format('select to_jsonb(t) from public.%I t where workspace_id=$1 and id=$2 for share',v_table) into v_row using p_workspace_id,p_id;
  if v_row is null then return null; end if;
  v_meta:=coalesce(v_row->'meta','{}'::jsonb);
  foreach v_value in array array[v_row->>'org_scope',v_meta->>'org_scope',v_meta->>'workspace'] loop
    if v_value in ('classin','company','business') then return 'company'; end if;
    if v_value in ('personal','brand','individual') then return 'personal'; end if;
  end loop;
  if v_meta->>'lane'='classin_sales' then return 'company'; end if;
  if v_crm then
    v_value:=coalesce(nullif(v_meta->>'account_kind',''),nullif(v_meta->>'type',''),nullif(v_meta->>'kind',''));
    if v_value in ('individual','personal','brand') then return 'personal'; end if;
    if v_value in ('company','business','classin') then return 'company'; end if;
  else
    foreach v_value in array array[v_meta->>'type',v_row->>'type'] loop
      if v_value in ('classin','company','business') then return 'company'; end if;
      if v_value in ('personal','brand','individual') then return 'personal'; end if;
    end loop;
  end if;
  if p_type='brands' then return case when v_row->>'slug' in ('classmoon','studyseagull','classin_side') then 'company' else 'personal' end; end if;
  if v_row->>'brand_id' is not null then return public.operating_goal_entity_scope_v1(p_workspace_id,'brands',(v_row->>'brand_id')::uuid,p_seen||v_identity); end if;
  v_value:=coalesce(nullif(v_meta->>'brand',''),nullif(v_meta->>'brand_key',''),nullif(v_meta->>'brandKey',''),nullif(v_meta->>'brand_slug',''),nullif(v_row->>'brand',''));
  if v_value is not null then return case when v_value in ('classmoon','studyseagull','classin_side') then 'company' else 'personal' end; end if;
  if p_type='tasks' and v_row->>'project_id' is not null then return public.operating_goal_entity_scope_v1(p_workspace_id,'projects',(v_row->>'project_id')::uuid,p_seen||v_identity); end if;
  if v_crm and nullif(v_row->>'company_id','') is not null then return 'company'; end if;
  return 'personal';
end; $$;
revoke all on function public.operating_goal_entity_scope_v1(uuid,text,uuid,text[]) from public,anon,authenticated,service_role;

create or replace function public.operating_goal_command_v1(p_workspace_id uuid,p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_id uuid; v_action text:=p_command->>'action'; v_input jsonb:=p_command->'input';
  v_hash text; v_receipt public.operating_goal_receipts%rowtype;
  v_objective public.operating_objectives%rowtype; v_metric public.operating_metrics%rowtype;
  v_observation public.operating_observations%rowtype; v_entity jsonb; v_before jsonb;
  v_expected bigint; v_kind text; v_exists boolean; v_table text; v_evidence jsonb;
  v_error jsonb:=jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command');
begin
  if p_workspace_id is null or p_actor_id is null or p_actor_id!~'^[a-zA-Z0-9._:@/-]{1,128}$'
    or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>65536
    or (p_command-array['commandId','action','expectedRevision','input'])<>'{}'::jsonb
    or jsonb_typeof(v_input) is distinct from 'object' or v_action is null
    or v_action not in ('create_objective','update_objective','create_metric','archive_metric','record_observation','link_entity','unlink_entity')
    or p_command->>'commandId' is null then return v_error; end if;
  v_id:=(p_command->>'commandId')::uuid;
  perform 1 from public.workspaces where id=p_workspace_id;
  if not found then return v_error||jsonb_build_object('error','workspace-unavailable'); end if;
  v_hash:=encode(public.digest(p_command::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_actor_id||':'||v_id::text,0));
  select * into v_receipt from public.operating_goal_receipts where workspace_id=p_workspace_id and actor_id=p_actor_id and command_id=v_id;
  if found then
    if v_receipt.request_hash<>v_hash then return jsonb_build_object('status','conflict','persisted',false,'error','command-id-reused','commandId',v_id); end if;
    return v_receipt.response||jsonb_build_object('replayed',true);
  end if;
  if v_action in ('update_objective','archive_metric','link_entity','unlink_entity') then
    if jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or (p_command->>'expectedRevision')!~'^[1-9][0-9]*$' then return v_error||jsonb_build_object('error','invalid-revision'); end if;
    v_expected:=(p_command->>'expectedRevision')::bigint;
    if v_expected>9007199254740991 then return v_error; end if;
  elsif p_command ? 'expectedRevision' then return v_error; end if;

  if v_action='create_objective' then
    if (v_input-array['title','description','scope','periodStart','periodEnd','timezone'])<>'{}'::jsonb
      or jsonb_typeof(v_input->'title') is distinct from 'string'
      or (v_input ? 'description' and jsonb_typeof(v_input->'description') is distinct from 'string')
      or coalesce(v_input->>'periodStart','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(v_input->>'periodEnd','')!~'^\d{4}-\d{2}-\d{2}$'
      or not exists(select 1 from pg_timezone_names where name=v_input->>'timezone') then return v_error; end if;
    insert into public.operating_objectives(workspace_id,title,description,scope,period_start,period_end,timezone)
      values(p_workspace_id,btrim(v_input->>'title'),coalesce(v_input->>'description',''),v_input->>'scope',(v_input->>'periodStart')::date,(v_input->>'periodEnd')::date,v_input->>'timezone') returning * into v_objective;
    v_entity:=public.operating_goal_project_v1('objective',to_jsonb(v_objective));
  elsif v_action in ('update_objective','create_metric','link_entity','unlink_entity') then
    select * into v_objective from public.operating_objectives where workspace_id=p_workspace_id and id=(case when v_action='update_objective' then v_input->>'id' else v_input->>'objectiveId' end)::uuid for update;
    if not found then return v_error||jsonb_build_object('error','objective-not-found'); end if;
    v_before:=public.operating_goal_project_v1('objective',to_jsonb(v_objective));
    if v_expected is not null and v_expected<>v_objective.revision then return jsonb_build_object('status','conflict','persisted',false,'error','stale-revision','entity',v_before); end if;
    if v_action not in ('update_objective','unlink_entity') and v_objective.status<>'active' then return v_error||jsonb_build_object('error','objective-archived'); end if;
    if v_action='update_objective' then
      if (v_input-array['id','title','description','status'])<>'{}'::jsonb or v_input-'id'='{}'::jsonb
        or (v_input ? 'title' and jsonb_typeof(v_input->'title') is distinct from 'string')
        or (v_input ? 'description' and jsonb_typeof(v_input->'description') is distinct from 'string') then return v_error; end if;
      update public.operating_objectives set title=case when v_input?'title' then btrim(v_input->>'title') else title end,
        description=case when v_input?'description' then v_input->>'description' else description end,
        status=case when v_input?'status' then v_input->>'status' else status end,revision=revision+1,updated_at=clock_timestamp()
        where workspace_id=p_workspace_id and id=v_objective.id returning * into v_objective;
      v_entity:=public.operating_goal_project_v1('objective',to_jsonb(v_objective));
    elsif v_action='create_metric' then
      if (v_input-array['objectiveId','name','unit','role','direction','baseline','target','targetMin','targetMax','sourceKey'])<>'{}'::jsonb
        or jsonb_typeof(v_input->'name') is distinct from 'string' or jsonb_typeof(v_input->'unit') is distinct from 'string' then return v_error; end if;
      foreach v_kind in array array['baseline','target','targetMin','targetMax'] loop
        if v_input?v_kind and jsonb_typeof(v_input->v_kind) not in ('number','null') then return v_error; end if;
      end loop;
      insert into public.operating_metrics(workspace_id,objective_id,name,unit,role,direction,baseline,target,target_min,target_max,source_key)
        values(p_workspace_id,v_objective.id,btrim(v_input->>'name'),btrim(v_input->>'unit'),v_input->>'role',v_input->>'direction',(v_input->>'baseline')::numeric,(v_input->>'target')::numeric,(v_input->>'targetMin')::numeric,(v_input->>'targetMax')::numeric,v_input->>'sourceKey') returning * into v_metric;
      v_entity:=public.operating_goal_project_v1('metric',to_jsonb(v_metric));
    else
      if (v_input-array['objectiveId','entityType','entityId'])<>'{}'::jsonb or v_input->>'entityType' is null or v_input->>'entityType' not in ('projects','tasks','campaigns','brands','content_items','deals','leads','customer_accounts','memos','journal_entries') or v_input->>'entityId' is null then return v_error; end if;
      if v_action='link_entity' then
        v_table:=case when v_input->>'entityType'='memos' then 'journal_entries' else v_input->>'entityType' end;
        if to_regclass('public.'||v_table) is null then return v_error||jsonb_build_object('error','entity-unavailable'); end if;
        -- Table name is fixed by the allowlist above; values stay bound parameters.
        execute format('select true from public.%I where workspace_id=$1 and id=$2 for key share',v_table) into v_exists using p_workspace_id,(v_input->>'entityId')::uuid;
        if v_exists is distinct from true then return v_error||jsonb_build_object('error','entity-not-found'); end if;
        if public.operating_goal_entity_scope_v1(p_workspace_id,v_input->>'entityType',(v_input->>'entityId')::uuid) is distinct from v_objective.scope then return v_error||jsonb_build_object('error','entity-scope-mismatch'); end if;
        insert into public.operating_goal_links(workspace_id,objective_id,entity_type,entity_id) values(p_workspace_id,v_objective.id,v_input->>'entityType',(v_input->>'entityId')::uuid) on conflict do nothing;
      -- Unlink acts on the objective's relation, so a deleted source must not
      -- prevent cleanup. The objective lock, workspace and CAS still apply.
      else delete from public.operating_goal_links where workspace_id=p_workspace_id and objective_id=v_objective.id and entity_type=v_input->>'entityType' and entity_id=(v_input->>'entityId')::uuid; end if;
      update public.operating_objectives set revision=revision+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=v_objective.id returning * into v_objective;
      v_entity:=jsonb_build_object('objectiveId',v_objective.id,'entityType',v_input->>'entityType','entityId',v_input->>'entityId','revision',v_objective.revision,'linked',v_action='link_entity');
    end if;
  else
    -- Lock objective before metric, consistent with all other command branches.
    select o.* into v_objective from public.operating_objectives o join public.operating_metrics m on m.workspace_id=o.workspace_id and m.objective_id=o.id
      where m.workspace_id=p_workspace_id and m.id=(case when v_action='archive_metric' then v_input->>'id' else v_input->>'metricId' end)::uuid for update of o;
    if not found then return v_error||jsonb_build_object('error','metric-not-found'); end if;
    select * into v_metric from public.operating_metrics where workspace_id=p_workspace_id and id=(case when v_action='archive_metric' then v_input->>'id' else v_input->>'metricId' end)::uuid for update;
    v_before:=public.operating_goal_project_v1('metric',to_jsonb(v_metric));
    if v_action='archive_metric' then
      if (v_input-'id')<>'{}'::jsonb then return v_error; end if;
      if v_expected<>v_metric.revision then return jsonb_build_object('status','conflict','persisted',false,'error','stale-revision','entity',v_before); end if;
      update public.operating_metrics set status='archived',revision=revision+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=v_metric.id returning * into v_metric;
      v_entity:=public.operating_goal_project_v1('metric',to_jsonb(v_metric));
    else
      if (v_input-array['metricId','value','observedAt','periodStart','periodEnd','coverage','evidence','note','sourceKey'])<>'{}'::jsonb
        or v_metric.source_key<>'manual' or v_metric.status<>'active' or v_objective.status<>'active'
        or (v_input?'sourceKey' and v_input->>'sourceKey' is distinct from 'manual')
        or jsonb_typeof(v_input->'value') not in ('number','null') or not(v_input?'value')
        or (v_input?'note' and jsonb_typeof(v_input->'note') is distinct from 'string')
        or coalesce(v_input->>'observedAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
        or (v_input->>'observedAt')::timestamptz>clock_timestamp()
        or ((v_input->>'observedAt')::timestamptz at time zone v_objective.timezone)::date<v_objective.period_start
        or coalesce(v_input->>'periodStart','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(v_input->>'periodEnd','')!~'^\d{4}-\d{2}-\d{2}$'
        or (v_input->>'periodStart')::date is distinct from v_objective.period_start or (v_input->>'periodEnd')::date is distinct from v_objective.period_end
        or jsonb_typeof(v_input->'evidence') is distinct from 'array' then return v_error||jsonb_build_object('error','invalid-observation'); end if;
      for v_evidence in select value from jsonb_array_elements(v_input->'evidence') loop
        if jsonb_typeof(v_evidence) is distinct from 'object' or (v_evidence-array['type','label','href','occurredAt'])<>'{}'::jsonb
          or (v_evidence?'type' and v_evidence->>'type' is distinct from 'manual')
          or jsonb_typeof(v_evidence->'label') is distinct from 'string' or length(btrim(v_evidence->>'label')) not between 1 and 300
          or length(coalesce(v_evidence->>'href','')) not between 1 and 2048
          or coalesce(v_evidence->>'href','')!~'^(https?://[^/@[:space:]]+|/dashboard([/?#]|$))'
          or (v_evidence->>'href')~'[[:cntrl:]\\]' or (v_evidence->>'href')~'^https?://[^/]*@'
          or coalesce(v_evidence->>'occurredAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then return v_error||jsonb_build_object('error','invalid-evidence'); end if;
        perform (v_evidence->>'occurredAt')::timestamptz;
        if (v_evidence->>'occurredAt')::timestamptz>(v_input->>'observedAt')::timestamptz then return v_error||jsonb_build_object('error','evidence-after-observation'); end if;
      end loop;
      insert into public.operating_observations(workspace_id,metric_id,value,observed_at,period_start,period_end,coverage,evidence,note)
        values(p_workspace_id,v_metric.id,(v_input->>'value')::numeric,(v_input->>'observedAt')::timestamptz,(v_input->>'periodStart')::date,(v_input->>'periodEnd')::date,v_input->>'coverage',v_input->'evidence',coalesce(v_input->>'note','')) returning * into v_observation;
      v_entity:=public.operating_goal_project_v1('observation',to_jsonb(v_observation));
    end if;
  end if;
  v_entity:=jsonb_build_object('status','saved','persisted',true,'replayed',false,'commandId',v_id,'entity',v_entity);
  insert into public.operating_goal_receipts(workspace_id,actor_id,command_id,request_hash,response,before_snapshot) values(p_workspace_id,p_actor_id,v_id,v_hash,v_entity,v_before);
  return v_entity;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation or numeric_value_out_of_range then
  return v_error;
end; $$;

create or replace function public.operating_goal_receipt_v1(p_workspace_id uuid,p_actor_id text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_response jsonb;
begin
  select response into v_response from public.operating_goal_receipts where workspace_id=p_workspace_id and actor_id=p_actor_id and command_id=p_command_id;
  return coalesce(v_response||jsonb_build_object('replayed',true),jsonb_build_object('status','error','error','receipt-not-found','persisted',null,'commandId',p_command_id,'nextAction','get_goal_command_receipt'));
end; $$;
revoke all on function public.operating_goal_command_v1(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.operating_goal_receipt_v1(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.operating_goal_command_v1(uuid,text,jsonb) to service_role;
grant execute on function public.operating_goal_receipt_v1(uuid,text,uuid) to service_role;
commit;
