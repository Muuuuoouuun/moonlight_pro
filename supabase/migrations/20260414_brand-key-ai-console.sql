-- Content brand_key expansion + AI Console persistence tables

alter table if exists content_items
  add column if not exists brand_key text;

alter table if exists content_variants
  add column if not exists brand_key text;

alter table if exists content_assets
  add column if not exists brand_key text;

alter table if exists publish_logs
  add column if not exists brand_key text;

alter table if exists campaigns
  add column if not exists brand_key text,
  add column if not exists goal text,
  add column if not exists next_action text,
  add column if not exists handoff text;

create index if not exists idx_content_items_workspace_brand
  on content_items (workspace_id, brand_key, status);

create index if not exists idx_content_variants_workspace_brand
  on content_variants (workspace_id, brand_key, status);

create index if not exists idx_content_assets_workspace_brand
  on content_assets (workspace_id, brand_key, created_at desc);

create index if not exists idx_publish_logs_workspace_brand
  on publish_logs (workspace_id, brand_key, status);

create index if not exists idx_campaigns_workspace_brand
  on campaigns (workspace_id, brand_key, status);

update content_variants as variant
set brand_key = coalesce(
  nullif(variant.brand_key, ''),
  nullif(item.brand_key, '')
)
from content_items as item
where variant.content_id = item.id
  and (variant.brand_key is null or variant.brand_key = '');

update content_assets as asset
set brand_key = coalesce(
  nullif(asset.brand_key, ''),
  nullif(variant.brand_key, ''),
  nullif(item.brand_key, ''),
  nullif(asset.meta ->> 'brand_key', ''),
  nullif(asset.meta ->> 'brand', '')
)
from content_variants as variant
left join content_items as item on item.id = variant.content_id
where asset.variant_id = variant.id
  and (asset.brand_key is null or asset.brand_key = '');

update publish_logs as publish
set brand_key = coalesce(
  nullif(publish.brand_key, ''),
  nullif(variant.brand_key, ''),
  nullif(item.brand_key, ''),
  nullif(publish.payload ->> 'brand_key', ''),
  nullif(publish.payload ->> 'brand', '')
)
from content_variants as variant
left join content_items as item on item.id = variant.content_id
where publish.variant_id = variant.id
  and (publish.brand_key is null or publish.brand_key = '');

alter table if exists agents
  drop constraint if exists agents_status_check;

alter table if exists agents
  add constraint agents_status_check
  check (status in ('idle', 'running', 'error', 'disabled', 'ready', 'working', 'live', 'paused'));

create table if not exists ai_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  target text not null default 'both' check (target in ('claude', 'codex', 'both', 'engine')),
  status text not null default 'active' check (status in ('active', 'paused', 'draft', 'archived')),
  preview text,
  unread integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  thread_id uuid not null references ai_threads(id) on delete cascade,
  author text not null check (author in ('operator', 'claude', 'codex', 'engine', 'system')),
  author_label text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists ai_council_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  topic text not null,
  members jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'hold', 'done')),
  tone text not null default 'blue',
  context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_council_turns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  session_id uuid not null references ai_council_sessions(id) on delete cascade,
  author text not null check (author in ('Claude', 'Codex', 'Engine')),
  stance text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists ai_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  target text not null default 'claude' check (target in ('claude', 'codex', 'both', 'engine')),
  status text not null default 'queued' check (status in ('draft', 'queued', 'running', 'review', 'done')),
  priority text not null default 'P1' check (priority in ('P0', 'P1', 'P2', 'P3')),
  lane text not null default 'Work OS',
  due_label text,
  note text not null default '',
  tone text not null default 'muted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_threads_workspace_updated
  on ai_threads (workspace_id, updated_at desc);

create index if not exists idx_ai_messages_thread_created
  on ai_messages (thread_id, created_at asc);

create index if not exists idx_ai_council_sessions_workspace_updated
  on ai_council_sessions (workspace_id, updated_at desc);

create index if not exists idx_ai_orders_workspace_updated
  on ai_orders (workspace_id, updated_at desc);
