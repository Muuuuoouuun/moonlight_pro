-- com_moon/supabase/schema.sql
-- Hub OS production-ready schema bootstrap + upgrade script

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.app_role as enum (
    'owner',
    'admin',
    'editor',
    'operator',
    'strategist',
    'viewer'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.content_status as enum (
    'draft',
    'in_review',
    'scheduled',
    'published',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.lead_status as enum (
    'new',
    'contacted',
    'qualified',
    'won',
    'lost'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.deal_stage as enum (
    'prospect',
    'proposal',
    'negotiation',
    'won',
    'lost'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.operation_case_status as enum (
    'active',
    'on_hold',
    'closed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.priority_level as enum (
    'low',
    'medium',
    'high',
    'critical'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.automation_workflow_status as enum (
    'draft',
    'active',
    'paused',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.automation_run_status as enum (
    'queued',
    'running',
    'success',
    'failure',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.error_severity as enum (
    'info',
    'warn',
    'error',
    'fatal'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.publication_channel as enum (
    'web',
    'instagram',
    'threads',
    'linkedin',
    'newsletter',
    'telegram'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.publication_status as enum (
    'draft',
    'scheduled',
    'published',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.integration_event_status as enum (
    'received',
    'processed',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.decision_status as enum (
    'proposed',
    'accepted',
    'rejected',
    'superseded'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_content_item_status_dates()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;

  if new.status = 'archived' and new.archived_at is null then
    new.archived_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.sync_operation_case_dates()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'closed' and new.closed_at is null then
    new.closed_at = now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- CORE TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'owner',
  timezone text not null default 'Asia/Seoul',
  locale text not null default 'ko-KR',
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  owner_id uuid references public.profiles(id) on delete set null,
  timezone text not null default 'Asia/Seoul',
  locale text not null default 'ko-KR',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'viewer',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  repo_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_status_check check (status in ('active', 'paused', 'archived'))
);

-- ---------------------------------------------------------------------------
-- CONTENT
-- ---------------------------------------------------------------------------

create table if not exists public.content_templates (
  id text primary key,
  name text not null,
  channel text not null default 'card_news',
  version text,
  fields jsonb not null default '[]'::jsonb,
  design_tokens jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_templates_channel_check check (
    channel in ('card_news', 'blog', 'newsletter', 'post', 'landing')
  )
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  subtitle text not null default '',
  body text not null default '',
  source_idea text,
  status public.content_status not null default 'draft',
  template_id text default 'v3' references public.content_templates(id) on update cascade on delete set null,
  content_type text not null default 'card_news',
  metadata jsonb not null default '{}'::jsonb,
  source_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_items_title_not_blank check (btrim(title) <> ''),
  constraint content_items_type_check check (
    content_type in ('card_news', 'blog', 'newsletter', 'post', 'landing')
  )
);

create table if not exists public.content_variants (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  variant_type text not null,
  title text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_variants_type_check check (
    variant_type in ('card_news', 'blog', 'newsletter', 'post', 'landing')
  )
);

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  asset_type text not null default 'image',
  storage_bucket text,
  storage_path text,
  public_url text,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_assets_type_check check (
    asset_type in ('image', 'pdf', 'video', 'document', 'thumbnail')
  )
);

create table if not exists public.content_publications (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  channel public.publication_channel not null,
  status public.publication_status not null default 'draft',
  external_id text,
  published_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SALES
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  email text,
  phone text,
  company text,
  source text not null default '',
  desired_service text,
  status public.lead_status not null default 'new',
  notes text not null default '',
  owner_id uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  last_contacted_at timestamptz,
  next_action_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null default 'note',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lead_activities_type_check check (
    activity_type in ('note', 'email', 'call', 'meeting', 'status_change', 'task', 'system')
  )
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  amount numeric(12, 2) not null default 0,
  currency char(3) not null default 'KRW',
  stage public.deal_stage not null default 'prospect',
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_title_not_blank check (btrim(title) <> '')
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  name text not null,
  channel text not null default 'instagram',
  status text not null default 'draft',
  budget numeric(12, 2) not null default 0,
  spend numeric(12, 2) not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_status_check check (status in ('draft', 'active', 'paused', 'completed', 'archived'))
);

-- ---------------------------------------------------------------------------
-- OPS
-- ---------------------------------------------------------------------------

create table if not exists public.operation_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text not null default '',
  status public.operation_case_status not null default 'active',
  priority public.priority_level not null default 'medium',
  owner_id uuid references public.profiles(id) on delete set null,
  due_date date,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_cases_title_not_blank check (btrim(title) <> '')
);

create table if not exists public.operation_case_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.operation_cases(id) on delete cascade,
  update_type text not null default 'note',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operation_case_updates_type_check check (
    update_type in ('note', 'status_change', 'comment', 'system')
  )
);

create table if not exists public.decision_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  context text not null default '',
  decision text not null default '',
  status public.decision_status not null default 'proposed',
  tags text[] not null default '{}',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decision_records_title_not_blank check (btrim(title) <> '')
);

-- ---------------------------------------------------------------------------
-- AUTOMATION / INTEGRATION
-- ---------------------------------------------------------------------------

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  key text unique,
  name text not null,
  description text not null default '',
  trigger_source text not null default 'manual',
  status public.automation_workflow_status not null default 'draft',
  schedule_text text,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_workflows_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.automation_workflows(id) on delete set null,
  agent_id text,
  status public.automation_run_status not null default 'queued',
  trigger_source text not null default 'manual',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  source text not null,
  event_type text not null default 'unknown',
  status public.integration_event_status not null default 'received',
  trace_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SYSTEM / SECURITY
-- ---------------------------------------------------------------------------

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  context text not null default 'unknown',
  payload jsonb not null default '{}'::jsonb,
  trace text not null default '',
  severity public.error_severity not null default 'error',
  archived boolean not null default false,
  resolved_at timestamptz,
  fingerprint text,
  "timestamp" timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  provider text not null default 'custom',
  label text not null default 'default',
  encrypted_key text not null,
  iv text not null,
  tag text not null,
  last4 text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.default_workspace_id()
returns uuid
language sql
stable
as $$
  select id
  from public.workspaces
  where is_default = true
  order by created_at asc
  limit 1;
$$;

create or replace function public.assign_default_workspace_id()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is null then
    new.workspace_id = public.default_workspace_id();
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$$;

create or replace function public.is_staff(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = coalesce(check_user_id, auth.uid())
      and role in ('owner', 'admin', 'editor', 'operator', 'strategist')
      and is_active = true
  );
$$;

insert into public.content_templates (
  id,
  name,
  channel,
  version,
  fields,
  design_tokens,
  is_active
)
values (
  'v3',
  'Notion 스타일 v3',
  'card_news',
  'v3',
  '["title","subtitle","body_list"]'::jsonb,
  '{"bg":"#F9F8F6","accent":"#4A7A59","text":"#2F3430"}'::jsonb,
  true
)
on conflict (id) do update
set name = excluded.name,
    channel = excluded.channel,
    version = excluded.version,
    fields = excluded.fields,
    design_tokens = excluded.design_tokens,
    is_active = excluded.is_active,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- UPGRADE EXISTING TABLES
-- ---------------------------------------------------------------------------

alter table if exists public.profiles
  add column if not exists display_name text,
  add column if not exists timezone text not null default 'Asia/Seoul',
  add column if not exists locale text not null default 'ko-KR',
  add column if not exists avatar_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.workspaces
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists timezone text not null default 'Asia/Seoul',
  add column if not exists locale text not null default 'ko-KR',
  add column if not exists is_default boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.workspaces
set slug = 'com-moon',
    name = coalesce(name, 'Com_Moon HQ'),
    description = coalesce(description, 'Default workspace for the private Hub OS.'),
    timezone = coalesce(timezone, 'Asia/Seoul'),
    locale = coalesce(locale, 'ko-KR'),
    is_default = true
where slug is null
  and not exists (
    select 1 from public.workspaces where slug = 'com-moon'
  );

insert into public.workspaces (slug, name, description, timezone, locale, is_default)
select
  'com-moon',
  'Com_Moon HQ',
  'Default workspace for the private Hub OS.',
  'Asia/Seoul',
  'ko-KR',
  true
where not exists (
  select 1
  from public.workspaces
  where slug = 'com-moon'
);

do $$
declare
  keep_workspace_id uuid;
begin
  select id
  into keep_workspace_id
  from public.workspaces
  where is_default = true
  order by created_at asc
  limit 1;

  if keep_workspace_id is null then
    select id
    into keep_workspace_id
    from public.workspaces
    where slug = 'com-moon'
    limit 1;
  end if;

  if keep_workspace_id is not null then
    update public.workspaces
    set is_default = (id = keep_workspace_id)
    where is_default = true
       or id = keep_workspace_id;
  end if;
end $$;

alter table if exists public.content_items
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists subtitle text not null default '',
  add column if not exists body text not null default '',
  add column if not exists template_id text references public.content_templates(id) on update cascade on delete set null,
  add column if not exists content_type text not null default 'card_news',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists source_url text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.content_items
  alter column template_id set default 'v3',
  alter column content_type set default 'card_news';

alter table if exists public.content_variants
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists phone text,
  add column if not exists company text,
  add column if not exists desired_service text,
  add column if not exists notes text not null default '',
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.deals
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists currency char(3) not null default 'KRW',
  add column if not exists expected_close_date date,
  add column if not exists closed_at timestamptz,
  add column if not exists lost_reason text,
  add column if not exists notes text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.operation_cases
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists description text not null default '',
  add column if not exists priority public.priority_level not null default 'medium',
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.automation_runs
  add column if not exists workflow_id uuid references public.automation_workflows(id) on delete set null,
  add column if not exists trigger_source text not null default 'manual',
  add column if not exists error_message text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

alter table if exists public.error_logs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists severity public.error_severity not null default 'error',
  add column if not exists archived boolean not null default false,
  add column if not exists resolved_at timestamptz,
  add column if not exists fingerprint text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.api_keys
  add column if not exists provider text not null default 'custom',
  add column if not exists label text not null default 'default',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and udt_name <> 'app_role'
  ) then
    update public.profiles
    set role = case lower(coalesce(role::text, ''))
      when 'owner' then 'owner'
      when 'admin' then 'admin'
      when 'editor' then 'editor'
      when 'operator' then 'operator'
      when 'strategist' then 'strategist'
      when 'viewer' then 'viewer'
      else 'owner'
    end;

    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type public.app_role using lower(role::text)::public.app_role;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    alter table public.profiles alter column role set default 'owner'::public.app_role;
    alter table public.profiles alter column role set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_items'
      and column_name = 'status'
      and udt_name <> 'content_status'
  ) then
    update public.content_items
    set status = case lower(coalesce(status::text, ''))
      when 'draft' then 'draft'
      when 'in_review' then 'in_review'
      when 'scheduled' then 'scheduled'
      when 'published' then 'published'
      when 'archived' then 'archived'
      else 'draft'
    end;

    alter table public.content_items alter column status drop default;
    alter table public.content_items alter column status type public.content_status using lower(status::text)::public.content_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_items'
      and column_name = 'status'
  ) then
    alter table public.content_items alter column status set default 'draft'::public.content_status;
    alter table public.content_items alter column status set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'status'
      and udt_name <> 'lead_status'
  ) then
    update public.leads
    set status = case lower(coalesce(status::text, ''))
      when 'new' then 'new'
      when 'contacted' then 'contacted'
      when 'qualified' then 'qualified'
      when 'won' then 'won'
      when 'lost' then 'lost'
      else 'new'
    end;

    alter table public.leads alter column status drop default;
    alter table public.leads alter column status type public.lead_status using lower(status::text)::public.lead_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'status'
  ) then
    alter table public.leads alter column status set default 'new'::public.lead_status;
    alter table public.leads alter column status set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deals'
      and column_name = 'stage'
      and udt_name <> 'deal_stage'
  ) then
    update public.deals
    set stage = case lower(coalesce(stage::text, ''))
      when 'prospect' then 'prospect'
      when 'proposal' then 'proposal'
      when 'negotiation' then 'negotiation'
      when 'won' then 'won'
      when 'lost' then 'lost'
      else 'prospect'
    end;

    alter table public.deals alter column stage drop default;
    alter table public.deals alter column stage type public.deal_stage using lower(stage::text)::public.deal_stage;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deals'
      and column_name = 'stage'
  ) then
    alter table public.deals alter column stage set default 'prospect'::public.deal_stage;
    alter table public.deals alter column stage set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operation_cases'
      and column_name = 'status'
      and udt_name <> 'operation_case_status'
  ) then
    update public.operation_cases
    set status = case lower(coalesce(status::text, ''))
      when 'active' then 'active'
      when 'on_hold' then 'on_hold'
      when 'closed' then 'closed'
      else 'active'
    end;

    alter table public.operation_cases alter column status drop default;
    alter table public.operation_cases alter column status type public.operation_case_status using lower(status::text)::public.operation_case_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operation_cases'
      and column_name = 'status'
  ) then
    alter table public.operation_cases alter column status set default 'active'::public.operation_case_status;
    alter table public.operation_cases alter column status set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_runs'
      and column_name = 'status'
      and udt_name <> 'automation_run_status'
  ) then
    update public.automation_runs
    set status = case lower(coalesce(status::text, ''))
      when 'queued' then 'queued'
      when 'running' then 'running'
      when 'success' then 'success'
      when 'failure' then 'failure'
      when 'cancelled' then 'cancelled'
      else 'queued'
    end;

    alter table public.automation_runs alter column status drop default;
    alter table public.automation_runs alter column status type public.automation_run_status using lower(status::text)::public.automation_run_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_runs'
      and column_name = 'status'
  ) then
    alter table public.automation_runs alter column status set default 'queued'::public.automation_run_status;
    alter table public.automation_runs alter column status set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'error_logs'
      and column_name = 'severity'
      and udt_name <> 'error_severity'
  ) then
    update public.error_logs
    set severity = case lower(coalesce(severity::text, ''))
      when 'info' then 'info'
      when 'warn' then 'warn'
      when 'error' then 'error'
      when 'fatal' then 'fatal'
      else 'error'
    end;

    alter table public.error_logs alter column severity drop default;
    alter table public.error_logs alter column severity type public.error_severity using lower(severity::text)::public.error_severity;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'error_logs'
      and column_name = 'severity'
  ) then
    alter table public.error_logs alter column severity set default 'error'::public.error_severity;
    alter table public.error_logs alter column severity set not null;
  end if;
