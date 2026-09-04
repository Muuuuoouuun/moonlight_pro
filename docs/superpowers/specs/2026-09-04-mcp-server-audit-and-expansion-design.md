# Moonlight MCP 서버 점검·확충 설계 — 통과 어댑터에서 투영 계층으로

> 상태: **제안(DRAFT)**. §2 "확인 결과"만 2026-09-04 로컬 실측이고, §4~§6은 구현 전 제안이다.
> 작성일: 2026-09-04 (Asia/Seoul)
> 상위 정본: `docs/integration-control-plane-inheritance.md` §6·§7, `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md` §18
> 관계:
> - `integration-control-plane-inheritance.md` §6(로컬 MCP 계약)을 **대체하지 않는다**. stdio 전용·write-secret 선행 검사·`live/preview/error` 의미 보존은 그대로 상속하고, 그 위에 페이로드 형태와 커버리지만 바꾼다.
> - `2026-09-03-sales-content-marketing-to-branding-growth-plan.md` F-14(`record_contact_outcome`·`tag_lead_source`·`create_content_idea` 추가)를 **흡수·확장**한다. F-14는 이 문서 §6 E2·E3·E4의 부분집합이다.
> - Council·Guru 페르소나를 MCP 도구로 노출하는 작업은 `docs/README.md`의 Phase 1B·1C 보류 게이트에 걸리므로 **범위 밖**이다(§7).

---

## 1. 요약

Moonlight MCP 서버는 **연결·동작한다**. 문제는 있느냐 없느냐가 아니라 **형태**다.

13개 도구가 전부 Hub의 화면용(BFF) 응답을 그대로 통과시킨다. 이 응답은 React 페이지 하나가 1회 렌더에 쓰라고 만든 것이라, 도구 1회 호출이 **48KB~159KB**를 반환한다. 에이전트가 매출 원장 한 번, 프로젝트 한 번을 읽으면 컨텍스트 창의 상당 부분이 사라진다. 도구는 붙어 있지만 **연속 작업에 쓸 수 없는 상태**다.

동시에 커버리지가 좁다. Hub API 라우트 65개 중 MCP가 감싸는 것은 **고유 경로 8개**뿐이고, 쓰기는 4개다. 태스크는 만들 수는 있지만 **고칠 수도 끝낼 수도 없다**(`PATCH`/`DELETE` 라우트는 있는데 MCP HTTP 클라이언트가 `GET`/`POST`만 지원한다). 운영자의 최우선 업무인 고객 연락(`followups`)과 유입 검토(`intake`)는 도구가 아예 없다.

제안하는 방향은 하나다. **"얇은 통과 어댑터"라는 전제를 페이로드에 한해 폐기하고, MCP 전용 투영(projection) 계층을 만든다.** 상태 의미(`live`/`preview`/`error`)는 계속 그대로 전달하되, 페이로드 형태는 MCP가 스스로 책임진다.

---

## 2. 확인 결과 (2026-09-04 로컬 실측)

### 2.1 세션 MCP 인벤토리

| 서버 | 상태 | 근거 |
|---|---|---|
| `moonlight` (로컬 stdio) | **Connected · 도구 13개** | `.claude/settings.local.json`의 `enabledMcpjsonServers: ["moonlight"]`, `get_daily_brief` 실호출 성공 |
| Notion · Google Drive · mcp-registry · scheduled-tasks · computer-use · Chrome · visualize | 세션에 노출됨 | 도구 목록 |
| **Figma · Vercel** | **인증 필요** | 비대화형 세션이라 여기서 OAuth 불가 |

Figma·Vercel은 이 세션에서 승인할 수 없다. claude.ai 커넥터 설정 또는 대화형 세션의 `/mcp`에서 인증하기 전까지 두 서버의 기능은 사용 불가다. 이는 `integration-control-plane-inheritance.md` §6이 기록한 2026-07-15 상태("이름이 보인다는 이유로 connected로 쓰지 않는다")와 **동일하게 유지**되고 있다.

### 2.2 moonlight 서버 실측

세션 시작 시점에 Hub(:3000)는 꺼져 있었고 Engine(:3001)만 떠 있었다. 이 상태에서 MCP 도구를 호출한 결과:

```
get_daily_brief → "fetch failed"
```

