-- Original notes/captures stay in their own ledger; links are explicit, never inferred.
create table if not exists public.task_memo_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  created_task boolean not null default false,
  created_at timestamptz not null default now(),
  check (num_nonnulls(note_id, work_order_id) = 1)
);
create unique index if not exists task_memo_note_unique on public.task_memo_links(task_id, note_id) where note_id is not null;
create unique index if not exists task_memo_capture_unique on public.task_memo_links(task_id, work_order_id) where work_order_id is not null;
create unique index if not exists task_memo_note_conversion_unique on public.task_memo_links(workspace_id, note_id) where created_task and note_id is not null;
create unique index if not exists task_memo_capture_conversion_unique on public.task_memo_links(workspace_id, work_order_id) where created_task and work_order_id is not null;
create index if not exists task_memo_workspace_task on public.task_memo_links(workspace_id, task_id);
alter table public.task_memo_links enable row level security;
-- Private Hub/Engine access uses service_role. No browser write access.
revoke all on public.task_memo_links from anon, authenticated;
grant all on public.task_memo_links to service_role;

create or replace function public.link_memo_task_v1(
  p_workspace_id uuid, p_source_kind text, p_source_id uuid, p_action text,
  p_task_id uuid default null, p_title text default '', p_project_id uuid default null,
  p_due_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task_id uuid;
  v_link_id uuid;
  v_owner_id uuid;
begin
  if p_source_kind not in ('note', 'work_order') or p_action not in ('create', 'link')
     or p_source_kind is null or p_action is null or p_source_id is null or p_workspace_id is null then
    return jsonb_build_object('status','invalid-input','error','invalid-source');
  end if;
  -- Serializes conversion and linking of the same original, including independent tabs.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || p_source_kind || p_source_id::text, 0));
  if p_source_kind = 'note' then
    perform 1 from public.notes where id=p_source_id and workspace_id=p_workspace_id for share;
  else
    perform 1 from public.work_orders where id=p_source_id and workspace_id=p_workspace_id
      and source='inbox' and kind in ('capture','note','idea') for share;
  end if;
  if not found then return jsonb_build_object('status','invalid-input','error','source-not-found'); end if;

  if p_action = 'create' then
    select task_id, id into v_task_id, v_link_id from public.task_memo_links
      where workspace_id=p_workspace_id and created_task
        and (case when p_source_kind='note' then note_id=p_source_id else work_order_id=p_source_id end);
    if found then return jsonb_build_object('status','duplicate','taskId',v_task_id,'linkId',v_link_id); end if;
    if p_title is null or length(trim(p_title))=0 or length(p_title)>300 then
      return jsonb_build_object('status','invalid-input','error','invalid-title');
    end if;
    perform 1 from public.projects where id=p_project_id and workspace_id=p_workspace_id for share;
    if not found then return jsonb_build_object('status','invalid-input','error','project-not-found'); end if;
    select owner_id into v_owner_id from public.workspaces where id=p_workspace_id;
    insert into public.tasks(workspace_id, project_id, owner_id, title, status, priority, due_at, meta)
      values(p_workspace_id,p_project_id,v_owner_id,trim(p_title),'todo','medium',p_due_at,
        jsonb_build_object('source','memo-conversion')) returning id into v_task_id;
  else
    select id into v_task_id from public.tasks where id=p_task_id and workspace_id=p_workspace_id for share;
    if not found then return jsonb_build_object('status','invalid-input','error','task-not-found'); end if;
    select id into v_link_id from public.task_memo_links where task_id=v_task_id and workspace_id=p_workspace_id
      and (case when p_source_kind='note' then note_id=p_source_id else work_order_id=p_source_id end);
    if found then return jsonb_build_object('status','duplicate','taskId',v_task_id,'linkId',v_link_id); end if;
  end if;
  insert into public.task_memo_links(workspace_id,task_id,note_id,work_order_id,created_task)
    values(p_workspace_id,v_task_id,case when p_source_kind='note' then p_source_id else null end,
      case when p_source_kind='work_order' then p_source_id else null end,p_action='create') returning id into v_link_id;
  return jsonb_build_object('status','saved','taskId',v_task_id,'linkId',v_link_id);
end;
$$;
revoke all on function public.link_memo_task_v1(uuid,text,uuid,text,uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.link_memo_task_v1(uuid,text,uuid,text,uuid,text,uuid,timestamptz) to service_role;
