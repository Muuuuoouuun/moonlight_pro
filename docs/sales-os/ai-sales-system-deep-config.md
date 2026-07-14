# AI 세일즈 시스템 — 심화 구성 (Deep Config)

> 오너 결정(2026-06-19) 기준 설계도. 코드 매핑(에이전트·업무·세일즈OS·데이터·문서 5기둥)
> 위에 방향 4개를 얹어 작성. 근거는 `docs/sales-os/*`, `migration 0003~0010`, 그리고
> `apps/hub/lib/repositories/*` ledger 계층.

## 0. 지금 AI가 앉아 있는 곳 (정직한 현재 상태)

세 기둥이 **하나의 Supabase 척추**를 공유하지만, AI는 **루프에서 단 한 곳**에만 산다.

- **SALES-OS (캡처→파이프라인)** — 가장 완성됨. 명함(`app/api/hub/cards/route.js` → `card-intake-core.js` → `google-vision.js`, Gemini Vision)과 시트(`sheets-sync.js`)가 `lead_intake_raw`로 들어와 `match_key`로 디듀프 후 `companies/contacts/leads`로 승격. `revenue-ledger.js`(읽기 전용 딜/리드/어카운트), `followups-ledger.js`(오늘 연락할 곳, 연체 우선), `outcomes-ledger.js`(아웃리치 결과 기록)까지 실제로 배선됨.
- **WORK (업무)** — 수동 집계기. `app/api/hub/daily-brief`가 5개 ledger를 `Promise.allSettled`로 펼쳐 규칙 기반 신호(딜 정체 ≥10d, Draft/Review 콘텐츠, 실패한 run, 막힌 프로젝트)를 낸다. `daily-brief.jsx`의 `SIGNAL_TARGETS`가 각 신호를 목적지 라우트로 연결 → 사실상 단일 지휘 화면. 단, **결정이 아니라 신호만** 내고, 오퍼레이터가 행동했을 때 **피드백이 없다.**
- **AGENTS (에이전트)** — AI가 실제로 사는 유일한 곳: **Sales Guru**. `revenue.jsx` `GuruCoachPanel` → `guru-client.js` `requestGuruCoaching()` → `app/api/hub/sales-mentor/route.js` `buildSalesContext()`(→ `getRevenueLedger()`, ~40건으로 트림) → Engine `/api/ai/sales-mentor`(12-guru/decision-styles 지식베이스). 나머지(Council·Orders·Office)는 **목 데이터.** 5-페르소나(Order→Sales→Content→Production→Review)는 `docs/sales-os/personas/00~04` + `registry.json`에 완전 명세, `migration 0010`이 agents 테이블에 시드까지 했지만 — **이를 읽는 커널이 없다.** `apps/hub/lib/sales-os/` 디렉터리 부재, `context-assembler.js`/`persona-registry.js` 없음, `/team`·`/inbox` 명령은 gitignore되어 end-to-end로 돈 적 없음. `work_order`는 시드 설정의 `emits` 문자열일 뿐 **물리 테이블이 아니다.**

**실제 루프:** 규칙 신호 → 사람이 브리프를 읽음 → 사람이 딜 1건을 Guru로 딥링크 → 사람이 행동 → 사람이 결과 로깅 → 결과는 followups의 'why' 표시 문자열과 last_touch 최신성으로만 흐르고 **재랭킹에 반영 안 됨**(priority = `since*10 + score/10 | amount/1e6`). **AI는 ledger에 볼트로 붙은 무상태 자문가이지, 오케스트레이터가 아니다.** 문서상 비전(자율 5-페르소나 일일 루프)과 가동 시스템(코칭 1개 + 휴리스틱 신호) 사이의 간극 = 제품 기회 전체.

## 1. 타깃 — 하나의 루프 (One Loop)

```
캡처 → 인박스(분류) → 페르소나 → work_orders(proposed)
        → [데일리 브리프 승인 큐 · 1클릭] → 실행 → 성과(outcome)
        → 학습(재랭킹 + leads.score) ─┐
        → 360 메모리 갱신 ────────────┴─→ Guru/페르소나(다음 판단)
```

