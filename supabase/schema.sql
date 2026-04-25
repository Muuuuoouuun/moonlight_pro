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
  title text not null,
  source_idea text,
  source_type text not null default 'idea' check (source_type in ('idea', 'brief', 'meeting', 'research', 'repurpose')),
  status text not null default 'draft' check (status in ('idea', 'draft', 'review', 'scheduled', 'published', 'archived')),
  next_action text,
  created_at timestamptz not null default now()
);

create table content_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_id uuid not null references content_items(id) on delete cascade,
  variant_type text not null check (variant_type in ('card_news', 'blog', 'newsletter', 'social_post', 'landing_copy')),
  title text,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  created_at timestamptz not null default now()
);

create table content_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  asset_type text not null check (asset_type in ('image', 'html', 'zip', 'thumbnail', 'source')),
  storage_path text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table publish_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  channel text not null,
  status text not null default 'queued' check (status in ('queued', 'published', 'failed')),
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
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
