-- CRM activity timeline — human-facing interaction log per lead/deal/account.
--
-- The Revenue surface (apps/hub/components/hub/pages/revenue.jsx) logs what
-- actually happened with a lead/account: 통화(call) · 미팅(meeting) · 설명회
-- (info_session) · 데모(demo) · 방문(visit) · 이메일(email) · 소식(update) ·
-- 노트(note). Until now the Account detail panel kept these in React state
-- only — a refresh dropped every logged call/note. This table makes the
-- timeline durable. Additive + idempotent (create table/index if not exists).
--
-- Distinct from `outreach_outcomes` (0008): that table is a funnel-measurement
-- sink with a fixed sent/replied/meeting/proposal/won/lost enum for the "5x"
-- loop. This one is the free-form operator timeline (any interaction kind,
-- plus pinnable notes). They can coexist; a logged call may also produce an
-- outreach_outcome, but this table is the record of the conversation itself.

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Entity linkage — an activity hangs off exactly one of these (account is most common).
  lead_id uuid references public.leads(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  account_id uuid references public.customer_accounts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  entity_type text not null default 'account'
    check (entity_type in ('lead', 'deal', 'account')),
  kind text not null default 'update'
    check (kind in ('call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'update', 'note', 'deal')),
  body text not null default '',
  pinned boolean not null default false,   -- meaningful for kind='note'
  owner_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_activities_account
  on public.crm_activities (workspace_id, account_id, occurred_at desc);
create index if not exists idx_crm_activities_lead
  on public.crm_activities (workspace_id, lead_id, occurred_at desc);
create index if not exists idx_crm_activities_deal
  on public.crm_activities (workspace_id, deal_id, occurred_at desc);
create index if not exists idx_crm_activities_recent
  on public.crm_activities (workspace_id, occurred_at desc);