end $$;

do $$
begin
  update public.content_items
  set subtitle = coalesce(subtitle, ''),
      body = coalesce(body, ''),
      template_id = coalesce(template_id, 'v3'),
      content_type = coalesce(content_type, 'card_news'),
      metadata = coalesce(metadata, '{}'::jsonb),
      updated_at = coalesce(updated_at, now())
  where subtitle is null
     or body is null
     or template_id is null
     or content_type is null
     or metadata is null
     or updated_at is null;

  update public.leads
  set source = coalesce(source, ''),
      notes = coalesce(notes, ''),
      tags = coalesce(tags, '{}'),
      metadata = coalesce(metadata, '{}'::jsonb),
      updated_at = coalesce(updated_at, now())
  where source is null
     or notes is null
     or tags is null
     or metadata is null
     or updated_at is null;

  update public.operation_cases
  set description = coalesce(description, ''),
      metadata = coalesce(metadata, '{}'::jsonb),
      started_at = coalesce(started_at, created_at, now()),
      updated_at = coalesce(updated_at, now())
  where description is null
     or metadata is null
     or started_at is null
     or updated_at is null;

  update public.error_logs
  set payload = coalesce(payload, '{}'::jsonb),
      trace = coalesce(trace, ''),
      archived = coalesce(archived, false),
      "timestamp" = coalesce("timestamp", created_at, now()),
      created_at = coalesce(created_at, "timestamp", now()),
      updated_at = coalesce(updated_at, now())
  where payload is null
     or trace is null
     or archived is null
     or "timestamp" is null
     or created_at is null
     or updated_at is null;
