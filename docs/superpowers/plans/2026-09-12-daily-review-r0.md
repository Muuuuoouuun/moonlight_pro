# 하루 리뷰 R0 구현 계획

> For agentic workers: use superpowers:subagent-driven-development for the bounded persistence task and review; the controller owns UI and integration. Steps use checkboxes for execution tracking.

**Goal:** 에너지·당일 목표의 진척·한 줄 메모를 날짜별로 영속 저장하고 다시 열어 수정한다.

**승인 범위:** 2026-09-12 운영자 ‘고고’는 직전 제안의 첫 구현 R0에 대한 진행 지시다. Council·자동 근거·주간 리포트는 후속 단계다.

**Architecture:** 기존 Hub에 별도 lazy 페이지를 추가한다. 보호된 Hub BFF가 shared Supabase REST client를 통해 journal_entries와 원자 RPC를 읽고 쓴다. workspace는 서버 resolver로 고정하며 브랜드 필터에 의해 달라지지 않는다.

**Tech Stack:** Next.js App Router, React 18, Node test runner, PostgreSQL/Supabase REST. 새 제품 의존성을 추가하지 않는다.

## 1. 경계와 계약

- UI: apps/hub/components/hub/pages/daily-review.jsx + daily-review.css.
- UI 상태 helper: apps/hub/lib/daily-review-state.js 및 행동 중심 테스트. daily-review-browser-store.js를 HubApp과 페이지가 공유해 다른 날짜·화면에서도 미저장 입력의 종료 보호를 유지한다.
- 공통 입력: apps/hub/lib/daily-review.js 및 테스트. 에너지 1~5 또는 null, 진척 0/1/2/not_applicable 또는 null.
- Repository: apps/hub/lib/repositories/daily-review-ledger.js 및 테스트.
- BFF: apps/hub/app/api/hub/daily-review/route.js. GET 실패 봉투는 HTTP 200 + status:error. POST는 write guard를 거친다.
- DB: supabase/migrations/20260912_0025_daily_review_journal.sql. 기존 journal 초안과 호환되는 공통 journal_entries 기반, 날짜별 unique, 입력 revision, 요청 receipt와 원자 저장 RPC. R0에는 AI 필드를 선제 생성하지 않는다.
- Navigation: hub-app.jsx PAGE_MAP, hub-nav.js 내 작업 하위, hub-data.js NAV_TREE. 경로는 dashboard/work/daily-review.

GET /api/hub/daily-review?date=2026-09-12&month=2026-09

```json
{"status":"live","configured":true,"timezone":"Asia/Seoul","review":null,"entries":[]}
```

review의 평탄화 계약은 id, reviewDate, timezone, energy, focus, progress, note, revision, updatedAt이다. entries는 선택한 월의 날짜별 요약이며 최대 31건이다. workspace의 시간대를 반환하고 선택 날짜가 없으면 그 시간대의 오늘을 사용한다. 날짜·월 형식과 범위를 검증한다.

POST /api/hub/daily-review

```json
{"reviewDate":"2026-09-12","energy":2,"focus":"개요의 소제목 3개","progress":1,"note":"연락 대응에 시간이 길어졌다.","expectedRevision":0,"requestId":"41c50d17-85b5-4672-8d05-408fa5a1bf8a"}
```

expectedRevision 0은 새 기록, 양수는 읽은 revision의 수정이다. 새로 쓰는 값은 전체 스냅샷이며 생략 필드로 기존 값을 우연히 지우지 않도록 입력 계약을 검증한다. 에너지 또는 목표 또는 진척 대상 없음 또는 메모 중 실답변 하나는 있어야 한다. 숫자 진척에는 목표가 필요하다. 문자열 숫자·임의 필드·타 workspace 입력을 신뢰하지 않는다. focus 최대 500자, note 최대 4000자.

저장 성공은 status:saved|duplicate + review, 충돌은 HTTP 409 status:conflict + 현재 review, 입력 거부는 400, 저장 불가는 503/502. 미설정은 절대 저장 성공으로 반환하지 않는다. RPC는 요청 키 재사용 시 동일 payload 여부를 확인하고 날짜별 생성·수정과 receipt를 원자 처리한다. 쓰기 함수는 public/anon/authenticated 실행 권한을 제거하고 service_role에만 허용한다.

## 2. 실행 작업

### Task A — 저장 계층

