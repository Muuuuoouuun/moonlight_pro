-- Agent commands are a service-role-only extension of the existing PMS and
-- record_contact_outcome_v1 business paths. No client role can write receipts.
-- A receipt and all of its domain writes commit or roll back in one transaction.
create table if not exists public.agent_command_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id text not null check (actor_id ~ '^[a-zA-Z0-9._:@/-]{1,128}$'),
  command_id uuid not null,
  action text not null check (action in ('create_task','update_task','complete_task','record_contact_outcome')),
  target_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object' and receipt->>'status' = 'saved' and receipt->>'persisted' = 'true'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_id, command_id)
);
alter table public.agent_command_receipts enable row level security;
revoke all on table public.agent_command_receipts from public, anon, authenticated, service_role;

-- Persist/return the same compact public shape, including receipts written by
-- older versions. Versions and changed field names are kept byte-for-byte.
create or replace function public.agent_command_public_receipt_v1(p_receipt jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_raw jsonb := p_receipt->'entity';
  v_entity jsonb;
  v_type text;
  v_label text;
  v_outcome jsonb;
begin
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_result
    from jsonb_each(p_receipt)
    where key = any(array['status','persisted','commandId','action','changedFields','updatedAt','replayed','code','error','retryable','nextAction','retryPolicy']);
  if jsonb_typeof(p_receipt->'outcome') = 'object' then
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_outcome
      from jsonb_each(p_receipt->'outcome')
      where key = any(array['status','activityId','entityType','entityId','dormant','warning']);
    v_result := v_result || jsonb_build_object('outcome',v_outcome);
  end if;
  if jsonb_typeof(v_raw) = 'object' then
    v_entity := jsonb_build_object('id',v_raw->'id','status',coalesce(v_raw->'status',v_raw->'stage','null'::jsonb),
      'updatedAt',coalesce(p_receipt->'updatedAt',v_raw->'updatedAt',v_raw->'updated_at','null'::jsonb));
    v_label := case when v_raw ? 'title' then 'title' when v_raw ? 'name' then 'name' end;
    if v_label is not null then v_entity := v_entity || jsonb_build_object(v_label,left(v_raw->>v_label,200)); end if;
    if v_raw->>'summaryTruncated' = 'true' or length(v_raw->>v_label) > 200 then
      v_entity := v_entity || jsonb_build_object('summaryTruncated',true);
    end if;
    v_type := case when p_receipt->>'action' in ('create_task','update_task','complete_task') then 'tasks'
      when p_receipt->'outcome'->>'entityType' = 'lead' then 'leads'
      when p_receipt->'outcome'->>'entityType' = 'deal' then 'deals'
      when p_receipt->'outcome'->>'entityType' = 'account' then 'accounts'
      else coalesce(p_receipt->'entityRef'->>'type','unknown') end;
    v_result := v_result || jsonb_build_object('entity',v_entity,'entityRef',jsonb_build_object(
      'type',v_type,'id',v_raw->'id','detailAvailable',v_type = 'tasks',
      'href',case when v_type = 'tasks' then '/api/agent/v1/entities/tasks/' || (v_raw->>'id') end));
  end if;
  return v_result;
end;
$$;
revoke all on function public.agent_command_public_receipt_v1(jsonb) from public, anon, authenticated, service_role;

create or replace function public.agent_command_v1(
  p_workspace_id uuid, p_actor_id text, p_scopes text[], p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_error jsonb := jsonb_build_object('status','error','persisted',false,'retryable',false);
  v_id uuid;
  v_target uuid;
  v_action text;
  v_expected timestamptz;
  v_payload jsonb;
  v_hash text;
  v_existing public.agent_command_receipts%rowtype;
  v_task public.tasks%rowtype;
  v_owner uuid;
  v_project uuid;
  v_deal uuid;
  v_contact uuid;
  v_entity jsonb;
  v_outcome jsonb;
  v_receipt jsonb;
  v_changed jsonb;
  v_meta jsonb;
  v_item jsonb;
  v_checklist_ids uuid[] := array[]::uuid[];
  v_checklist_id uuid;
begin
  if p_workspace_id is null or p_actor_id is null or p_actor_id !~ '^[a-zA-Z0-9._:@/-]{1,128}$'
    or p_scopes is null or array_position(p_scopes, null) is not null
    or not p_scopes <@ array['read','tasks:write','contact-outcomes:write','jobs:read','jobs:write']::text[] then
    return v_error || jsonb_build_object('code','forbidden','error','invalid-agent-context');
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object'
    or octet_length(p_command::text) > 262144
    or (p_command - array['commandId','action','targetId','expectedUpdatedAt','payload']) <> '{}'::jsonb then
    return v_error || jsonb_build_object('code','invalid-input','error','invalid-command');
  end if;
  v_id := (p_command->>'commandId')::uuid;
  v_target := (p_command->>'targetId')::uuid;
  v_action := p_command->>'action';
  v_payload := p_command->'payload';
  if v_id is null or v_target is null or v_action is null
    or v_action not in ('create_task','update_task','complete_task','record_contact_outcome')
    or v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return v_error || jsonb_build_object('code','invalid-input','error','invalid-command');
  end if;
  if not (case when v_action = 'record_contact_outcome' then 'contact-outcomes:write' else 'tasks:write' end = any(p_scopes)) then
    return v_error || jsonb_build_object('code','forbidden','error','insufficient-scope');
  end if;
  if v_action in ('update_task','complete_task') then
    if coalesce(p_command->>'expectedUpdatedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then
      return v_error || jsonb_build_object('code','invalid-input','error','missing-or-invalid-expected-updated-at');
    end if;
    v_expected := (p_command->>'expectedUpdatedAt')::timestamptz;
  elsif p_command->>'expectedUpdatedAt' is not null then
    return v_error || jsonb_build_object('code','invalid-input','error','unexpected-expected-updated-at');
  end if;
  if v_action = 'create_task' and v_target <> v_id then
    return v_error || jsonb_build_object('code','invalid-input','error','create-target-must-match-command');
  end if;

  -- Compute the hash here: service callers cannot supply a trusted hash. JSONB
  -- canonicalizes object order while retaining meaningful array/item order.
  v_hash := encode(sha256(convert_to(p_command::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_actor_id || ':' || v_id::text, 0));
  select * into v_existing from public.agent_command_receipts
    where workspace_id = p_workspace_id and actor_id = p_actor_id and command_id = v_id;
  if found then
    if v_existing.request_hash <> v_hash then
      return v_error || jsonb_build_object('code','conflict','error','command-id-reuse','commandId',v_id);
    end if;
    return public.agent_command_public_receipt_v1(v_existing.receipt || jsonb_build_object('replayed',true));
  end if;
  select owner_id into v_owner from public.workspaces where id = p_workspace_id for key share;
  if not found then return v_error || jsonb_build_object('code','invalid-input','error','invalid-workspace'); end if;

  if v_action in ('create_task','update_task','complete_task') then
    if (v_payload - array['title','status','priority','project_id','next_action','description','due_at','meta']) <> '{}'::jsonb
      or (v_action = 'complete_task' and v_payload <> '{"status":"done"}'::jsonb)
      or (v_action = 'update_task' and v_payload = '{}'::jsonb) then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-task-fields');
    end if;
    -- Engine normalizePmsCommand supplies these normalized fields. Repeat the
    -- storage allowlist/type boundary; domain normalization remains in Engine.
    if (v_action = 'create_task' or v_payload ? 'title') and
      (jsonb_typeof(v_payload->'title') is distinct from 'string' or length(btrim(v_payload->>'title')) not between 1 and 300) then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-title');
    end if;
    if (v_action = 'create_task' or v_payload ? 'status') and coalesce(v_payload->>'status','') not in ('inbox','todo','doing','blocked','done') then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-status');
    end if;
    if (v_action = 'create_task' or v_payload ? 'priority') and coalesce(v_payload->>'priority','') not in ('low','medium','high','critical') then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-priority');
    end if;
    if exists (select 1 from jsonb_each(v_payload) as f(key,value) where key in ('project_id','due_at','next_action','description') and jsonb_typeof(value) not in ('null','string'))
      or length(coalesce(v_payload->>'description','')) > 4000 or length(coalesce(v_payload->>'next_action','')) > 1000 then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-task-field-types');
    end if;
    v_meta := coalesce(v_payload->'meta','{}'::jsonb);
    if jsonb_typeof(v_meta) <> 'object'
      or (v_action = 'create_task' and (v_meta - array['source','deal_id','checklist'] <> '{}'::jsonb or v_meta->>'source' is distinct from 'agent'))
      or (v_action <> 'create_task' and v_meta - 'checklist' <> '{}'::jsonb) then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-task-metadata');
    end if;
    if v_meta ? 'checklist' then
      if jsonb_typeof(v_meta->'checklist') <> 'array' or jsonb_array_length(v_meta->'checklist') > 50 then
        return v_error || jsonb_build_object('code','invalid-input','error','invalid-checklist');
      end if;
      for v_item in select value from jsonb_array_elements(v_meta->'checklist') loop
        if jsonb_typeof(v_item) <> 'object' or v_item - array['id','title','done','note'] <> '{}'::jsonb
          or jsonb_typeof(v_item->'title') is distinct from 'string' or length(btrim(v_item->>'title')) not between 1 and 200
          or jsonb_typeof(v_item->'done') is distinct from 'boolean'
          or jsonb_typeof(v_item->'note') is distinct from 'string' or length(v_item->>'note') > 500 then
          return v_error || jsonb_build_object('code','invalid-input','error','invalid-checklist-item');
        end if;
        v_checklist_id := (v_item->>'id')::uuid;
        if v_checklist_id is null or v_checklist_id = any(v_checklist_ids) then
          return v_error || jsonb_build_object('code','invalid-input','error','invalid-checklist-item');
        end if;
        v_checklist_ids := array_append(v_checklist_ids, v_checklist_id);
      end loop;
    end if;
    v_project := (v_payload->>'project_id')::uuid;
    if v_project is not null then
      perform 1 from public.projects where id = v_project and workspace_id = p_workspace_id for key share;
      if not found then return v_error || jsonb_build_object('code','invalid-input','error','invalid-project-reference'); end if;
    end if;
    v_deal := (v_meta->>'deal_id')::uuid;
    if v_deal is not null then
      perform 1 from public.deals where id = v_deal and workspace_id = p_workspace_id for key share;
      if not found then return v_error || jsonb_build_object('code','invalid-input','error','invalid-deal-reference'); end if;
    end if;
    if v_action = 'create_task' then
      insert into public.tasks(id,workspace_id,owner_id,project_id,title,status,priority,next_action,description,due_at,completed_at,meta)
      values(v_id,p_workspace_id,v_owner,v_project,v_payload->>'title',v_payload->>'status',v_payload->>'priority',v_payload->>'next_action',v_payload->>'description',(v_payload->>'due_at')::timestamptz,case when v_payload->>'status' = 'done' then now() end,v_meta)
      returning * into v_task;
    else
      select * into v_task from public.tasks where id = v_target and workspace_id = p_workspace_id for update;
      if not found then return v_error || jsonb_build_object('code','not-found','error','task-not-found','commandId',v_id); end if;
      if v_task.updated_at is distinct from v_expected then
        return public.agent_command_public_receipt_v1(v_error || jsonb_build_object('code','conflict','error','stale-update','commandId',v_id,'action',v_action,'entity',to_jsonb(v_task),'updatedAt',v_task.updated_at));
      end if;
      if jsonb_typeof(coalesce(v_task.meta,'{}'::jsonb)) <> 'object' then return v_error || jsonb_build_object('code','invalid-input','error','invalid-task-metadata'); end if;
      update public.tasks set
        title = case when v_payload ? 'title' then v_payload->>'title' else title end,
        status = case when v_payload ? 'status' then v_payload->>'status' else status end,
        completed_at = case when v_payload ? 'status' then case when v_payload->>'status' = 'done' then now() end else completed_at end,
        priority = case when v_payload ? 'priority' then v_payload->>'priority' else priority end,
        project_id = case when v_payload ? 'project_id' then v_project else project_id end,
        next_action = case when v_payload ? 'next_action' then v_payload->>'next_action' else next_action end,
        description = case when v_payload ? 'description' then v_payload->>'description' else description end,
        due_at = case when v_payload ? 'due_at' then (v_payload->>'due_at')::timestamptz else due_at end,
        meta = coalesce(meta,'{}'::jsonb) || v_meta, updated_at = now()
      where id = v_target and workspace_id = p_workspace_id and updated_at = v_expected
      returning * into v_task;
    end if;
    v_entity := to_jsonb(v_task);
    select coalesce(jsonb_agg(key order by key),'[]'::jsonb) into v_changed from jsonb_object_keys(v_payload) as f(key);
    v_changed := v_changed || '"updated_at"'::jsonb;
    if v_payload ? 'status' then v_changed := v_changed || '"completed_at"'::jsonb; end if;
  else
    if v_payload - array['entityType','contactId','kind','summary','reaction','nextAction','nextActionAt','dormant'] <> '{}'::jsonb
      or coalesce(v_payload->>'entityType','') not in ('lead','deal','account')
      or jsonb_typeof(v_payload->'summary') is distinct from 'string' or length(btrim(v_payload->>'summary')) not between 1 and 4000
      or jsonb_typeof(v_payload->'reaction') is distinct from 'string' or length(v_payload->>'reaction') > 100
      or jsonb_typeof(v_payload->'kind') is distinct from 'string' or length(v_payload->>'kind') > 100
      or jsonb_typeof(v_payload->'dormant') is distinct from 'boolean'
      or length(coalesce(v_payload->>'nextAction','')) > 1000
      or exists (select 1 from jsonb_each(v_payload) as f(key,value) where key in ('contactId','nextAction','nextActionAt') and jsonb_typeof(value) not in ('null','string')) then
      return v_error || jsonb_build_object('code','invalid-input','error','invalid-contact-outcome');
    end if;
    if v_payload->>'nextActionAt' is not null then perform (v_payload->>'nextActionAt')::timestamptz; end if;
    v_contact := (v_payload->>'contactId')::uuid;
    if v_contact is not null then
      perform 1 from public.contacts where id = v_contact and workspace_id = p_workspace_id for key share;
      if not found then return v_error || jsonb_build_object('code','invalid-input','error','invalid-contact-reference'); end if;
    end if;
    -- Lock and verify the target before invoking the authoritative RPC. This also
    -- protects its insert-first flow from cross-workspace entity/contact refs.
    if v_payload->>'entityType' = 'lead' then
      perform 1 from public.leads where id = v_target and workspace_id = p_workspace_id for update;
    elsif v_payload->>'entityType' = 'deal' then
      perform 1 from public.deals where id = v_target and workspace_id = p_workspace_id for update;
    else
      perform 1 from public.customer_accounts where id = v_target and workspace_id = p_workspace_id for update;
    end if;
    if not found then return v_error || jsonb_build_object('code','not-found','error','entity-not-found'); end if;
    v_outcome := public.record_contact_outcome_v1(p_workspace_id,v_payload->>'entityType',v_target,v_contact,v_payload->>'kind',v_payload->>'summary',v_payload->>'reaction',v_payload->>'nextAction',v_payload->>'nextActionAt',(v_payload->>'dormant')::boolean);
    if v_outcome->>'status' is distinct from 'saved' then
      -- Raise so even an unexpectedly changed legacy RPC cannot leave partial work.
      raise exception using errcode = 'P0002', message = 'contact-outcome-failed';
    end if;
    if v_payload->>'entityType' = 'lead' then
      select to_jsonb(l) into v_entity from public.leads l where id = v_target and workspace_id = p_workspace_id;
    elsif v_payload->>'entityType' = 'deal' then
      select to_jsonb(d) into v_entity from public.deals d where id = v_target and workspace_id = p_workspace_id;
    else
      select to_jsonb(a) into v_entity from public.customer_accounts a where id = v_target and workspace_id = p_workspace_id;
    end if;
    v_changed := '["next_action","meta","updated_at"]'::jsonb;
    if v_payload->>'entityType' = 'lead' then v_changed := v_changed || '"last_touch_at"'::jsonb; end if;
    if v_payload->>'entityType' = 'deal' then v_changed := v_changed || '"last_activity_at"'::jsonb; end if;
  end if;
  v_receipt := jsonb_build_object('status','saved','persisted',true,'commandId',v_id,'action',v_action,'entity',v_entity,'changedFields',v_changed,'updatedAt',v_entity->>'updated_at','replayed',false);
  if v_outcome is not null then v_receipt := v_receipt || jsonb_build_object('outcome',v_outcome); end if;
  v_receipt := public.agent_command_public_receipt_v1(v_receipt);
  insert into public.agent_command_receipts(workspace_id,actor_id,command_id,action,target_id,request_hash,receipt)
    values(p_workspace_id,p_actor_id,v_id,v_action,v_target,v_hash,v_receipt);
  return v_receipt;
exception
  when no_data_found then
    if v_outcome->>'status' = 'invalid-input' then
      return v_error || jsonb_build_object('code','invalid-input','error',v_outcome->>'error','commandId',v_id);
    end if;
    return v_error || jsonb_build_object('code','command-storage-error','error','contact-outcome-failed','commandId',v_id);
  when unique_violation then return v_error || jsonb_build_object('code','conflict','error','task-id-already-exists','commandId',v_id);
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then
    return v_error || jsonb_build_object('code','invalid-input','error','invalid-command-values','commandId',v_id);
  when foreign_key_violation then return v_error || jsonb_build_object('code','invalid-input','error','invalid-reference','commandId',v_id);
  when undefined_function or undefined_table or undefined_column then
    return v_error || jsonb_build_object('code','agent-commands-migration-required','error','agent-commands-migration-required','commandId',v_id);
  when others then
    -- The enclosing exception block rolls back the mutation AND receipt. Never
    -- expose SQL messages (which may include private field values) to API callers.
    return v_error || jsonb_build_object('code','command-storage-error','error','command-storage-error','commandId',v_id);
end;
$$;

create or replace function public.agent_command_receipt_v1(
  p_workspace_id uuid, p_actor_id text, p_scopes text[], p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_receipt jsonb;
begin
  if p_workspace_id is null or p_actor_id is null or p_actor_id !~ '^[a-zA-Z0-9._:@/-]{1,128}$'
    or p_scopes is null or array_position(p_scopes,null) is not null
    or not p_scopes <@ array['read','tasks:write','contact-outcomes:write','jobs:read','jobs:write']::text[]
    or not ('read' = any(p_scopes)) then
    return jsonb_build_object('status','error','code','forbidden','error','insufficient-scope','persisted',false,'retryable',false);
  end if;
  select receipt into v_receipt from public.agent_command_receipts
    where workspace_id = p_workspace_id and actor_id = p_actor_id and command_id = p_command_id;
  if not found then
    -- Absence is not a negative receipt: a timed-out command may still hold its
    -- transaction open, so neither its mutation nor receipt is visible yet.
    -- Keep this diagnostic read non-blocking and forbid a retry under a new ID.
    return jsonb_build_object('status','error','code','not-found','error','receipt-not-found','commandId',p_command_id,
      'persisted',null,'retryable',false,'nextAction','get_command_receipt','retryPolicy','same-command-id-and-input-only');
  end if;
  return public.agent_command_public_receipt_v1(v_receipt || jsonb_build_object('replayed',true));
end;
$$;

revoke all on function public.agent_command_v1(uuid,text,text[],jsonb) from public, anon, authenticated;
revoke all on function public.agent_command_receipt_v1(uuid,text,text[],uuid) from public, anon, authenticated;
grant execute on function public.agent_command_v1(uuid,text,text[],jsonb) to service_role;
grant execute on function public.agent_command_receipt_v1(uuid,text,text[],uuid) to service_role;
