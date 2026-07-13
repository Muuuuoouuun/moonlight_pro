-- Durable task mutations and quick capture with workspace-scoped idempotency.

begin;

create table if not exists public.mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  destination text not null check (destination in ('task', 'inbox')),
  action text not null check (action in ('create', 'update', 'capture')),
  payload_hash text not null,
  task_id uuid references public.tasks(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete restrict,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  check (
    response is null
    or (destination = 'task' and task_id is not null and work_order_id is null)
    or (destination = 'inbox' and work_order_id is not null and task_id is null)
  ),
  check (
    (destination = 'task' and action in ('create', 'update'))
    or (destination = 'inbox' and action = 'capture')
  )
);

alter table public.mutation_receipts enable row level security;

revoke all on table public.mutation_receipts from public, anon, authenticated;
grant select, insert, update on table public.mutation_receipts to service_role;

create or replace function public.create_task_v1(
  p_workspace_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_destination constant text := 'task';
  v_action constant text := 'create';
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_task public.tasks%rowtype;
  v_task_json jsonb;
  v_project_id uuid;
  v_project jsonb;
  v_entity_ref jsonb;
  v_entity_id uuid;
  v_entity_type text;
  v_title text;
  v_status text;
  v_priority text;
  v_next_action text;
  v_due_at timestamptz;
  v_due_precision text;
  v_meta jsonb;
  v_now timestamptz := now();
begin
  if p_workspace_id is null
     or nullif(btrim(p_idempotency_key), '') is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'workspace, idempotency key, and object payload are required'
      using errcode = '22023';
  end if;

  select w.owner_id
  into v_owner_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or v_owner_id is null then
    raise exception 'workspace owner not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_owner_id
    and wm.role = 'owner'
    and wm.status = 'active';

  if not found then
    raise exception 'active workspace owner membership not found'
      using errcode = '42501';
  end if;

  v_title := nullif(btrim(p_payload ->> 'title'), '');
  if v_title is null then
    raise exception 'task title is required'
      using errcode = '22023';
  end if;

  v_status := coalesce(nullif(p_payload ->> 'status', ''), 'inbox');
  if v_status not in ('inbox', 'todo', 'doing', 'blocked', 'done') then
    raise exception 'invalid task status'
      using errcode = '22023';
  end if;

  v_priority := coalesce(nullif(p_payload ->> 'priority', ''), 'medium');
  if v_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'invalid task priority'
      using errcode = '22023';
  end if;

  v_next_action := coalesce(p_payload ->> 'nextAction', p_payload ->> 'next_action');
  v_due_at := nullif(coalesce(p_payload ->> 'dueAt', p_payload ->> 'due_at'), '')::timestamptz;
  v_due_precision := coalesce(
    nullif(p_payload ->> 'duePrecision', ''),
    nullif(p_payload ->> 'due_precision', ''),
    case when v_due_at is null then 'none' else 'timed' end
  );
  if v_due_precision not in ('timed', 'date', 'none')
     or (v_due_precision = 'none' and v_due_at is not null)
     or (v_due_precision <> 'none' and v_due_at is null) then
    raise exception 'invalid due precision'
      using errcode = '22023';
  end if;

  v_project_id := nullif(coalesce(p_payload ->> 'projectId', p_payload ->> 'project_id'), '')::uuid;
  if v_project_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.name)
    into v_project
    from public.projects p
    where p.id = v_project_id
      and p.workspace_id = p_workspace_id;

    if not found then
      raise exception 'project not found in workspace'
        using errcode = 'P0002';
    end if;
  end if;

  v_entity_ref := coalesce(p_payload -> 'entityRef', p_payload -> 'entity_ref');
  if v_entity_ref is not null and jsonb_typeof(v_entity_ref) <> 'null' then
    if jsonb_typeof(v_entity_ref) <> 'object' then
      raise exception 'entity ref must be an object'
        using errcode = '22023';
    end if;

    v_entity_type := nullif(v_entity_ref ->> 'type', '');
    v_entity_id := nullif(v_entity_ref ->> 'id', '')::uuid;
    if v_entity_type is null or v_entity_id is null then
      raise exception 'entity ref type and id are required'
        using errcode = '22023';
    end if;

    if v_entity_type = 'lead' then
      perform 1 from public.leads l
      where l.id = v_entity_id and l.workspace_id = p_workspace_id;
    elsif v_entity_type = 'deal' then
      perform 1 from public.deals d
      where d.id = v_entity_id and d.workspace_id = p_workspace_id;
    elsif v_entity_type = 'contact' then
      perform 1 from public.contacts c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    elsif v_entity_type = 'company' then
      perform 1 from public.companies c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    else
      raise exception 'invalid entity ref type'
        using errcode = '22023';
    end if;

    if not found then
      raise exception 'entity ref not found in workspace'
        using errcode = 'P0002';
    end if;

  else
    v_entity_ref := null;
  end if;

  if p_payload ? 'meta'
     and jsonb_typeof(p_payload -> 'meta') not in ('object', 'null') then
    raise exception 'task meta must be an object'
      using errcode = '22023';
  end if;

  v_meta := case
    when jsonb_typeof(p_payload -> 'meta') = 'object' then p_payload -> 'meta'
    else '{}'::jsonb
  end - 'due_precision' - 'entity_ref';
  v_meta := v_meta || jsonb_build_object('due_precision', v_due_precision);
  if v_entity_ref is not null then
    v_meta := v_meta || jsonb_build_object('entity_ref', v_entity_ref);
  end if;

  v_canonical_payload := jsonb_build_object(
    'title', v_title,
    'status', v_status,
    'priority', v_priority,
    'next_action', v_next_action,
    'due_at', v_due_at,
    'due_precision', v_due_precision,
    'project_id', v_project_id,
    'entity_ref', v_entity_ref,
    'meta', v_meta
  );
  v_payload_hash := md5(v_canonical_payload::text);

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    destination,
    action,
    payload_hash
  ) values (
    p_workspace_id,
    btrim(p_idempotency_key),
    v_destination,
    v_action,
    v_payload_hash
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into v_receipt;

  if not found then
    select mr.*
    into v_receipt
    from public.mutation_receipts mr
    where mr.workspace_id = p_workspace_id
      and mr.idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_receipt.destination is distinct from v_destination
       or v_receipt.action is distinct from v_action
       or v_receipt.payload_hash is distinct from v_payload_hash then
      return jsonb_build_object('result', 'conflict', 'reason', 'idempotency-key-reused');
    end if;

    if v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('result', 'duplicate');
    end if;

    return jsonb_build_object('result', 'conflict', 'reason', 'mutation-in-progress');
  end if;

  insert into public.tasks (
    workspace_id,
    project_id,
    owner_id,
    title,
    status,
    priority,
    next_action,
    started_at,
    due_at,
    completed_at,
    meta,
    created_at,
    updated_at
  ) values (
    p_workspace_id,
    v_project_id,
    v_owner_id,
    v_title,
    v_status,
    v_priority,
    v_next_action,
    case when v_status = 'doing' then v_now else null end,
    v_due_at,
    case when v_status = 'done' then v_now else null end,
    v_meta,
    v_now,
    v_now
  )
  returning * into v_task;

  v_task_json := jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'status', v_task.status,
    'priority', v_task.priority,
    'due_at', v_task.due_at,
    'due_precision', v_task.meta ->> 'due_precision',
    'meta', v_task.meta,
    'project', v_project,
    'owner', jsonb_build_object('id', v_owner_id),
    'next_action', v_task.next_action,
    'created_at', v_task.created_at,
    'updated_at', v_task.updated_at,
    'completed_at', v_task.completed_at,
    'started_at', v_task.started_at,
    'workspace_id', v_task.workspace_id
  );

  update public.mutation_receipts
  set task_id = v_task.id,
      response = jsonb_build_object('result', 'saved', 'task', v_task_json),
      updated_at = v_now
  where id = v_receipt.id
  returning response into v_task_json;

  return v_task_json;