end $$;

do $$
begin
  begin
    alter table public.profiles add constraint profiles_email_not_blank check (btrim(email) <> '');
  exception
    when duplicate_object then null;
  end;

  begin
    alter table public.workspaces add constraint workspaces_slug_not_blank check (btrim(slug) <> '');
  exception
    when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));
create unique index if not exists workspaces_slug_key on public.workspaces (slug);
create unique index if not exists workspaces_one_default_idx on public.workspaces ((is_default)) where is_default = true;
create unique index if not exists projects_workspace_key_key on public.projects (workspace_id, key);
create unique index if not exists leads_email_lower_unique_idx on public.leads (lower(email)) where email is not null and btrim(email) <> '';

create index if not exists content_items_workspace_created_idx on public.content_items (workspace_id, created_at desc);
create index if not exists content_items_status_created_idx on public.content_items (status, created_at desc);
create index if not exists content_variants_content_id_idx on public.content_variants (content_id, created_at desc);
create index if not exists content_assets_content_id_idx on public.content_assets (content_id, created_at desc);
create index if not exists content_publications_content_id_idx on public.content_publications (content_id, created_at desc);

create index if not exists leads_workspace_created_idx on public.leads (workspace_id, created_at desc);
create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists lead_activities_lead_created_idx on public.lead_activities (lead_id, created_at desc);
create index if not exists deals_stage_created_idx on public.deals (stage, created_at desc);

