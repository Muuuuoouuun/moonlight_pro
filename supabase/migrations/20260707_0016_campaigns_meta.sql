-- Campaigns display metadata — the Hub Campaigns war room card renders fields
-- beyond the base `campaigns` columns (id, name, channel, status, start_date,
-- end_date): a channel list, a progress percent, and a goal/current pair
-- ("신청 40" / 24). None of those have a dedicated column and don't warrant
-- one yet (still shaping), so they live in a jsonb `meta` column, matching the
-- convention already used by `content_items.meta` / `leads.meta` etc.
-- Additive + idempotent.

alter table public.campaigns
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.campaigns
  add column if not exists updated_at timestamptz not null default now();
