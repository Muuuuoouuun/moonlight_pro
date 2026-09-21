-- Durable Office generation receipts. These are not a second task/CRM ledger.
create table if not exists public.office_requests (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id text not null check (actor_id ~ '^[a-zA-Z0-9._:@/-]{1,128}$'),
  request_hash text not null, request_contract_version text not null,
  intent text not null check (intent in ('weekly_report','customer_reply')),
  owner_id text not null, mode text not null, participants jsonb not null,
  scope text not null check (scope in ('personal','classin')),
  origin_ref jsonb not null, origin_key text not null, context_hash text not null,
  source_refs jsonb not null, input_snapshot jsonb, context_snapshot jsonb,
  state text not null check (state in ('running','generated','error','unknown')),
  attempt_token uuid not null, deadline_at timestamptz not null,
  result jsonb, result_hash text, result_revision integer,
  parent_request_id uuid references public.office_requests(id),
  application jsonb, run_id uuid, log_state text,
  created_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  expires_at timestamptz not null default clock_timestamp() + interval '30 days'
);
create index if not exists office_requests_origin_idx on public.office_requests
  (workspace_id,actor_id,intent,scope,origin_key,created_at desc,id desc);
alter table public.office_requests enable row level security;
revoke all on public.office_requests from public,anon,authenticated,service_role;

create or replace function public.office_identity_valid_v1(p_workspace_id uuid,p_actor_id text)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select p_workspace_id is not null and p_actor_id is not null and p_actor_id ~ '^[a-zA-Z0-9._:@/-]{1,128}$';
$$;
create or replace function public.office_origin_key_v1(p_intent text,p_scope text,p_origin jsonb)
returns text language sql immutable set search_path=pg_catalog as $$
  select p_intent || ':' || p_scope || ':' || p_origin::text;
$$;
-- Private service projection. Hub strips snapshots, attempt token and command
-- payload before returning any receipt to a browser. Expiry redacts immediately,
-- including when the explicit retention sweep has not yet run.
create or replace function public.office_request_envelope_v1(p_row public.office_requests,p_claimed boolean default false)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('status',case when p_row.expires_at <= now() then 'expired'
    when p_row.state='running' and p_row.deadline_at <= now() then 'unknown' else p_row.state end,
    'persisted',true,'claimed',p_claimed,'request',case when p_row.expires_at <= now()
      then to_jsonb(p_row) || jsonb_build_object('input_snapshot',null,'context_snapshot',null,'result',null,'source_refs','[]'::jsonb)
      else to_jsonb(p_row) end);
$$;

create or replace function public.office_request_receipt_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid,p_request jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) then return jsonb_build_object('status','error','error','invalid-context','persisted',false); end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id;
  if not found then return jsonb_build_object('status','not-found','error','request-not-found','persisted',false); end if;
  if p_request is not null and v_row.request_hash <> encode(sha256(convert_to(p_request::text,'UTF8')),'hex') then
    return jsonb_build_object('status','conflict','error','request-id-reuse','persisted',false);
  end if;
  return public.office_request_envelope_v1(v_row);
end; $$;