원인은 정상이다(Hub 미기동). **문제는 메시지다.** 무엇이 죽었는지, 무엇을 하면 되는지가 전혀 없다. 이 증상은 메모리에 기록된 Council/Guru의 "fetch failed = engine down" 함정과 **같은 계열의 반복**이다.

Hub를 띄운 뒤 `get_daily_brief`는 `status:"live"`, `source:"supabase"`, 6/6 ledger live로 정상 응답했다. 즉 **기능은 정상, 진단 가능성과 페이로드 크기가 문제**다.

### 2.3 read 라우트 응답 크기 (실측)

`curl` 실측 바이트. 토큰은 `bytes/4` 추정이며, 한글 비중이 높은 페이로드에서는 **하한**이다.

| 라우트 | 바이트 | ≈토큰(하한) | MCP 도구 |
|---|---:|---:|---|
| `api/hub/revenue` | **158,872** | ~39,700 | `get_revenue` |
| `api/hub/projects` | **93,813** | ~23,500 | `list_projects` |
| `api/hub/work-orders` | **51,828** | ~13,000 | `list_work_orders` |
| `api/hub/daily-brief` | **48,378** | ~12,100 | `get_daily_brief` |
| `api/hub/overview` | 25,099 | ~6,300 | (없음) |
| `api/hub/content` | 22,952 | ~5,700 | `get_content` ×2 |
| `api/hub/attention` | 9,912 | ~2,500 | (없음) |
| `api/hub/followups` | 9,172 | ~2,300 | (없음) |
| `api/hub/tasks` | 7,718 | ~1,900 | `list_tasks` |
| `api/hub/work` | 4,608 | ~1,200 | (없음) |
| `api/hub/agents` | 2,220 | ~560 | `list_agents` |
| `api/hub/brands` | 0 | — | GET 없음(POST·PATCH 전용) |

무엇이 크기를 만드는지도 확인했다.

- `revenue` 158KB 중 **`leads` 배열 하나가 102KB**(117건). `contacts` 121건 24KB, `companies` 122건 14KB가 뒤따른다.
- `projects` 93KB 중 **`updates` 53건이 44KB**, `projectEntities` 142건이 24KB. 정작 `projects` 본체는 7건 10KB다.
- `work-orders` 51KB는 **`orders` 26건이 전부**다. 각 행의 `body.summary`에 AI가 쓴 수천 자 마크다운 에세이가 통째로 들어 있다.

즉 큰 것은 운영자가 판단에 쓰는 요약이 아니라 **원장 전량과 생성물 원문**이다. 화면은 이걸 접어서 보여주지만, MCP는 접지 않는다.

### 2.4 커버리지

| 축 | 수치 |
|---|---|
| Hub API 라우트 | 65개 (그중 `api/hub/*` 31개) |
| MCP 도구 | 13개 |
| MCP가 감싸는 **고유 경로** | **8개** (`daily-brief` `agents` `work-orders` `projects` `tasks` `revenue` `content` `calendar/google/event`) |
| MCP 쓰기 도구 | 4개 (`create_task` `decide_work_order` `create_calendar_event` `create_campaign`) |

도구가 없는 주요 표면: `followups`(고객 연락) · `intake`(유입 검토) · `attention` · `brands` · `decisions` · `inbox` · `cards`(Quick Capture) · `outcomes` · `campaigns` · `automations` · `overview` · `work` · `revenue/*` 쓰기 6종(`lead` `deal` `account` `case` `activity` `contact-outcome`).

### 2.5 코드 수준 결함

