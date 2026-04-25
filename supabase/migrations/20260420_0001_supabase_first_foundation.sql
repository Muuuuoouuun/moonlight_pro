-- Moonlight Supabase-first foundation
-- Applies the P0 operating-ledger layer on top of the existing schema.sql.
--
-- Intent:
-- 1. Keep current Hub/Engine table contracts intact.
-- 2. Add workspace membership, brand context, public content metadata, and
--    operational fields needed by the project detail surfaces.
-- 3. Prepare RLS helper functions without enabling RLS globally yet.

create extension if not exists pgcrypto;

-- ============================================================================
-- Common updated_at trigger
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Auth / Workspace
-- ============================================================================

alter table if exists profiles
  add column if not exists avatar_url text,
  add column if not exists default_workspace_id uuid references workspaces(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists workspaces
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

create table if not exists workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

insert into workspace_memberships (workspace_id, user_id, role, status)
select w.id, w.owner_id, 'owner', 'active'
from workspaces w
where w.owner_id is not null
on conflict (workspace_id, user_id) do nothing;

update profiles p
set default_workspace_id = w.id
from workspaces w
where w.owner_id = p.id
  and p.default_workspace_id is null;

-- ============================================================================
-- Brand / Context
-- ============================================================================

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  kind text,
  status text not null default 'active' check (status in ('active', 'archived')),
  color_hex text,
  description text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

-- ============================================================================
-- Work OS
-- ============================================================================

alter table if exists areas
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists projects
  add column if not exists brand_id uuid references brands(id) on delete set null,
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists progress integer not null default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists tasks
  add column if not exists area_id uuid references areas(id) on delete set null,
  add column if not exists priority text not null default 'medium',
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists notes
  add column if not exists actor_id uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists decisions
  add column if not exists actor_id uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists project_updates
  add column if not exists actor_id uuid references profiles(id) on delete set null,
  add column if not exists provider_event_id text,
  add column if not exists correlation_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists routine_checks
  add column if not exists actor_id uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- ============================================================================
-- Content OS / Public web
-- ============================================================================

alter table if exists content_items
  add column if not exists brand_id uuid references brands(id) on delete set null,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists idea_source text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists visibility text not null default 'private',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists content_variants
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists visibility text not null default 'private',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists content_assets
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists checksum text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists publish_logs
  add column if not exists provider text,
  add column if not exists target_url text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- Revenue / Ops
-- ============================================================================

alter table if exists leads
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists channel text,
  add column if not exists last_touch_at timestamptz,
  add column if not exists qualified_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists deals
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists currency text not null default 'KRW',
  add column if not exists next_action text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists customer_accounts
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists health_score integer,
  add column if not exists next_action text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists operation_cases
  add column if not exists priority text not null default 'medium',
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- ============================================================================
-- Automation / Integration / Logs
-- ============================================================================

alter table if exists agents
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists triggers
  add column if not exists updated_at timestamptz not null default now();

alter table if exists automations
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table if exists automation_runs
  add column if not exists triggered_by_user_id uuid references profiles(id) on delete set null,
  add column if not exists correlation_id text,
  add column if not exists provider_event_id text;

alter table if exists integration_connections
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists external_account_id text;

alter table if exists sync_runs
  add column if not exists correlation_id text,
  add column if not exists provider_event_id text;

alter table if exists webhook_events
  add column if not exists correlation_id text,
  add column if not exists provider_event_id text;

alter table if exists error_logs
  add column if not exists correlation_id text;

alter table if exists activity_logs
  add column if not exists correlation_id text;

-- ============================================================================
-- Constraints that are safe to add after seed data
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_progress_range') then
    alter table projects add constraint projects_progress_range check (progress between 0 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table tasks add constraint tasks_priority_check check (priority in ('low', 'medium', 'high', 'critical'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_items_visibility_check') then
    alter table content_items add constraint content_items_visibility_check check (visibility in ('private', 'workspace', 'public'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_variants_visibility_check') then
    alter table content_variants add constraint content_variants_visibility_check check (visibility in ('private', 'workspace', 'public'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'customer_accounts_health_score_range') then
    alter table customer_accounts add constraint customer_accounts_health_score_range check (health_score is null or health_score between 0 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'operation_cases_priority_check') then
    alter table operation_cases add constraint operation_cases_priority_check check (priority in ('low', 'medium', 'high', 'critical'));
  end if;
end;
$$;

-- ============================================================================
-- RLS helper functions
-- ============================================================================

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
  );
$$;

grant execute on function public.is_workspace_member(uuid) to anon, authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[]) to anon, authenticated, service_role;

-- ============================================================================
-- Public content read view
-- ============================================================================

create or replace view public.public_content_variants as
select
  cv.id,
  cv.workspace_id,
  cv.content_id,
  ci.brand_id,
  b.slug as brand_slug,
  b.name as brand_name,
  cv.variant_type,
  coalesce(cv.title, ci.title) as title,
  coalesce(cv.summary, ci.summary) as summary,
  cv.excerpt,
  cv.body,
  cv.slug,
  cv.seo_title,
  cv.seo_description,
  cv.published_at,
  cv.created_at,
  cv.updated_at,
  cv.meta
from content_variants cv
join content_items ci on ci.id = cv.content_id
left join brands b on b.id = ci.brand_id
where cv.visibility = 'public'
  and cv.status = 'published'
  and cv.published_at is not null
  and ci.visibility in ('workspace', 'public')
  and ci.status in ('published', 'scheduled', 'review', 'draft');

grant select on public.public_content_variants to anon, authenticated;

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_workspace_memberships_user_status
  on workspace_memberships (user_id, status);

create index if not exists idx_workspace_memberships_workspace_role
  on workspace_memberships (workspace_id, role, status);

create index if not exists idx_brands_workspace_status
  on brands (workspace_id, status);

create unique index if not exists idx_projects_workspace_slug
  on projects (workspace_id, slug)
  where slug is not null;

create index if not exists idx_projects_workspace_brand_status
  on projects (workspace_id, brand_id, status);

create index if not exists idx_projects_workspace_updated
  on projects (workspace_id, updated_at desc);

create index if not exists idx_tasks_workspace_owner_status_due
  on tasks (workspace_id, owner_id, status, due_at);

create index if not exists idx_tasks_workspace_project_status
  on tasks (workspace_id, project_id, status);

create index if not exists idx_project_updates_project_happened
  on project_updates (workspace_id, project_id, happened_at desc);

create index if not exists idx_project_updates_correlation
  on project_updates (workspace_id, correlation_id)
  where correlation_id is not null;

create index if not exists idx_content_items_workspace_brand_status_updated
  on content_items (workspace_id, brand_id, status, updated_at desc);

create unique index if not exists idx_content_items_workspace_slug
  on content_items (workspace_id, slug)
  where slug is not null;

create index if not exists idx_content_variants_public
  on content_variants (workspace_id, visibility, status, published_at desc);

create unique index if not exists idx_content_variants_workspace_slug
  on content_variants (workspace_id, slug)
  where slug is not null;

create index if not exists idx_leads_workspace_owner_touch
  on leads (workspace_id, owner_id, last_touch_at desc);

create index if not exists idx_deals_workspace_stage_close
  on deals (workspace_id, stage, expected_close_at);

create index if not exists idx_customer_accounts_workspace_owner_status
  on customer_accounts (workspace_id, owner_id, status);

create index if not exists idx_operation_cases_workspace_owner_status
  on operation_cases (workspace_id, owner_id, status);

create index if not exists idx_automation_runs_correlation
  on automation_runs (workspace_id, correlation_id)
  where correlation_id is not null;

create unique index if not exists idx_webhook_events_provider_event
  on webhook_events (workspace_id, source, provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_error_logs_correlation
  on error_logs (workspace_id, correlation_id)
  where correlation_id is not null;

-- ============================================================================
-- Attach updated_at triggers
-- ============================================================================

do $$
declare
  table_name text;
  table_reg regclass;
  trigger_name text;
begin
  foreach table_name in array array[
    'profiles',
    'workspaces',
    'workspace_memberships',
    'brands',
    'areas',
    'projects',
    'tasks',
    'notes',
    'decisions',
    'project_updates',
    'routine_checks',
    'content_items',
    'content_variants',
    'content_assets',
    'publish_logs',
    'leads',
    'deals',
    'customer_accounts',
    'operation_cases',
    'agents',
    'triggers',
    'automations',
    'integration_connections'
  ]
  loop
    table_reg := to_regclass(format('public.%I', table_name));
    trigger_name := table_name || '_set_updated_at';

    if table_reg is not null and not exists (
      select 1
      from pg_trigger
      where tgname = trigger_name
        and tgrelid = table_reg
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        trigger_name,
        table_name
      );
    end if;
  end loop;
end;
$$;
