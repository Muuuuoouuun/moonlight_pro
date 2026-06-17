-- Sales OS v1 — Google Sheets sync staging + sales plays
--
-- Backs the approved design "ClassIn B2B 세일즈 OS — B의 척추 + C의 실행".
-- Single source of truth stays the Supabase ledger; spreadsheet edits land in a
-- staging table (`lead_intake_raw`) and are *promoted* into `leads`/`companies`
-- rather than upserting straight in (proposal model). Naver collection is NOT
-- enabled here — the `source` enum reserves it for a later, legally-reviewed phase.
--
-- Also fills gaps the read layer already expects: `apps/hub/lib/repositories/
-- revenue-ledger.js` orders leads by `last_touch_at` and reads `name/email/
-- channel/owner_id/meta`, none of which existed on `leads` yet.

-- ----------------------------------------------------------------------------
-- 1. Extend leads/companies for academy (학원) matching + sheet import.
--    All additive + idempotent so re-running is safe.
-- ----------------------------------------------------------------------------
alter table public.companies
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists match_key text,
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.leads
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists channel text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists last_touch_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists idx_companies_match_key
  on public.companies (workspace_id, match_key);
create index if not exists idx_leads_last_touch_at
  on public.leads (workspace_id, last_touch_at desc nulls last);

-- ----------------------------------------------------------------------------
-- 2. Staging table — raw rows from Sheets / CSV (Naver reserved, disabled).
--    Promotion maps raw -> companies/leads; nothing is trusted until promoted.
-- ----------------------------------------------------------------------------
create table if not exists public.lead_intake_raw (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  source text not null default 'google_sheets'
    check (source in ('google_sheets', 'csv', 'manual', 'naver')),
  source_ref text,                       -- sheet row key / external id
  raw jsonb not null default '{}'::jsonb, -- original row, verbatim
  normalized jsonb not null default '{}'::jsonb,
  match_key text,
  status text not null default 'pending'
    check (status in ('pending', 'promoted', 'merged', 'ignored', 'review')),
  company_id uuid references public.companies(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);

create index if not exists idx_lead_intake_raw_status
  on public.lead_intake_raw (workspace_id, status);
create index if not exists idx_lead_intake_raw_match_key
  on public.lead_intake_raw (workspace_id, match_key);
-- Idempotent re-import: same connection + source row should not duplicate.
create unique index if not exists uq_lead_intake_raw_source_ref
  on public.lead_intake_raw (workspace_id, source, source_ref)
  where source_ref is not null;

-- ----------------------------------------------------------------------------
-- 3. Sales plays — the "이기는 플레이" definitions + run log (5x measurement).
-- ----------------------------------------------------------------------------
create table if not exists public.sales_plays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  brand_slug text not null default 'classmoon',  -- ties content to Class.Moon voice
  stage text,                                     -- deal stage this play targets
  definition jsonb not null default '{}'::jsonb,  -- steps / objections / content_types
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.sales_play_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  play_id uuid references public.sales_plays(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failure')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_sales_play_runs_play
  on public.sales_play_runs (workspace_id, play_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. Seed the first play for the Com_Moon workspace (idempotent).
-- ----------------------------------------------------------------------------
insert into public.sales_plays (workspace_id, slug, name, description, brand_slug, stage, definition)
select
  w.id,
  'district-academy-first-touch',
  '지역 학원 → 단계별 맞춤 자료',
  '수기 리드 시트 import → 정규화·중복제거 → 단계+반론 묶인 맞춤 자료 자동 생성 → 검토 후 시트 발송. 네이버 무의존(v1).',
  'classmoon',
  'lead',
  jsonb_build_object(
    'steps', jsonb_build_array(
      'import_or_collect', 'normalize_dedupe_score', 'generate_assets',
      'review_gate', 'push_to_outreach', 'measure'
    ),
    'objections', jsonb_build_array('price', 'trust', 'switching_cost', 'time'),
    'content_types', jsonb_build_array('one_pager_proposal', 'roi_table', 'case_study', 'outreach_email'),
    'guardrails', jsonb_build_object(
      'naver', 'official_api_only__disabled_until_legal_review',
      'outreach', 'consent_or_legitimate_interest_required'
    )
  )
from public.workspaces w
where w.slug = 'com-moon-os'
   or w.id = '11111111-1111-1111-1111-111111111111'
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  description = excluded.description,
  brand_slug = excluded.brand_slug,
  stage = excluded.stage,
  definition = excluded.definition,
  status = 'active',
  updated_at = now();