create index if not exists operation_cases_status_created_idx on public.operation_cases (status, created_at desc);
create index if not exists operation_case_updates_case_created_idx on public.operation_case_updates (case_id, created_at desc);

create index if not exists automation_runs_workflow_created_idx on public.automation_runs (workflow_id, created_at desc);
create index if not exists automation_runs_status_created_idx on public.automation_runs (status, created_at desc);
create index if not exists webhook_events_source_created_idx on public.webhook_events (source, created_at desc);

create index if not exists error_logs_archived_timestamp_idx on public.error_logs (archived, "timestamp" desc);
create index if not exists error_logs_severity_timestamp_idx on public.error_logs (severity, "timestamp" desc);

-- ---------------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------------

create or replace view public.v_dashboard_overview
with (security_invoker = true)
as
select
  (select count(*)::bigint from public.operation_cases) as total_operation_cases,
  (select count(*)::bigint from public.operation_cases where status = 'active') as active_operation_cases,
  (select count(*)::bigint from public.leads) as total_leads,
  (select count(*)::bigint from public.leads where status in ('new', 'contacted', 'qualified')) as active_leads,
  (select count(*)::bigint from public.content_items) as total_content_items,
  (select count(*)::bigint from public.content_items where status = 'published') as published_content_items,
  (select count(*)::bigint from public.error_logs where archived = false) as open_error_logs,
  (select max(created_at) from public.automation_runs) as last_automation_run_at;

