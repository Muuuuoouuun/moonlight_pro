# Supabase DB Pack

Com_Moon Hub OS의 현재 로컬 스키마와 시드 데이터를 정리한 안내 문서입니다.

## 포함 파일

- `schema.sql`: 현재 허브/엔진이 읽고 쓰는 통합 ledger 스키마
- `seed.sql`: 로컬 또는 스테이징에서 바로 붙여볼 수 있는 기본 데이터
- `migrations/20260420_0001_supabase_first_foundation.sql`: Supabase-first P0 원장 보강 migration
- `migrations/20260427_0003_content_os_variant_contract.sql`: Content OS variant/source constraint 보강 migration
- `migrations/20260427_0004_canonical_brand_directory.sql`: Hub fallback과 live 브랜드 디렉토리 정렬
- `migrations/20260602_0003_content_variant_type_contract.sql`: content_variants variant_type 5종 정리 + 데이터 마이그레이션
- `migrations/20260602_0004_live_setup_contracts.sql`: 기존 Supabase 프로젝트용 live contract 보정 migration
- `migrations/20260617_0005`~`20260618_0009`: Sales OS (시트 동기화·CRM owner-names·content idea cadence·outreach outcomes·명함 source)
- `migrations/20260618_0010_agents_personas_inbox.sql`: 5 페르소나 agents 시드 + `lead_intake_raw.source='inbox'`
- `migrations/20260619_0011_work_orders_agent_runs.sql`: 반자동 승인 큐(`work_orders`) + 에피소드 메모리(`agent_runs`)
- `migrations/20260620_0012_work_orders_execution_claim.sql`: 승인된 주문의 실행 claim 상태(`executing`) 추가
- `migrations/20260702_0013_eeocrm_source.sql`: `lead_intake_raw.source='eeocrm'` 추가
- `migrations/20260707_0014_crm_activities.sql`: CRM 활동 타임라인(`crm_activities`)
- `migrations/20260707_0015_lead_intake_gmail_source.sql`: `lead_intake_raw.source='gmail'` 추가
- `migrations/20260707_0016_campaigns_meta.sql`: `campaigns.meta`/`updated_at`
- `migrations/20260707_0017_work_orders_open_followup_unique.sql`: 오픈 팔로업 중복 방지 unique
- `migrations/20260804_0018_backend_optimization.sql`: 백엔드 최적화 — eeoCRM JSONB 조회 키·배치 조회 인덱스, `integration_connections`/`field_mappings` unique(단일-콜 upsert 성립), staging dedupe full unique 교체
- `migrations/20260717_0019`~`20260719_0023`: routine idempotency · `0020`(nullable project progress) · task description · project context links · deal hide
- `apply-pending.sql`: **편의 번들** — 0003→0023을 시점순으로 묶은 단일 파일(멱등). 대시보드 SQL Editor에 한 번에 붙여넣기용. 정본은 위 개별 migration 파일.
- `seed.supabase_first.sql`: foundation migration 이후 넣는 브랜드/프로젝트 seed 보강
- `policies/supabase_first_rls.sql`: Auth 연결 후 적용할 RLS 정책 초안
- `setup/`: 새 Supabase 프로젝트에 순서대로 적용하는 live setup pack

## 현재 앱이 직접 기대하는 핵심 테이블

- `projects`, `tasks`, `project_updates`, `routine_checks`
- `content_items`, `content_variants`, `content_assets`, `publish_logs`
- `leads`, `deals`, `operation_cases`
- `automation_runs`, `webhook_endpoints`, `webhook_events`
- `error_logs`, `activity_logs`, `integration_connections`, `sync_runs`

## 적용 순서

### 새 Supabase 프로젝트

1. Supabase SQL Editor에서 `setup/00_live_schema.sql` 실행
2. `setup/01_storage.sql` 실행
3. 개발/스테이징 샘플 workspace가 필요하면 `setup/03_seed_dev_workspace.sql` 실행
4. `setup/99_smoke_checks.sql` 실행
5. 앱 환경 변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID`를 채움
6. Supabase Auth와 실제 사용자를 연결한 뒤 `setup/02_rls_policies.sql` 실행

### 기존 Supabase 프로젝트

1. `migrations/20260602_0004_live_setup_contracts.sql` 실행
2. `setup/01_storage.sql` 실행
3. `setup/99_smoke_checks.sql` 실행
4. 운영 마이그레이션 적용 (0003→0023): **간편 경로** = `apply-pending.sql` 전체를 SQL Editor에 붙여넣고 Run (멱등). **개별 경로** = PAT(`SUPABASE_ACCESS_TOKEN=sbp_...`) 설정 후 `node scripts/apply-migrations.mjs <파일들…>`. 포함: `20260602_0003`(variant_type)·`0004`·`0005`~`0018`(Sales OS·백엔드 최적화)·`0019`~`0023`(routine idempotency·nullable progress·task detail·project links·deal hide).
5. 앱 환경 변수를 실제 project URL/key/workspace ID로 맞춘 뒤 `npm run check:connections` 실행

> **라이브 적용 상태 (2026-08-04 확인):** 운영 프로젝트(rwqefdxalmbrkybxqwxj)에는 0003→0018 적용·검증 완료. 0019~0023은 배포 전 적용 대상으로 번들에 포함되어 있다. `schema_migrations` 추적 테이블이 없으므로 적용 여부는 마커(테이블/인덱스/제약 존재)로 확인한다.

> 번호 메모: `0003`·`0004`는 `20260427`·`20260602` 두 벌이 있습니다(브랜치 병합 흔적). 적용은 날짜 접두사 순서대로 — `apply-pending.sql`이 그 순서를 이미 반영합니다.

## 설계 포인트

- 허브와 엔진이 같은 REST 계약을 바라보도록 테이블 이름을 통일했습니다.
- `project_updates`, `routine_checks`, `webhook_events`, `error_logs`가 운영 신호의 기본 기록 레이어입니다.
- Content Studio의 `Schedule`/`Publish`는 외부 발송을 직접 실행하지 않고 `publish_logs`에 handoff/export 이벤트를 기록합니다.
- 수동 export 스냅샷은 `content_assets`에 `hub://content/...` storage path로 남겨 자동화 전 단계도 추적합니다.
- `seed.sql`은 허브 UI가 mock-only 상태를 벗어나도록 최소 동작 데이터를 넣는 데 초점을 둡니다.
- P0 설계 기준은 `운영 원장 + 로그 원장 + 공개 콘텐츠 뷰`입니다.
- `content_variants.variant_type`은 현재 코드 계약에 맞춰 `blog_insight`, `x_thread`, `reels_script`를 허용합니다.
- 자세한 설계 기준은 `docs/supabase-first-operating-ledger.md`를 참고합니다.

## 현재 주의점

- RLS 정책 파일은 포함되어 있지만, Auth 연결과 `workspace_memberships` 데이터가 준비된 뒤 적용해야 합니다.
- Hub/Engine 서버 쓰기는 `SUPABASE_SERVICE_ROLE_KEY` 기준으로 운용합니다.
- 브라우저 직접 접근은 Supabase Auth + `workspace_memberships` + RLS 기준으로 운용합니다.
- 현재 연결이 안 된다면 SQL보다 먼저 `SUPABASE_URL` DNS resolve, service role key, `COM_MOON_DEFAULT_WORKSPACE_ID`가 실제 `workspaces.id`와 일치하는지 확인합니다.
