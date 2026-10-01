# 소셜 PR20 재정합 — 검증 결과와 다음 단계

이 문서는 이전 211개 검증 시점의 보존 기록이다. 이후 확인된 report 0061 적용/0062 준비와 별도 고래 최소 구현/제안 번호 0063·0064는 [다음 로컬 단계](2026-10-01-gore-threads-text-local-step.md)가 정본이다. 아래 고래 0061 보존 패치를 운영에 그대로 적용하면 안 된다.

확인: 2026-09-30 UTC / 2026-10-01 KST. 빅맥 `bigmaegmun-ui-Macmini.local`에서 작업했다. 이 문서는 로컬 코드 완성과 실제 계정 연결·게시 성공을 구분한다.

## 이번 단계 결과

- 새 작업트리: `/Users/bigmac_moon/Documents/Codex/2026-09-30/task-2/moonlight-social-pr20`, 브랜치 `codex/social-pr20-reconcile-1001`.
- 기준 HEAD 및 종료 전 `git ls-remote`의 main: `a595b624c4bbcd616cdf7b3b2500d6de3a983075`(PR20). 기존 PR19 소셜 작업트리·보존 패치·원본 사용자 변경·별도 로그인/영상/Android 작업은 수정하지 않았다.
- 기존 소셜 패치를 옮기고 유일한 겹침인 `scripts/database-readiness.mjs`를 수동 정합했다. PR20의 report/research 0056~0060 항목은 모두 유지하고 고래 항목만 뒤에 추가했다.
- 운영 미적용 고래 allowlist는 `20261001_0061_gore_oauth_app_binding.sql`로 재번호했다. 내용 SHA-256은 이전 고래 파일과 같은 `9b0f0d1943a76b850e3810c404144e157888e89699a011a3d1cde169a80dcaf3`다. 기존 허용 앱·ID/pairing·소유권 제약을 유지한다. 새로운 0061 번호는 이 기준 main에서 유일하다.
- 구현 범위: 계정별 비밀 없는 상태/만료, 확인 후 YouTube 갱신 진입점, 안전한 오류, 앱/계정 경계, 정상 Class.Moon 연결 대상, 고래 전용 Threads 설정·OAuth state/callback·readiness. 기본 앱 자격으로 고래 설정을 대체하지 않는다.
- 실제 OAuth/자격증명 발급·갱신·설정, DB 적용, 스케줄 등록/호출, 유료 연구 실행, 게시, 푸시/PR/배포는 하지 않았다. Threads 발행 executor·영속 publish job은 아직 없다.

| 이번 PR20 검증 | 결과 | 증거 파일(task-2) |
|---|---|---|
| 기존·고래 연결 및 인증/REST 회귀 | 177/177, skip 0 | `social-pr20-tests.log` |
| readiness + 임시 PostgreSQL 제약 전후 검사 | 8/8, skip 0 | `social-pr20-db-tests.log` |
| 목업/팔레트/모션 규칙 | 6/6 | `social-pr20-ui-tests.log` |
| 연구 요청·비용 투영·브리프 저장 계약 | 20/20 | `social-pr20-contract-tests.log` |
| Hub production build, Next 16.3.8 | exit 0 | `social-pr20-build.log` |
| whitespace·lockfile | `git diff --check` 성공, lockfile 변경 없음 | `social-pr20-state.json` |

총 211개는 이 단계의 대상 테스트 수다. 저장소 전체 테스트나 실제 공급자/운영 DB 검증을 대체하지 않는다. 새 제약의 행 검사는 로컬 임시 PostgreSQL에서 합성 데이터로 실행했다. 이 DB는 테스트 `finally`에서 정지·삭제됐으며 운영 DB와 연결하지 않았다. 기존 독립 합성 UI 확인창 증거 `social-refresh-confirmation.png`도 보존했다.

YouTube 회귀에는 원문 token이 CAS URL/오류에 들어가지 않는지, `refreshTokenExpiresAt` 보존·공급자 TTL 반영, 같은 밀리초 버전 증가, 유효한 CAS 승자만 회수, 응답/저장 실패, 부분 OAuth/갱신 응답, 축소 scope, 다른 채널·workspace·provider, 확인 없는 POST 거부를 포함한다. 고래 회귀에는 빈 전용 설정의 fallback 금지, 기존 세 브랜드와 Instagram 경계, 서명 state/app ID/nonce/workspace/handle, 재사용 state·설정 변경·오매핑·부분 장기 응답·권한 축소의 저장 거부를 포함한다.

