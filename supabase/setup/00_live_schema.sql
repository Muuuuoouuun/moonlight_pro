-- Moonlight live Supabase schema setup
-- Apply first on a new Supabase project. Safe to re-run.
-- This file intentionally does not enable RLS; run 02_rls_policies.sql after
-- Supabase Auth users and workspace_memberships are ready.

create extension if not exists pgcrypto;

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
-- Core
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  role text not null default 'owner' check (role in ('owner', 'operator', 'viewer')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  slug text unique not null,
  name text not null,
  timezone text not null default 'Asia/Seoul',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists avatar_url text,
  add column if not exists default_workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.workspaces
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text,
  name text not null,
  description text,
  kind text not null default 'focus' check (kind in ('focus', 'client', 'brand', 'ops', 'growth', 'personal')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
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

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  slug text,
  name text not null,
  summary text,
  status text not null default 'active' check (status in ('draft', 'active', 'blocked', 'completed', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  progress integer not null default 0 check (progress between 0 and 100),
  next_action text,
  started_at timestamptz,
  due_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'blocked', 'done')),
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  status text not null default 'todo' check (status in ('inbox', 'todo', 'doing', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  next_action text,
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  summary text not null,
  rationale text,
  decided_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  source text not null default 'manual',
  event_type text not null default 'progress',
  status text not null default 'reported' check (status in ('reported', 'active', 'blocked', 'done')),
  title text not null,
  summary text,
  progress integer check (progress between 0 and 100),
  milestone text,
  next_action text,
  correlation_id text,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  check_type text not null check (check_type in ('morning', 'midday', 'evening', 'weekly')),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'blocked')),
  note text,
  meta jsonb not null default '{}'::jsonb,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Content OS
-- ============================================================================

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  slug text,
  title text not null,
  summary text,
  source_idea text,
  idea_source text,
  source_type text not null default 'idea',
  status text not null default 'draft' check (status in ('idea', 'draft', 'review', 'scheduled', 'published', 'archived')),
  next_action text,
  scheduled_at timestamptz,
  published_at timestamptz,
  visibility text not null default 'private',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  variant_type text not null,
  title text,
  summary text,
  excerpt text,
  body text not null default '',
  slug text,
  seo_title text,
  seo_description text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  visibility text not null default 'private',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
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

create table if not exists public.publish_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
  channel text not null,
  provider text,
  status text not null default 'queued' check (status in ('queued', 'published', 'failed')),
  external_id text,
  target_url text,
  attempt_count integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- CRM / Revenue / Ops
-- ============================================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  website text,
  status text not null default 'active' check (status in ('active', 'prospect', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  email text,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text,
  email text,
  phone text,
  source text,
  channel text,
  status text not null default 'new' check (status in ('new', 'qualified', 'nurturing', 'won', 'lost')),
  score integer not null default 0,
  next_action text,
  last_touch_at timestamptz,
  qualified_at timestamptz,
  lost_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  amount numeric not null default 0,
  currency text not null default 'KRW',
  stage text not null default 'prospect' check (stage in ('prospect', 'proposal', 'negotiation', 'won', 'lost')),
  next_action text,
  expected_close_at timestamptz,
  last_activity_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  channel text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failure')),
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  started_at timestamptz,
  ended_at timestamptz,
  health_score integer check (health_score is null or health_score between 0 and 100),
  next_action text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operation_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_account_id uuid references public.customer_accounts(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'waiting', 'blocked', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  next_action text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_case_id uuid references public.operation_cases(id) on delete set null,
  title text not null,
  document_type text not null,
  storage_path text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'signed', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_case_id uuid references public.operation_cases(id) on delete set null,
  title text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'mitigated', 'closed')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Automation / Integrations / Security
-- ============================================================================

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  agent_type text not null default 'system' check (agent_type in ('system', 'strategist', 'content', 'sales', 'ops')),
  status text not null default 'idle' check (status in ('idle', 'running', 'error', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.triggers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual', 'schedule', 'webhook', 'event')),
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  trigger_id uuid references public.triggers(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'disabled')),
  last_run_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  triggered_by_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failure', 'ignored')),
  correlation_id text,
  provider_event_id text,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  external_account_id text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  source_field text not null,
  target_field text not null,
  mapping_type text not null default 'copy' check (mapping_type in ('copy', 'transform', 'constant')),
  created_at timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failure')),
  correlation_id text,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  provider text not null,
  route_path text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
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

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  automation_run_id uuid references public.automation_runs(id) on delete set null,
  context text not null,
  payload jsonb not null default '{}'::jsonb,
  trace text,
  correlation_id text,
  level text not null default 'error' check (level in ('debug', 'info', 'warn', 'error')),
  source text not null default 'system',
  resolved boolean not null default false,
  timestamp timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  correlation_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  provider text not null,
  encrypted_key text not null,
  iv text not null,
  tag text not null,
  last4 text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.secret_rotations (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  rotated_at timestamptz not null default now(),
  reason text
);

create table if not exists public.export_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  export_type text not null,
  status text not null default 'requested' check (status in ('requested', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Existing-database column backfill
-- ============================================================================

alter table if exists public.areas
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.projects
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists progress integer not null default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.milestones
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.milestones m
set workspace_id = p.workspace_id
from public.projects p
where m.project_id = p.id
  and m.workspace_id is null;

alter table if exists public.tasks
  add column if not exists area_id uuid references public.areas(id) on delete set null,
  add column if not exists priority text not null default 'medium',
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.project_updates
  add column if not exists actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists provider_event_id text,
  add column if not exists correlation_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.routine_checks
  add column if not exists actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_items
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists idea_source text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists visibility text not null default 'private',
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_variants
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists visibility text not null default 'private',
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_assets
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists checksum text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.publish_logs
  add column if not exists provider text,
  add column if not exists target_url text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.leads
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists channel text,
  add column if not exists last_touch_at timestamptz,
  add column if not exists qualified_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.deals
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists currency text not null default 'KRW',
  add column if not exists next_action text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.customer_accounts
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists health_score integer,
  add column if not exists next_action text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.operation_cases
  add column if not exists priority text not null default 'medium',
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.agents
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.triggers
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.automations
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.automation_runs
  add column if not exists triggered_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists correlation_id text,
  add column if not exists provider_event_id text;

alter table if exists public.integration_connections
  add column if not exists external_account_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.sync_runs
  add column if not exists correlation_id text,
  add column if not exists provider_event_id text;

alter table if exists public.webhook_events
  add column if not exists correlation_id text,
  add column if not exists provider_event_id text;

alter table if exists public.error_logs
  add column if not exists correlation_id text;

alter table if exists public.activity_logs
  add column if not exists correlation_id text;

-- ============================================================================
-- Contract fixes
-- ============================================================================

alter table if exists public.content_items
  drop constraint if exists content_items_source_type_check;
alter table if exists public.content_items
  add constraint content_items_source_type_check
  check (source_type in ('idea', 'brief', 'meeting', 'research', 'repurpose', 'manual', 'import', 'generated'));

alter table if exists public.content_variants
  drop constraint if exists content_variants_variant_type_check;
alter table if exists public.content_variants
  add constraint content_variants_variant_type_check
  check (variant_type in (
    'newsletter',
    'blog_insight',
    'card_news',
    'x_thread',
    'reels_script'
  ));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_items_visibility_check') then
    alter table public.content_items
      add constraint content_items_visibility_check
      check (visibility in ('private', 'workspace', 'public'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_variants_visibility_check') then
    alter table public.content_variants
      add constraint content_variants_visibility_check
      check (visibility in ('private', 'workspace', 'public'));
  end if;
end;
$$;

-- ============================================================================
-- RLS helper functions and public content view
-- ============================================================================

insert into public.workspace_memberships (workspace_id, user_id, role, status)
select w.id, w.owner_id, 'owner', 'active'
from public.workspaces w
where w.owner_id is not null
on conflict (workspace_id, user_id) do nothing;

update public.profiles p
set default_workspace_id = w.id
from public.workspaces w
where w.owner_id = p.id
  and p.default_workspace_id is null;

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
from public.content_variants cv
join public.content_items ci on ci.id = cv.content_id
left join public.brands b on b.id = ci.brand_id
where cv.visibility = 'public'
  and cv.status = 'published'
  and cv.published_at is not null
  and ci.visibility in ('workspace', 'public')
  and ci.status in ('published', 'scheduled', 'review', 'draft');

grant select on public.public_content_variants to anon, authenticated;

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_projects_workspace_status on public.projects (workspace_id, status);
create index if not exists idx_projects_workspace_brand_status on public.projects (workspace_id, brand_id, status);
create index if not exists idx_projects_workspace_updated on public.projects (workspace_id, updated_at desc);
create unique index if not exists idx_projects_workspace_slug on public.projects (workspace_id, slug) where slug is not null;
create index if not exists idx_project_updates_workspace_happened on public.project_updates (workspace_id, happened_at desc);
create index if not exists idx_project_updates_project_happened on public.project_updates (workspace_id, project_id, happened_at desc);
create index if not exists idx_project_updates_correlation on public.project_updates (workspace_id, correlation_id) where correlation_id is not null;
create index if not exists idx_tasks_workspace_status on public.tasks (workspace_id, status);
create index if not exists idx_tasks_workspace_owner_status_due on public.tasks (workspace_id, owner_id, status, due_at);
create index if not exists idx_tasks_workspace_project_status on public.tasks (workspace_id, project_id, status);
create index if not exists idx_workspace_memberships_user_status on public.workspace_memberships (user_id, status);
create index if not exists idx_workspace_memberships_workspace_role on public.workspace_memberships (workspace_id, role, status);
create index if not exists idx_brands_workspace_status on public.brands (workspace_id, status);
create index if not exists idx_content_items_workspace_status on public.content_items (workspace_id, status);
create index if not exists idx_content_items_workspace_brand_status_updated on public.content_items (workspace_id, brand_id, status, updated_at desc);
create unique index if not exists idx_content_items_workspace_slug on public.content_items (workspace_id, slug) where slug is not null;
create index if not exists idx_content_variants_content on public.content_variants (content_id, variant_type);
create index if not exists idx_content_variants_public on public.content_variants (workspace_id, visibility, status, published_at desc);
create unique index if not exists idx_content_variants_workspace_slug on public.content_variants (workspace_id, slug) where slug is not null;
create index if not exists idx_leads_workspace_status on public.leads (workspace_id, status);
create index if not exists idx_leads_workspace_owner_touch on public.leads (workspace_id, owner_id, last_touch_at desc);
create index if not exists idx_deals_workspace_stage_close on public.deals (workspace_id, stage, expected_close_at);
create index if not exists idx_operation_cases_workspace_status on public.operation_cases (workspace_id, status);
create index if not exists idx_operation_cases_workspace_owner_status on public.operation_cases (workspace_id, owner_id, status);
create index if not exists idx_customer_accounts_workspace_owner_status on public.customer_accounts (workspace_id, owner_id, status);
create index if not exists idx_automation_runs_workspace_status on public.automation_runs (workspace_id, status);
create index if not exists idx_automation_runs_correlation on public.automation_runs (workspace_id, correlation_id) where correlation_id is not null;
create index if not exists idx_sync_runs_workspace_status on public.sync_runs (workspace_id, status);
create index if not exists idx_webhook_events_workspace_received on public.webhook_events (workspace_id, received_at desc);
create unique index if not exists idx_webhook_events_provider_event on public.webhook_events (workspace_id, source, provider_event_id) where provider_event_id is not null;
create index if not exists idx_error_logs_workspace_timestamp on public.error_logs (workspace_id, timestamp desc);
create index if not exists idx_error_logs_correlation on public.error_logs (workspace_id, correlation_id) where correlation_id is not null;
create index if not exists idx_activity_logs_workspace_created on public.activity_logs (workspace_id, created_at desc);
create index if not exists idx_integration_connections_workspace_provider on public.integration_connections (workspace_id, provider, status);
create index if not exists idx_integration_connections_external_account on public.integration_connections (workspace_id, provider, external_account_id) where external_account_id is not null;

-- ============================================================================
-- updated_at triggers
-- ============================================================================

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'profiles',
    'workspaces',
    'workspace_memberships',
    'areas',
    'brands',
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
    trigger_name := target_table || '_set_updated_at';

    if to_regclass(format('public.%I', target_table)) is not null
      and not exists (
        select 1
        from pg_trigger
        where tgname = trigger_name
          and tgrelid = to_regclass(format('public.%I', target_table))
      )
    then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        trigger_name,
        target_table
      );
    end if;
  end loop;
end;
$$;
