-- Com_Moon Hub OS
-- Unified ledger schema v1 for personal operations, content, sales, ops, and automation.

create extension if not exists pgcrypto;

-- ============================================================================
-- Core
-- ============================================================================

create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  role text not null default 'owner' check (role in ('owner', 'operator', 'viewer')),
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  slug text unique not null,
  name text not null,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now()
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'focus' check (kind in ('focus', 'client', 'brand', 'ops', 'growth', 'personal')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  area_id uuid references areas(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'blocked', 'completed', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  next_action text,
  started_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'blocked', 'done')),
  target_date date,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  title text not null,
  status text not null default 'todo' check (status in ('inbox', 'todo', 'doing', 'blocked', 'done')),
  next_action text,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  summary text not null,
  rationale text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table project_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  source text not null default 'manual',
  event_type text not null default 'progress',
  status text not null default 'reported' check (status in ('reported', 'active', 'blocked', 'done')),
  title text not null,
  summary text,
  progress integer check (progress between 0 and 100),
  milestone text,
  next_action text,
  payload jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table routine_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  check_type text not null check (check_type in ('morning', 'midday', 'evening', 'weekly')),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'blocked')),
  note text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Content OS
-- ============================================================================

create table content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid references profiles(id) on delete set null,
  brand_id uuid references brands(id) on delete set null,
  title text not null,
  source_idea text,
  idea_source text,
  source_type text not null default 'idea' check (source_type in ('idea', 'brief', 'meeting', 'research', 'repurpose', 'manual', 'studio', 'import')),
  status text not null default 'draft' check (status in ('idea', 'draft', 'review', 'scheduled', 'published', 'archived')),
  summary text,
  next_action text,
  slug text,
  scheduled_at timestamptz,
  published_at timestamptz,
  rank_score numeric not null default 0,
  cadence_week text,
  visibility text not null default 'private',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_id uuid not null references content_items(id) on delete cascade,
  variant_type text not null check (variant_type in ('newsletter', 'blog_insight', 'card_news', 'x_thread', 'reels_script')),
  title text,
  body text not null default '',
  summary text,
  excerpt text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  slug text,
  seo_title text,
  seo_description text,
  scheduled_at timestamptz,
  published_at timestamptz,
  channel text,
  visibility text not null default 'private',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  asset_type text not null check (asset_type in ('image', 'html', 'zip', 'thumbnail', 'source')),
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  checksum text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table publish_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  channel text not null,
  status text not null default 'queued' check (status in ('queued', 'published', 'failed')),
  provider text,
  target_url text,
  external_id text,
  attempt_count integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- CRM / Sales
-- ============================================================================

create table companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  website text,
  status text not null default 'active' check (status in ('active', 'prospect', 'inactive')),
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  name text not null,
  email text,
  title text,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  source text,
  status text not null default 'new' check (status in ('new', 'qualified', 'nurturing', 'won', 'lost')),
  score integer not null default 0,
  next_action text,
  created_at timestamptz not null default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  title text not null,
  amount numeric not null default 0,
  stage text not null default 'prospect' check (stage in ('prospect', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close_at timestamptz,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  channel text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table campaign_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failure')),
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Ops OS
-- ============================================================================

create table customer_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  created_at timestamptz not null default now()
);

create table operation_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_account_id uuid references customer_accounts(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'waiting', 'blocked', 'closed')),
  next_action text,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  operation_case_id uuid references operation_cases(id) on delete set null,
  title text not null,
  document_type text not null,
  storage_path text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'signed', 'archived')),
  created_at timestamptz not null default now()
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  operation_case_id uuid references operation_cases(id) on delete set null,
  title text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'mitigated', 'closed')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Automation / Integrations / Security
-- ============================================================================

