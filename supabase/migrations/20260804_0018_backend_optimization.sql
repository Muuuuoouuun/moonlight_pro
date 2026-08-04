-- Backend/DB 최적화 배치 — 코드가 실제로 치는 조회 키에 인덱스를 맞추고,
-- 단일-콜 upsert(on_conflict)가 성립하도록 unique 제약을 추가한다.
--
-- 근거(2026-08-04 백엔드 조사):
-- - eeoCRM hydrate/sheets promote 루프가 JSONB 경로·복합 키 조회를 레코드마다
--   반복 실행 — 전부 seq scan이었음. 배치화 코드(레코드당→배치당 1회)와 함께
--   이 인덱스들이 남은 스캔 비용을 제거한다.
-- - integration_connections 는 upsert 가 (read→write→read) 3왕복이던 것을
--   on_conflict 단일 콜로 바꿈 → unique (workspace_id, provider) 필요.
-- - field_mappings 는 notion-sync 가 프로퍼티당 SELECT+INSERT 하던 것을
--   bulk ignore-duplicates 로 바꿈 → 4-컬럼 unique 필요.
-- - lead_intake_raw 의 재임포트 dedupe 는 partial unique 라 PostgREST
--   on_conflict 의 arbiter 로 쓸 수 없었음 → full unique 로 교체.
--
-- 안전: additive + 멱등(if not exists). 파괴적 변경 없음 — 기존 partial index
-- drop 은 동일 키의 full unique 생성 *이후*에만 수행.
-- 적용: npm run db:migrate 20260804_0018_backend_optimization.sql
-- (라이브 확인 2026-08-04: integration_connections·field_mappings·lead_intake_raw
--  모두 중복 0 — unique 생성이 즉시 성립. 만에 하나 다른 환경에 중복이 있으면
--  아래 suffix 가드가 0002 패턴대로 비파괴 격리한다.)

-- ----------------------------------------------------------------------------
-- 1. eeoCRM 동기화 조회 키 (JSONB 표현식 인덱스)
-- ----------------------------------------------------------------------------

create index if not exists idx_companies_eeocrm_account_id
  on public.companies ((meta->>'eeocrm_account_id'))
  where meta ? 'eeocrm_account_id';

create index if not exists idx_customer_accounts_eeocrm_account_id
  on public.customer_accounts ((meta->>'eeocrm_account_id'))
  where meta ? 'eeocrm_account_id';

create index if not exists idx_deals_eeocrm_opportunity_id
  on public.deals ((meta->>'eeocrm_opportunity_id'))
  where meta ? 'eeocrm_opportunity_id';

create index if not exists idx_deals_eeocrm_order_id
  on public.deals ((meta->>'eeocrm_order_id'))
  where meta ? 'eeocrm_order_id';

-- sheets/eeocrm 상태 뷰의 최근 실행 조회: payload->>provider 필터 + started_at 정렬.
create index if not exists idx_sync_runs_provider_started
  on public.sync_runs (workspace_id, (payload->>'provider'), started_at desc);

-- ----------------------------------------------------------------------------
-- 2. promote/hydrate 배치 조회 키
-- ----------------------------------------------------------------------------

-- contacts 는 인덱스가 하나도 없었다. promote/hydrate 의 (회사, 이름) 결정자
-- 조회와 company_id in.() 프리페치를 커버.
create index if not exists idx_contacts_workspace_company_name
  on public.contacts (workspace_id, company_id, name);

-- promote 의 pending 스캔: (status, source) 필터 + created_at.asc 정렬.
create index if not exists idx_lead_intake_raw_status_source_created
  on public.lead_intake_raw (workspace_id, status, source, created_at);

-- eeoCRM hydrate 의 name 폴백 조회.
create index if not exists idx_companies_workspace_name
  on public.companies (workspace_id, name);

-- automations 대시보드의 미해결 에러 카운트: resolved=false 필터 + 최신순.
create index if not exists idx_error_logs_workspace_unresolved
  on public.error_logs (workspace_id, timestamp desc)
  where resolved = false;

-- ----------------------------------------------------------------------------
-- 3. integration_connections — 단일-콜 upsert 성립
-- ----------------------------------------------------------------------------

-- 혹시 남아 있을 중복을 0002 패턴대로 비파괴 격리(최신 행이 정본 유지).
with ranked_connections as (
  select
    id,
    row_number() over (
      partition by workspace_id, provider
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.integration_connections
  where provider not like '%:duplicate:%'
)
update public.integration_connections
set provider = provider || ':duplicate:' || id::text
where id in (
  select id from ranked_connections where duplicate_rank > 1
);

create unique index if not exists uq_integration_connections_workspace_provider
  on public.integration_connections (workspace_id, provider);

-- ----------------------------------------------------------------------------
-- 4. field_mappings — bulk ignore-duplicates 성립 (+ 첫 인덱스)
-- ----------------------------------------------------------------------------

with ranked_mappings as (
  select
    id,
    row_number() over (
      partition by workspace_id, connection_id, source_field, target_field
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.field_mappings
  where source_field not like '%:duplicate:%'
)
update public.field_mappings
set source_field = source_field || ':duplicate:' || id::text
where id in (
  select id from ranked_mappings where duplicate_rank > 1
);

create unique index if not exists uq_field_mappings_scope
  on public.field_mappings (workspace_id, connection_id, source_field, target_field);

-- ----------------------------------------------------------------------------
-- 5. lead_intake_raw 재임포트 dedupe — partial → full unique 교체
-- ----------------------------------------------------------------------------
-- partial unique 는 PostgREST on_conflict 의 arbiter 가 될 수 없다(추론에 WHERE
-- 절이 필요). full unique 는 NULLS DISTINCT(기본)라 source_ref null 행의 기존
-- 동작(중복 허용)이 그대로 유지된다. 새 인덱스 생성 후에만 기존 것을 제거.

create unique index if not exists uq_lead_intake_raw_source_ref_all
  on public.lead_intake_raw (workspace_id, source, source_ref);

drop index if exists public.uq_lead_intake_raw_source_ref;
