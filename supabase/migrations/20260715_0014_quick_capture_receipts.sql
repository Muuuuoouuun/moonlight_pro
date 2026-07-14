-- Phase 1A: one idempotency receipt across Quick Capture task/work-order destinations.

create table if not exists public.mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  operation text not null,
  destination_type text not null check (destination_type in ('task', 'work_order')),
  destination_id uuid,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create index if not exists idx_mutation_receipts_workspace_created
  on public.mutation_receipts (workspace_id, created_at desc);

alter table public.mutation_receipts enable row level security;
revoke all on public.mutation_receipts from anon, authenticated;
grant select, insert, update, delete on public.mutation_receipts to service_role;

create or replace function public.capture_quick_input_v1(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_raw text,
  p_hint text,
  p_idempotency_key text,
  p_request_hash text,
  p_entity_ref jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_raw, ''));
  v_hint text := lower(btrim(coalesce(p_hint, 'inbox')));
  v_destination_type text;
  v_destination_id uuid;
  v_receipt_id uuid;
  v_existing public.mutation_receipts%rowtype;
  v_response jsonb;
  v_kind text;
  v_persona text;
begin
  if p_workspace_id is null then
    return jsonb_build_object('status', 'invalid-input', 'error', 'missing-workspace', 'retryable', false);
  end if;
  if v_raw = '' then
    return jsonb_build_object('status', 'invalid-input', 'error', 'empty-capture', 'retryable', false);
  end if;
  if length(v_raw) > 4000 then
    return jsonb_build_object('status', 'invalid-input', 'error', 'capture-too-long', 'retryable', false);
  end if;
  if v_hint not in ('inbox', 'task', 'note', 'customer', 'idea') then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-hint', 'retryable', false);
  end if;
  if btrim(coalesce(p_idempotency_key, '')) = '' or btrim(coalesce(p_request_hash, '')) = '' then
    return jsonb_build_object('status', 'invalid-input', 'error', 'missing-receipt-key', 'retryable', false);
  end if;

  v_destination_type := case when v_hint = 'task' then 'task' else 'work_order' end;

  insert into public.mutation_receipts (
    workspace_id,
    idempotency_key,
    request_hash,
    operation,
    destination_type,
    status
  ) values (
    p_workspace_id,
    p_idempotency_key,
    p_request_hash,
    'quick_capture',
    v_destination_type,
    'processing'
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select * into v_existing
      from public.mutation_receipts
      where workspace_id = p_workspace_id
        and idempotency_key = p_idempotency_key;

    if v_existing.request_hash is distinct from p_request_hash then
      return jsonb_build_object(
        'status', 'conflict',
        'error', 'idempotency-key-reused',
        'correlationId', p_idempotency_key,
        'retryable', false
      );
    end if;

    if v_existing.status = 'completed' and v_existing.response is not null then
      return v_existing.response || jsonb_build_object('status', 'duplicate');
    end if;

    return jsonb_build_object(
      'status', 'error',
      'error', 'receipt-not-completed',
      'correlationId', p_idempotency_key,
      'retryable', true
    );
  end if;

  v_destination_id := gen_random_uuid();

  if v_destination_type = 'task' then
    insert into public.tasks (
      id,
      workspace_id,
      owner_id,
      title,
      status,
      priority,
      meta
    ) values (
      v_destination_id,
      p_workspace_id,
      p_owner_id,
      left(v_raw, 300),
      'inbox',
      'medium',
      jsonb_build_object(
        'source', 'quick-capture',
        'raw', v_raw,
        'entity_ref', p_entity_ref
      )
    );
  else
    v_kind := case
      when v_hint = 'idea' then 'idea'
      when v_hint = 'customer' then 'lead'
      when v_hint = 'note' then 'note'
      else 'capture'
    end;
    v_persona := case
      when v_hint = 'idea' then 'content'
      when v_hint = 'customer' then 'sales'
      else 'inbox'
    end;

    insert into public.work_orders (
      id,
      workspace_id,
      persona,
      kind,
      title,
      body,
      status,
      gate,
      source
    ) values (
      v_destination_id,
      p_workspace_id,
      v_persona,
      v_kind,
      '[' || v_kind || '] ' || left(regexp_replace(v_raw, '\s+', ' ', 'g'), 60),
      jsonb_build_object('raw', v_raw, 'hint', v_hint, 'entity_ref', p_entity_ref),
      'proposed',
      'needs_human',
      'inbox'
    );
  end if;

  v_response := jsonb_build_object(
    'status', 'saved',
    'operation', 'quick_capture',
    'destinationType', v_destination_type,
    'destinationId', v_destination_id,
    'correlationId', p_idempotency_key,
    'retryable', false
  );

  update public.mutation_receipts
    set destination_id = v_destination_id,
        status = 'completed',
        response = v_response,
        updated_at = now()
    where id = v_receipt_id;

  return v_response;
end;
$$;

revoke all on function public.capture_quick_input_v1(uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.capture_quick_input_v1(uuid, uuid, text, text, text, text, jsonb)
  to service_role;
