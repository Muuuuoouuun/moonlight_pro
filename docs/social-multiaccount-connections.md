# 소셜 다중 계정 연결 계약

## 저장 키와 이관

`integration_connections`의 Threads(`meta_threads`), Instagram(`instagram_api`), YouTube(`youtube`)는 `(workspace_id, provider, account_key)`로 구분한다. Threads는 API 프로필 ID, Instagram은 앱 범위 프로필 ID, YouTube는 `UC...` 채널 ID를 `account_key`와 `external_account_id`에 함께 기록한다. 한 계정을 재인증하면 같은 행을 갱신하며 다른 계정의 토큰을 건드리지 않는다.

`20260924_0046_social_multiaccount_connections.sql`은 기존 행의 `external_account_id` 또는 `config`의 플랫폼 ID에서 키를 채운다. ID를 확인할 수 없는 과거 행은 빈 키로 남기므로 운영자가 검토해야 한다. 행을 삭제하거나 ID를 바꾸지 않아 기존 `sync_runs.connection_id` 참조가 유지된다. `gmail`, `google_calendar` 등 비소셜 provider는 `account_key=''`로 종전처럼 워크스페이스당 한 행이다.

적용 순서는 **운영 DB 백업과 현재 소셜 행 확인 → 이 마이그레이션 적용 → Engine과 Hub 코드 배포 → 계정별 OAuth 승인**이다. 마이그레이션 전 새 Hub 코드를 켜면 `account_key` 열이 없어 저장이 실패한다. 마이그레이션 후 옛 Engine 코드를 계속 쓰면 옛 2열 `on_conflict`가 실패할 수 있으므로 두 코드의 배포 간격을 짧게 유지한다. 이 문서와 코드 변경은 운영 DB 마이그레이션을 실행하지 않는다.

## OAuth와 브랜드

- Threads·Instagram: `/api/social/{meta/threads|instagram}/connect?brand=<정확한_핸들>&brandKey=<브랜드_slug>`
- YouTube: `/api/social/youtube/connect?channelId=<정확한_UC_ID>&brandKey=<브랜드_slug>`

`brandKey`는 선택 사항이다. 넣으면 시작 단계에서 같은 워크스페이스의 `brands.slug` 존재를 확인하고, 서명된 OAuth state를 통해 콜백까지 전달한다. 브랜드가 아직 정해지지 않은 채널은 빈 매핑으로 연결할 수 있다. 나중에 명시적 `brandKey`로 재인증하면 매핑할 수 있고, `brandKey` 없이 재인증하면 기존 매핑을 유지한다. Threads·Instagram은 인증된 프로필 핸들이 요청 핸들과 정확히 일치해야 저장된다. YouTube는 인증된 채널 ID가 요청 ID와 일치해야 저장된다.

연결 상태 API는 플랫폼별 `connections` 배열에 토큰 없는 요약을 제공한다. Threads·Instagram은 `?brand=<핸들>` 또는 `?accountId=<플랫폼_ID>`, YouTube는 `?channelId=<UC_ID>` 또는 `?brandKey=<브랜드_slug>`로 해당 연결의 `status`와 단일 `connection`을 확인한다. 다른 계정이 연결돼 있어도 요청한 계정이 없으면 `ready`로 응답한다. Supabase 읽기가 실패하면 `storage-error`로 표시한다.

여러 YouTube 채널의 브랜드 소속과 실제 Google OAuth 선택 가능 여부는 각각 확인해야 한다. Studio의 소유자 표시는 특정 로그인에서 해당 채널이 OAuth 선택 목록에 나온다는 증거가 아니다. 이 단계는 자격증명 연결만 구현하며 업로드·게시 실행 코드는 포함하지 않는다.

## Meta 전용 앱 대상 (2026-10-26 운영자 승인)

현재 Meta 연결의 브랜드·핸들·지원 provider는 `apps/hub/lib/social-brand-registry.js`가 제한한다. 위의 일반적인 선택 사항 계약과 달리, 전용 앱 대상은 정확한 `brandKey`와 핸들을 함께 전달해야 한다. 전용 자격증명이 없거나 앱 ID가 다른 브랜드와 겹치면 다른 앱으로 우회하지 않는다.

| 브랜드 키 | 정확한 핸들 | provider | 전용 환경 변수 접미사 |
| --- | --- | --- | --- |
| `gore` | `go_re_startagain` | Instagram, Threads | `GORE` |
| `22nomad` | `22th.nomad` | Instagram, Threads | `NOMAD_22` |
| `holyfuncollector` | `holyfuncollect0r` (숫자 0) | Instagram | `HOLYFUN_COLLECTOR` |
| `sinabro` | `dazz.ling_u` | Threads | `SINABRO` |

Instagram은 `COM_MOON_INSTAGRAM_<접미사>_APP_ID`·`APP_SECRET`, Threads는 `COM_MOON_META_THREADS_<접미사>_APP_ID`·`APP_SECRET` 쌍을 사용한다. 각 제품 화면의 앱 ID와 secret을 사용하며 부모 Meta 앱 ID로 대체하지 않는다. Class.Moon(`CLASSMOON`)·Politic Officer(`POLITIC_OFFICER`)·BridgeMaker의 기존 연결 계약은 유지한다.

전용 앱의 OAuth 권한은 프로필 기본 조회와 콘텐츠 게시 두 가지로 고정된다. 테스터 역할 등록 → 해당 계정에서 초대 수락 → OAuth 승인 → 실제 `/me`의 ID·핸들 대조 순서로 검증한다. 상태 API의 `stored-metadata` 표시는 실제 API 검증을 대신하지 않는다. 연결 작업에는 실제 게시물 발행을 포함하지 않는다.

`20261026_0071_brand_social_oauth_apps.sql`은 OAuth 일회용 원장의 앱 허용 목록만 확장한다. 기존 앱 키, 앱 ID 쌍, 만료·재사용 차단, 연결 소유권 보호를 유지한다. 서울 운영 DB에는 2026-10-26 적용했고 migration ledger의 SHA-256 `b97b9853f2cc3c582af6ca192d578a30fed7fcf8d01b88d12c1faab754648df1`과 제약 조건을 재조회했다.
