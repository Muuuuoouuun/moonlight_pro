-- Adds a structured slot to outreach_outcomes for the minimum contact record required by
-- docs/operator-workflow-profile.md §7: 대화 요약 (note, already existed) + 고객 반응 (reaction,
-- new) alongside the existing free-text note. Kept out of `note` so reaction can be aggregated
-- later (e.g. reaction-based conversion stats) without parsing free text.
--
-- Additive + idempotent, no backfill needed (default '{}'::jsonb reads as "no reaction logged").

alter table public.outreach_outcomes
  add column if not exists meta jsonb not null default '{}'::jsonb;
