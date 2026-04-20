-- Moonlight Supabase-first RLS policy pack
--
-- Run this after Supabase Auth is connected and workspace_memberships contains
-- the active users for each workspace.
--
-- Service role bypasses RLS, so Engine/Hub server writes that use
-- SUPABASE_SERVICE_ROLE_KEY keep working. Browser/client access should go
-- through authenticated users and these membership policies.

create or replace function public.shares_workspace_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships mine
    join public.workspace_memberships theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
      and mine.status = 'active'
      and theirs.status = 'active'
  );
$$;

grant execute on function public.shares_workspace_with(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- Membership table
-- ============================================================================

alter table public.workspace_memberships enable row level security;

drop policy if exists workspace_memberships_select_self on public.workspace_memberships;
create policy workspace_memberships_select_self
on public.workspace_memberships
for select
using (
  user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists workspace_memberships_write_owner on public.workspace_memberships;
create policy workspace_memberships_write_owner
on public.workspace_memberships
for all
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

-- ============================================================================
-- Business data: members can read, owners/operators can write.
-- ============================================================================

do $$
declare
  table_name text;
  select_policy text;
  insert_policy text;
  update_policy text;
  delete_policy text;
begin
  foreach table_name in array array[
    'areas',
    'brands',
    'projects',
    'milestones',
    'tasks',
    'notes',
    'decisions',
    'project_updates',
    'routine_checks',
    'content_items',
    'content_variants',
    'content_assets',
    'publish_logs',
    'companies',
    'contacts',
    'leads',
    'deals',
    'campaigns',
    'campaign_runs',
    'customer_accounts',
    'operation_cases',
    'documents',
    'issues',
    'agents',
    'triggers',
    'automations',
    'memos',
    'prompt_templates',
    'integration_connections',
    'field_mappings',
    'webhook_endpoints',
    'export_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);

    select_policy := table_name || '_select_member';
    insert_policy := table_name || '_insert_operator';
    update_policy := table_name || '_update_operator';
    delete_policy := table_name || '_delete_owner';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = select_policy
    ) then
      execute format(
        'create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))',
        select_policy,
        table_name
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = insert_policy
    ) then
      execute format(
        'create policy %I on public.%I for insert with check (public.has_workspace_role(workspace_id, array[''owner'', ''operator'']))',
        insert_policy,
        table_name
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = update_policy
    ) then
      execute format(
        'create policy %I on public.%I for update using (public.has_workspace_role(workspace_id, array[''owner'', ''operator''])) with check (public.has_workspace_role(workspace_id, array[''owner'', ''operator'']))',
        update_policy,
        table_name
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = delete_policy
    ) then
      execute format(
        'create policy %I on public.%I for delete using (public.has_workspace_role(workspace_id, array[''owner'']))',
        delete_policy,
        table_name
      );
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- System ledgers: members can read, service role writes.
-- ============================================================================

do $$
declare
  table_name text;
  select_policy text;
begin
  foreach table_name in array array[
    'automation_runs',
    'sync_runs',
    'webhook_events',
    'error_logs',
    'activity_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);

    select_policy := table_name || '_select_member';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = select_policy
    ) then
      execute format(
        'create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))',
        select_policy,
        table_name
      );
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- Profiles / Workspaces
-- ============================================================================

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
using (
  id = auth.uid()
  or public.shares_workspace_with(id)
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

alter table public.workspaces enable row level security;

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
on public.workspaces
for select
using (public.is_workspace_member(id));

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
on public.workspaces
for update
using (public.has_workspace_role(id, array['owner']))
with check (public.has_workspace_role(id, array['owner']));