create or replace function public.office_request_claim_v1(p_workspace_id uuid,p_actor_id text,p_request jsonb,p_context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_id uuid;v_parent uuid;v_hash text;v_intent text;v_scope text;v_origin jsonb;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id)
    or jsonb_typeof(p_request) is distinct from 'object' or jsonb_typeof(p_context) is distinct from 'object'
    -- Wire contracts keep facts at 24 KiB. JSONB text adds formatting spaces;
    -- the storage ceiling includes that overhead instead of rejecting valid JSON.
    or octet_length(p_request::text)>100000 or octet_length((p_context->'facts')::text)>49152 then
    return jsonb_build_object('status','invalid-input','error','invalid-request','persisted',false);
  end if;
  v_id:=(p_request->>'requestId')::uuid;v_parent:=(p_request->>'parentRequestId')::uuid;
  v_intent:=p_request->>'intent';v_scope:=p_request->>'scope';v_origin:=p_request->'originRef';
  if v_id is null or v_intent not in ('weekly_report','customer_reply') or v_scope not in ('classin','personal')
    or v_intent is null or v_scope is null or jsonb_typeof(v_origin) is distinct from 'object'
    or p_context->>'scope' is distinct from v_scope or p_context->'originRef' is distinct from v_origin
    or p_context->>'contextHash' is distinct from p_request->>'expectedContextHash'
    or coalesce(p_context->>'contextHash','') !~ '^[0-9a-f]{64}$'
    or p_context->>'status' is distinct from 'ready' or p_context->'capabilities'->>'generate' is distinct from 'true' then
    return jsonb_build_object('status','invalid-input','error','invalid-request-context','persisted',false);
  end if;
  v_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('office:'||v_id::text,0));
  select * into v_row from public.office_requests where id=v_id;
  if found then
    if v_row.workspace_id<>p_workspace_id or v_row.actor_id<>p_actor_id or v_row.request_hash<>v_hash then
      return jsonb_build_object('status','conflict','error','request-id-reuse','persisted',false);
    end if;
    return public.office_request_envelope_v1(v_row);
  end if;
  if v_parent is not null then
    perform 1 from public.office_requests where id=v_parent and workspace_id=p_workspace_id and actor_id=p_actor_id
      and scope=v_scope and intent=v_intent and origin_ref=v_origin;
    if not found then return jsonb_build_object('status','invalid-input','error','invalid-parent','persisted',false); end if;
  end if;
  insert into public.office_requests(id,workspace_id,actor_id,request_hash,request_contract_version,intent,owner_id,mode,participants,scope,
    origin_ref,origin_key,context_hash,source_refs,input_snapshot,context_snapshot,state,attempt_token,deadline_at,parent_request_id)
  values(v_id,p_workspace_id,p_actor_id,v_hash,'2026-09-21.v1',v_intent,p_request->>'ownerId',p_request->>'mode',p_request->'participants',v_scope,
    v_origin,public.office_origin_key_v1(v_intent,v_scope,v_origin),p_context->>'contextHash',p_context->'sourceRefs',p_request,p_context,
    'running',gen_random_uuid(),clock_timestamp()+interval '60 seconds',v_parent) returning * into v_row;
  return public.office_request_envelope_v1(v_row,true);
exception when invalid_text_representation or not_null_violation or check_violation or foreign_key_violation then
  return jsonb_build_object('status','invalid-input','error','invalid-request','persisted',false);
end; $$;

create or replace function public.office_request_finish_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid,p_attempt_token uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_hash text;v_state text:=p_result->>'status';
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) or jsonb_typeof(p_result) is distinct from 'object'
    -- Hub/Engine enforce the 32 KiB wire cap; JSONB formatting has separate room.
    or octet_length(p_result::text)>65536 or v_state is null or v_state not in ('generated','error','unknown') then
    return jsonb_build_object('status','invalid-input','error','invalid-result','persisted',false);
  end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id for update;
  if not found then return jsonb_build_object('status','not-found','error','request-not-found','persisted',false); end if;
  if v_row.attempt_token is distinct from p_attempt_token then return jsonb_build_object('status','conflict','error','attempt-mismatch','persisted',false); end if;
  if v_row.expires_at<=clock_timestamp() then return public.office_request_envelope_v1(v_row); end if;
  v_hash:=encode(sha256(convert_to(p_result::text,'UTF8')),'hex');
  if v_row.state='generated' then
    if v_hash<>v_row.result_hash then return jsonb_build_object('status','conflict','error','result-mismatch','persisted',false); end if;
    return public.office_request_envelope_v1(v_row);
  end if;
  if v_row.state='error' then return public.office_request_envelope_v1(v_row); end if;
  if v_state='generated' and (p_result->>'requestId' is distinct from p_request_id::text
    or p_result->>'ownerId' is distinct from v_row.owner_id or p_result->>'mode' is distinct from v_row.mode
    or p_result->>'scope' is distinct from v_row.scope or p_result->'participants' is distinct from v_row.participants
    or p_result->'context'->>'contextHash' is distinct from v_row.context_hash
    or p_result->>'resultRevision' is distinct from '1' or length(coalesce(p_result->'artifact'->>'body',''))=0) then
    return jsonb_build_object('status','invalid-input','error','result-context-mismatch','persisted',false);
  end if;
  update public.office_requests set state=v_state,result=p_result,result_hash=v_hash,
    result_revision=case when v_state='generated' then 1 end,finished_at=clock_timestamp()
    where id=p_request_id returning * into v_row;
  return public.office_request_envelope_v1(v_row);
end; $$;

