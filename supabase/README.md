# Supabase DB Pack

Com_Moon Hub OS의 현재 로컬 스키마와 시드 데이터를 정리한 안내 문서입니다.

## 포함 파일

- `schema.sql`: 현재 허브/엔진이 읽고 쓰는 통합 ledger 스키마
- `seed.sql`: 로컬 또는 스테이징에서 바로 붙여볼 수 있는 기본 데이터
- `migrations/20260420_0001_supabase_first_foundation.sql`: Supabase-first P0 원장 보강 migration
- `seed.supabase_first.sql`: foundation migration 이후 넣는 브랜드/프로젝트 seed 보강
- `policies/supabase_first_rls.sql`: Auth 연결 후 적용할 RLS 정책 초안

## 현재 앱이 직접 기대하는 핵심 테이블

- `projects`, `tasks`, `project_updates`, `routine_checks`
- `content_items`, `content_variants`, `content_assets`, `publish_logs`
- `leads`, `deals`, `operation_cases`
- `automation_runs`, `webhook_endpoints`, `webhook_events`
- `error_logs`, `activity_logs`, `integration_connections`, `sync_runs`

## 적용 순서

1. Supabase SQL Editor에서 `schema.sql` 실행
2. 샘플 데이터가 필요하면 `seed.sql` 실행
3. `migrations/20260420_0001_supabase_first_foundation.sql` 실행
4. 샘플 브랜드/프로젝트 문맥이 필요하면 `seed.supabase_first.sql` 실행
5. 앱 환경 변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID`를 채움
6. Supabase Auth와 실제 사용자를 연결한 뒤 `policies/supabase_first_rls.sql` 실행

## 설계 포인트

- 허브와 엔진이 같은 REST 계약을 바라보도록 테이블 이름을 통일했습니다.
- `project_updates`, `routine_checks`, `webhook_events`, `error_logs`가 운영 신호의 기본 기록 레이어입니다.
- `seed.sql`은 허브 UI가 mock-only 상태를 벗어나도록 최소 동작 데이터를 넣는 데 초점을 둡니다.
- P0 설계 기준은 `운영 원장 + 로그 원장 + 공개 콘텐츠 뷰`입니다.
- 자세한 설계 기준은 `docs/supabase-first-operating-ledger.md`를 참고합니다.

## 현재 주의점

- RLS 정책 파일은 포함되어 있지만, Auth 연결과 `workspace_memberships` 데이터가 준비된 뒤 적용해야 합니다.
- Hub/Engine 서버 쓰기는 `SUPABASE_SERVICE_ROLE_KEY` 기준으로 운용합니다.
- 브라우저 직접 접근은 Supabase Auth + `workspace_memberships` + RLS 기준으로 운용합니다.