| # | 결함 | 위치 |
|---|---|---|
| C1 | `hubFetch`가 `{ok, httpStatus, data}`를 돌려주는데 **모든 도구가 `data`만 꺼내 쓴다.** 401·500·502가 성공 결과로 반환된다 | `tools.js` 전역 (`const { data } = await hubGet(...)`) |
| C2 | `errorResult()`가 정의·export 되어 있으나 **호출처가 0곳**이다. `isError`를 세우는 도구가 하나도 없다 | `tools.js:9`, `tools.js:285` |
| C3 | `hubGet`/`hubPost`만 있고 **`PATCH`/`DELETE`가 없다.** `tasks`·`projects`·`content`·`brands`·`decisions`의 수정 경로가 구조적으로 막혀 있다 | `hub-client.js:52-58` |
| C4 | `get_content`와 `get_content_queue`가 **완전히 동일**하다(같은 라우트, 인자 없음, 본문 동일). 제목·설명만 다르다 | `tools.js` |
| C5 | `annotations`(`readOnlyHint`/`destructiveHint`/`idempotentHint`) 미사용. 클라이언트가 읽기와 쓰기를 구분할 근거가 설명 문자열뿐이다. SDK 1.29.0은 지원한다 | `tools.js` 전역 |
| C6 | `outputSchema`/`structuredContent` 미사용. 전부 `JSON.stringify(..., null, 2)` 텍스트다(들여쓰기 2칸이 바이트를 더 키운다) | `tools.js:5` |
| C7 | `resource`/`prompt` 미사용. SDK는 `registerResource`·`registerPrompt`를 지원한다 | `index.js` |
| C8 | 서버 버전이 `index.js`에 `"0.1.0"`으로 **하드코딩**되어 `package.json`과 이중 관리된다 | `index.js:8` |
| C9 | 테스트 3건뿐이고 **CI에서 돌지 않는다.** 루트 글롭이 `packages/*/*.test.mjs`(1단계)라 `packages/mcp-server/src/*.test.mjs`(2단계)를 잡지 못한다 | `package.json` `test`, `.github/workflows/ci.yml` |
| C10 | `.mcp.json`이 nvm 절대경로(`.../v24.14.0/bin/node`)를 박아 둔다. Node 버전을 올리면 서버가 조용히 죽는다 | `.mcp.json` |

C9·C10은 `integration-control-plane-inheritance.md` §8이 OpenClaw gateway에서 이미 겪고 고친 문제(nvm 경로 → Homebrew 고정 경로)와 **같은 실패 유형**이다.

---

## 3. 진단 — 결함 5개로 묶으면

| ID | 진단 | 근거 | 영향 |
|---|---|---|---|
| **D1** | **페이로드 폭발.** 화면용 BFF 응답을 그대로 통과시킨다 | §2.3 | 가장 큼. 도구 2~3회 호출로 컨텍스트가 고갈되어 연속 작업이 불가능하다 |
| **D2** | **커버리지 공백 + 쓰기 루프 미완결.** 만들 수는 있고 끝낼 수는 없다 | §2.4, C3 | 에이전트가 "다리를 건너지 못한다"(F-14의 문제 의식) |
| **D3** | **오류가 오류로 보이지 않는다.** 네트워크 실패는 맨몸 문자열, HTTP 오류는 성공으로 위장 | C1·C2, §2.2 | 진단 비용. `preview`(정직한 미연결)와 `error`(실제 실패)의 구분이 도구 레벨에서 무너진다 |
| **D4** | **도구 메타데이터 부재.** 중복 도구, 어노테이션·스키마 없음 | C4·C5·C6 | 모델이 도구를 잘못 고르고, 클라이언트가 쓰기 승인 UI를 못 만든다 |
| **D5** | **운영 취약성.** Hub 의존이 암묵적, 경로 고정, CI 미실행 | §2.2, C9·C10 | 조용한 고장. 회귀를 잡을 그물이 없다 |

**D1이 다른 넷을 압도한다.** D2를 먼저 해서 도구를 20개로 늘리면 문제는 오히려 커진다. **순서는 D1 → D3 → D4 → D2 → D5**여야 한다.

---

## 4. 설계 원칙 — 무엇을 바꾸고 무엇을 지키는가

### 4.1 바꾸는 것 하나

> **"MCP는 얇은 통과 어댑터"라는 전제를 페이로드 형태에 한해 폐기한다.**

기존 README는 이렇게 선언했다: *"It is a thin adapter: every tool calls an existing route and forwards that route's own `status` field verbatim."* 이 문장은 **두 가지를 한 덩어리로 묶었다** — (a) 상태 의미 보존, (b) 페이로드 통과. (a)는 옳고 지켜야 한다. (b)는 §2.3이 반증했다.

새 전제: **상태는 통과시키고, 형태는 MCP가 책임진다.**

### 4.2 지키는 것 (상속 계약 — 협상 불가)