CAS는 `id/workspace_id/provider/account_key/status/last_synced_at` 조건과 `select=id`를 사용한다. access/refresh token은 요청 본문의 서버 저장값에만 있다. 프로세스 Map은 같은 프로세스의 호출을 묶으며 여러 인스턴스의 공급자 발급을 잠그지 않는다. CAS 역시 외부 토큰 발급 자체의 exactly-once 보장은 아니다.

## 적용 이력과 번호 충돌

18:09 UTC의 읽기 전용 서울 ledger 검증(`ncgpnqfulnlshegalmbd`)에서 아래 정확한 파일명/해시가 main 바이트와 일치했다. 이번 재정합에서도 HEAD와 작업 파일의 바이트 일치를 다시 확인했다. 동일 번호만으로 다른 migration의 적용 여부를 판단하지 않았다.

| 적용 확인 파일 | ledger = main SHA-256 |
|---|---|
| `20261001_0056_report_documents.sql` | `bd5167058bb9b72e826262094e99754285eccddfb3683441d29edc2b875a820b` |
| `20261001_0057_research_runs.sql` | `9dc480546376e0b2f71d8b233e84c79c2f3aae971a9b1b8721854b6936a83c26` |
| `20261001_0058_research_pending_recovery.sql` | `c85437a65868f3c1adfbc9f0892813cbd4780b15bfe8a6c4ce03729043a9bf7b` |
| `20261001_0059_research_draft_slots.sql` | `0bc946f89f5253930972c94734d973c8664008796b264a0e2b61ddadd62438af` |
| `20261001_0060_research_provider_outcomes.sql` | `480194fdf36176a93e42a82e230f7bc3b6fea9c9197866e224b4a6d04ce2fa98` |

같은 조사에서 Android 원본 `20260930_0056_device_calendar_occurrences.sql`, `20260930_0057_contact_outcome_idempotency.sql` 및 이전 고래 `20260930_0056_gore_oauth_app_binding.sql`의 정확한 ledger 항목은 없었다. Android 원본은 부모가 별도 Library 패치로 보존 중이며 이번 작업에 적용하지 않았다. 향후 Android 통합 시 실제 최신 번호를 확인해 각각 고유 번호를 부여하고 정확한 파일명/내용 해시를 새 이력과 비교해야 한다. 적용된 PR20 0056~0060을 재번호/재적용하거나 번호만으로 Android 완료로 표시하면 안 된다.

## 현재 계정·로그인 확인 범위

- YouTube 4채널: 저장된 access 만료, refresh grant 만료 10/1 KST 14:55~17:33. 이 값은 공급자 `refresh_token_expires_in`을 사용한 저장 메타데이터다. Google 콘솔 Testing/Production 현재 상태는 미확인이다. access 갱신 1회가 refresh 권한 만료를 해결하지 않는다. 실제 계정별 확인·필요한 재동의가 남아 있다.
- BridgeMaker Threads/Instagram: 저장 만료 11/23, 실제 공급자 유효성은 미검증. Class.Moon `classmoon/@moon.classin`은 정상 대상이고 보류 조건은 없다. 회사/정치 별도 Meta 설정·현재 자산/권한 확인이 남아 있다.
- Go;Re: 사용자 지정 Threads `@go_re_startagain`과 자체 프로필 UI를 읽어 확인했다. DB active `gore` brand ID `7fad9d64-bb90-4a63-8528-de8a8a23836d`는 존재하지만 연결 행은 없다. 숫자 app-scoped provider account ID·grant는 아직 미확인이다. 고래 앱 ID/secret 키는 조사한 로컬/PR20 production 파일에서 미설정이었다. 비밀값은 출력하지 않았다.
- 정치 Chrome: 표시 이름은 계정 소유 증거가 아니다. `@politic_officer`는 코드/Notion 후보이며 다른 프로필의 실제 Meta 계정 확인이 필요하다. Chrome 2/Vercel 화면은 건드리지 않았다.
- PR20 이후 공개 운영 session GET은 HTTP200/configured:true, dashboard 307→login, login HTTP200이었다. 과거 configured:false/503은 현재 차단이 아니다. 새 비밀번호 적용과 고정 alias→SHA 직접 대응은 미확인이고, 로그인 작업과 별도로 다룬다.
- Class.Moon Plan B: 코드에는 직접 Meta OAuth만 있고 Google OAuth가 필수 단계가 아니다. Google 이메일의 로그인/복구 연락처 역할 및 Meta/Business/앱 자산 관리권한은 현재 화면 실측이 남아 있다. 보조 복구 수단·독립 관리자·직접 자산 권한·재연결 담당 절차를 확인한 뒤 제안할 수 있다. 이번에 이메일/MFA/관리자/권한을 변경하지 않았으며 Google 삭제 시 자동 승계를 약속하지 않는다.

