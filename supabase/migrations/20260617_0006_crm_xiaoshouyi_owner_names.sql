-- CRM (Xiaoshouyi/EEO) ownerId -> name resolution for moonlight.
--
-- Xiaoshouyi records carry only a numeric `ownerId`. This curated table resolves
-- it to display/Korean names + team. Used when CRM account/opportunity rows are
-- synced into companies/deals so the owner shows a real name instead of a number.
-- Global (not workspace-scoped). No RLS/trigger (matches moonlight migration style).
--
-- Seeds ONLY the current operator (문준혁 = ownerId 3935704427463307), the one
-- mapping the user provided. Other owners are resolved from the live CRM User
-- object at sync time, or curated into this table by the user — we do not
-- pre-populate colleagues' names/codes here.

create table if not exists public.crm_xiaoshouyi_owner_names (
  external_id  text primary key,        -- Xiaoshouyi User.id / ownerId (numeric, as text)
  display_name text not null,
  korean_name  text,
  eeo_code     text,
  team         text,
  is_excluded  boolean not null default false,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.crm_xiaoshouyi_owner_names
  (external_id, display_name, korean_name, eeo_code, team, is_excluded, metadata)
values
  ('3935704427463307', 'Mun Junhyuk (문준혁)', '문준혁', 'EEO04186', 'KR', false, '{"anchor_account":"윤유경플러스학원","is_current_user":true}'::jsonb)
on conflict (external_id) do update
set
  display_name = excluded.display_name,
  korean_name  = excluded.korean_name,
  eeo_code     = excluded.eeo_code,
  team         = excluded.team,
  is_excluded  = excluded.is_excluded,
  metadata     = public.crm_xiaoshouyi_owner_names.metadata || excluded.metadata,
  updated_at   = now();
