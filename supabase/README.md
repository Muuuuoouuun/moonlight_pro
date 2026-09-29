# Supabase DB Pack

Com_Moon Hub OS의 스키마·마이그레이션 안내입니다. 운영 DB는 서울 리전
`ncgpnqfulnlshegalmbd`이며, 실행 전 `npm run db:check`로 실제 상태를 확인합니다.

## 포함 파일

- `schema.sql`: 현재 허브/엔진이 읽고 쓰는 통합 ledger 스키마
- `seed.sql`: 로컬 또는 스테이징에서 바로 붙여볼 수 있는 기본 데이터
- `migrations/20260420_0001_supabase_first_foundation.sql`: Supabase-first P0 기록 보강 migration
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
- `migrations/20260902_0024_overview_read_indexes.sql`: Overview lean read model 최신순 쿼리 인덱스(tasks/decisions/publish logs/automation runs/routine checks)
- `migrations/20260912_0025`~`20260923_0043`: 하루 리뷰·콘텐츠·메모·문의·Agent·Office·운영 목표·AI·캘린더·Top 3 등 후속 기능. 동일 번호가 다른 날짜에 재사용된 파일이 있으므로 **전체 파일명**으로 식별한다.
- `migrations/20260923_0044_migration_history.sql`: 이후 파일의 이름·SHA256을 원자적으로 기록하는 비공개 운영 이력과 실행 함수.
- `migrations/20260924_0046_social_multiaccount_connections.sql`: 기존 소셜 연결 ID·토큰·sync 참조를 유지하면서 외부 계정 ID별 고유 키로 확장. Engine의 `on_conflict` 변경과 함께 배포해야 한다.
- `apply-pending.sql`: **과거 0003→0024 번들**. 현재 서울 운영 DB에는 실행하지 않는다.
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

1. 먼저 `npm run db:check`와 해당 데이터 이관의 건수·충돌 점검으로 현재 상태를 읽는다. 파일이 있다는 이유만으로 기존 SQL을 다시 실행하지 않는다.
2. 새로 검토한 파일만, PAT(`SUPABASE_ACCESS_TOKEN`)와 운영 URL을 설정한 체크아웃에서 아래처럼 실행한다. 예상 ref와 설정된 `SUPABASE_PROJECT_REF`·`SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_URL`이 모두 일치해야 한다. 새 SQL 파일에는 직접 `BEGIN`/`COMMIT`을 쓰지 않고 테이블·함수 이름을 스키마로 한정한다.

   ```bash
   npm run db:migrate -- --expect-ref ncgpnqfulnlshegalmbd <새-마이그레이션-파일.sql>
   npm run db:check
   ```

3. 이력 테이블이 없는 프로젝트는 `20260923_0044_migration_history.sql` **한 파일만 먼저** 적용한다. 0044 자체는 생성한 테이블·함수·권한으로 확인하며, 이후 파일은 `moonlight_ops.apply_migration`이 SQL과 `applied_migrations`의 전체 파일명·SHA256을 같은 트랜잭션으로 기록한다. 동일 해시 재실행은 건너뛰고, 변경된 파일은 거부한다. `CREATE INDEX CONCURRENTLY`처럼 트랜잭션 밖에서만 되는 명령은 이 실행기로 적용하지 않는다. 시간 초과·응답 오류 뒤에는 이력을 조회해 커밋 여부를 확인한 다음 처리한다.
4. 0044 이전 파일에는 신뢰할 적용 이력이 없다. 기존 DB에는 `--allow-legacy` 없이 재실행할 수 없으며, 사용 전 스키마 마커와 데이터 이관 상태를 별도로 대조한다. 기존 파일 중 직접 `BEGIN`/`COMMIT`이 있는 것은 실행 함수가 거부하므로 수동 적용 계획이 필요하다. `20260921_0035_memo_notes_to_journal.sql`과 `20260923_0039_memo_notes_to_journal.sql`은 SQL 내용이 같은 데이터 이관이며 서울 운영 DB에서는 두 메모 모두 이관 완료를 대조했다. 새 DB 구축은 `setup/`과 개별 파일의 선행 의존성을 검토해 진행한다. `apply-pending.sql`은 최신 기능을 포함하지 않는다.
5. 앱 환경 변수를 실제 project URL/key/workspace ID로 맞춘 뒤 `npm run check:connections`을 실행한다.

> `0019~0023` 구간의 `0020`(nullable project progress)은 기존 DB의 근거 없는 기본 진행률을 제거한다. 운영 서울 DB에는 이 구간을 포함한 현재 기능이 적용되어 있으며, `db:check`의 0043까지 20개 기능 검사와 메모 이관 데이터 대조로 확인한다.

> **2026-09-23 서울 적용:** `0044` 부트스트랩만 적용했다. `db:check`의 기존 20개 기능과 이력 객체 검사가 전부 PASS이며, 재실행은 SKIP이다. 0044는 이력 행 대신 객체·함수 본문 해시·권한으로 확인한다. 이후 파일부터 이력 행을 남긴다. 시험 호출은 트랜잭션을 롤백해 업무 테이블과 이력 테이블의 행 수를 바꾸지 않았다.

## 설계 포인트

- 허브와 엔진이 같은 REST 계약을 바라보도록 테이블 이름을 통일했습니다.
- `project_updates`, `routine_checks`, `webhook_events`, `error_logs`가 운영 신호의 기본 기록 레이어입니다.
- Content Studio의 `Schedule`/`Publish`는 외부 발송을 직접 실행하지 않고 `publish_logs`에 handoff/export 이벤트를 기록합니다.
- 수동 export 스냅샷은 `content_assets`에 `hub://content/...` storage path로 남겨 자동화 전 단계도 추적합니다.
- `seed.sql`은 허브 UI가 mock-only 상태를 벗어나도록 최소 동작 데이터를 넣는 데 초점을 둡니다.
- P0 설계 기준은 `운영 기록 + 로그 기록 + 공개 콘텐츠 뷰`입니다.
- `content_variants.variant_type`은 현재 코드 계약에 맞춰 `blog_insight`, `x_thread`, `reels_script`를 허용합니다.
- 자세한 설계 기준은 `docs/supabase-first-operating-ledger.md`를 참고합니다.

## 현재 주의점

- RLS 정책 파일은 포함되어 있지만, Auth 연결과 `workspace_memberships` 데이터가 준비된 뒤 적용해야 합니다.
- Hub/Engine 서버 쓰기는 `SUPABASE_SERVICE_ROLE_KEY` 기준으로 운용합니다.
- 브라우저 직접 접근은 Supabase Auth + `workspace_memberships` + RLS 기준으로 운용합니다.
- 현재 연결이 안 된다면 SQL보다 먼저 `SUPABASE_URL` DNS resolve, service role key, `COM_MOON_DEFAULT_WORKSPACE_ID`가 실제 `workspaces.id`와 일치하는지 확인합니다.

### 2026-09-15 로컬 통합: Threads → Studio

`20260914_0001_content_threads_post.sql`(타입 확장) 다음에
`20260915_0034_threads_studio_compat.sql`(Studio 채널 검증·기존 Threads 채널 보완)을 적용한다.
후자는 `20260912_0026_content_workflow.sql`에도 의존한다. 로컬 통합 작업에서는 운영 DB에 적용하지 않았다.