create or replace view public.v_sales_pipeline
with (security_invoker = true)
as
select
  status,
  count(*)::bigint as total
from public.leads
group by status;

create or replace view public.v_content_status_counts
with (security_invoker = true)
as
select
  status,
  count(*)::bigint as total
from public.content_items
group by status;

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists set_content_templates_updated_at on public.content_templates;
create trigger set_content_templates_updated_at
before update on public.content_templates
for each row
execute function public.set_updated_at();

drop trigger if exists set_content_items_updated_at on public.content_items;
create trigger set_content_items_updated_at
before update on public.content_items
for each row
execute function public.set_updated_at();

drop trigger if exists content_items_assign_workspace on public.content_items;
create trigger content_items_assign_workspace
before insert on public.content_items
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists content_items_sync_status_dates on public.content_items;
create trigger content_items_sync_status_dates
before insert or update on public.content_items
for each row
execute function public.sync_content_item_status_dates();

drop trigger if exists set_content_variants_updated_at on public.content_variants;
create trigger set_content_variants_updated_at
before update on public.content_variants
for each row
execute function public.set_updated_at();

drop trigger if exists set_content_assets_updated_at on public.content_assets;
create trigger set_content_assets_updated_at
before update on public.content_assets
for each row
execute function public.set_updated_at();