콘텐츠→리드→딜→주문→성과를 **끊김 없는 한 바퀴**로. 세 기둥은 이 루프의 구간일 뿐.

### 가로지르는 3원칙 (cross-cutting)

1. **Supabase = 단일 진실원천.** 모든 상태는 Supabase 테이블에 쓴다. eeoCRM(Xiaoshouyi)은 **읽기 전용 enrichment**(`migration 0006` 소유자명 테이블 활용), Google Sheets는 **캡처 전용**. 진실은 Supabase에만.
2. **반자동 = 1클릭 승인 게이트.** 모든 페르소나/에이전트 산출물은 `work_orders` 행(`status='proposed'`)으로 큐잉 → 데일리 브리프 승인 큐에 노출 → 오퍼레이터 1클릭 `approve` → `status='approved'` → (이후) 실행. **승인 없는 외부 액션(카톡/DM 발송, 리드 승격, 딜 클로징)은 없다.**
3. **360 메모리 = 공유 입력.** `context-spine.md`의 operating_context를 단일 모듈(`context-assembler.js`)이 조립 → Guru와 모든 페르소나가 **같은 풍부한 입력**을 받는다. 이게 "에이전트가 나를 기억한다"의 실체.

## 2. 빠진 커널 (the spine to build)

`apps/hub/lib/sales-os/` 신규 + Supabase 테이블 2개가 전체의 토대:

| 구성요소 | 종류 | 역할 |
| --- | --- | --- |
| `work_orders` 테이블 | 신규 migration | 반자동 큐의 백본. 페르소나 산출물이 `proposed`로 쌓이는 곳 |
| `agent_runs`(coaching_log) 테이블 | 신규 migration | 에피소드 메모리. Guru/페르소나가 "무엇을 추천했고 통했는지" |
| `persona-registry.js` | 신규 모듈 | 시드된 agents 테이블 + `registry.json`을 런타임에서 로드 |
| `context-assembler.js` | 신규 모듈 | 360 operating_context 조립(entity+ledger+outcomes+content+brand, `missing[]` degradation) |
| `inbox-classify.js` + Engine capture command | 분류 helper + 실행 경계 | 한 줄 캡처 분류는 pure helper로 유지하고, 실제 task/work-order 저장은 Hub BFF→Engine→atomic receipt 경계를 사용 |

## 3. 단계별 빌드 — 4개 우선순위 축에 매핑

> 오너 우선순위(메모리·지식 → 캡처-인박스-액션 → 데일리 브리프 → 성과 루프)를 북극성으로 두되,
> **하드 의존성(테이블·로더)만 Phase 0으로 앞당긴다.** 이 한 가지가 유일한 순서 역전.

### Phase 0 — 토대 (foundation) · effort S~M
반자동 큐와 에피소드 메모리가 앉을 자리부터.
- `supabase/migrations`: `work_orders`(id, persona, kind/emits, ref_company, ref_deal, payload, status[proposed|approved|executed|dismissed], created_at), `agent_runs`(persona/guru, mode, ref, recommendation, outcome_id nullable)
- `apps/hub/lib/sales-os/persona-registry.js` — agents 테이블 + `docs/sales-os/personas/registry.json` 로더. `agents.jsx` Orders/Council의 하드코딩 배열을 이걸로 교체.

### Phase 1 — 에이전트 메모리·지식 (우선순위 #1) · effort L+S
Guru를 무상태 자문가 → 기억하는 코치로.
- `apps/hub/lib/sales-os/context-assembler.js` (신규) — `context-spine.md` 9필드 360 조립. 이미 있는 ledger(revenue·outcomes·content·brands) 조인 배선이 대부분.
- `app/api/hub/sales-mentor/route.js` — `buildSalesContext()`를 context-assembler 경유로 교체(flat 매출 슬라이스 → 풀 360).
- `app/api/hub/sales-mentor/route.js` + `outcomes-ledger.js` — 코칭 run을 `agent_runs`에 적재(mode/ref/recommendation), 이후 해당 딜 outcome과 조인(→ Phase 4 학습 substrate).