create table agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  agent_type text not null default 'system' check (agent_type in ('system', 'strategist', 'content', 'sales', 'ops')),
  status text not null default 'idle' check (status in ('idle', 'running', 'error', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table triggers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual', 'schedule', 'webhook', 'event')),
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  trigger_id uuid references triggers(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'disabled')),
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  automation_id uuid references automations(id) on delete set null,
  agent_id uuid references agents(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failure', 'ignored')),
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table memos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table prompt_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table field_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,
  source_field text not null,
  target_field text not null,
  mapping_type text not null default 'copy' check (mapping_type in ('copy', 'transform', 'constant')),
  created_at timestamptz not null default now()
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  connection_id uuid references integration_connections(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failure')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  provider text not null,
  route_path text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  endpoint_id uuid references webhook_endpoints(id) on delete set null,
  event_type text not null,
  source text not null default 'webhook',
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  correlation_id text,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  automation_run_id uuid references automation_runs(id) on delete set null,
  context text not null,
  payload jsonb not null default '{}'::jsonb,
  trace text,
  level text not null default 'error' check (level in ('debug', 'info', 'warn', 'error')),
  source text not null default 'system',
  resolved boolean not null default false,
  timestamp timestamptz not null default now()
);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid references profiles(id) on delete set null,
  provider text not null,
  encrypted_key text not null,
  iv text not null,
  tag text not null,
  last4 text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table secret_rotations (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references api_keys(id) on delete cascade,
  rotated_at timestamptz not null default now(),
  reason text
);

create table export_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  export_type text not null,
  status text not null default 'requested' check (status in ('requested', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index idx_projects_workspace_status on projects (workspace_id, status);
create index idx_project_updates_workspace_happened on project_updates (workspace_id, happened_at desc);
create index idx_tasks_workspace_status on tasks (workspace_id, status);
create index idx_content_items_workspace_status on content_items (workspace_id, status);
create index idx_content_variants_content on content_variants (content_id, variant_type);
create index idx_leads_workspace_status on leads (workspace_id, status);
create index idx_operation_cases_workspace_status on operation_cases (workspace_id, status);
create index idx_automation_runs_workspace_status on automation_runs (workspace_id, status);
create index idx_sync_runs_workspace_status on sync_runs (workspace_id, status);
create index idx_webhook_events_workspace_received on webhook_events (workspace_id, received_at desc);
create unique index idx_webhook_events_provider_event
  on webhook_events (workspace_id, source, provider_event_id)
  where provider_event_id is not null;
create index idx_error_logs_workspace_timestamp on error_logs (workspace_id, timestamp desc);
create index idx_activity_logs_workspace_created on activity_logs (workspace_id, created_at desc);

-- Bootstrap prerequisite source: supabase/migrations/20260420_0001_supabase_first_foundation.sql
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

-- Bootstrap prerequisite source: supabase/migrations/20260618_0008_outreach_outcomes.sql
-- Learning sink for the sales daily-loop (closes the loop).
--
-- Approved design: clmagi-codex-moonlight-p0-hardening-design-20260618-000940.md
-- (orchestration operating model). Each outreach result is logged here so the
-- next day's triage can read recent outcomes and bias prioritization — without
-- this table the loop is open and the "5x" target has no machinery behind it.
--
-- Records the human-executed sales motion (phone/visit/kakao), tied back to the
-- lead/deal/company and the play that produced the asset. Additive + idempotent.

create table if not exists public.outreach_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  play text,                       -- which play produced this (e.g. district-academy-first-touch)
  asset_id text,                   -- content asset reference, if any
  channel text,                    -- phone | visit | kakao | email | other
  action text not null default 'sent'
    check (action in ('sent', 'replied', 'meeting', 'proposal', 'won', 'lost', 'no_response')),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_outcomes_recent
  on public.outreach_outcomes (workspace_id, occurred_at desc);
create index if not exists idx_outreach_outcomes_lead
  on public.outreach_outcomes (workspace_id, lead_id);
create index if not exists idx_outreach_outcomes_play
  on public.outreach_outcomes (workspace_id, play, occurred_at desc);

-- Bootstrap prerequisite source: supabase/migrations/20260619_0011_work_orders_agent_runs.sql
-- Sales OS 심화 v0 — 반자동 큐 + 에피소드 메모리 (Phase 0 토대).
--
-- 설계: docs/sales-os/ai-sales-system-deep-config.md (Phase 0)
-- 페르소나(/team)·인박스(/inbox)·Guru 가 산출하는 "제안"을 사람이 1클릭 승인하기 전까지
-- 머무는 큐(work_orders)와, 각 에이전트 실행 1건을 기억하는 로그(agent_runs)를 추가.
-- registry.json gates.no_auto_send=true → 모든 외부 액션은 status='approved' 이후에만.
--
-- 안전: 신규 테이블만 추가(additive). 멱등: create table/index if not exists.
-- 의존: workspaces·leads·deals·companies(0001~), outreach_outcomes(0008). 새 컬럼/제약 변경 없음.

-- (1) agent_runs — 에피소드 메모리. 페르소나/Guru 실행 1건 = 1행. 나중에 outcome 으로 귀속.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent text not null,                       -- persona_id (order|sales|content|production|review) | 'guru'
  mode text,                                 -- guru 코칭 모드(deal-review 등) 또는 페르소나 단계
  ref text,                                  -- 대상 식별자(deal id / lead id / account name)
  input_summary text,                        -- 조립된 컨텍스트 지문(트림)
  recommendation jsonb,                      -- 에이전트가 제안한 내용
  emitted_count integer not null default 0,  -- 이 실행이 만든 work_orders 수
  result text not null default 'ok'
    check (result in ('ok', 'needs_human', 'error')),
  outcome_id uuid references public.outreach_outcomes(id) on delete set null,  -- 사후 성과 귀속(학습)
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_recent
  on public.agent_runs (workspace_id, ran_at desc);
create index if not exists idx_agent_runs_ref
  on public.agent_runs (workspace_id, ref);
create index if not exists idx_agent_runs_agent
  on public.agent_runs (workspace_id, agent, ran_at desc);

-- (2) work_orders — 반자동 승인 큐. 페르소나/인박스/Guru 가 'proposed' 로 적재.
--     데일리 브리프에서 1클릭 승인 → 'approved' → 실행 → 'executed'.
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  persona text not null,                     -- persona_id | 'guru' | 'inbox'
  kind text not null,                        -- emit 종류: next_action | followup | idea | skeleton | review | dispatch | note
  title text not null,                       -- 오퍼레이터용 짧은 라벨
  body jsonb not null default '{}'::jsonb,    -- 페르소나 emit 페이로드(next_action/objection/ideas/skeleton/...)
  -- 파이프라인 참조(모두 nullable: 딜/리드/회사 또는 콘텐츠 자산을 겨눔)
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  asset_id text,
  channel text,                              -- phone | visit | kakao | email | dm | publish | other
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'executed', 'dismissed')),
  gate text,                                 -- 페르소나 gate: outbound->codex | internal->auto | orchestrates | n/a
  source text not null default 'team'
    check (source in ('team', 'inbox', 'guru', 'manual')),
  run_id uuid references public.agent_runs(id) on delete set null,  -- 이 제안을 만든 실행
  outcome_id uuid references public.outreach_outcomes(id) on delete set null,  -- 실행 후 성과(루프 닫기)
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,                    -- 승인/기각 시각
  executed_at timestamptz,                   -- 외부 액션 발사 시각
  created_at timestamptz not null default now()
);

-- 승인 대기 큐(데일리 브리프 콕핏): 워크스페이스 × 상태 × 최신순.
create index if not exists idx_work_orders_queue
  on public.work_orders (workspace_id, status, proposed_at desc);
create index if not exists idx_work_orders_deal
  on public.work_orders (workspace_id, deal_id);
create index if not exists idx_work_orders_lead
  on public.work_orders (workspace_id, lead_id);
create index if not exists idx_work_orders_company
  on public.work_orders (workspace_id, company_id);
create index if not exists idx_work_orders_run
  on public.work_orders (run_id);

-- Source: supabase/migrations/20260713_0015_durable_task_loop.sql
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