end;
$$;

revoke all on function public.create_task_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_task_v1(uuid, text, jsonb)
  to service_role;

create or replace function public.update_task_v1(
  p_workspace_id uuid,
  p_task_id uuid,
  p_idempotency_key text,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_destination constant text := 'task';
  v_action constant text := 'update';
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_task public.tasks%rowtype;
  v_task_json jsonb;
  v_response jsonb;
  v_project_id uuid;
  v_project jsonb;
  v_entity_ref jsonb;
  v_entity_id uuid;
  v_entity_type text;
  v_title text;
  v_status text;
  v_priority text;
  v_next_action text;
  v_due_at timestamptz;
  v_due_precision text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_meta jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_workspace_id is null
     or p_task_id is null
     or nullif(btrim(p_idempotency_key), '') is null
     or p_expected_updated_at is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'workspace, task, idempotency key, expected timestamp, and object payload are required'
      using errcode = '22023';
  end if;

  select w.owner_id
  into v_owner_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or v_owner_id is null then
    raise exception 'workspace owner not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_owner_id
    and wm.role = 'owner'
    and wm.status = 'active';

  if not found then
    raise exception 'active workspace owner membership not found'
      using errcode = '42501';
  end if;

  v_canonical_payload := jsonb_build_object(
    'task_id', p_task_id,
    'expected_updated_at', p_expected_updated_at,
    'patch', p_payload
  );
  v_payload_hash := md5(v_canonical_payload::text);

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    destination,
    action,
    payload_hash
  ) values (
    p_workspace_id,
    btrim(p_idempotency_key),
    v_destination,
    v_action,
    v_payload_hash
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into v_receipt;

  if not found then
    select mr.*
    into v_receipt
    from public.mutation_receipts mr
    where mr.workspace_id = p_workspace_id
      and mr.idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_receipt.destination is distinct from v_destination
       or v_receipt.action is distinct from v_action
       or v_receipt.payload_hash is distinct from v_payload_hash then
      return jsonb_build_object('result', 'conflict', 'reason', 'idempotency-key-reused');
    end if;

    if v_receipt.response is not null then
      if v_receipt.response ->> 'result' = 'saved' then
        return v_receipt.response || jsonb_build_object('result', 'duplicate');
      end if;
      return v_receipt.response;
    end if;

    return jsonb_build_object('result', 'conflict', 'reason', 'mutation-in-progress');
  end if;

  select t.*
  into v_task
  from public.tasks t
  where t.id = p_task_id
    and t.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'task not found in workspace'
      using errcode = 'P0002';
  end if;

  if v_task.updated_at is distinct from p_expected_updated_at then
    v_task_json := jsonb_build_object(
      'id', v_task.id,
      'title', v_task.title,
      'status', v_task.status,
      'priority', v_task.priority,
      'due_at', v_task.due_at,
      'due_precision', coalesce(v_task.meta ->> 'due_precision', case when v_task.due_at is null then 'none' else 'timed' end),
      'meta', v_task.meta,
      'project', case when v_task.project_id is null then null else jsonb_build_object('id', v_task.project_id) end,
      'owner', jsonb_build_object('id', v_task.owner_id),
      'next_action', v_task.next_action,
      'created_at', v_task.created_at,
      'updated_at', v_task.updated_at,
      'completed_at', v_task.completed_at,
      'started_at', v_task.started_at,
      'workspace_id', v_task.workspace_id
    );
    v_response := jsonb_build_object('result', 'conflict', 'reason', 'stale-write', 'task', v_task_json);

    update public.mutation_receipts
    set task_id = v_task.id,
        response = v_response,
        updated_at = v_now
    where id = v_receipt.id;

    return v_response;
  end if;

  v_title := case
    when p_payload ? 'title' then nullif(btrim(p_payload ->> 'title'), '')
    else v_task.title
  end;
  if v_title is null then
    raise exception 'task title cannot be empty'
      using errcode = '22023';
  end if;

  v_status := case
    when p_payload ? 'status' then nullif(p_payload ->> 'status', '')
    else v_task.status
  end;
  if v_status is null or v_status not in ('inbox', 'todo', 'doing', 'blocked', 'done') then
    raise exception 'invalid task status'
      using errcode = '22023';
  end if;

  if v_status is distinct from v_task.status and not (
    (v_task.status = 'inbox' and v_status in ('todo', 'done'))
    or (v_task.status = 'todo' and v_status in ('doing', 'blocked', 'done'))
    or (v_task.status = 'doing' and v_status in ('todo', 'blocked', 'done'))
    or (v_task.status = 'blocked' and v_status in ('todo', 'doing', 'done'))
    or (v_task.status = 'done' and v_status = 'todo')
  ) then
    raise exception 'invalid task status transition'
      using errcode = '22023';
  end if;

  v_priority := case
    when p_payload ? 'priority' then nullif(p_payload ->> 'priority', '')
    else v_task.priority
  end;
  if v_priority is null or v_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'invalid task priority'
      using errcode = '22023';
  end if;

  if p_payload ? 'nextAction' then
    v_next_action := p_payload ->> 'nextAction';
  elsif p_payload ? 'next_action' then
    v_next_action := p_payload ->> 'next_action';
  else
    v_next_action := v_task.next_action;
  end if;

  if p_payload ? 'dueAt' then
    v_due_at := nullif(p_payload ->> 'dueAt', '')::timestamptz;
  elsif p_payload ? 'due_at' then
    v_due_at := nullif(p_payload ->> 'due_at', '')::timestamptz;
  else
    v_due_at := v_task.due_at;
  end if;

  if p_payload ? 'duePrecision' then
    v_due_precision := nullif(p_payload ->> 'duePrecision', '');
  elsif p_payload ? 'due_precision' then
    v_due_precision := nullif(p_payload ->> 'due_precision', '');
  elsif p_payload ? 'dueAt' or p_payload ? 'due_at' then
    v_due_precision := case when v_due_at is null then 'none' else 'timed' end;
  else
    v_due_precision := coalesce(
      v_task.meta ->> 'due_precision',
      case when v_due_at is null then 'none' else 'timed' end
    );
  end if;
  if v_due_precision is null
     or v_due_precision not in ('timed', 'date', 'none')
     or (v_due_precision = 'none' and v_due_at is not null)
     or (v_due_precision <> 'none' and v_due_at is null) then
    raise exception 'invalid due precision'
      using errcode = '22023';
  end if;

  if p_payload ? 'projectId' then
    v_project_id := nullif(p_payload ->> 'projectId', '')::uuid;
  elsif p_payload ? 'project_id' then
    v_project_id := nullif(p_payload ->> 'project_id', '')::uuid;
  else
    v_project_id := v_task.project_id;
  end if;
  if v_project_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.name)
    into v_project
    from public.projects p
    where p.id = v_project_id
      and p.workspace_id = p_workspace_id;

    if not found then
      raise exception 'project not found in workspace'
        using errcode = 'P0002';
    end if;
  end if;

  v_meta := v_task.meta;
  if jsonb_typeof(p_payload -> 'meta') = 'object' then
    v_meta := v_meta || ((p_payload -> 'meta') - 'due_precision' - 'entity_ref');
  elsif p_payload ? 'meta' and jsonb_typeof(p_payload -> 'meta') <> 'null' then
    raise exception 'task meta must be an object'
      using errcode = '22023';
  end if;
  v_meta := v_meta || jsonb_build_object('due_precision', v_due_precision);

  if p_payload ? 'entityRef' or p_payload ? 'entity_ref' then
    v_entity_ref := coalesce(p_payload -> 'entityRef', p_payload -> 'entity_ref');
    if v_entity_ref is null or jsonb_typeof(v_entity_ref) = 'null' then
      v_meta := v_meta - 'entity_ref';
    else
      if jsonb_typeof(v_entity_ref) <> 'object' then
        raise exception 'entity ref must be an object'
          using errcode = '22023';
      end if;

      v_entity_type := nullif(v_entity_ref ->> 'type', '');
      v_entity_id := nullif(v_entity_ref ->> 'id', '')::uuid;
      if v_entity_type is null or v_entity_id is null then
        raise exception 'entity ref type and id are required'
          using errcode = '22023';
      end if;

      if v_entity_type = 'lead' then
        perform 1 from public.leads l
        where l.id = v_entity_id and l.workspace_id = p_workspace_id;
      elsif v_entity_type = 'deal' then
        perform 1 from public.deals d
        where d.id = v_entity_id and d.workspace_id = p_workspace_id;
      elsif v_entity_type = 'contact' then
        perform 1 from public.contacts c
        where c.id = v_entity_id and c.workspace_id = p_workspace_id;
      elsif v_entity_type = 'company' then
        perform 1 from public.companies c
        where c.id = v_entity_id and c.workspace_id = p_workspace_id;
      else
        raise exception 'invalid entity ref type'
          using errcode = '22023';
      end if;

      if not found then
        raise exception 'entity ref not found in workspace'
          using errcode = 'P0002';
      end if;
      v_meta := v_meta || jsonb_build_object('entity_ref', v_entity_ref);
    end if;
  end if;

  v_started_at := v_task.started_at;
  if v_status = 'doing' then
    v_started_at := coalesce(v_task.started_at, v_now);
  end if;

  v_completed_at := v_task.completed_at;
  if v_status = 'done' then
    v_completed_at := coalesce(v_task.completed_at, v_now);
  elsif v_task.status = 'done' and v_status = 'todo' then
    v_completed_at := null;
  end if;

  update public.tasks
  set project_id = v_project_id,
      owner_id = v_owner_id,
      title = v_title,
      status = v_status,
      priority = v_priority,
      next_action = v_next_action,
      started_at = v_started_at,
      due_at = v_due_at,
      completed_at = v_completed_at,
      meta = v_meta,
      updated_at = v_now
  where id = p_task_id
    and workspace_id = p_workspace_id
  returning * into v_task;

  v_task_json := jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'status', v_task.status,
    'priority', v_task.priority,
    'due_at', v_task.due_at,
    'due_precision', v_task.meta ->> 'due_precision',
    'meta', v_task.meta,
    'project', v_project,
    'owner', jsonb_build_object('id', v_owner_id),
    'next_action', v_task.next_action,
    'created_at', v_task.created_at,
    'updated_at', v_task.updated_at,
    'completed_at', v_task.completed_at,
    'started_at', v_task.started_at,
    'workspace_id', v_task.workspace_id
  );
  v_response := jsonb_build_object('result', 'saved', 'task', v_task_json);

  update public.mutation_receipts
  set task_id = v_task.id,
      response = v_response,
      updated_at = v_now
  where id = v_receipt.id;

  return v_response;
