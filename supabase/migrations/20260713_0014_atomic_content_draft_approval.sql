-- Materialize internal content-draft approvals atomically and idempotently.
-- A locked content item can leave idea state once; later states are never downgraded.

begin;

create unique index if not exists idx_content_variants_workspace_work_order
  on public.content_variants (workspace_id, ((meta ->> 'work_order_id')))
  where meta ? 'work_order_id';

create or replace function public.approve_content_draft_work_order(
  p_workspace_id uuid,
  p_work_order_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.work_orders%rowtype;
  v_content_id uuid;
  v_content_status text;
  v_variant_id uuid;
  v_variant_content_id uuid;
  v_now timestamptz := now();
  v_title text;
  v_body text;
begin
  if p_workspace_id is null or p_work_order_id is null then
    raise exception 'workspace id and work order id are required'
      using errcode = '22004';
  end if;

  select wo.*
  into v_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'content draft work order not found'
      using errcode = 'P0002';
  end if;

  if v_order.kind <> 'content-draft' then
    raise exception 'work order is not a content draft'
      using errcode = '22023';
  end if;

  if nullif(btrim(v_order.asset_id), '') is null then
    raise exception 'content draft work order requires an asset id'
      using errcode = '23502';
  end if;

  select ci.id, ci.status
  into v_content_id, v_content_status
  from public.content_items ci
  where ci.workspace_id = p_workspace_id
    and ci.id::text = v_order.asset_id
  for update;

  if not found then
    raise exception 'content item for work order not found'
      using errcode = '23503';
  end if;

  select cv.id, cv.content_id
  into v_variant_id, v_variant_content_id
  from public.content_variants cv
  where cv.workspace_id = p_workspace_id
    and cv.meta ->> 'work_order_id' = p_work_order_id::text
  order by cv.created_at asc
  limit 1;

  if v_variant_id is not null and v_variant_content_id <> v_content_id then
    raise exception 'content draft variant points to a different content item'
      using errcode = '23514';
  end if;

  if v_variant_id is not null then
    if v_order.status = 'proposed' then
      update public.work_orders
      set status = 'approved',
          decided_at = coalesce(decided_at, v_now)
      where id = p_work_order_id
        and workspace_id = p_workspace_id
        and status = 'proposed';

      v_order.status := 'approved';
    end if;

    return jsonb_build_object(
      'reason', 'already-materialized',
      'status', v_order.status,
      'materialized', true,
      'variant_id', v_variant_id,
      'content_id', v_content_id,
      'idempotent', true
    );
  end if;

  if v_order.status not in ('proposed', 'approved') then
    return jsonb_build_object(
      'reason', 'already-decided',
      'status', v_order.status,
      'materialized', false,
      'variant_id', null,
      'content_id', v_content_id,
      'idempotent', true
    );
  end if;

  if v_content_status <> 'idea' then
    return jsonb_build_object(
      'reason', 'content-not-idea',
      'status', v_order.status,
      'materialized', false,
      'variant_id', null,
      'content_id', v_content_id,
      'content_status', v_content_status,
      'idempotent', false
    );
  end if;

  v_title := coalesce(nullif(btrim(v_order.body ->> 'title'), ''), v_order.title);
  v_body := coalesce(v_order.body ->> 'body', '');
  v_variant_id := gen_random_uuid();

  insert into public.content_variants (
    id,
    workspace_id,
    content_id,
    variant_type,
    title,
    body,
    summary,
    excerpt,
    status,
    slug,
    scheduled_at,
    visibility,
    meta,
    created_at,
    updated_at
  ) values (
    v_variant_id,
    p_workspace_id,
    v_content_id,
    'blog_insight',
    v_title,
    v_body,
    null,
    nullif(left(v_body, 200), ''),
    'draft',
    null,
    null,
    'private',
    jsonb_build_object(
      'origin', 'content-flywheel',
      'work_order_id', p_work_order_id::text,
      'run_id', v_order.run_id,
      'brand_key', v_order.body ->> 'brandKey',
      'model', v_order.body ->> 'model'
    ),
    v_now,
    v_now
  );

  update public.content_items
  set status = 'draft',
      next_action = 'Studio에서 초안 검토 후 발행 준비',
      updated_at = v_now
  where id = v_content_id
    and workspace_id = p_workspace_id
    and status = 'idea';

  if not found then
    raise exception 'content item is no longer an idea'
      using errcode = '40001';
  end if;

  update public.work_orders
  set status = 'approved',
      decided_at = coalesce(decided_at, v_now)
  where id = p_work_order_id
    and workspace_id = p_workspace_id
    and status in ('proposed', 'approved');

  if not found then
    raise exception 'content draft work order is no longer recoverable'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'reason', case when v_order.status = 'approved' then 'recovered' else 'ok' end,
    'status', 'approved',
    'materialized', true,
    'variant_id', v_variant_id,
    'content_id', v_content_id,
    'idempotent', false
  );
end;
$$;

do $repair$
declare
  repair_order record;
  repair_result jsonb;
begin
  for repair_order in
    -- Materialize only the latest approved decision for each content item.
    -- Older duplicate approvals remain unchanged for a later audit.
    select distinct on (wo.workspace_id, ci.id)
      wo.workspace_id,
      ci.id as content_id,
      wo.id
    from public.work_orders wo
    join public.content_items ci
      on ci.workspace_id = wo.workspace_id
     and ci.id::text = wo.asset_id
    where wo.kind = 'content-draft'
      and wo.status = 'approved'
      and ci.status = 'idea'
      and not exists (
        select 1
        from public.content_variants cv
        where cv.workspace_id = wo.workspace_id
          and cv.content_id = ci.id
          and cv.meta ->> 'work_order_id' = wo.id::text
      )
    order by
      wo.workspace_id,
      ci.id,
      wo.decided_at desc nulls last,
      wo.proposed_at desc,
      wo.id desc
  loop
    repair_result := public.approve_content_draft_work_order(
      repair_order.workspace_id,
      repair_order.id
    );

    if coalesce((repair_result ->> 'materialized')::boolean, false) is not true
       or repair_result ->> 'status' is distinct from 'approved' then
      raise exception 'approved content draft repair did not materialize'
        using detail = repair_result::text;
    end if;
  end loop;
end;
$repair$;

revoke all on function public.approve_content_draft_work_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_content_draft_work_order(uuid, uuid)
  to service_role;

commit;
