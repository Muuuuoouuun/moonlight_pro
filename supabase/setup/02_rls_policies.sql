-- Moonlight RLS policy setup
-- Apply after 00_live_schema.sql and after auth users are represented in
-- profiles + workspace_memberships.
--
-- Service role bypasses RLS, so Hub/Engine server writes keep working when
-- SUPABASE_SERVICE_ROLE_KEY is used.

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

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
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
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_select_member', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_insert_operator', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_update_operator', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_delete_owner', target_table);

    execute format(
      'create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))',
      target_table || '_select_member',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.has_workspace_role(workspace_id, array[''owner'', ''operator'']))',
      target_table || '_insert_operator',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update using (public.has_workspace_role(workspace_id, array[''owner'', ''operator''])) with check (public.has_workspace_role(workspace_id, array[''owner'', ''operator'']))',
      target_table || '_update_operator',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete using (public.has_workspace_role(workspace_id, array[''owner'']))',
      target_table || '_delete_owner',
      target_table
    );
  end loop;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'automation_runs',
    'sync_runs',
    'webhook_events',
    'error_logs',
    'activity_logs'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', target_table || '_select_member', target_table);
    execute format(
      'create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))',
      target_table || '_select_member',
      target_table
    );
  end loop;
end;
$$;

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