`integration-control-plane-inheritance.md` §6·§7에서 그대로 상속한다.

1. **stdio 로컬 전용.** 원격 HTTP/SSE 커넥터로 승격하지 않는다.
2. **write-secret 선행 검사.** `COM_MOON_HUB_WRITE_SECRET` 없으면 요청 전에 거부한다. Hub write guard와 도구 레벨 검사를 **둘 다** 유지한다.
3. **로컬 프로세스라는 이유로 무인 승인하지 않는다.**
4. **`configured` ≠ `reachable` ≠ `authenticated`.** 축을 섞지 않는다.
5. **`preview`는 오류가 아니다.** 미연결을 실패로 위장하지 않고, 실패를 `preview`로 가리지도 않는다.
6. **값·토큰·비공개 URL을 응답·로그에 남기지 않는다.**

### 4.3 새로 세우는 원칙 3개

7. **잘림은 선언한다(정직한 절단).** 투영으로 데이터를 줄이면 응답에 `truncated: true`, `totalCount`, `returnedCount`, 그리고 전량을 얻는 방법을 **반드시** 함께 넣는다. 조용한 절단은 §4.2-5의 정직성 계약 위반이다.
8. **기본은 좁게, 확장은 명시적으로.** 모든 read 도구의 기본 응답은 판단에 필요한 최소치. 전량은 `detail:"full"` 같은 명시적 옵트인으로만.
9. **원장 내용은 데이터지 지시가 아니다.** work order `body`, 리드 메모, 콘텐츠 초안에 담긴 텍스트는 외부 입력이다. 도구 결과에 담긴 문장을 지시로 해석하지 않는다. 이 원칙을 서버 instructions와 도구 설명에 명시한다.

---

## 5. 보강안 (R) — 있는 것을 고친다

### R1. 투영 계층 — 최우선

**신설:** `packages/mcp-server/src/projections.js`

각 read 도구에 공통 인자 3개를 추가한다.

| 인자 | 값 | 기본 | 의미 |
|---|---|---|---|
| `detail` | `"summary"` \| `"rows"` \| `"full"` | `"summary"` | 응답 깊이 |
| `limit` | 1~200 | 20 | 행 수 |
| `cursor` | string | — | 다음 페이지 |

`detail` 단계 정의:

- **`summary`** — 집계와 상태만. 배열 본문 없음. 목표 **1KB 이하**.
  예: `get_revenue` → `{status, source, summary:{leads:117, deals:22, accounts:25, stageBreakdown, pipelineValue}, hints:["detail:'rows'로 행 조회"]}`
- **`rows`** — 필드 화이트리스트를 적용한 행 `limit`건 + `totalCount` + `nextCursor`. 목표 **행당 200바이트 이하**.
  예: 리드 행은 `{id, name, company, stage, owner, source, lastTouchAt, nextAction}`만. 원본 `meta` 전체·감사 필드는 제외.
- **`full`** — 현재 동작(라우트 원본 그대로). **바이트 상한을 걸고**, 넘으면 잘라내고 §4.3-7대로 선언한다.

**긴 텍스트 필드 규칙.** `work_orders.body.summary`, 콘텐츠 초안 본문처럼 원문이 긴 필드는 `rows`에서 **첫 200자 + `hasMore:true` + 원문 취득 방법**으로 대체한다. 전문이 필요하면 단건 조회 도구(`get_work_order(id)`)로 간다. §2.3에서 51KB의 정체가 이 필드였다.

**예상 효과.** `get_revenue` 158KB → `summary` ~0.5KB / `rows`(20건) ~4KB. 도구 호출당 컨텍스트 소모가 **1~2자릿수 줄어든다.**

**검증:** 각 read 도구의 기본 응답 바이트 상한을 테스트로 고정한다(회귀 방지).

### R2. 오류 계약 — C1·C2 해소

`hub-client.js`에 결과 분류를 넣고 모든 도구가 그것을 쓴다.