create or replace function public.office_request_list_v1(p_workspace_id uuid,p_actor_id text,p_intent text,p_scope text,p_origin_ref jsonb,p_limit integer default 10,p_before jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;v_limit integer:=greatest(1,least(coalesce(p_limit,10),20));v_time timestamptz;v_id uuid;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) or p_intent not in ('weekly_report','customer_reply')
    or p_scope not in ('personal','classin') or jsonb_typeof(p_origin_ref) is distinct from 'object' then
    return jsonb_build_object('status','invalid-input','error','invalid-query');
  end if;
  if p_before is not null then v_time:=(p_before->>'createdAt')::timestamptz;v_id:=(p_before->>'id')::uuid;
    if v_time is null or v_id is null then return jsonb_build_object('status','invalid-input','error','invalid-cursor'); end if;
  end if;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_rows from (
    select id,created_at,public.office_request_envelope_v1(r)-'request' || jsonb_build_object('request',jsonb_build_object(
      'id',id,'created_at',created_at,'owner_id',owner_id,'mode',mode,'participants',participants,'scope',scope,'intent',intent,'origin_ref',origin_ref,
      'state',state,'expires_at',expires_at,'result_revision',result_revision,'parent_request_id',parent_request_id,
      'application',case when application is null then null else application-array['command','payloadHash','sourceRefs','expectedScope'] end)) as item
    from public.office_requests r where workspace_id=p_workspace_id and actor_id=p_actor_id and intent=p_intent and scope=p_scope
      and origin_key=public.office_origin_key_v1(p_intent,p_scope,p_origin_ref)
      and (p_before is null or (created_at,id)<(v_time,v_id)) order by created_at desc,id desc limit v_limit+1
  ) rows;
  return jsonb_build_object('status','ready','items',v_rows,'limit',v_limit);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status','invalid-input','error','invalid-cursor');
end; $$;

create or replace function public.office_request_log_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid,p_run_id uuid,p_log_state text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) or p_log_state is null or p_log_state not in ('saved','error','unknown')
    or (p_log_state='saved' and p_run_id is null) then return jsonb_build_object('status','invalid-input','error','invalid-log-state','persisted',false); end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id for update;
  if not found then return jsonb_build_object('status','not-found','error','request-not-found','persisted',false); end if;
  if v_row.log_state is distinct from 'saved' then
    update public.office_requests set run_id=p_run_id,log_state=p_log_state where id=p_request_id returning * into v_row;
  end if;
  return public.office_request_envelope_v1(v_row);
end; $$;

create or replace function public.office_application_claim_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid,p_result_revision integer,p_command jsonb,p_source_refs jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_command_id uuid;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) then return jsonb_build_object('status','error','error','invalid-context','persisted',false); end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id for update;
  if not found then return jsonb_build_object('status','not-found','error','request-not-found','persisted',false); end if;
  -- Existing commands survive body expiry and new source versions.
  if v_row.application is not null then return public.office_request_envelope_v1(v_row); end if;
  if v_row.expires_at<=clock_timestamp() then return public.office_request_envelope_v1(v_row); end if;
  if v_row.state<>'generated' or v_row.result_revision is distinct from p_result_revision
    or v_row.context_snapshot->'capabilities'->>'applyTask' is distinct from 'true' then
    return jsonb_build_object('status','conflict','error','result-not-applicable','persisted',false);
  end if;
  v_command_id:=(p_command->>'commandId')::uuid;
  if jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>32768
    or v_command_id is null or p_command->>'targetId' is distinct from v_command_id::text or p_command->>'action' is distinct from 'create_task'
    or p_command->'payload'->>'project_id' is null or jsonb_typeof(p_source_refs) is distinct from 'array'
    or jsonb_array_length(p_source_refs) not between 1 and 4 then
    return jsonb_build_object('status','invalid-input','error','invalid-application','persisted',false);
  end if;
  update public.office_requests set application=jsonb_build_object('state','pending','commandId',v_command_id,
    'command',p_command,'commandContractVersion','agent-command.v1','payloadHash',encode(sha256(convert_to(p_command::text,'UTF8')),'hex'),
    'action','create_task','expectedScope',v_row.scope,'sourceRefs',p_source_refs,'targetRef',jsonb_build_object('type','tasks','id',v_command_id))
    where id=p_request_id returning * into v_row;
  return public.office_request_envelope_v1(v_row,true);
exception when invalid_text_representation then return jsonb_build_object('status','invalid-input','error','invalid-application','persisted',false);
end; $$;

