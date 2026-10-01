# 소셜 연결/갱신 준비 상태 — 2026-09-30

후속 로컬 텍스트 단계는 [고래 최소 실행 단계](2026-10-01-gore-threads-text-local-step.md)를 본다. 아래는 보존된 이전 연결 단계 기록이다. 새 단계에서 다른 작업의 0061 적용/0062 준비를 확인해 고래 allowlist 0063/job 0064를 제안했다. 이전 0061 표기를 운영 적용 지시로 사용하지 않는다.

현재 전달본은 PR20 `a595b624c4bbcd616cdf7b3b2500d6de3a983075` 기준 격리 작업트리에서 재검증했다. 원본 PR19 조사/165개 단계 산출물은 별도로 보존했다. 재정합·최종 검증·비용/브리프 API 계약은 [PR20 재정합 결과](2026-10-01-social-pr20-reconciliation.md)가 최신이다. 아래 만료일과 계정 정보는 조회 시점의 저장 메타데이터이며 현재 공급자 유효성을 보장하지 않는다.

## 검증 범위와 작업 위치

- 빅맥 `bigmaegmun-ui-Macmini.local`, 원본 `/Users/bigmac_moon/dev/moonlight_pro`. 초기 조사 당시 `09.bigmac1.5@10d64f9b`였고, 다른 작업이 이후 브랜치를 이동했다. 원본 미커밋 파일은 편집하지 않았다.
- 초기 격리 작업트리 `.../task-2/moonlight-social`, `codex/social-token-readiness-0930`, 기준 `9f6f63e435563ce1c4c58f2bc9bd819ea4dbb5b6`는 보존했다. 현재 `.../task-2/moonlight-social-pr20`, `codex/social-pr20-reconcile-1001`의 기준과 원격 main은 `a595b624c4bbcd616cdf7b3b2500d6de3a983075`다.
- Android/cloud 패치·로그인 작업과 합치지 않았다. 토큰 원문 조회/출력, 실갱신/OAuth/게시/새 cron/운영 DB 변경/푸시/PR/배포를 실행하지 않았다.
- 운영 DB는 계정/만료/권한 메타데이터와 토큰 존재 여부만 읽었다. 이번 결과의 `connected`는 공급자 실검증을 의미하지 않는다.

## 저장 메타데이터 확인

2026-09-30 14:11 UTC 조회. YouTube 4개 모두 access 만료, access/refresh 존재, readonly/upload scope 존재, brandKey 미지정.

| YouTube 채널 | 고정 ID | refresh 권한 만료 KST(10/1) |
|---|---|---|
| 22세기 유목민 | UCK_CYxp_L_BiM2GCcP4r_8w | 14:55:14 |
| 문군 | UCJ6W-afKFqwgL_h09S3K83Q | 16:16:29 |
| 기독밈 | UCb599DDZuNpGXdasHgqKkzw | 16:17:07 |
| 클래스인 문 | UCNK7qVBPx7HJ0gpJw6DacrQ | 17:33:57 |

`refreshTokenExpiresAt`은 OAuth 응답 `refresh_token_expires_in`에 저장시각을 더한 값이다. 앱이 일괄 7일을 가정한 값이 아니다. 이번 갱신 구현도 새 TTL 응답이 없으면 기존 만료일을 보존한다. 현재 Google 콘솔의 Testing/Production은 미확인이다. 9/24 문서의 Testing 관측과 이번 만료값을 현재 콘솔 상태의 확증으로 쓰지 않는다.

Threads `@ml_bridgemaker` ID `28566844002947568`, 만료 11/23 16:17 KST, basic/content_publish. Instagram `@ml_bridgemaker` ID `40683122841286961`, 만료 11/23 16:19 KST, basic/content_publish. 실제 API/profile 유효성은 미검증. 장기 access token 갱신 방식이며 별도 refresh token이 없다.