공식 Google/Threads 만료 조건과 YouTube private 업로드 감사의 구분, Threads 원문 접근/Meta 공식 샘플·Postman 교차확인 경로는 [기존 조사 공식 조건](2026-09-30-social-token-readiness.md#공식-조건)에 남겼다. OAuth 앱 Production/검증과 YouTube API 업로드 준수감사는 별개이며 현재 프로젝트 감사 상태는 미확인이다.

## 고래 텍스트 1건: 가장 작은 다음 구현안

대상·본문·작업키는 [승인 계약](2026-09-30-gore-threads-publish-plan.md)에 고정했다. 이 단계는 계획이며 다음 파일·RPC를 아직 추가하지 않았다.

| 공통 계층에 추가할 최소 단위 | 역할 |
|---|---|
| `apps/hub/lib/social-publish-contract.js` | 서버 workspace/승인 actor, brand UUID/provider/account ID/app ID, 본문 hash/revision, 공개 범위·1회 job key 검증. 대상/본문 변경 시 기존 승인 재사용 거부. |
| `lib/repositories/social-publish-jobs.js` | 기존 `server-write.js` → `@com-moon/supabase-rest` RPC 사용. job/receipt 읽기와 lease/version CAS. |
| `lib/social-publish-service.js`, `lib/threads-text-publish.js` | 상태 전이 및 Threads TEXT adapter. provider 실패를 비밀 없는 코드로 기록. token은 서버 연결 저장소에서만 사용. |
| `app/api/social/publish/jobs/...` | 준비 POST, 상태 GET, job별 명시적 실행/조회복구 POST. 기존 write guard·middleware 사용. 정상 operator 또는 명시적 게시 권한의 원격 서버 자격, 고정 workspace/account 경계. GET은 게시/갱신하지 않음. |
| 별도 미적용 SQL + readiness | `social_publish_jobs`/이벤트/검증 receipt, `(workspace_id,job_key)` unique, payload hash, version, lease owner/fencing/expires, write intent, container/post ID/permalink, 승인 범위. service_role 전용 RPC/RLS. 새 번호는 그때 최신 main/Android와 조율(현재 0061 뒤 후보 0062). |

기존 `content_items/variants`는 본문/브랜드 저장에 재사용한다. `packages/content-manager`는 제작/편집 계층이므로 거기에 provider credentials/worker를 넣을 필요는 없다. `agent_jobs`의 lease RPC 패턴은 참고할 수 있지만 Codex 실행 job에 암묵적 게시 권한을 부여하지 않는다.

기존 Hub→Engine `/api/content/workflow`의 발행 기록은 `provider:manual`, `operator_published`, `operator_confirmed`, `external_verified:false`를 강제한다(`apps/engine/lib/content-command.ts`). API로 검증된 게시를 이 수동 기록으로 위장하지 않는다. provider/account/post ID와 검증 근거를 갖는 별도 typed API receipt를 최소 범위로 추가해 content/publish log와 연결해야 한다.

최소 상태는 준비→lease 획득→container 생성 요청 기록→container ID 저장→publish 요청 기록→post ID 저장→본문/소유자/permalink 조회 검증→완료다. 외부 효과 직전에 의도를 저장하고 결과 직후 ID를 저장한다. `/me`의 실제 ID·username이 `gore/@go_re_startagain`과 일치해야 한다. 자동 publish 플래그 없이 TEXT container를 만들고 알려진 ID만 발행한다. 네트워크/DB 저장 실패로 결과가 불명확하면 `reconciliation-required`로 멈추고 알려진 container/post를 조회한다. 새 lease나 새 key로 재게시하지 않는다. provider 자체 idempotency가 없다면 crash 경계의 exactly-once는 보장할 수 없다.

합성 검증은 2-worker 단일 claim, 만료 lease fencing, 동일 key/다른 본문·대상 거부, 다른 앱/계정/권한, 토큰 만료, container/publish 전후 timeout·DB 저장 실패, ambiguous 결과에서 자동 재게시 금지, verified receipt 1건으로 묶는다. 이번 YouTube Map/CAS 검증이 이 영속 publish 보장을 대신하지 않는다.

텍스트 1건에는 새 미디어 보관소가 필요 없다. 영상 후속에는 기존 `moonlight-content-assets`/`moonlight-public` 정의의 실제 설치·50MiB/MP4 정책, video asset schema/업로드 adapter를 먼저 확인하고 별도 승인해야 한다. 앱/원격은 Hub BFF만 호출하며 토큰·resumable session URL을 받지 않는다. 공개 게시물 ID/body/permalink 확인이 최초 트래킹 경로이고 insights 수집은 실제 지원 fields/scope를 확인한 다음 별도 승인한다. 미측정을 0으로 채우지 않는다.

실제 실행 전 순서는 정상 Hub 로그인 → 고래 전용 앱/HTTPS callback/tester 설정의 사용자 비밀 입력 → 0061 및 job schema/코드의 별도 운영 적용 승인 → 정확한 Chrome 세션에서 앱·대상·basic/publish scope를 보며 OAuth 직접 동의 → callback `/me` 숫자 ID 확인 → 부모와 확정 본문 hash/공개 범위/단일 job key 정합 → 승인된 1건 실행/조회 검증이다. 새 cron·반복 스케줄은 필요 없다. 사용자 게시 승인은 OAuth·credentials 변경 승인과 동일하지 않다.

코드 롤백은 실제 token/게시물을 되돌리지 않는다. 넓힌 allowlist를 고래 flow가 남은 채 좁히거나 기존 grant를 회전하지 않는다. 불명확한 job은 먼저 조회 복구하며 삭제/재게시/새 키는 별도 결정이다.

## 비용 정책: 실제 집계와 빠진 한도 검사

읽기 검증 시 research settings는 `enabled:true`, `costCapUsd:null`이었다. Mac launchd 900초/RunAtLoad와 runner SHA는 PR20과 일치했고, 해당 로그 4회는 새 생성 0건이었다. cron/runner를 상태 확인용으로 호출하지 않았다. due slot의 GET은 유료 준비를 실행할 수 있다. 기존 예약을 활성화·중단·수정하지 않았다. 코드/가이드의 과거 운영자 결정 기록을 이 대화의 무제한 비용 승인으로 대체하지 않는다.

| 코드 단위 | 집계/검사 범위 | 실무 한계 |
|---|---|---|
| `research-run-contract.js:researchSettings` | `costCapUsd:null` 상수. 기간·금액 비교·call 전 예약·예산 차감 로직 없음. | 월별/일별/호출별 어느 금전 한도도 적용되지 않음. |
| research sweep/0059 수량 제약 | KST 정치 08~22시 2시간 간격 최대 8개/일, 회사 3개/일, 유목민 1개/일. 실패는 draft slot에서 제외. | 준비 수량 제한은 호출 비용 한도가 아님. 수동 `runResearchPreparation`에는 enabled 검사도 없음(enabled는 sweep 입구에서 검사). |
| `projectResearchRun` + 0057 finish RPC | 1 run의 source preparation usage를 합산. 실패 preparation도 받은 usage를 포함. 답변+thinking 가격; thinking 없으면 유효한 total−prompt−answer로 복원. | 시작한 호출의 usage 불완전/모델 혼합·미확인 단가면 null. 저장 `estimated_cost_usd`는 null이고 읽기 투영에서 추정. 예산 검사와 무관. |
| reports `generationMetadata` | Office draft/review 합산, total−prompt를 출력으로 추정(thinking 포함). 합산 prompt ≤200k와 유효 usage에서만 추정. | 더 큰 합계는 호출별 단가 구간 복원 불가로 null. 이것도 비용 제어가 아님. |
| `repositories/ai-usage-ledger.js` | workspace의 모든 `ai_usage_log` surface. KST 달력 이번 달/지난달 각각 `[월초00:00,다음월초00:00)`. 호출 행별 가격 후 월 합계. | research 전용 아님. 두 달 전체 1000×10행 상한이면 partial. 미확인 단가 호출은 제외/별도 카운트되므로 합계가 청구 총액이 아님. |
| Engine `ai-usage-log.ts`/`gemini.ts` | HTTP 응답 usage를 success/failure 판정 전에 기록. 실패/잘린 응답도 usage가 있으면 포함. 3초 timeout의 fire-and-forget 기록. | 네트워크 실패·usage 없음·기록 저장 실패는 누락될 수 있음. 누락은 무료라는 뜻이 아님. 부분 token 필드는 0 fallback이 있어 과소 추정 가능. |
| Brave `research-news.js` | 시도 1회는 HTTP/네트워크 실패에도 `calls:1`. | 검색 횟수만 기록하며 USD 비용은 어떤 Gemini 추정에도 포함하지 않음. |

가격 근거는 코드 `ai-pricing.js`의 2026-09-26 확인 표(Gemini Paid/Standard, 모델/호출별 prompt tier)다. 현재 공급자 청구 단가를 이번 코드 조사에서 재검증한 것으로 표현하지 않는다. 무료 크레딧/캐시 할인/오디오 차등/세금·조정은 반영되지 않는다. 금액 한도를 정하려면 기간(KST 월 등), workspace/브랜드·research+reports 범위, Brave 포함 여부, 실패/unknown 비용 예약 및 동시 호출 원자 차감을 명시하고 구현해야 한다. 이번 단계에서 정책을 변경하지 않았다.

## prepared 자료 26개: 기존 검토 대기 저장 계약

코드에 **`POST /api/hub/research/briefs`**가 있다. `assertHubWriteAllowed`와 최대 32KiB JSON을 거쳐 `research_command_v1`에 저장한다. 이 경로에는 검색/Gemini/paid research 호출이 없다. 이번 확인은 코드 읽기와 합성 계약 테스트만 했으며 DB/API 쓰기는 하지 않았다. `POST /api/hub/research/runs`는 새 리서치 실행 계약이므로 prepared JSON import에 사용하면 안 된다.

요청 외피는 `{action:'create',requestId:<UUID>,brief:{...}}`, 1요청 1브리프다. 배열 batch 계약은 없다. 서버가 workspace를 고정하고 SQL이 active brand의 workspace 소속을 검증한다.

| brief 필드 | 현재 요구 계약 |
|---|---|
| `brandId` | 실제 active brand UUID. 문자열 연구 브랜드 키를 직접 넣지 않음. |
| `title`, `change`, `whyBrand`, `draft` | 각각 필수 비공백 string, 최대 180/1000/1000/12000(JS string length). |
| `facts` | 1~12개 필수 비공백 string, 각각 최대 1000. |
| `sources` | 1~8개. `url` HTTP(S) 최대 2000, 자격증명/localhost·검사하는 private 주소 차단, fragment/추적 파라미터 제거. `title` 필수 최대 240. |
| source `accessLevel`, `locator` | accessLevel은 `full-text`, `official-document`, `attachment`, `excerpt` 중 하나(`snippet` 불가). locator 선택 최대 500. |
| `interpretation`, `counterevidence`, `unknown` | 선택 string 각각 최대 3000, 없으면 빈 string. |
| `origin`, `verificationLevel` | 클라이언트 값을 받지 않고 **`operator-manual` / `operator-submitted`로 고정**. |

정확한 대응은 연구 run `politic_officer`→DB/social `politicofficer`, `class.moon`→`classmoon`, `22nomad`→`22nomad`다(`research-run-contract.js`가 명시). briefs는 이 문자열 대신 실제 UUID를 요구한다. 고래는 active UUID가 확인됐지만 research/runs의 세 브랜드 allowlist에는 없다. 추가 UUID/26카드 매핑을 이번 요청 때문에 새 DB 조회/쓰기하지 않았다.

중복 key는 서버가 `SHA256(JSON.stringify([brandId,title.toLowerCase(),normalizedFirstSourceUrl])).slice(0,40)`으로 만든다. DB `(workspace_id,brand_id,event_key)` unique와 workspace/requestId receipt를 사용한다. 같은 requestId·다른 normalized payload는 409 `request-id-reused`; 같은 event key·다른 payload는 409 `event-already-exists`; 동일 내용 반복은 기존 brief를 반환한다. 원문 순서/첫 출처 변경은 event key에 영향을 주므로 외부 카드 ID 전용 import 중복키와 같지 않다.

저장 시 `new` 상태/첫 revision으로 검토 대기에 들어간다. 별도 `promote-idea`/`promote-draft`는 `requestId`, `briefId`, `expectedRevision`, `expectedStateVersion`이 필요하다. 아이디어 승격은 `content_items`의 idea와 body 빈 base variant를 만들고 prepared draft/source/verification을 metadata에 보존한다. draft 승격은 초안 본문을 채우며, 어느 승격도 실제 게시하지 않는다. 정본 SQL은 `20260930_0054_research_promotion_fixes.sql`이다.

따라서 26개 클라우드 prepared 카드를 현재 수동 계약에 그대로 넣는 것은 부적합할 수 있다. `conditions`/`factEvidence`/외부 card ID/생성 출처·가설 표기는 normalize 단계에서 보존되지 않는다. 최소 후속안은 신뢰된 import 경로/계약에 `cloud-prepared` 출처와 `imported-unreviewed` 표시, stable external card ID+payload hash, 사실/해석/가설 분리, source access/locator·fact evidence/조건 보존을 추가하는 것이다. 유료 생성 service는 호출하지 않는다. 사실·출처 없는 아이디어에 가짜 evidence를 채워 기존 필수 조건을 통과시키지 않고 별도 idea import 계약으로 제안한다. 실제 Library JSON을 확인해 adapter/필드 mapping을 만든 후 로컬 검증·사용자 검토를 거쳐 저장 승인을 받는다. 현재 26개는 Library 보존 상태다.

## 디스크 중단·정리·보존

첫 임시 PostgreSQL `initdb`가 `No space left on device`로 실패했다. 경로는 Node tmpdir `/var/folders/l6/tx5c_hw97452y83gkpgpnxcr0000gn/T/moon-readiness-*/data/pg_wal/xlogtemp.*` 범위다. 실패 랜덤 suffix는 보존되지 않아 정확한 디렉터리명을 추측하지 않는다. 테스트 `finally`가 해당 임시 root를 정리한다. 저장소와 `/tmp`는 모두 `/dev/disk3s5`, `/System/Volumes/Data`의 228GiB 볼륨이며 초기 가용 344MiB였다.

부모의 정리 보류 지시 도착 전에 이미 확인한 다음 작업 소유 생성 디렉터리만 정리했고, 재검증 8개가 완료됐다. 이후 추가 설치·대형 빌드·DB 초기화·정리는 멈췄다.

| 정리 완료 경로(task-2 상대) | 확인한 크기 | 근거/보존 |
|---|---|---|
| `npm-pr20-cache` | 약 266MB | 이번 PR20 설치에 지정한 npm cache, symlink 아님. 잠금파일/소스는 그대로. |
| `moonlight-social/node_modules` | 약 792MB | 이 작업이 설치한 이전 격리 소셜 작업트리 전용 dependency 출력, symlink 아님. 다른 사용자 checkout deps는 그대로. 이전 작업트리 재시험에는 설치가 다시 필요. |
| `moonlight-social/apps/hub/.next` | 약 180MB | 이 작업이 생성한 이전 Hub 빌드 출력, symlink 아님. 새 PR20 빌드/소스는 그대로. |

소스 작업트리 자체, `.env`, 원본 미디어, 기존 DB, 다른 작업 산출물, `social-phase1-165-tests.patch`/`social-final.patch`/UI PNG는 보존했다. 삭제 대상 확인 크기는 합계 약 1.2GB이고 측정 가용 공간은 정리 직후 2.66GB, 18:45 UTC 2.64GB, 작은 diff 보존 시 약 5.88GB였다. 다른 작업도 같은 볼륨을 쓰므로 전체 가용 증가를 이 정리만의 회수량으로 주장하지 않는다. 최종 상태 JSON의 `freeBytes`가 가장 최근 측정값이다. 남은 공간만을 근거로 새 대형 작업을 재개하지 않았다.

PR20 별도 패치 `social-pr20-reconciled.patch`, 상태 `social-pr20-state.json`, 검증 로그 다섯 개를 task-2에 보존한다. 이전 패치 SHA `661ff069bd01e5a704dbc62d8df4ab7d9e0c455076f94c636337f3af9822aa80`는 변경되지 않았다. 새 패치에는 이 재정합/0061/문서만 포함하며 git stage·commit·push하지 않았다.
