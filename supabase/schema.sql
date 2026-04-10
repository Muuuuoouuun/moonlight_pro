-- com_moon/supabase/schema.sql

-- 1. Core (Profiles, Workspaces, Areas, Projects, Tasks, Decisions)
CREATE TABLE profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text default 'owner'
);

CREATE TABLE workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 2. Content (Source -> Variants -> Assets -> Publish Log)
CREATE TABLE content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_idea text,
  status text default 'draft', -- draft, published, archived
  created_at timestamptz default now()
);

CREATE TABLE content_variants (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references content_items(id) on delete cascade,
  variant_type text, -- card_news, blog, newsletter, post
  content text,
  created_at timestamptz default now()
);

-- 3. CRM / Sales (Leads, Deals, Campaigns)
CREATE TABLE leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  source text,
  status text default 'new',
  created_at timestamptz default now()
);

CREATE TABLE deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric default 0,
  stage text, -- prospect, proposal, negotiation, won, lost
  created_at timestamptz default now()
);

-- 4. Ops (Operation Cases, Documents, Issues)
CREATE TABLE operation_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text default 'active',
  created_at timestamptz default now()
);

-- 5. Automation & Integration (Agents, Triggers, Sync Logs)
CREATE TABLE automation_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text,
  status text, -- success, failure
  payload jsonb,
  created_at timestamptz default now()
);

CREATE TABLE error_logs (
  id uuid primary key default gen_random_uuid(),
  context text,
  payload jsonb,
  trace text,
  timestamp timestamptz default now()
);

-- 6. Vault (Security)
CREATE TABLE api_keys (
  id uuid primary key default gen_random_uuid(),
  encrypted_key text not null,
  iv text not null,
  tag text not null,
  last4 text,
  is_active boolean default true,
  owner_id uuid references profiles(id)
);