-- The Hub project view recognizes only its canonical org_scope values. Keep
-- this narrow check alongside the broader metric resolver; disagreement closes
-- Office apply instead of silently changing existing product scope rules.
create or replace function public.office_project_hub_scope_v1(p_workspace_id uuid,p_project_id uuid)
returns text language plpgsql set search_path=pg_catalog,public as $$
declare v_project jsonb;v_brand jsonb;v_scope text;
begin
  select to_jsonb(p) into v_project from public.projects p where workspace_id=p_workspace_id and id=p_project_id for share;
  if v_project is null then return null; end if;
  v_scope:=btrim(v_project->'meta'->>'org_scope');
  if v_scope in ('classin','personal') then return v_scope; end if;
  if v_project->>'brand_id' is not null then
    select to_jsonb(b) into v_brand from public.brands b where workspace_id=p_workspace_id and id=(v_project->>'brand_id')::uuid for share;
    if v_brand is null then return null; end if;
    v_scope:=nullif(btrim(v_brand->'meta'->>'org_scope'),'');
    if v_scope is null then v_scope:=case when v_brand->>'slug' in ('classmoon','studyseagull','classin_side') then 'classin' else 'personal' end; end if;
    if v_scope in ('classin','personal') then return v_scope; end if;
  end if;
  return 'personal';
end; $$;

create or replace function public.office_apply_task_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_app jsonb;v_command jsonb;v_id uuid;v_project uuid;v_deal uuid;
  v_receipt public.agent_command_receipts%rowtype;v_result jsonb;v_ref jsonb;v_entity jsonb;v_scope text;v_table text;v_ref_id uuid;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) then return jsonb_build_object('status','error','error','invalid-context','persisted',false); end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id for update;
  if not found or v_row.application is null then return jsonb_build_object('status','not-found','error','application-not-found','persisted',false); end if;
  v_app:=v_row.application;v_command:=v_app->'command';v_id:=(v_app->>'commandId')::uuid;
  -- Same lock as agent_command_v1. A not-found observation before this lock
  -- cannot decide whether a concurrently dispatched command committed.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_actor_id||':'||v_id::text,0));
  select * into v_receipt from public.agent_command_receipts where workspace_id=p_workspace_id and actor_id=p_actor_id and command_id=v_id;
  if found then
    if v_receipt.request_hash is distinct from v_app->>'payloadHash' then
      return jsonb_build_object('status','conflict','error','command-id-reuse','persisted',false);
    end if;
    v_result:=public.agent_command_public_receipt_v1(v_receipt.receipt||jsonb_build_object('replayed',true));
  else
    if v_app->>'state'='rejected' then return jsonb_build_object('status','conflict','error','application-rejected','persisted',false); end if;
    if v_app->>'commandContractVersion' is distinct from 'agent-command.v1' or v_command is null
      or v_app->>'payloadHash' is distinct from encode(sha256(convert_to(v_command::text,'UTF8')),'hex')
      or v_command->>'commandId' is distinct from v_id::text or v_command->>'targetId' is distinct from v_id::text
      or v_command->>'action' is distinct from 'create_task' or v_app->>'expectedScope' is distinct from v_row.scope then
      return jsonb_build_object('status','error','error','invalid-stored-application','persisted',false);
    end if;
    v_project:=(v_command->'payload'->>'project_id')::uuid;v_deal:=(v_command->'payload'->'meta'->>'deal_id')::uuid;
    if v_project is null or not exists(select 1 from jsonb_array_elements(v_app->'sourceRefs') ref where ref->>'type'='projects' and ref->>'id'=v_project::text)
      or (v_deal is not null and not exists(select 1 from jsonb_array_elements(v_app->'sourceRefs') ref where ref->>'type'='deals' and ref->>'id'=v_deal::text)) then
      return jsonb_build_object('status','error','error','missing-target-validation','persisted',false);
    end if;
    -- Reference rows and all scope ancestry remain stable through task commit.
    for v_ref in select value from jsonb_array_elements(v_app->'sourceRefs') order by value->>'type',value->>'id' loop
      v_table:=v_ref->>'type';v_ref_id:=(v_ref->>'id')::uuid;
      if v_table not in ('projects','deals','brands') then return jsonb_build_object('status','invalid-input','error','invalid-target-reference','persisted',false); end if;
      execute format('select to_jsonb(t) from public.%I t where workspace_id=$1 and id=$2 for share',v_table) into v_entity using p_workspace_id,v_ref_id;
      v_scope:=public.operating_goal_entity_scope_v1(p_workspace_id,v_table,v_ref_id);
      if v_entity is null or nullif(v_ref->>'updatedAt','') is null
        or (v_entity->>'updated_at')::timestamptz is distinct from (v_ref->>'updatedAt')::timestamptz
        or (v_table<>'brands' and v_scope is distinct from case when v_row.scope='classin' then 'company' else 'personal' end) then
        update public.office_requests set application=application||jsonb_build_object('state','rejected','error','target-changed') where id=p_request_id;
        return jsonb_build_object('status','conflict','error','target-changed','persisted',false,'commandId',v_id);
      end if;
    end loop;
    if public.office_project_hub_scope_v1(p_workspace_id,v_project) is distinct from v_row.scope then
      update public.office_requests set application=application||jsonb_build_object('state','rejected','error','scope-rules-disagree') where id=p_request_id;
      return jsonb_build_object('status','conflict','error','scope-rules-disagree','persisted',false,'commandId',v_id);
    end if;
    v_result:=public.agent_command_v1(p_workspace_id,p_actor_id,array['read','tasks:write'],v_command);
  end if;
  if v_result->>'status'<>'saved' and v_result->>'persisted'='false' then
    update public.office_requests set application=application||jsonb_build_object('state','rejected','error',v_result->>'error') where id=p_request_id;
  end if;
  return v_result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status','invalid-input','error','invalid-stored-application','persisted',false);