| 상황 | MCP 응답 | 메시지 |
|---|---|---|
| `fetch` 자체 실패(ECONNREFUSED 등) | `isError: true` | `Hub(<url>)에 연결할 수 없습니다. 'npm run dev:hub'로 Hub를 먼저 띄우세요. (원인: <code>)` |
| HTTP 4xx/5xx | `isError: true` | 라우트 자신의 `status`·`error`를 그대로 싣고 HTTP 코드 병기 |
| 200 + `status:"preview"` | **정상 결과** | 절대 오류로 만들지 않는다(§4.2-5) |
| 200 + `status:"error"` | `isError: true` | 라우트 메시지 + `retryable` 보존 |
| write-secret 미설정 | `isError: true` | 현행 유지(요청 전 거부) |

§2.2의 맨몸 `"fetch failed"`가 없어진다. 이건 코드 몇 줄이지만 **진단 비용에서 가장 크게 회수되는 항목**이다.

### R3. 도구 메타데이터 — C4·C5·C6 해소

- **`get_content` 삭제.** `get_content_queue`와 완전 동일하다. 하나만 남기고 설명을 실제 반환 내용에 맞춘다.
- **`annotations` 부여.** read 전부 `readOnlyHint:true`. write는 `readOnlyHint:false` + 성격에 맞는 `idempotentHint`. 삭제 계열은 `destructiveHint:true`.
- **`outputSchema` 도입.** 최소한 공통 봉투(`{status, source, summary, rows?, totalCount?, nextCursor?, truncated?}`)를 스키마로 선언해 `structuredContent`로 반환한다.
- **`JSON.stringify(x, null, 2)` → `JSON.stringify(x)`.** 들여쓰기가 순수 낭비다.

### R4. `hubPatch` / `hubDelete` — C3 해소

`hub-client.js`에 두 메서드를 추가한다. 이것 없이는 §6의 확충 절반이 **구현 자체가 불가능**하다. 인증 헤더 처리는 기존 `method !== "GET"` 분기를 그대로 탄다.

### R5. Resources — 어휘를 도구 호출로 낭비하지 않는다

에이전트가 반복해서 필요로 하지만 거의 바뀌지 않는 것은 **도구가 아니라 리소스**여야 한다(클라이언트가 캐시한다).

| 리소스 URI | 내용 | 출처 |
|---|---|---|
| `moonlight://vocab/stages` | 딜 단계 6종과 퍼널 순서 | `revenue` 응답 `stages` |
| `moonlight://vocab/task-status` | 태스크 status·priority 허용값 | 현행 `create_task` zod enum |
| `moonlight://vocab/lead-source` | 리드 소스 어휘(`meta_ads·threads·existing·referral·event·manual`) | 성장 계획 F-3 |
| `moonlight://directory/brands` | 브랜드 12건 (id·key·label·orgScope) | `projects` 응답 `brands` |
| `moonlight://directory/workspaces` | 워크스페이스 소속 | `workspace-map.js` |
| `moonlight://contract/write-policy` | §18 자동화 권한 경계 표 | 심화 설계 §18 |

마지막 항목이 특히 중요하다. 에이전트가 **무엇을 스스로 해도 되고 무엇이 승인 대상인지**를 매번 추측하는 대신 읽게 만든다.

### R6. 운영 강건성 — D5 해소

- **`get_hub_health` 도구 신설.** Hub 도달 여부, Supabase 도달 여부, write-secret 설정 여부, Engine 도달 여부를 `configured`/`reachable`/`authenticated` 축을 섞지 않고 반환한다(§4.2-4). 에이전트가 작업 전에 한 번 부르면 §2.2 같은 상황을 즉시 진단한다.
- **`.mcp.json`의 nvm 절대경로 제거.** OpenClaw gateway에서 이미 적용한 해법(고정 런타임 경로)과 같은 방식으로 정리한다. `.mcp.json`은 `.gitignore` 대상이므로 README에 권장 형태를 기록한다.
- **CI 글롭 확장.** 루트 `test` 스크립트와 `.github/workflows/ci.yml`에 `packages/*/src/*.test.mjs`를 추가한다. C9는 MCP만의 문제가 아니라 글롭 밖 18개 파일 전체의 문제이므로, 이 변경은 `docs/README.md` §3이 지적한 "CI 미실행 18파일"을 함께 줄인다.
- **`index.js`의 하드코딩 버전 제거**, `package.json`에서 읽는다.

---

## 6. 확충안 (E) — 없는 것을 만든다