- [x] 기존 테스트 기준선 확인.
- [x] 순수 입력 검증·repository read/write·인증/오류/충돌 테스트를 먼저 추가하고 실패를 확인.
- [x] journal_entries 공통 기반과 daily_review 제약·revision·원자 RPC·receipt 작성.
- [x] 서버 resolver를 통한 workspace/timezone과 한 달 범위 읽기 구현.
- [x] 보호된 GET/POST BFF 연결. 근거 API·AI·task 생성은 호출하지 않음.
- [x] 대상 테스트와 SQL 실행 검증. SQL은 임시 PostgreSQL 환경에서 중복·수정 충돌·권한까지 확인.

핵심 검수 입력 예시:

```js
const energyOnly = {reviewDate:'2026-09-12',energy:2,focus:'',progress:null,note:'',expectedRevision:0,requestId:'41c50d17-85b5-4672-8d05-408fa5a1bf8a'};
const zeroProgress = {...energyOnly,energy:null,focus:'개요 작성',progress:0};
const invalidEmpty = {...energyOnly,energy:null};
// energyOnly와 zeroProgress는 저장 가능. invalidEmpty는 거부.
// 같은 requestId+payload 재시도는 같은 기록, 같은 키+다른 payload는 conflict.
// 동일 날짜의 서로 다른 생성 요청은 기존 입력을 덮지 않음.
// 이전 revision 수정은 409이며 현재 서버 기록을 반환.
```

### Task B — 화면과 상태

- [x] 실패·중복·충돌·이전 날짜의 늦은 응답을 다루는 상태 helper 테스트 먼저 작성.
- [x] 페이지 제목 1개, 날짜 선택·이전/다음 날, 세 항목, 저장, 최근 월의 날짜별 기록 구현.
- [x] 에너지·진척은 SegmentedControl, 입력은 TextField/TextAreaField, 상태는 TruthBadge를 사용. 에너지는 선택 해제 가능. 대상 없음과 미입력을 구분.
- [x] 저장 중 이중 클릭 방지. 실패 시 입력과 requestId 유지. 충돌 시 내 입력과 서버 기록을 비교하고 명시적으로 다시 저장하거나 서버 기록 열기.
- [x] 미저장 입력을 날짜별 sessionStorage에 보관하고 접근 불가 시 메모리로 보완한다. 날짜·화면 이동과 새로고침에서 복구하며, 창을 닫거나 새로고침할 때 beforeunload로 한 번 더 보호한다. 새 요청의 응답이 다른 날짜 draft를 덮지 않음. 저장소 기록과 미저장 입력의 상태를 구분한다.
- [x] 저장 후 서버 반환값으로 revision을 갱신하고 날짜 목록에 반영. 재시도 성공/duplicate도 실제 반환된 저장 데이터를 사용.
- [x] 390px·desktop에서 클리핑 없이 선택·저장·편집. 오류·미설정에서도 거짓 기록을 표시하지 않음.

### Task C — 연결·검증·통합

- [x] 내 작업 하위에 ‘실행 목록’·‘하루 리뷰’를 추가. 기존 primary 앵커 수 유지. 모든 scope가 동일한 개인 기록 경로를 사용.
- [x] NAV_TREE·PAGE_MAP 추가, ssr:false 유지. navigation 계약 테스트.
- [x] npm test, check:contracts, typecheck, build 실행.
- [x] Browser plugin 부재이므로 bundled Playwright로 실제 페이지의 입력·저장·재열기·실패·충돌·날짜 이동을 검증. API fixture 검증과 실제 DB 검증을 보고서에서 구분.
- [x] 독립 사양 검토 후 코드 검토. 발견한 문제 수정 뒤 해당 검증만 재실행.
- [x] 변경 파일만 커밋하고 원본 작업 트리에 충돌 없이 통합. 다른 세션의 기존 미커밋 변경을 보존. 적용 상태와 DB 선행 조건을 문서에 기록.

## 3. 검증 명령과 완료 판단

대상 Node 테스트는 node --import ./scripts/register-hub-alias.mjs --test 로 실행한다. 전체 회귀는 npm test, npm run check:contracts, npm run typecheck, npm run build다.

UI 검증의 흐름은 내 작업 → 하루 리뷰 → 날짜 선택 → 한 항목 저장 → 새로고침 → 수정 저장 → 다른 날짜 기록 열기다. 결과물이 문서나 로컬 임시 상태만으로 끝나지 않아야 한다. DB 적용·실제 저장 검증이 불가능하면 그 한계를 결과에 명시하고 실패를 성공으로 표시하지 않는다.


## 4. 검증 기록과 실제 저장소 적용

2026-09-12 전용 worktree 기준:

