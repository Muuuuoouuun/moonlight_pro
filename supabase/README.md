# Supabase DB Pack

Com_Moon Hub OS의 현재 로컬 스키마와 시드 데이터를 정리한 안내 문서입니다.

## 포함 파일

- `schema.sql`: 현재 허브/엔진이 읽고 쓰는 통합 ledger 스키마
- `seed.sql`: 로컬 또는 스테이징에서 바로 붙여볼 수 있는 기본 데이터
- `migrations/20260414_brand-key-ai-console.sql`: `brand_key` backfill과 AI Console persistence 테이블 추가용 점진 적용 스크립트

## 현재 앱이 직접 기대하는 핵심 테이블

- `projects`, `tasks`, `project_updates`, `routine_checks`
- `content_items`, `content_variants`, `content_assets`, `publish_logs`
- `campaigns`, `campaign_runs`
- `leads`, `deals`, `operation_cases`
- `automation_runs`, `webhook_endpoints`, `webhook_events`
- `ai_threads`, `ai_messages`, `ai_council_sessions`, `ai_council_turns`, `ai_orders`
- `error_logs`, `activity_logs`, `integration_connections`, `sync_runs`

## 적용 순서

1. Supabase SQL Editor에서 `schema.sql` 실행
2. 기존 DB를 점진 업데이트할 때는 필요한 migration 파일만 추가 실행
3. 샘플 데이터가 필요하면 `seed.sql` 실행
4. 앱 환경 변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID`를 채움

## 설계 포인트

- 허브와 엔진이 같은 REST 계약을 바라보도록 테이블 이름을 통일했습니다.
- `project_updates`, `routine_checks`, `webhook_events`, `error_logs`가 운영 신호의 기본 기록 레이어입니다.
- `seed.sql`은 허브 UI가 mock-only 상태를 벗어나도록 최소 동작 데이터를 넣는 데 초점을 둡니다.

## 현재 주의점

- 이 리포의 현재 스키마는 아직 RLS 정책 파일을 포함하지 않습니다.
- 원격 최신 브랜치에는 더 큰 스키마 전환과 RLS 스크립트가 있지만, 현재 허브/엔진 코드 계약과 달라 그대로 합치지 않았습니다.
- RLS를 붙일 때는 현재 `schema.sql` 기준 테이블 이름에 맞춰 별도 `dev-open` / `dev-close` 정책 파일을 다시 만드는 편이 안전합니다.