§18 자동화 권한 경계를 그대로 적용한다. **기록·후보 생성은 자동 허용, 외부 발송·발행·삭제는 승인 대상**이다. 모든 신규 쓰기는 `source:"mcp"`를 남긴다.

### E1. 태스크 루프 완결 — **P0**

| 도구 | 라우트 | §18 |
|---|---|---|
| `update_task` | `PATCH /api/hub/tasks` | 자동 허용 (task 후보 생성·갱신) |
| `complete_task` | `PATCH /api/hub/tasks` (`status:"done"`) | 자동 허용 |

만들 수만 있고 끝낼 수 없는 현 상태가 가장 이상한 구멍이다. R4 선행 필요.

`delete_task`는 §18의 "삭제 = 명시적 승인"에 걸린다. **이번 범위에서 제외**한다.

### E2. 고객 연락 — **P0** (F-14 흡수)

| 도구 | 라우트 | §18 |
|---|---|---|
| `list_followups` | `GET /api/hub/followups` | 읽기 |
| `record_contact_outcome` | `POST /api/hub/revenue/contact-outcome` | 자동 허용 (사람의 행동 **기록**) |

**주의 — 선행 결정이 있다.** `docs/README.md` §3과 성장 계획 F-2가 기록한 대로, 컨택 결과 기록에는 **두 경로가 공존**한다(고객 DB의 원자 RPC `record_contact_outcome_v1` vs `followups.jsx`의 비원자 단건 insert). **정본 화면은 운영자 미정**이다. MCP 도구는 **원자 RPC 경로(`/api/hub/revenue/contact-outcome`)에 붙인다** — 원자성이 있는 쪽이 에이전트 쓰기에 안전하기 때문이다. 이 선택이 F-2의 운영자 결정을 대신하지 않으며, 결정이 나면 그때 맞춘다.

### E3. 캡처·아이디어 — **P1** (F-14 흡수)

| 도구 | 라우트 | §18 |
|---|---|---|
| `quick_capture` | `POST /api/hub/cards` 또는 `inbox` | 자동 허용 (raw capture 저장) |
| `create_content_idea` | `POST /api/hub/content` | 자동 허용 (AI 초안·후보) |

**주의.** 성장 계획 F-6이 지적한 대로 아이디어 입력에 두 저장소(`work_orders(kind:idea)` vs `content_items(status:idea)`)가 공존하고 **정본이 미확정**이다. F-6 결정 전에는 `create_content_idea`를 **한 경로에만 붙이고 그 사실을 도구 설명에 적는다.** 두 곳에 동시에 쓰지 않는다.

### E4. 리드·딜 — **P1** (F-14 흡수)

| 도구 | 라우트 | §18 |
|---|---|---|
| `list_leads` | `GET /api/hub/revenue` + R1 투영 | 읽기 |
| `create_lead` | `POST /api/hub/revenue/lead` | 자동 허용 (후보 생성) |
| `tag_lead_source` | `POST /api/hub/revenue/lead` | 자동 허용 (기록) |
| `update_deal_stage` | `POST /api/hub/revenue/deal` | 자동 허용 (내부 원장 상태) |
| `log_activity` | `POST /api/hub/revenue/activity` | 자동 허용 (기록) |

`tag_lead_source`는 성장 계획 F-3의 소스 어휘 통일과 짝이다. **F-3이 어휘를 확정하기 전에는** R5의 `moonlight://vocab/lead-source`를 임시 어휘로 쓰고, 확정 시 enum을 맞춘다.

### E5. 읽기 표면 보강 — **P2**

`get_attention` · `list_brands` · `get_overview` · `list_intake`. 전부 R1 투영 적용 후에만 추가한다.

### E6. Prompts — **P2**

`registerPrompt`로 반복 작업을 고정한다. 예: `daily-triage`(브리핑 읽기 → 긴급 분류 → 다음 행동 제안), `followup-sweep`(정체 리드 → 연락 초안 → work_order 제안). 프롬프트는 **도구를 부르는 순서를 고정할 뿐 권한을 넓히지 않는다.**

---

## 7. 하지 않을 것