Class.Moon = `classmoon/@moon.classin`, 정치 = `politicofficer/@politic_officer`. Class.Moon은 최종 사용자 정정에 따라 정상 연결 대상이다. 보류 로직은 남기지 않았다. 회사 YouTube `클래스인 문`은 이 Instagram과 별개다. 로컬 Hub/Engine의 회사/정치 전용 Meta 앱 ID/secret 키는 미설정이며 운영 설정은 미확인이다. 기본 Bridge 설정으로 회사 앱을 대신하지 않는다.

관련 Google Calendar 연결 메타데이터는 존재하나 refresh를 유발할 수 있는 SDK 호출은 하지 않았다. Gmail 연결 행은 확인되지 않았다. Facebook Page/TikTok 게시 어댑터는 없다.

## 단계 1 구현과 검증

- YouTube 상태 UI: 계정별 고정 ID·access/refresh 만료·재승인 예정·브랜드 미지정·업로드 준비 미완료를 표시한다. 화면 로드/상태 GET은 갱신하지 않는다.
- 갱신은 인증된 Hub의 확인창 → `POST /api/social/youtube/refresh`, `confirmRefresh:true`와 정확한 channelId가 있어야 시작한다. 워크스페이스와 provider는 서버가 결정한다. 사용자 재연결은 기존 OAuth 경로를 이용한다.
- 서버 helper는 새 access token으로 `channels.list(mine=true)` 채널 ID를 검증한 뒤 해당 연결 행에만 저장한다. refresh 응답의 부분/잘못된 타입·TTL·권한 축소는 저장하지 않는다.
- CAS URL 조건은 id/workspace/provider/account_key/status/last_synced_at뿐이다. raw access/refresh token 필터는 없고 응답 representation은 `select=id`다. 수정시각은 최소 1ms 증가시킨다.
- Map은 같은 프로세스/같은 계정의 진행 중 호출만 묶는다. 다중 인스턴스의 공급자 발급 자체를 막는 잠금이 아니다. CAS는 오래된 저장을 막으며, 충돌 시 정확히 같은 계정의 유효한 최신 행만 사용한다. 자동 갱신/분산 worker 도입 전 영속 lease가 필요하다.
- 공급자 실패/네트워크 오류는 안전한 코드로 분류한다. Instagram/Threads callback은 raw 오류를 sync 로그에 쓰지 않는다. Supabase credential 행 실패는 상세/URL을 제거하고 중복 분류용 SQL 코드만 남긴다.
- 저장 응답을 잃으면 성공으로 표시하거나 자동 재발급하지 않는다. DB PATCH가 적용됐는지는 불확실할 수 있으므로 상태를 다시 읽고 재연결/재시도를 결정한다. 새 grant가 회전했는데 저장되지 않은 경우 재승인이 필요할 수 있다.
- Meta 상태는 계정/브랜드/앱 범위를 유지하며 만료·만료 미확인·갱신 필요를 구분한다. Meta 수동 token refresh endpoint/자동 스케줄은 이번 단계에 추가하지 않았다. 재연결만 기존 OAuth 경로로 진행한다.
- 합성 테스트 165/165, `npm --workspace @com-moon/hub run build` 성공, `git diff --check` 통과. 공급자/DB는 가짜 응답만 썼다.
- 독립 로컬 UI harness에서 expired/reauthorization 화면·확인창·확인 전 GET만·확인 후 fake POST 1회/상태 갱신을 확인했다. 실제 자격증명 없는 합성 UI이며 QA 서버는 종료했다.

주요 파일: `lib/{youtube-oauth,social-token-health,social-account-status,social-upload-readiness,meta-threads,instagram-api}.js`, `app/api/social/{youtube/{status,refresh},meta/threads/{status,callback},instagram/{status,callback}}/route.js`, `components/hub/pages/{youtube-connections,evolution-settings}.jsx`, `packages/supabase-rest/index.js`와 관련 회귀 테스트.

## 고래 연결 지원 — 후속 증분

