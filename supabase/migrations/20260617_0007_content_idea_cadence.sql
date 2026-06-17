-- Content OS: idea-queue ranking + publishing cadence (Sales OS v1.1).
--
-- Additive only. Backs two things from the approved Sales OS v3 design:
--   1. Idea queue   — `content_items.rank_score` surfaces "what to post next".
--   2. Publishing cadence — `content_items.cadence_week` buckets published items
--      per ISO week; `content_variants.channel` records insta/threads/reels.
-- No new tables: `content_items.status` already covers idea→draft→scheduled→published.
-- Safe after the Content OS foundation + variant-contract migrations (0001/0003).

alter table public.content_items
  add column if not exists rank_score numeric not null default 0;

alter table public.content_items
  add column if not exists cadence_week text;

comment on column public.content_items.rank_score is
  'Idea-queue ranking score (higher surfaces first). Sales OS v1.1.';
comment on column public.content_items.cadence_week is
  'ISO week bucket (e.g. 2026-W25) for publishing-cadence tracking. Null until scheduled/published.';

alter table public.content_variants
  add column if not exists channel text;

comment on column public.content_variants.channel is
  'Publish channel: instagram | threads | reels | x | blog. Derived from variant_type when null.';

-- Queue ordering: surface highest-ranked idea/draft items per workspace fast.
create index if not exists content_items_queue_idx
  on public.content_items (workspace_id, status, rank_score desc);

-- Cadence aggregation: count published items per workspace per ISO week.
create index if not exists content_items_cadence_idx
  on public.content_items (workspace_id, cadence_week)
  where status = 'published';