| 항목 | 이유 |
|---|---|
| **원격 HTTP/SSE 커넥터 승격** | §4.2-1. 쓰기 가능 도구를 공개 엔드포인트에 올리는 것은 완전히 다른 위험 프로파일이다. 별도 승인·설계 필요 |
| **Council·Guru 페르소나 도구화** | `docs/README.md`가 Phase 1B·1C 완료까지 보류로 명시. 기존 README의 "Not included yet"과 동일 판단 유지 |
| **`delete_*` 계열** | §18 "결제·계약·삭제 = 명시적 승인" |
| **외부 발송·발행 도구** | §18. 에이전트는 `work_orders(proposed)`까지만 만든다. 발송은 사람의 승인 게이트를 지난다 |
| **Engine 라우트 직접 도구화** | Hub가 운영자 표면이라는 §1 실행 경계를 지킨다. Engine은 Hub를 통해서만 닿는다 |
| **F-2·F-6 운영자 결정 선점** | 미정을 확정처럼 구현하지 않는다(CLAUDE.md 운영자 업무 기준). 도구는 한 경로에 붙이고 그 사실을 설명에 적는다 |

---

## 8. 단계 계획

| 단계 | 범위 | 크기 | 선행 |
|---|---|---|---|
| **1. 기반** | R2(오류 계약) · R3(메타데이터·중복 제거) · R4(PATCH/DELETE) · R6 일부(`get_hub_health`, 버전) | S~M | 없음 |
| **2. 투영** | R1 전면 적용 + 도구별 바이트 상한 회귀 테스트 | **M~L (핵심)** | 1 |
| **3. 루프 완결** | E1 · E2 | M | 1·2 |
| **4. 어휘·확충** | R5(Resources) · E3 · E4 | M | 2·3 |
| **5. 운영** | R6 나머지(CI 글롭·`.mcp.json` 경로) · E5 · E6 | S~M | — |

1단계와 2단계만으로 "붙어 있지만 못 쓰는" 상태에서 벗어난다. 3·4단계가 F-14를 완료한다.

---

## 9. 검증 기준

구현이 끝났다고 말하려면 아래가 증거로 남아야 한다.

1. **크기.** 12개 read 도구의 기본(`detail:"summary"`) 응답이 각각 **2KB 이하**. `get_revenue`가 158KB → 1KB 미만. 테스트로 상한 고정.
2. **정직한 절단.** 절단된 모든 응답에 `truncated` · `totalCount` · `returnedCount` · 전량 취득 방법이 있다. 조용한 절단 0건.
3. **오류.** Hub 미기동 상태에서 임의 도구 호출 시 `isError:true` + "Hub를 띄우세요" 메시지. `preview` 응답은 여전히 **오류가 아니다**(회귀 테스트 2건).
4. **쓰기 루프.** MCP만으로 태스크 생성 → 수정 → 완료 → 재조회가 성립하고, 임시 행 정리 후 **residue 0**. (2026-07-15 `create_task` smoke와 같은 방식)
5. **경계.** write-secret 미설정 시 모든 쓰기가 요청 전 거부. Hub write guard 우회 0건.
6. **CI.** `packages/mcp-server/src/*.test.mjs`가 CI에서 실제로 실행된다.
7. **문서.** `integration-control-plane-inheritance.md` §6의 "현재 등록 surface" 목록과 `packages/mcp-server/README.md` 도구 표가 실제 도구 목록과 일치한다.

---

## 10. 미정 — 운영자 결정이 필요한 것

| # | 질문 | 왜 지금 필요한가 | 이 문서의 임시 처리 |
|---|---|---|---|
| M1 | 컨택 결과 정본 화면(F-2 / README §3) | E2가 어느 경로에 붙는지를 결정한다 | 원자 RPC 경로에 붙이고 명시 |
| M2 | 아이디어 저장소 정본(F-6) | E3가 어디에 쓰는지를 결정한다 | 한 경로에만 붙이고 명시 |
| M3 | 리드 소스 어휘 확정(F-3) | `tag_lead_source`의 enum | R5 리소스를 임시 어휘로 |
| M4 | Figma·Vercel MCP를 실제로 쓸 것인가 | 인증 미완. 안 쓸 거면 세션에서 내리는 게 낫다 | 이 문서 범위 밖 |

M1~M3은 **구현을 막지 않는다.** 임시 처리대로 진행하고 결정이 나면 맞춘다.
