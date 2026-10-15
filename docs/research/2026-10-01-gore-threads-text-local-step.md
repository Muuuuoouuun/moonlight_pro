# Go;Re Threads 텍스트 1건 — 로컬 최소 실행 단계

이 단계는 `codex/gore-threads-text-test-1001`, `.../task-2/moonlight-threads-text`에서 PR20 `a595b624c4bbcd616cdf7b3b2500d6de3a983075`와 보존된 소셜 재정합 패치를 바탕으로 작업했다. 이전 211개 검증/Hub build 산출물과 작업트리는 그대로 보존했다. 이 단계에서 설치·큰 빌드·PostgreSQL 초기화·운영 DB 쓰기·OAuth·게시·배포·푸시는 하지 않았다.

## 고정된 승인 범위와 실제 상태

- 사용자 지정 Threads `@go_re_startagain`, brand `gore`, app key `gore`, brand UUID `7fad9d64-bb90-4a63-8528-de8a8a23836d`의 짧은 텍스트 1건이다. 본문과 SHA-256, 작업키는 [기존 승인 계약](2026-09-30-gore-threads-publish-plan.md#확정된-대상과-본문)을 그대로 쓴다.
- body hash: `cefd7d31a8c445c8693c307f630b6462ddd8b19798665c27f4147293d8a1807e`; key: `gore-threads-test-20260930-01`. 해시가 맞는 고정 본문 외에는 받지 않는다.
- 숫자 app-scoped account ID와 전용 앱 ID·실제 OAuth grant는 아직 확인/설정되지 않았다. handle에서 숫자 ID를 추측하지 않는다. 실제 영속 job·container·post ID·permalink도 없다. 테스트의 ID·token은 전부 합성값이다.
- runtime gate `COM_MOON_THREADS_TEXT_TEST_ENABLED`는 코드 기본값 false다. 이번에 환경파일/운영 설정을 변경하지 않았다. gate만 켜면 계정 연결·DB 준비가 해결되는 것은 아니다.
- 새 경로는 고래 시험 1건 전용이다. 범용 업로더, 다른 브랜드, 미디어, 반복 일정, insights 수집, prepared research import, 비용 정책을 추가하지 않았다.

## 번호 충돌을 반영한 미적용 SQL 제안

최신 원격 main 읽기는 여전히 PR20 `a595b624`였다. 서울 DB ledger의 파일명/해시 SELECT에서는 `20261001_0061_report_quality_projection.sql` / `342a24f01d83a6b51c54ee5cb746362aebe76aa9e16817b8012960315f4fc539`가 적용돼 있었다. 고래 allowlist 0061은 적용되지 않았다. 별도 연구 작업트리에는 `20261001_0062_office_weekly_quality_deadline.sql`도 준비돼 있었다(0062 적용 ledger는 이번 SELECT에 없었다).

따라서 **이 새 작업트리에서만** 이전 고래 allowlist를 내용 그대로 `20261001_0063_gore_oauth_app_binding.sql`로 옮기고, `20261001_0064_gore_threads_text_test_job.sql`을 준비했다. readiness 및 해당 회귀의 참조도 함께 바꿨다. 0063 SHA는 기존 고래 내용 `9b0f0d1943a76b850e3810c404144e157888e89699a011a3d1cde169a80dcaf3`와 같다. 이전 재정합 패치는 보존본이므로 그 안의 고래 0061을 운영에 그대로 적용하면 안 된다.

0063/0064는 제안 번호이며 최신 main/ledger/다른 작업의 예약 번호를 운영 반영 직전에 다시 조율해야 한다. 적용된 report/research 0056~0061을 재번호·재적용하지 않았고 별도 Android Library 원본과 합치지 않았다.

## 실제 추가 파일과 API 계약

| 파일 | 역할 |
|---|---|
| `apps/hub/lib/gore-threads-test-contract.js` | 고정 브랜드/본문/hash/job key, 숫자 account/app ID, strict input, 비밀 없는 job projection |
| `lib/repositories/gore-threads-test-jobs.js` | 기존 `server-write.js` → 공통 REST RPC. 저장 불명확 오류를 고정 코드로 반환 |
| `lib/gore-threads-test-service.js` | 준비/실행/조회복구, 정확한 연결/앱/유효기간·저장된 scope, `/me` ID/username 확인 |
| `lib/threads-text-test-adapter.js` | bounded Threads GET/POST, TEXT container 생성/발행 분리, 결과 GET 검증 |
| `app/api/social/meta/threads/test-post/route.js` | 단일 GET/POST BFF, write guard + operator session + exact same-origin, 2KiB JSON |
| 두 `.test.mjs` | provider·repository 합성 의존성으로 실패/경계/중복·응답 유실 회귀 |
| 미적용 0064 SQL/readiness | 영속 단일 job, unique key, row lock/lease/version CAS, 불명확 상태, post receipt |

`POST /api/social/meta/threads/test-post`의 모든 동작에는 **운영자 세션과 정확한 같은 Origin**이 필요하다. 일반 Hub write secret만으로는 실행할 수 없다. 앱/desktop이 기존 Hub 세션을 사용하는 경로는 이 계약을 쓸 수 있지만 임의 원격 서버의 게시 권한은 추가하지 않았다. 설정 UI에 새 게시 버튼을 연결하지 않았으며 아래 API 계약이 이번 구현 표면이다.

공통 입력은 `accountId`, `appId`, 승인된 `bodyHash`다. workspace/brand/provider/body를 클라이언트가 바꾸면 거부한다.

- `action:'prepare'`: `visibility:'public'`, `confirmPrepare:true`. 실제 고래 전용 연결이 없거나 만료/오매핑/저장 scope 부족이면 job을 만들지 않는다. 같은 key/payload는 기존 job을 반환하고 다른 account/app은 충돌이다.
- `action:'execute'`: `jobId`, `visibility:'public'`, `confirmPublish:true`. 기존 job과 정확한 승인 tuple을 비교한 뒤 readonly `/me`로 소유 ID/handle을 확인하고 lease를 획득한다.
- `action:'reconcile'`: `jobId`, `confirmLookup:true`. provider GET만 수행하고 create/publish는 하지 않는다. 알려진 post ID가 없을 때 운영자가 숫자 `observedPostId` 후보를 제공하려면 `confirmRecoveredPost:true`가 추가로 필요하다. 후보를 본문·owner·username·permalink로 검증한 뒤만 저장하며 `operator-reconciled` 출처를 표시한다. provider 응답에서 원래 확보한 ID는 저장돼 있어야 한다.
- `GET .../test-post?jobId=<UUID>`: middleware 인증을 거쳐 비밀 없는 job metadata/receipt만 읽는다. 갱신·조회복구·게시를 하지 않는다. 저장소 오류는 HTTP200 + `status:'error'` 봉투로 반환한다.

이 API 입력 자체가 OAuth/운영 배포 승인이나 새로운 게시 범위를 만드는 것은 아니다. 실행 직전에 대상·정확한 본문·공개 프로필 게시·한 건 key를 사용자에게 보여 주는 화면/행동 확인이 필요하다. 아직 그런 운영 실행은 하지 않았다.

## 영속 중복 방지와 복구 한계

0064는 credential을 저장하지 않는 `gore_threads_test_jobs` 한 테이블과 service_role 전용 RPC를 준비한다. workspace/job key unique, 고정 브랜드/본문 hash, immutable account/app, version, UUID lease owner/token, 90초 expiry, container/post ID, permalink/검증시각·출처를 기록한다. 테이블은 RLS를 켜고 service_role까지 직접 쓰기를 회수해 RPC만 쓰게 한다.

`prepared → claimed → creating → container_ready → publish_requested → post_recorded → verified` 순서다. `creating`과 `publish_requested`를 저장·확인한 후에만 해당 POST를 보낸다. 각 advance는 row lock 아래 owner/token/version/expiry를 확인한다. 신규 claim은 효과 전 `prepared/claimed`에서만 가능하다. 효과가 시작된 상태의 lease가 만료되면 `ambiguous`로 바꾸고 execute를 거부한다. 살아 있는 lease는 busy다. 진행 중 Map에 의존하지 않는다.

만료/실패 판정 때문에 provider POST를 자동 반복하지 않는다. 외부 API에는 이 job key가 idempotency key로 전달되지 않으며, provider 발행 응답 유실·서버 중단 경계에서 exactly-once를 보장하지 않는다. DB/응답 저장이 이미 성공했는지 불명확하면 CAS로 보수적으로 멈추고 조회해야 한다.

`PUBLISHED` container만으로 최종 post ID를 추측하지 않는다. container ID가 없거나 post ID가 확정되지 않으면 ambiguous를 유지한다. known ID 또는 운영자가 확인한 후보의 GET에서 numeric owner, username, 정확한 본문/hash, 안전한 Threads profile permalink가 모두 맞아야 verified가 된다. 후보의 query/fragment는 permalink 저장에서 제거하며 잘못된 후보는 저장하지 않는다. 조회 복구가 자동 새 게시를 승인하지 않는다.

현재 최소 경로는 `IN_PROGRESS/ERROR/EXPIRED` container도 보수적으로 멈춘다. 대기 polling/자동 resume/reset은 구현하지 않았다. verified job은 재실행해도 기존 receipt만 반환한다. 수동 후보 복구는 operator 관찰과 API 검증을 표시하며 원래 container↔post 관계를 provider 응답으로 증명했다고 주장하지 않는다.

기존 content workflow의 `provider:manual/operator_confirmed/external_verified:false` 로그를 API 성공으로 위장하지 않았다. 현재 job receipt의 post ID/body hash/owner 확인·permalink/verifiedAt가 최소 트래킹 증거다. Studio publish log 연결이나 insights 측정은 아직 없다.

## 공급자 계약 근거와 비밀 처리

[Meta 공식 Postman collection](https://raw.githubusercontent.com/fbsamples/threads_api/main/postman/threads-api.postman_collection.json) 및 [Meta 공식 문서 모음](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)을 이번에 읽어 TEXT 생성, 별도 `threads_publish`, container status, post fields 경로를 확인했다. 개발자 문서 직접 URL은 도구 오류였으므로 공식 collection으로 교차확인했다. `auto_publish_text`는 보내지 않는다. container status의 FINISHED/PUBLISHED 구분을 사용하며 post permalink/owner/text를 읽는다.

새 adapter는 기존 코드와 공식 collection의 `graph.threads.net` 경로에 맞춰 v1.0을 쓴다. 현재 계정에서 host/version·Bearer header·요청 fields의 실제 허용 여부는 live OAuth 이후 검증이 남아 있다. 공식 예시를 읽은 것과 공급자 성공을 구분한다.

token은 서버 연결 저장소에서만 읽고 header로 보낸다. URL/입력 JSON/job/RPC에 원문 access/refresh token이나 app secret을 넣지 않는다. provider/DB raw 오류는 외부 응답·로그로 전파하지 않는다. 자동 token refresh는 호출하지 않는다. scope는 저장된 metadata 검사이므로 실제 publish grant/검수·앱 역할 확인을 대신하지 않는다.

## 검증과 남은 차단

- 새 실행/adapter/route 테스트 22개와 기존 고래 OAuth·write guard·middleware 회귀를 합쳐 **61/61** 통과했다. 범위: 단일 계약, 기본 비활성, 확인/Origin/session/계정 경계, 두 실행자 claim 모델, 오래된 lease fencing, 저장 전후 실패, 생성/발행 응답 유실, PUBLISHED만으로 재발행 금지, 올바른/잘못된 조회 후보, URL/오류 비밀 제거.
- readiness 정적/순수 검사 7개 및 runtime mock 금지 검사 2개, **9/9** 통과했다. 합계 70개다. SQL 선언은 기존 검사기가 인식하는 CREATE OR REPLACE 형태로 정합했다.
- repository race 테스트는 원자적 저장소 **의존성 모델**이고 실제 PostgreSQL RPC 실행 증거가 아니다. 신규 SQL의 문법·동시 세션/권한·함수 실제 실행 검증은 아직 하지 않았다. PostgreSQL 초기화 테스트는 명시적으로 제외했다. 기존 211개/빌드 결과로 이번 SQL이나 새 route build를 검증했다고 표시하지 않는다.
- 설치·전체 빌드 없이 기존 PR20 dependency 디렉터리를 symlink로 재사용했다. 이 링크는 운영 산출물이 아니며 원본 dependency를 변경하지 않았다. 작업트리는 소스 약 71MB 예상 규모로 추가했고, 대형 cache/media는 생성하지 않았다. 최종 실측 disk bytes는 별도 상태 JSON에 남긴다.

다음 승인/직접 단계: 번호 정합 → 공간 여유가 있을 때 임시 PG의 실제 SQL/2-session lease·CAS/RLS 및 대상 Hub build 검증 → 운영 schema/code 적용 승인 → 전용 Meta app ID/secret·HTTPS callback/tester/검수 설정의 사용자 직접 입력 → 정확한 Chrome 계정에서 OAuth 직접 동의 → 숫자 ID/실제 scope 읽기 확인 → gate 설정과 실제 한 건 실행 직전 계약 확인. 비밀은 채팅으로 받지 않는다. 진행 순서는 배포/연결 준비 상황에 맞춰 조율하되 승인 없이 어느 운영 변경도 실행하지 않는다.

기존 스케줄·비용 설정·prepared research 자료는 그대로다. ambiguity가 생기면 먼저 조회/수동 확인하며 새 key/재게시/삭제/강제 reset은 별도 결정이다. 코드 롤백은 provider 게시나 credentials를 되돌리지 않는다.
