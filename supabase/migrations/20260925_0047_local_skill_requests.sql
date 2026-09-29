-- Local skills run on the operator's Mac. Moonlight stores a deliberate request
-- and an execution receipt only; neither this table nor these functions execute
-- a skill or complete a task.
create table if not exists public.local_skill_requests (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operator_id text not null check (operator_id = 'operator'),
  task_id uuid not null,
  scope text not null check (scope in ('classin','personal')),
  instruction text not null check (char_length(instruction) between 1 and 4000),
  expected_evidence text not null check (char_length(expected_evidence) between 1 and 500),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'requested' check (state in ('requested','completed','failed','unconfirmed')),
  receipt jsonb,
  receipt_hash text check (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$'),
  receipt_actor_id text check (receipt_actor_id is null or receipt_actor_id ~ '^[a-zA-Z0-9._:@/-]{1,128}$'),
  receipt_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint local_skill_receipt_consistency check (
    (state = 'requested' and receipt is null and receipt_hash is null and receipt_actor_id is null and receipt_at is null)
    or (state <> 'requested' and jsonb_typeof(receipt) = 'object' and receipt_hash is not null and receipt_actor_id is not null and receipt_at is not null)
  )
);
create index if not exists local_skill_requests_owner_recent_idx
  on public.local_skill_requests(workspace_id, operator_id, created_at desc, id desc);
alter table public.local_skill_requests enable row level security;
revoke all on public.local_skill_requests from public, anon, authenticated, service_role;

create or replace function public.local_skill_request_public_v1(p_row public.local_skill_requests)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('status','ready','persisted',true,'request',jsonb_build_object(
    'requestId',p_row.id,'taskId',p_row.task_id,'scope',p_row.scope,
    'instruction',p_row.instruction,'expectedEvidence',p_row.expected_evidence,
    'state',p_row.state,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at,
    'receiptAt',p_row.receipt_at,'receiptActorId',p_row.receipt_actor_id,
    'receipt',p_row.receipt));
$$;

create or replace function public.local_skill_task_valid_v1(p_workspace_id uuid,p_task_id uuid,p_scope text)
returns boolean language plpgsql set search_path=pg_catalog,public as $$
declare v_scope text;
begin
  perform 1 from public.tasks where workspace_id=p_workspace_id and id=p_task_id;
  if not found then return false; end if;
  v_scope:=public.operating_goal_entity_scope_v1(p_workspace_id,'tasks',p_task_id);
  return v_scope is not distinct from case p_scope when 'classin' then 'company' when 'personal' then 'personal' else null end;
end; $$;

create or replace function public.local_skill_request_create_v1(p_workspace_id uuid,p_operator_id text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;v_task uuid;v_scope text;v_instruction text;v_evidence text;v_hash text;v_row public.local_skill_requests%rowtype;
begin
  if p_operator_id is distinct from 'operator' or p_workspace_id is null
    or jsonb_typeof(p_request) is distinct from 'object'
    or (p_request-array['requestId','taskId','scope','instruction','expectedEvidence']) <> '{}'::jsonb
    or octet_length(p_request::text)>16384 then
    return jsonb_build_object('status','invalid-input','error','invalid-skill-request','persisted',false);
  end if;
  v_id:=(p_request->>'requestId')::uuid;v_task:=(p_request->>'taskId')::uuid;
  v_scope:=p_request->>'scope';v_instruction:=btrim(p_request->>'instruction');v_evidence:=btrim(p_request->>'expectedEvidence');
  if v_id is null or v_task is null or v_scope not in ('classin','personal') or v_scope is null
    or char_length(coalesce(v_instruction,'')) not between 1 and 4000
    or char_length(coalesce(v_evidence,'')) not between 1 and 500 then
    return jsonb_build_object('status','invalid-input','error','invalid-skill-request','persisted',false);
  end if;
  v_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('local-skill:'||p_workspace_id::text||':'||v_id::text,0));
  select * into v_row from public.local_skill_requests where id=v_id;
  if found then
    if v_row.workspace_id<>p_workspace_id or v_row.operator_id<>p_operator_id or v_row.request_hash<>v_hash then
      return jsonb_build_object('status','conflict','error','request-id-reused','persisted',false);
    end if;
    return public.local_skill_request_public_v1(v_row)||jsonb_build_object('replayed',true);
  end if;
  if not public.local_skill_task_valid_v1(p_workspace_id,v_task,v_scope) then
    return jsonb_build_object('status','invalid-input','error','task-scope-or-owner-mismatch','persisted',false);
  end if;
  insert into public.local_skill_requests(id,workspace_id,operator_id,task_id,scope,instruction,expected_evidence,request_hash)
    values(v_id,p_workspace_id,p_operator_id,v_task,v_scope,v_instruction,v_evidence,v_hash) returning * into v_row;
  return public.local_skill_request_public_v1(v_row)||jsonb_build_object('replayed',false);
exception when invalid_text_representation or check_violation or foreign_key_violation then
  return jsonb_build_object('status','invalid-input','error','invalid-skill-request','persisted',false);
end; $$;

create or replace function public.local_skill_request_get_v1(p_workspace_id uuid,p_operator_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.local_skill_requests%rowtype;
begin
  if p_workspace_id is null or p_operator_id is distinct from 'operator' or p_request_id is null then
    return jsonb_build_object('status','invalid-input','error','invalid-skill-request-id');
  end if;
  select * into v_row from public.local_skill_requests where id=p_request_id and workspace_id=p_workspace_id and operator_id=p_operator_id;
  if not found then return jsonb_build_object('status','not-found','error','skill-request-not-found'); end if;
  return public.local_skill_request_public_v1(v_row);
end; $$;

create or replace function public.local_skill_request_list_v1(p_workspace_id uuid,p_operator_id text,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  if p_workspace_id is null or p_operator_id is distinct from 'operator' then
    return jsonb_build_object('status','invalid-input','error','invalid-skill-request-owner');
  end if;
  select coalesce(jsonb_agg(public.local_skill_request_public_v1(r)->'request' order by created_at desc,id desc),'[]'::jsonb)
    into v_rows from (select * from public.local_skill_requests where workspace_id=p_workspace_id and operator_id=p_operator_id
      order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))) r;
  return jsonb_build_object('status','ready','items',v_rows);
end; $$;

create or replace function public.local_skill_receipt_record_v1(p_workspace_id uuid,p_operator_id text,p_agent_actor_id text,p_request_id uuid,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.local_skill_requests%rowtype;v_task public.tasks%rowtype;v_state text;v_summary text;v_evidence jsonb;v_command_id uuid;v_hash text;v_item jsonb;v_command public.agent_command_receipts%rowtype;
begin
  if p_workspace_id is null or p_operator_id is distinct from 'operator' or p_request_id is null
    or p_agent_actor_id is null or p_agent_actor_id !~ '^[a-zA-Z0-9._:@/-]{1,128}$'
    or jsonb_typeof(p_receipt) is distinct from 'object'
    or (p_receipt-array['state','summary','evidence','commandId']) <> '{}'::jsonb
    or octet_length(p_receipt::text)>16384 then
    return jsonb_build_object('status','invalid-input','error','invalid-skill-receipt','persisted',false);
  end if;
  v_state:=p_receipt->>'state';v_summary:=btrim(p_receipt->>'summary');v_evidence:=p_receipt->'evidence';
  if v_state not in ('completed','failed','unconfirmed') or v_state is null
    or char_length(coalesce(v_summary,'')) not between 1 and 2000
    or jsonb_typeof(v_evidence) is distinct from 'array' or jsonb_array_length(v_evidence)>8
    or (v_state='completed' and jsonb_array_length(v_evidence)=0) then
    return jsonb_build_object('status','invalid-input','error','invalid-skill-receipt','persisted',false);
  end if;
  for v_item in select value from jsonb_array_elements(v_evidence) loop
    if jsonb_typeof(v_item) is distinct from 'object' or (v_item-array['kind','value'])<>'{}'::jsonb
      or not (v_item ? 'kind') or not (v_item ? 'value')
      or v_item->>'kind' not in ('path','url','note') or char_length(coalesce(v_item->>'value','')) not between 1 and 1024 then
      return jsonb_build_object('status','invalid-input','error','invalid-skill-evidence','persisted',false);
    end if;
  end loop;
  if p_receipt->>'commandId' is not null then v_command_id:=(p_receipt->>'commandId')::uuid; end if;
  if v_command_id is not null and v_state<>'completed' then
    return jsonb_build_object('status','invalid-input','error','completion-command-requires-completed-receipt','persisted',false);
  end if;
  select * into v_row from public.local_skill_requests where id=p_request_id and workspace_id=p_workspace_id and operator_id=p_operator_id for update;
  if not found then return jsonb_build_object('status','not-found','error','skill-request-not-found','persisted',false); end if;
  select * into v_task from public.tasks where id=v_row.task_id and workspace_id=p_workspace_id for share;
  if not found or not public.local_skill_task_valid_v1(p_workspace_id,v_row.task_id,v_row.scope) then
    return jsonb_build_object('status','conflict','error','task-scope-or-owner-mismatch','persisted',false);
  end if;
  v_hash:=encode(sha256(convert_to(p_receipt::text,'UTF8')),'hex');
  if v_row.receipt_hash=v_hash and v_row.receipt_actor_id=p_agent_actor_id then
    return public.local_skill_request_public_v1(v_row)||jsonb_build_object('replayed',true);
  end if;
  if v_row.state in ('completed','failed') then
    return jsonb_build_object('status','conflict','error','terminal-receipt-exists','persisted',false);
  end if;
  if v_command_id is not null then
    select * into v_command from public.agent_command_receipts where workspace_id=p_workspace_id and actor_id=p_agent_actor_id
      and command_id=v_command_id and action='complete_task' and target_id=v_row.task_id;
    if not found then return jsonb_build_object('status','conflict','error','completion-command-receipt-not-found','persisted',false); end if;
  end if;
  update public.local_skill_requests set state=v_state,receipt=p_receipt||jsonb_build_object('commandReceiptVerified',v_command_id is not null),
    receipt_hash=v_hash,receipt_actor_id=p_agent_actor_id,receipt_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=p_request_id returning * into v_row;
  return public.local_skill_request_public_v1(v_row)||jsonb_build_object('replayed',false);
exception when invalid_text_representation or check_violation then
  return jsonb_build_object('status','invalid-input','error','invalid-skill-receipt','persisted',false);
end; $$;

revoke all on function public.local_skill_request_public_v1(public.local_skill_requests),public.local_skill_task_valid_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.local_skill_request_create_v1(uuid,text,jsonb),public.local_skill_request_get_v1(uuid,text,uuid),public.local_skill_request_list_v1(uuid,text,integer),public.local_skill_receipt_record_v1(uuid,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.local_skill_request_create_v1(uuid,text,jsonb),public.local_skill_request_get_v1(uuid,text,uuid),public.local_skill_request_list_v1(uuid,text,integer),public.local_skill_receipt_record_v1(uuid,text,text,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