- 단계 1의 165개 통과 시점은 별도 `task-2/social-phase1-165-tests.patch`로 보존했다. 이후 고래 지원을 추가했으며 최종 연결 회귀는 177/177이다. DB readiness 8/8, 목업/색상/모션 규칙 6/6과 Hub production build도 통과했다.
- 공통 `social-brand-registry.js`가 UI와 서버의 브랜드/handle/provider/app 경계를 공유한다. 기존 BridgeMaker/Politic Officer/Class.Moon은 Instagram/Threads 대상 그대로다. Go;Re는 사용자 지정 Threads `gore/@go_re_startagain/appKey=gore`만 지원한다. 고래용 Instagram 연결은 추측해 추가하지 않았다.
- Hub/Engine 로컬 `.env.local`의 `COM_MOON_META_THREADS_GORE_APP_ID`/`COM_MOON_META_THREADS_GORE_APP_SECRET`는 키 존재/설정 여부만 확인했으며 둘 다 미설정이다. 운영 설정은 미확인이다. 빈 고래 설정에서 기존 BridgeMaker/Class.Moon 자격증명으로 fallback하지 않는다.
- 고래 state는 서명·provider·workspace·brand/handle·app ID/key·nonce·만료·기존 동일 앱 account ID에 묶인다. callback은 one-time flow를 소비한 뒤 `/me`의 username/ID를 확인하고 해당 provider/account 행만 저장한다. 다른 브랜드/앱으로 귀속된 기존 행은 변경하지 않는다.
- Threads 응답의 access token 타입/값, 장기 token TTL, 반환 scope의 축소를 검사한다. 부분 long-token 응답을 short-token TTL로 보충해 장기 연결 성공으로 표시하지 않는다. HTTP 응답에 scope가 없으면 요청 scope를 기록하는 기존 동작이므로 실제 계정의 현재 권한은 API 단계에서 별도 확인해야 한다.
- 신규 `20261001_0061_gore_oauth_app_binding.sql`은 기존 one-time OAuth 앱 허용 목록에 `gore`만 추가한다. 기존 앱/ID 형식/pairing/계정 소유권 제약은 유지한다. `scripts/database-readiness.mjs`에도 이 제약 버전을 등록했다. **운영 미적용**이며 임시 로컬 PostgreSQL의 합성 행으로 기존 세 앱과 고래 허용, unknown 앱/불완전 ID/잘못된 ID 거부를 검증했다.
- Chrome **1 / Junhyeok**, 정확한 URL의 탭 `1145207398`을 읽어 `GO;RE / go_re_startagain`, 자기 프로필 링크와 프로필 편집/인사이트 버튼을 확인했다. 브라우저의 본인 로그인 정황이며 Moonlight API 연결 성공 증거는 아니다. 숫자 provider account ID는 OAuth 후 `/me` 검증 전까지 미확인이다. 게시 편집/버튼은 누르지 않았다.
- 사용 가능한 Chrome 표시명은 1 Junhyeok / 2 정상화 / 3 classin.com이다. 표시명만으로 정치 Meta 계정을 확정할 수 없다. Chrome 2의 Vercel/로그인 작업은 조작하지 않았다. 부모 리서치가 전달한 [Politic_Officer Notion 지침](https://app.notion.com/p/e9216edda79246b9a4f32b6afc5d256e)의 `@Politic_officer`는 기존 코드 handle 후보와 일치하나, 실제 공개 URL/로그인 소유자는 미검증이다.
- 승인된 고래 Threads 1건 본문·작업키 후보·중복 방지/사용자 단계는 [발행 최소 계획](2026-09-30-gore-threads-publish-plan.md)에 고정했다. 실제 grant/저장/게시나 executor 구현은 아직 하지 않았다.

## 공식 조건

- [Google OAuth](https://developers.google.com/identity/protocols/oauth2): 외부 Testing 앱의 non-profile scope refresh grant는 7일 제한. 취소/장기 미사용/발급 한도/시간제 접근/관리자 정책 등도 무효화 원인이 된다. access 1회 갱신은 refresh grant 만료 해결이 아니다. Production 전환은 실행하지 않았다.
- [Threads long-lived tokens](https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens): 일반 웹 도구 접근 실패 후 IAB에서 공식 원문(Updated March 27, 2025)을 직접 읽었다. short 1시간, long 60일, 발급 24시간 이후/만료 전/basic 권한이 있어야 refresh 가능, 갱신 후 60일, 만료 후 refresh 불가. 앱 검수/역할/권한 조건은 별도로 확인해야 한다.
- 교차 확인: [Meta 공식 샘플](https://github.com/fbsamples/threads_api), [공식 Postman collection](https://raw.githubusercontent.com/fbsamples/threads_api/main/postman/threads-api.postman_collection.json). 공식 현재 문서의 `.com` endpoint와 기존 코드 `.net` endpoint의 실제 호환성은 credentials 없이 검증하지 못했으며 live 연결 단계에서 확인해야 한다.
- [YouTube videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert): 2020-07-28 이후 생성된 미검증 프로젝트는 업로드가 private로 제한되고 제한 해제에는 API 준수감사가 필요하다. OAuth Testing/Production·OAuth 앱 검증과 다른 조건이다. 현재 프로젝트의 해당 여부/감사 상태는 미확인. 과거 1600 quota를 하드코딩하지 않았다.
- [YouTube resumable upload](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol): session/진행 위치/308/상태 조회와 재개를 durable job에서 관리해야 한다. 세션 URL도 비밀처럼 보호한다.

## Class.Moon 플랜 B

실제 코드상 Instagram/Threads OAuth는 각 Meta 앱으로 직접 진행한다. Google OAuth는 Instagram 인증 단계에 포함되지 않는다. 회사 Google 이메일이 Facebook/Instagram 로그인·복구 연락처인지, Meta/Business 앱 소유권에 어떤 사람/조직으로 연결됐는지는 현재 설정 화면에서 재확인하지 않았다.

9/24 handoff 문서에는 Classin Korea 포트폴리오 관리자 4명, Classmooni 앱의 직접 full-access 관리자 1명, 회사 개발자 연락처 이메일이 관측됐다고 기록돼 있다. 이는 과거 증거다. 현재 관리자/복구 연락처 유효성은 미확인이다.

다음 읽기 확인 후 사용자/회사 정책에 맞춰 결정한다: 유지 가능한 보조 로그인·복구 연락처와 MFA 복구 수단의 존재 여부, 독립 관리자와 앱 자산의 직접 권한, Meta 앱/Instagram/Business 소유자, OAuth 앱/토큰 재연결 담당자와 복구 절차. 암호/복구코드는 채팅으로 받지 않는다. [Meta 연락처 변경 도움말](https://www.facebook.com/help/224049364288051)은 이번 공개 접근에서 로그인으로 리디렉션돼 현재 절차를 검증하지 못했다. 실제 계정의 Accounts Center/Business 설정에서 권한 있는 사용자가 확인해야 한다. Google 삭제 시 자산·데이터 자동 승계를 약속하지 않는다. 이메일/MFA/관리자/권한 변경은 하지 않았다.

## 원격 업로드/트래킹 후속 최소 범위

현재 apps/android·desktop은 같은 운영 Hub URL을 쓴다. Studio/Engine은 텍스트 제작, 수동 발행 URL/로그 기록, 예약 알림, 수동 성과 입력을 지원한다. `content_schedules`는 알림 원장이고 API 발행 큐가 아니다. PR19의 기존 cron 4개는 점수/문의/GitHub/예약 sweep이고 PR20 `vercel.json`에는 research/reports daily fallback 2개가 추가됐다. social refresh/publish cron은 없다. 별도 Mac research/reports launchd는 900초 간격으로 설치돼 있다. 이번 작업에서는 어느 스케줄도 호출·등록·변경하지 않았다. content-flywheel endpoint는 retired tombstone이다.

| 구성 | 기존 코드 재사용과 필요한 추가 |
|---|---|
| 미디어 보관 | `supabase/setup/01_storage.sql`에 private `moonlight-content-assets`/public `moonlight-public`가 정의됨. 50MiB 제한, MP4 미허용. 실제 bucket 설치는 미확인. storage 업로드 adapter가 없고 `content_assets.asset_type`에도 video 없음. 영상은 정책/스키마 변경 또는 별도 private bucket 승인 필요. 텍스트 Threads 시험에는 미디어 bucket 불필요. |
| 영속 작업/중복 방지 | `content_items/variants`, `publish_logs`, 기존 요청/영수증 패턴 재사용. 별도 social publish job에 workspace/provider/account ID/brand/app ID/content revision/body hash/job key/승인범위/lease/version/session/progress/결과 ID를 저장. Unique job key와 lease 획득은 DB 트랜잭션/RPC로 구현. 기존 publish_logs만으로 분산 중복 실행을 보장하지 못함. |
| executor | 가장 작은 다음 구현은 Threads text-only container 생성 → 완료 확인 → publish → post 조회 검증. 영상은 후속 YouTube resumable adapter. OAuth 토큰을 브라우저/원격 앱에 보내지 않고 서버 연결을 선택. 응답 불확실 상태는 reconcile 전 재발행 금지. |
| 승인 계약 | 고정 brand/provider/account/app, 콘텐츠 revision/hash, 공개범위, 1회 실행 키. 사용자/대상/본문 변경 시 기존 승인 무효화. 초기 영상 default private, 공개 가능 여부는 프로젝트 감사 별도 확인. |
| 트래킹 | 현재 `/api/hub/content/performance`는 조회/공유/답글 수동 기록. provider post ID를 key로 결과/성과 수집 adapter와 capturedAt/source를 추가. 필요한 insights scope/검수는 별도 사용자 승인. 미측정 수치는 0으로 표시하지 않음. |

로컬에서 먼저 구현할 수 있는 범위: 위 계약/작업 상태기계/가짜 provider adapter/계정 경계/중복·응답 불확실 복구 테스트/상태 UI/미적용 SQL. 실제 단계 전 필요한 사용자 행동: 정상 Hub 로그인, Meta 앱 설정·HTTPS callback/tester 권한, 정확한 계정에서 OAuth 직접 승인, 운영 migration/스토리지 정책/배포 승인. 새 cron은 별도이며 첫 시험은 명시적 1회 실행으로 충분하다.

## 운영 반영/복구

소셜 변경은 이 격리 브랜치에서만 검토한다. 로그인 패치/Android 패치를 혼합하지 않는다. 승인 후 선택한 코드만 새 main에 적용하고 같은 합성 테스트·빌드를 재확인한 뒤 배포한다. 단계 1에는 migration 변경이 없고 코드 롤백으로 UI/route를 되돌릴 수 있다. 고래 증분에는 미적용 0061 migration이 있으므로 운영 반영은 별도 승인·원래 제약 read-back 확인 후 진행한다. 코드 롤백 시 넓어진 allowlist는 기존 세 앱 동작에 영향을 주지 않으며 고래 flow가 남아 있을 때 제약을 무작정 좁히지 않는다. 실제 토큰 저장 이후에는 이전 token을 복원/회전하지 말고 metadata 조회 또는 재승인으로 복구한다.

초기 공개 조회의 configured:false/HTTP503은 과거 결과다. PR20 이후 읽기 검증은 `/api/operator/session` HTTP200/configured:true, `/dashboard` 307→`/login`, `/login` HTTP200이다. 과거 설정 오류를 현재 차단으로 보고하지 않는다. 새 비밀번호 적용과 운영 alias→SHA 직접 대응은 미확인이다. 비밀번호/세션을 열람하거나 변경하지 않았다.
