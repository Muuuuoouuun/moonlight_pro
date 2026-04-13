# Supabase DB Pack

Com_Moon Hub OS용 Supabase 스키마 패키지입니다. 현재 `apps/hub`에서 실제로 쓰는 콘텐츠/세일즈/운영/시스템 로그 구조를 기준으로 설계했고, Phase 2/3를 위한 확장 테이블도 함께 포함합니다.

## 포함 파일

- `schema.sql`: 기존 초안 테이블을 업그레이드 가능한 전체 스키마
- `seed.sql`: 로컬/개발용 기본 데이터
- `dev-open-policies.sql`: 로그인 없이 현재 UI를 붙여보는 임시 개발용 정책
- `dev-close-policies.sql`: 개발용 오픈 정책 제거

## 적용 순서

1. Supabase SQL Editor에서 `schema.sql` 실행
2. 샘플 데이터가 필요하면 `seed.sql` 실행
3. 보안 모드 선택

- 안전 기본값: `schema.sql`만 사용
- 무로그인 개발 테스트: `dev-open-policies.sql` 추가 실행
- 다시 잠그기: `dev-close-policies.sql` 실행

## 현재 앱과 맞춘 핵심 테이블

- `content_items`: `title`, `subtitle`, `body`, `status`, `template_id`, `created_at`
- `leads`: `name`, `email`, `source`, `status`, `notes`, `created_at`
- `operation_cases`: `title`, `description`, `status`, `created_at`
- `error_logs`: `context`, `payload`, `trace`, `severity`, `archived`, `timestamp`

## 설계 포인트

- 단일 기본 워크스페이스 `com-moon`을 자동 부트스트랩합니다.
- 현재 UI에서 바로 필요한 컬럼은 nullable/기본값까지 맞춰 두었습니다.
- 상태값은 enum으로 정리해서 데이터 품질을 강제합니다.
- `updated_at` 트리거, 기본 워크스페이스 할당 트리거, 콘텐츠/운영 상태 날짜 트리거를 포함합니다.
- 보안 기본값은 `authenticated` + staff 역할 기준 RLS입니다.
- 서버 작업은 `SUPABASE_SERVICE_ROLE_KEY` 사용을 전제로 두는 게 안전합니다.

## 중요 메모

- 지금 `apps/hub`는 브라우저에서 Supabase를 직접 호출하는 구조라, 로그인/Auth를 아직 안 붙였다면 안전 기본 RLS만으로는 화면이 비어 보일 수 있습니다.
- 이 경우 개발 중에만 `dev-open-policies.sql`을 사용하세요.
- `api_keys`는 민감 테이블이라 개발용 오픈 정책 대상에 포함하지 않았습니다.