end; $$;

-- Office screen state is a separate transaction from the task write. Losing
-- this update never invalidates the existing command receipt and never dispatches.
create or replace function public.office_application_refresh_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_receipt public.agent_command_receipts%rowtype;v_result jsonb;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) then return jsonb_build_object('status','error','error','invalid-context','persisted',false); end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id for update;
  if not found then return jsonb_build_object('status','not-found','error','request-not-found','persisted',false); end if;
  if v_row.application is not null then
    select * into v_receipt from public.agent_command_receipts where workspace_id=p_workspace_id and actor_id=p_actor_id and command_id=(v_row.application->>'commandId')::uuid;
    if found and v_receipt.request_hash=v_row.application->>'payloadHash' then
      v_result:=public.agent_command_public_receipt_v1(v_receipt.receipt||jsonb_build_object('replayed',true));
      -- Only the linkage belongs here. Do not copy task titles/receipt bodies
      -- back into expired Office tombstones whenever a user reads their status.
      update public.office_requests set application=(application-'receipt')||jsonb_build_object('state','saved','entityId',v_result->'entity'->>'id')
        where id=p_request_id returning * into v_row;
    end if;
  end if;
  return public.office_request_envelope_v1(v_row);
end; $$;

-- Explicit maintenance operation; no new scheduler is installed. Pending or
-- unknown application payloads survive until their command receipt is resolved.
create or replace function public.office_requests_expire_v1(p_now timestamptz default clock_timestamp())
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
  update public.office_requests set input_snapshot=null,context_snapshot=null,result=null,source_refs='[]'::jsonb,
    application=case when application->>'state' in ('saved','rejected') then application-array['command','sourceRefs','receipt'] else application end
    where expires_at<=p_now and (input_snapshot is not null or context_snapshot is not null or result is not null
      or source_refs<>'[]'::jsonb
      or (application->>'state' in ('saved','rejected') and (application ? 'command' or application ? 'sourceRefs' or application ? 'receipt')));
  get diagnostics v_count=row_count;return v_count;
end; $$;

revoke all on function public.office_identity_valid_v1(uuid,text),public.office_origin_key_v1(text,text,jsonb),public.office_request_envelope_v1(public.office_requests,boolean) from public,anon,authenticated,service_role;
revoke all on function public.office_project_hub_scope_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.office_request_log_v1(uuid,text,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.office_request_log_v1(uuid,text,uuid,uuid,text) to service_role;
revoke all on function public.office_request_receipt_v1(uuid,text,uuid,jsonb),public.office_request_claim_v1(uuid,text,jsonb,jsonb),public.office_request_finish_v1(uuid,text,uuid,uuid,jsonb),public.office_request_list_v1(uuid,text,text,text,jsonb,integer,jsonb),public.office_application_claim_v1(uuid,text,uuid,integer,jsonb,jsonb),public.office_apply_task_v1(uuid,text,uuid),public.office_application_refresh_v1(uuid,text,uuid),public.office_requests_expire_v1(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.office_request_receipt_v1(uuid,text,uuid,jsonb),public.office_request_claim_v1(uuid,text,jsonb,jsonb),public.office_request_finish_v1(uuid,text,uuid,uuid,jsonb),public.office_request_list_v1(uuid,text,text,text,jsonb,integer,jsonb),public.office_application_claim_v1(uuid,text,uuid,integer,jsonb,jsonb),public.office_apply_task_v1(uuid,text,uuid),public.office_application_refresh_v1(uuid,text,uuid),public.office_requests_expire_v1(timestamptz) to service_role;