### Phase 2 — 캡처→인박스→액션 스파인 (#2) · effort M
입력 한 줄이 세 기둥을 먹인다 + 페르소나가 제안을 큐잉.
- `apps/hub/lib/sales-os/inbox-classify.js`의 pure 분류를 유지한다. 실제 저장은 `apps/hub/app/api/hub/inbox/route.js` → Engine `/api/capture/command` → `capture_quick_input_v1`로 연결하며, 삭제된 direct `inbox-router.js` write 경계를 복원하지 않는다.
- 페르소나 산출물 → `work_orders(status='proposed')`. `agents.jsx` Orders/Office가 `persona-registry` + `work_orders` 실데이터를 렌더(목 데이터 제거).

### Phase 3 — 데일리 브리프 = 단일 지휘 화면 (#3) · effort S
브리프를 신호판 → 1클릭 승인 콕핏으로.
- `daily-brief/route.js` + `operating-ledger.js` × `revenue-ledger.js` — **교차 리스크 신호**(같은 회사: 막힌 프로젝트 + 정체 딜 = "이 어카운트 두 전선에서 위험") 조인.
- `daily-brief.jsx` — `work_orders(proposed)` 승인 큐를 브리프에 노출("승인 대기 N건"), `SIGNAL_TARGETS`에 1클릭 approve 액션 연결. ← 여기가 반자동 게이트의 물리적 위치.

### Phase 4 — 성과 루프 / 학습 (#4) · effort M
어제의 결과가 오늘의 콜 리스트를 바꾼다.
- `followups-ledger.js`(priority 공식 ~line 99/129) — outcome 최신성·결과를 우선순위 공식에 반영.
- `outcomes-ledger.js` `getOutcomeStats()` + 주기적 `leads.score` 재계산(현재 sheets-sync 기본 0으로 정적) — Phase 1의 `agent_runs`↔outcome 귀속이 학습 신호를 공급.

## 4. 남은 결정 1개 (architecture fork)

**페르소나 실행 substrate** — 매핑이 남긴 유일한 미해결 갈림길:
- (A) **서버사이드 hub API 라우트** — 추천. Supabase 진실원천 + 큐 모델 + 로컬 Claude 세션 없이도 제품이 도는 구조. `migration 0010` agents 시드가 **load-bearing**이 됨. `context-assembler.js`는 `apps/hub/lib/sales-os/`에 상주.
- (B) gitignore된 `/team` Claude Code 서브에이전트(로컬·오퍼레이터 트리거) — 시드는 장식이 되고, 컨텍스트 조립이 로컬 명령에 묶임.

반자동·Supabase·단일 제품 표면 모두 **(A)** 를 가리킴. 오너가 (B)를 원하면 Phase 0~2의 모듈 위치가 바뀐다.

## 5. 매핑 근거 — weave points (live / partial / missing)

| from → to | 상태 | 메커니즘 |
| --- | --- | --- |
| DailyBrief 신호 → Guru | live | `SIGNAL_TARGETS` → `guruChatPath(?agent=guru&mode&ref)` |
| Revenue ledger → Guru 코칭 | live | `buildSalesContext()` → Engine `/api/ai/sales-mentor` |
| 시트+명함 → 파이프라인 | live | `card-intake`/`sheets-sync` → `lead_intake_raw` → `promoteStagedLeads()` |
| 결과 → 팔로업 트리아지 | partial | `followups-ledger`가 outcome을 'why'로만 읽음, 우선순위 무반영 |
| 결과 → 학습/lead score | **missing** | `leads.score` 정적, 재가중 없음 |
| 인박스 → 5 페르소나 | **missing** | 분류기·라우터 부재 |
| registry.json → 런타임 | **missing** | 시드만 있고 로더 없음 |
| 360 스키마 → buildSalesContext | partial | flat 매출 슬라이스만, crm/content/social/brand 미조립 |
| 플로우 → 에이전트 | **missing** | 이벤트가 페르소나/Guru run을 트리거 안 함 |
| 콘텐츠 ledger → 360/Content 페르소나 | **missing** | `content-ledger` 미조인 |
| 프로젝트 next_action → 브리프/Guru | partial | 신호 시드/코칭 입력에 미사용 |
| eeoCRM → crm_facts | **missing** | 소유자명 테이블 있으나 MCP 읽기 경로 없음 |