- 기준선 700개에서 최종 749개 테스트 통과(실패·skip 0). 임시 PostgreSQL의 14개 실행 검증을 포함한다.
- 입력·repository·route·실제 PostgreSQL 대상 38개 통과. 동시 생성/수정, 같은 요청 재시도, 이전 revision 충돌, receipt 실패 rollback, service_role 전용 권한, 마이그레이션 재적용을 확인했다.
- 클라이언트 상태 10개 통과. 0/null/대상 없음 구분, 저장 성공 판정, 실패 요청 키 유지, 다른 revision 복구 충돌, 임시 저장 공간 장애 시 최신 입력과 모든 날짜·다른 화면의 이탈 보호를 확인했다.
- check:contracts, typecheck, build 통과. Hub는 JS이므로 브라우저 검증과 build를 함께 사용했다.
- 실제 렌더링 페이지 + API fixture로 저장/재열기/수정/빈 목표 검증/0/대상 없음/실패 재시도/날짜 이동/새로고침 복구/충돌 비교/명시 재저장/390px·320px/preview/error를 확인했다. 모바일 입력 16px, 가로 넘침 없음, pageerror 0.
- 독립 사양 리뷰 PASS. 품질 리뷰가 발견한 다른 날짜·화면의 탭 종료 보호 누락을 수정하고 실제 종료·취소·다른 화면 새로고침·여러 날짜 저장 등 브라우저 10개 시나리오 재검토 PASS(pageerror 0).
- API fixture 테스트는 운영 DB 저장 증명이 아니다. 별도로 임시 PostgreSQL에서 실제 SQL 쓰기와 동시성/권한 검증을 실행했다.
- live read-only 조사: 실제 BFF도 HTTP 200 + status:error / configured:true로 안전하게 실패했다. Supabase REST 연결과 workspace 시간대(Asia/Seoul)는 확인했으나 `journal_entries`는 아직 없다(PGRST205). 관리 API는 기존 SUPABASE_ACCESS_TOKEN에 HTTP 401을 반환했다. live schema 변경과 실제 개인 기록 쓰기는 실행하지 않았다.

실제 저장 활성화 순서:

1. `/Users/bigmac_moon/dev/moonlight_pro/apps/hub/.env.local`의 `SUPABASE_ACCESS_TOKEN`을 유효한 관리 토큰으로 갱신한다. 값은 채팅이나 문서에 기록하지 않는다.
2. 저장소 루트에서 아래 한 파일을 적용한다. 기존 `db:migrate` 기본 목록과 `apply-pending.sql`에는 이 새 파일이 들어 있지 않으므로 파일명을 명시한다. Supabase SQL Editor에서 해당 SQL 파일 전체를 실행해도 같다.

```sh
node scripts/apply-migrations.mjs 20260912_0025_daily_review_journal.sql
```

3. `/api/hub/daily-review`가 `status:live`와 날짜별 목록을 반환하는지 확인한다.
4. 내 작업 → 하루 리뷰에서 실제 답변을 저장하고 새로고침, 같은 날짜 수정, 다른 날짜 재열기를 확인한다. 운영 데이터에 테스트용 임의 리뷰를 남기지 않는다.

마이그레이션은 신규 journal/receipt 테이블과 제약·인덱스·RPC를 생성하는 트랜잭션이다. 기존 업무 테이블의 데이터는 바꾸지 않는다. 운영 DB 적용과 배포 완료를 이 기록의 로컬 검증 통과로 대신하지 않는다.


## 5. 원본 작업 트리 통합

전용 브랜치 `codex/daily-review-r0-20260912`의 `ef77543` 변경을 원본 작업 트리에 적용했다. 원본의 다른 작업 파일 22개는 내용 해시가 유지됐으며, 함께 편집 중이던 hub-app.jsx와 docs/README.md의 기존 변경도 그대로 보존했다. index에는 하루 리뷰 변경만 넣었다.

통합 상태 검증: build 통과. 전체 테스트는 751개 중 750개 통과, 기존 미커밋 `celebration-fx.test.mjs` 1개가 Node의 `.jsx` 직접 import 미지원(ERR_UNKNOWN_FILE_EXTENSION)으로 실패했다. 해당 파일은 이번 변경 전부터 있었고 내용을 변경하지 않았다. 하루 리뷰 전용 브랜치의 전체 749개는 모두 통과했으며 통합 후 대상 83개도 모두 통과했다. 이 별도 작업의 테스트 실패를 하루 리뷰 테스트 성공으로 감추지 않는다.

운영 DB에는 마이그레이션을 적용하지 않았다. 관리 인증 갱신과 §4의 적용 절차가 남아 있다.