drop trigger if exists set_content_publications_updated_at on public.content_publications;
create trigger set_content_publications_updated_at
before update on public.content_publications
for each row
execute function public.set_updated_at();

drop trigger if exists leads_assign_workspace on public.leads;
create trigger leads_assign_workspace
before insert on public.leads
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

drop trigger if exists deals_assign_workspace on public.deals;
create trigger deals_assign_workspace
before insert on public.deals
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_deals_updated_at on public.deals;
create trigger set_deals_updated_at
before update on public.deals
for each row
execute function public.set_updated_at();

drop trigger if exists campaigns_assign_workspace on public.campaigns;
create trigger campaigns_assign_workspace
before insert on public.campaigns
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
before update on public.campaigns
for each row
execute function public.set_updated_at();

drop trigger if exists operation_cases_assign_workspace on public.operation_cases;
create trigger operation_cases_assign_workspace
before insert on public.operation_cases
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_operation_cases_updated_at on public.operation_cases;
create trigger set_operation_cases_updated_at
before update on public.operation_cases
for each row
execute function public.set_updated_at();

drop trigger if exists operation_cases_sync_dates on public.operation_cases;
create trigger operation_cases_sync_dates
before insert or update on public.operation_cases
for each row
execute function public.sync_operation_case_dates();

drop trigger if exists decision_records_assign_workspace on public.decision_records;
create trigger decision_records_assign_workspace
before insert on public.decision_records
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_decision_records_updated_at on public.decision_records;
create trigger set_decision_records_updated_at
before update on public.decision_records
for each row
execute function public.set_updated_at();

drop trigger if exists automation_workflows_assign_workspace on public.automation_workflows;
create trigger automation_workflows_assign_workspace
before insert on public.automation_workflows
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_automation_workflows_updated_at on public.automation_workflows;
create trigger set_automation_workflows_updated_at
before update on public.automation_workflows
for each row
execute function public.set_updated_at();

drop trigger if exists webhook_events_assign_workspace on public.webhook_events;
create trigger webhook_events_assign_workspace
before insert on public.webhook_events
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists error_logs_assign_workspace on public.error_logs;
create trigger error_logs_assign_workspace
before insert on public.error_logs
for each row
execute function public.assign_default_workspace_id();

drop trigger if exists set_error_logs_updated_at on public.error_logs;
create trigger set_error_logs_updated_at
before update on public.error_logs
for each row
execute function public.set_updated_at();

drop trigger if exists set_api_keys_updated_at on public.api_keys;
create trigger set_api_keys_updated_at
before update on public.api_keys
for each row
execute function public.set_updated_at();

insert into public.profiles (id, email, display_name)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(u.email, ''), '@', 1)
  )
from auth.users as u
on conflict (id) do update
set email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- RLS BASELINE
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.content_templates enable row level security;
alter table public.content_items enable row level security;
alter table public.content_variants enable row level security;
alter table public.content_assets enable row level security;
alter table public.content_publications enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.deals enable row level security;
alter table public.campaigns enable row level security;
alter table public.operation_cases enable row level security;
alter table public.operation_case_updates enable row level security;
alter table public.decision_records enable row level security;
alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.api_keys enable row level security;

