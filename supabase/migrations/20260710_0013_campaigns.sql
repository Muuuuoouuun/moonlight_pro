-- Content OS — campaigns (Phase 0 spine).
--
-- Content/Campaigns has been UI-only mock since launch (see docs/personal-os
-- audit, 2026-07-10): the war-room list rendered FALLBACK_CAMPAIGNS from
-- hub-data.js and createCampaign() only mutated local React state.
-- This adds the top-level campaign list as a real ledger row, matching the
-- content_items/content_variants pattern already live for Queue/Studio.
--
-- Out of scope here: the deep war-room tabs (strategy/surfaces/audience/
-- attribution/automation breakdown) stay static — that needs its own data
-- model decision, not a Phase 0 mechanical spine.
--
-- Safety: additive only (new table). Idempotent: create table/index if not exists.
-- Depends on: workspaces, brands (0001, 0427_0004).

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'active', 'paused', 'completed')),
  channels jsonb not null default '[]'::jsonb,   -- e.g. ["Email", "Web", "X"]
  progress numeric not null default 0,           -- 0-100
  ends_label text,                               -- freeform, e.g. "5월 말" (matches deals.close convention)
  goal_label text,                               -- e.g. "신청 40"
  goal_current numeric not null default 0,
  goal_target numeric,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_workspace_status
  on public.campaigns (workspace_id, status);
create index if not exists idx_campaigns_workspace_updated
  on public.campaigns (workspace_id, updated_at desc);
