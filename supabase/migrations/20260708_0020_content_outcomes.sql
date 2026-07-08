-- Learning sink for the content daily-loop (closes the Council loop).
--
-- Approved design: bigmac_moon-real_v1-design-20260707-230910.md (AI를 업무 OS 비서로,
-- Phase 2 ⓐ). The sales lane already closes its loop via outreach_outcomes; the content
-- lane recorded only publish_logs ("나갔나?") with no result signal ("먹혔나?"). Without
-- this table the Council audience-analysis mode has no engagement numbers to reason from.
--
-- `metric` is intentionally free text (not an enum): the operator has not yet fixed the
-- 1-2 key metrics per brand (OQ2), so the schema stays metric-agnostic — record whatever
-- metric name + value the channel reports (views/saves/subscribes/clicks/…). `source`
-- distinguishes manual entry from a future API pull. Additive + idempotent.

create table if not exists public.content_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  variant_id uuid references public.content_variants(id) on delete set null,
  content_id uuid references public.content_items(id) on delete set null,
  brand_key text,                  -- brand this outcome belongs to (free text, matches brands.key)
  channel text,                    -- instagram | threads | blog | newsletter | other
  metric text not null,            -- free text: views | saves | shares | subscribes | clicks | …
  value numeric not null default 0,
  measured_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'api')),
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_outcomes_recent
  on public.content_outcomes (workspace_id, measured_at desc);
create index if not exists idx_content_outcomes_variant
  on public.content_outcomes (workspace_id, variant_id);
create index if not exists idx_content_outcomes_brand
  on public.content_outcomes (workspace_id, brand_key, measured_at desc);