end;
$$;

revoke all on function public.update_task_v1(uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_task_v1(uuid, uuid, text, timestamptz, jsonb)
  to service_role;

create or replace function public.capture_quick_input_v1(
  p_workspace_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_destination constant text := 'inbox';
  v_action constant text := 'capture';
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_work_order public.work_orders%rowtype;
  v_work_order_json jsonb;
  v_response jsonb;
  v_raw text;
  v_kind text;
  v_persona text;
  v_summary text;
  v_channel text;
  v_entity_ref jsonb;
  v_entity_id uuid;
  v_entity_type text;
  v_lead_id uuid;
  v_deal_id uuid;
  v_company_id uuid;
  v_body jsonb;
  v_now timestamptz := now();
begin
  if p_workspace_id is null
     or nullif(btrim(p_idempotency_key), '') is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'workspace, idempotency key, and object payload are required'
      using errcode = '22023';
  end if;

  select w.owner_id
  into v_owner_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or v_owner_id is null then
    raise exception 'workspace owner not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_owner_id
    and wm.role = 'owner'
    and wm.status = 'active';

  if not found then
    raise exception 'active workspace owner membership not found'
      using errcode = '42501';
  end if;

  v_raw := nullif(btrim(p_payload ->> 'raw'), '');
  if v_raw is null or length(v_raw) > 4000 then
    raise exception 'quick input raw text must be between 1 and 4000 characters'
      using errcode = '22023';
  end if;

  v_kind := coalesce(nullif(btrim(p_payload ->> 'kind'), ''), 'note');
  v_persona := coalesce(nullif(btrim(p_payload ->> 'persona'), ''), 'inbox');
  v_summary := coalesce(nullif(btrim(p_payload ->> 'summary'), ''), left(v_raw, 160));
  v_channel := nullif(btrim(p_payload ->> 'channel'), '');
  v_entity_ref := coalesce(p_payload -> 'entityRef', p_payload -> 'entity_ref');

  if v_entity_ref is not null and jsonb_typeof(v_entity_ref) <> 'null' then
    if jsonb_typeof(v_entity_ref) <> 'object' then
      raise exception 'entity ref must be an object'
        using errcode = '22023';
    end if;

    v_entity_type := nullif(v_entity_ref ->> 'type', '');
    v_entity_id := nullif(v_entity_ref ->> 'id', '')::uuid;
    if v_entity_type is null or v_entity_id is null then
      raise exception 'entity ref type and id are required'
        using errcode = '22023';
    end if;

    if v_entity_type = 'lead' then
      select l.id into v_lead_id
      from public.leads l
      where l.id = v_entity_id and l.workspace_id = p_workspace_id;
    elsif v_entity_type = 'deal' then
      select d.id, d.lead_id, d.company_id
      into v_deal_id, v_lead_id, v_company_id
      from public.deals d
      where d.id = v_entity_id and d.workspace_id = p_workspace_id;
    elsif v_entity_type = 'contact' then
      perform 1 from public.contacts c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    elsif v_entity_type = 'company' then
      select c.id into v_company_id
      from public.companies c
      where c.id = v_entity_id and c.workspace_id = p_workspace_id;
    else
      raise exception 'invalid entity ref type'
        using errcode = '22023';
    end if;

    if not found then
      raise exception 'entity ref not found in workspace'
        using errcode = 'P0002';
    end if;

    if v_deal_id is not null and v_lead_id is not null then
      perform 1
      from public.leads l
      where l.id = v_lead_id
        and l.workspace_id = p_workspace_id;

      if not found then
        raise exception 'deal lead is not in workspace'
          using errcode = '23514';
      end if;
    end if;

    if v_deal_id is not null and v_company_id is not null then
      perform 1
      from public.companies c
      where c.id = v_company_id
        and c.workspace_id = p_workspace_id;

      if not found then
        raise exception 'deal company is not in workspace'
          using errcode = '23514';
      end if;
    end if;
  else
    v_entity_ref := null;
  end if;

  v_body := jsonb_build_object(
    'raw', v_raw,
    'kind', v_kind,
    'persona', v_persona,
    'summary', v_summary,
    'owner_id', v_owner_id,
    'entity_ref', v_entity_ref
  );
  v_canonical_payload := jsonb_build_object(
    'raw', v_raw,
    'kind', v_kind,
    'persona', v_persona,
    'summary', v_summary,
    'channel', v_channel,
    'entity_ref', v_entity_ref
  );
  v_payload_hash := md5(v_canonical_payload::text);

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    destination,
    action,
    payload_hash
  ) values (
    p_workspace_id,
    btrim(p_idempotency_key),
    v_destination,
    v_action,
    v_payload_hash
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into v_receipt;

  if not found then
    select mr.*
    into v_receipt
    from public.mutation_receipts mr
    where mr.workspace_id = p_workspace_id
      and mr.idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_receipt.destination is distinct from v_destination
       or v_receipt.action is distinct from v_action
       or v_receipt.payload_hash is distinct from v_payload_hash then
      return jsonb_build_object('result', 'conflict', 'reason', 'idempotency-key-reused');
    end if;

    if v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('result', 'duplicate');
    end if;

    return jsonb_build_object('result', 'conflict', 'reason', 'mutation-in-progress');
  end if;

  insert into public.work_orders (
    workspace_id,
    persona,
    kind,
    title,
    body,
    lead_id,
    deal_id,
    company_id,
    channel,
    status,
    gate,
    source,
    proposed_at,
    created_at
  ) values (
    p_workspace_id,
    v_persona,
    v_kind,
    v_summary,
    v_body,
    v_lead_id,
    v_deal_id,
    v_company_id,
    v_channel,
    'proposed',
    'n/a',
    'inbox',
    v_now,
    v_now
  )
  returning * into v_work_order;

  v_work_order_json := jsonb_build_object(
    'id', v_work_order.id,
    'status', v_work_order.status,
    'persona', v_work_order.persona,
    'kind', v_work_order.kind,
    'title', v_work_order.title,
    'body', v_work_order.body,
    'source', v_work_order.source,
    'proposed_at', v_work_order.proposed_at,
    'created_at', v_work_order.created_at,
    'workspace_id', v_work_order.workspace_id
  );
  v_response := jsonb_build_object('result', 'saved', 'work_order', v_work_order_json);

  update public.mutation_receipts
  set work_order_id = v_work_order.id,
      response = v_response,
      updated_at = v_now
  where id = v_receipt.id;

  return v_response;
end;
$$;

revoke all on function public.capture_quick_input_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.capture_quick_input_v1(uuid, text, jsonb)
  to service_role;

commit;
