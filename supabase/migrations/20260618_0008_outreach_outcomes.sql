-- Learning sink for the sales daily-loop (closes the loop).
--
-- Approved design: clmagi-codex-moonlight-p0-hardening-design-20260618-000940.md
-- (orchestration operating model). Each outreach result is logged here so the
-- next day's triage can read recent outcomes and bias prioritization — without
-- this table the loop is open and the "5x" target has no machinery behind it.
--
-- Records the human-executed sales motion (phone/visit/kakao), tied back to the
-- lead/deal/company and the play that produced the asset. Additive + idempotent.

create table if not exists public.outreach_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  play text,                       -- which play produced this (e.g. district-academy-first-touch)
  asset_id text,                   -- content asset reference, if any
  channel text,                    -- phone | visit | kakao | email | other
  action text not null default 'sent'
    check (action in ('sent', 'replied', 'meeting', 'proposal', 'won', 'lost', 'no_response')),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_outcomes_recent
  on public.outreach_outcomes (workspace_id, occurred_at desc);
create index if not exists idx_outreach_outcomes_lead
  on public.outreach_outcomes (workspace_id, lead_id);
create index if not exists idx_outreach_outcomes_play
  on public.outreach_outcomes (workspace_id, play, occurred_at desc);