drop policy if exists dev_open_access_workspaces on public.workspaces;
drop policy if exists dev_open_access_projects on public.projects;
drop policy if exists dev_open_access_content_templates on public.content_templates;
drop policy if exists dev_open_access_content_items on public.content_items;
drop policy if exists dev_open_access_content_variants on public.content_variants;
drop policy if exists dev_open_access_content_assets on public.content_assets;
drop policy if exists dev_open_access_content_publications on public.content_publications;
drop policy if exists dev_open_access_leads on public.leads;
drop policy if exists dev_open_access_lead_activities on public.lead_activities;
drop policy if exists dev_open_access_deals on public.deals;
drop policy if exists dev_open_access_campaigns on public.campaigns;
drop policy if exists dev_open_access_operation_cases on public.operation_cases;
drop policy if exists dev_open_access_operation_case_updates on public.operation_case_updates;
drop policy if exists dev_open_access_decision_records on public.decision_records;
drop policy if exists dev_open_access_automation_workflows on public.automation_workflows;
drop policy if exists dev_open_access_automation_runs on public.automation_runs;
drop policy if exists dev_open_access_webhook_events on public.webhook_events;
drop policy if exists dev_open_access_error_logs on public.error_logs;

drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists profiles_insert_self_or_staff on public.profiles;
create policy profiles_insert_self_or_staff
on public.profiles
for insert
to authenticated
with check (id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists profiles_update_own_or_staff on public.profiles;
create policy profiles_update_own_or_staff
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_staff(auth.uid()))
with check (id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists profiles_delete_staff_only on public.profiles;
create policy profiles_delete_staff_only
on public.profiles
for delete
to authenticated
using (public.is_staff(auth.uid()));

drop policy if exists workspaces_staff_manage on public.workspaces;
create policy workspaces_staff_manage
on public.workspaces
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists workspace_members_staff_manage on public.workspace_members;
create policy workspace_members_staff_manage
on public.workspace_members
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists projects_staff_manage on public.projects;
create policy projects_staff_manage
on public.projects
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists content_templates_staff_manage on public.content_templates;
create policy content_templates_staff_manage
on public.content_templates
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists content_items_staff_manage on public.content_items;
create policy content_items_staff_manage
on public.content_items
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists content_variants_staff_manage on public.content_variants;
create policy content_variants_staff_manage
on public.content_variants
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists content_assets_staff_manage on public.content_assets;
create policy content_assets_staff_manage
on public.content_assets
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists content_publications_staff_manage on public.content_publications;
create policy content_publications_staff_manage
on public.content_publications
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists leads_staff_manage on public.leads;
create policy leads_staff_manage
on public.leads
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists lead_activities_staff_manage on public.lead_activities;
create policy lead_activities_staff_manage
on public.lead_activities
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists deals_staff_manage on public.deals;
create policy deals_staff_manage
on public.deals
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists campaigns_staff_manage on public.campaigns;
create policy campaigns_staff_manage
on public.campaigns
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists operation_cases_staff_manage on public.operation_cases;
create policy operation_cases_staff_manage
on public.operation_cases
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists operation_case_updates_staff_manage on public.operation_case_updates;
create policy operation_case_updates_staff_manage
on public.operation_case_updates
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists decision_records_staff_manage on public.decision_records;
create policy decision_records_staff_manage
on public.decision_records
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists automation_workflows_staff_manage on public.automation_workflows;
create policy automation_workflows_staff_manage
on public.automation_workflows
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists automation_runs_staff_manage on public.automation_runs;
create policy automation_runs_staff_manage
on public.automation_runs
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists webhook_events_staff_manage on public.webhook_events;
create policy webhook_events_staff_manage
on public.webhook_events
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists error_logs_staff_manage on public.error_logs;
create policy error_logs_staff_manage
on public.error_logs
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

drop policy if exists api_keys_staff_manage on public.api_keys;
create policy api_keys_staff_manage
on public.api_keys
for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

commit;
