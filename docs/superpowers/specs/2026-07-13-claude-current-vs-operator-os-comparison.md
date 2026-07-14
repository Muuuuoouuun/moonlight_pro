# Claude 현재 구현 vs Moonlight Personal Operator OS 비교 검토

Date: 2026-07-13
Branch: `real_v1.1`
Current HEAD: `d523c9e`
Status: `HISTORICAL — PHASE_0_BASELINE_SUPERSEDED`
Canonical target: `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`

> 이 문서는 Phase 0 착수 전 코드 감사 스냅샷이다. 당시의 실패 수치와 구현 우려를 현재 상태로 인용하지 않는다. 권고한 Phase 0 신뢰 수리는 `5c9ccc2` (`codex/moonlight-phase0-trust`)에서 완료됐고, 현재 상태와 다음 순서는 `docs/README.md`와 정본 심화 설계를 따른다.

## 1. 결론

Claude 작업은 폐기하거나 되돌릴 대상이 아니다. Guru, Council, `work_orders`, `agent_runs`, Follow-up 계산, Google Calendar, Content Studio, Daily Brief shell, 디자인 시스템은 새 운영 OS의 실행 기반으로 그대로 사용한다.

문제는 구현 순서다.

현재 버전은 **AI가 일을 만들어내는 생산 레인과 이를 보여주는 화면**을 먼저 만들었지만, 문준혁이 매일 믿고 쓰려면 먼저 닫혀 있어야 할 아래 루프는 아직 완성되지 않았다.

```text
입력
  -> 실제 저장
  -> 오늘 우선순위 승격
  -> 실행
  -> 결과 + 다음 행동 기록
  -> 새로고침 후 동일 상태 확인
```

따라서 권장안은 rewrite가 아니라 **기존 Claude 실행 자산 위에 Personal Operating Spine을 덧씌우는 것**이다.

```text
Claude 실행 생산자
  Guru / Council / cron / Calendar / Follow-up / Content Studio
                         │
                         ▼
기존 native ledger
  tasks / leads / deals / projects / content / work_orders / outcomes
                         │
                         ▼
Personal Operating Spine
  durable write / owner gate / Attention adapters / atomic result
                         │
                         ▼
Action Desk
  Quick Capture / 긴급 KA / 집중 고객 / 오늘 일 / 일정 / Inbox
```

Approach B, 기존 원장 기반 Personal Operating Spine이 현재 코드와 가장 충돌이 적다.

## 2. 비교 기준선

### Claude 계보

1. Sales Guru 직접 Claude 계열: `b78087d`~`99c417d`, 이후 `a7adf86`으로 현재 계보에 병합.
2. `origin/real_v1.1` 기준점: `2260207`.
3. 현재 로컬 `real_v1.1`: `d523c9e`, 원격 기준보다 20커밋 앞섬.
4. 위 20커밋 중 18개는 commit body에 Claude 공동작성 표기가 있다.

### 설계 문서

| 문서 | 상태 | 역할 |
|---|---|---|
| `~/.gstack/.../bigmac_moon-real_v1.1-design-20260711-180548.md` | DRAFT | Capture → Attention → Done 신뢰 루프 문제 정의 |
| `~/.gstack/.../bigmac_moon-real_v1.1-eng-review-20260711-191040.md` | REVIEWED | 옛 `captures` 중심 V1과 Attention RPC 검토 |
| `~/.gstack/.../bigmac_moon-real_v1.1-design-20260712-215411.md` | APPROVED | Guru, Content Flywheel, Chief of Staff 자율 3-lane 로드맵 |
| `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md` | DRAFT | 운영자 인터뷰 115개 답변을 반영한 새 정본 |

2026-07-12 자율화 문서는 2026-07-11 신뢰 루프 문서를 `Supersedes`로 표시했지만 두 설계는 실제로 경쟁 관계가 아니다. 자율화 레인은 일을 만드는 **producer**, 신뢰 루프는 일을 저장하고 우선순위화해 끝내는 **operating spine**이다. 새 정본은 두 자산을 이 관계로 다시 합친다.

## 3. 현재 검증 상태

2026-07-13 로컬 재검증 결과:

| 검증 | 결과 | 의미 |
|---|---|---|
| `npm run typecheck` | PASS | 현재 TS 기준선 정상 |
| `npm run build` | PASS | Hub/Engine production build 정상 |
| `npm run check:contracts` | FAIL 1 | Content variant repository 8종과 DB canonical 5종 불일치 |
| `npm test` | 9/12 PASS | 3개 실패가 위 단일 contract 오류에서 연쇄 발생 |
| `npm run check:connections` | PARTIAL | Supabase·Gemini·GitHub 연결 정상, 로컬 Hub/Engine 미기동으로 health 2건 실패 |

현재 contract mismatch:

```text
repository
  newsletter, blog, blog_insight, card_news,
  social_post, x_thread, reels_script, landing_copy

DB canonical
  newsletter, blog_insight, card_news, x_thread, reels_script
```

더 직접적인 문제는 `apps/hub/lib/sales-os/work-orders.js`의 Content materialization이 `variant_type: "blog"`를 저장한다는 점이다. Claude 최신 커밋 `d523c9e`는 이 루프를 closed라고 설명하지만 live DB 계약상 완료 상태가 아니다.

## 4. Step 0: Scope Challenge

### 무엇을 새로 만들지 않아도 되는가

- `tasks`, `projects`, `activity_logs`를 유지한다.
- `work_orders`를 AI·inbox 제안 큐로 유지한다.
- Follow-up은 별도 테이블을 만들지 않고 leads/deals/outcomes에서 계산한다.
- Google Calendar OAuth/read/write를 유지한다.
- Daily Brief를 버리지 않고 Action Desk로 바꾼다.
- 새 `captures` 만능 테이블과 새 Unified Work Graph를 만들지 않는다.
- Claude 자율 3-lane을 없애지 않고 Attention producer로 연결한다.

### 최소 완료 범위

```text
Phase 0  현재 거짓 완료와 계약 오류 제거
Phase 1A task 한 개의 durable loop 완성
Phase 1B task + followup + calendar + work_order를 Action Desk로 조립
Phase 1C 고객 연락 결과와 다음 행동을 원자 기록
```

전체 설계는 8개 이상의 파일을 건드리므로 한 diff로 구현하면 과대 범위다. 위 네 단계는 각각 독립 배포·검증 가능한 vertical slice로 유지한다.

새 배포 artifact는 없다. 기존 Next.js Hub/Engine과 Supabase migration delivery를 사용한다.

공식 패턴 검토는 2026-07-11 Engineering Review의 Supabase function/RLS, Next.js App Router, polling-first freshness 검토를 재사용한다. 이번 비교에서 새 framework나 concurrency primitive는 추가하지 않았다.

## 5. 영역별 비교와 판정

| 영역 | Claude 의도와 구현 | 현재 차이 | 판정 |
|---|---|---|---|
| 디자인 시스템 | Moonstone 토큰, primitives, 44px touch, audit 10건 반영 | Action Desk 정보 순서만 아직 없음 | **유지** |
| Sales Guru | 원장 기반 코칭, 후속 초안 생성 | 초안 품질 사전 시뮬레이션 기록과 durable result loop가 약함 | **유지 후 보완** |
| Guru Autopilot | `draft → queue → approve → execute → learn` | `dab2ad9`로 queue까지 구현, 실제 발송은 수동 복사 | **producer로 유지** |
| Content Flywheel | 아이디어 → AI draft → 승인 → Studio | cron/materialize는 있으나 DB variant 계약 위반 | **Phase 0 즉시 수리** |
| Chief of Staff | 두 lane의 오늘 3개를 아침에 준비 | followups/orders/cadence는 읽지만 실제 Calendar·email·push 미포함 | **Attention adapter로 보완** |
| Daily Brief | first-open cockpit, Morning Brief/Approval Queue | mock fallback, 임의 시간, `Hyeon`, KPI 과다 | **같은 route를 Action Desk로 전환** |
| Quick Capture | 2026-07-15 현재 `/api/hub/inbox` BFF, task/work-order toggle, Engine command, atomic receipt가 live | Phase 1A 당시 gap은 해소됨 | **Phase 1A 완료, spine 유지** |
| Projects/PMS | 실제 read ledger와 풍부한 UI | create/toggle/drag가 local-only | **UI 유지, write 교체** |
| Follow-up | overdue-first, 채널·이유·다음 행동 | Daily Brief 미연결, POST 실패도 `기록됨` 표시 가능 | **계산기 유지, 완료 loop 교체** |
| Calendar | OAuth/read/write 실제 배선 | 미연결 시 예시 event와 local create | **배관 유지, fake state 제거** |
| Owner scope | Neo ID/alias seed 존재 | 일반 repository는 owner가 있으면 모두 `Me`, workspace 전체를 읽음 | **verified gate 전 추천 금지** |
| Revenue | 실제 CRUD와 deep link 기반 | 사람 중심 continuity는 아직 약함 | **V1 유지, Phase 2에서 발전** |
| Content Studio | autosave, Queue, assets, handoff | variant contract와 fallback state가 신뢰를 깸 | **대부분 유지** |
| work_orders | 승인 게이트와 AI producer 공통 큐 | sink 전 상태 변경, 실패를 status로 표현 못함 | **내부 sink 원자화** |
| Workspace IA | ClassIn/브랜드 org scope 구현 | 첫 홈까지 둘로 갈라 인지 부하 증가 | **filter/badge 유지, 홈 통합** |
| ClassIn | `crm_facts` 방향과 owner ID 준비 | snapshot/bootstrap/outbox 없음 | **Phase 4 HMAC bridge로 발전** |
| Identity | demo/founder persona | `Hyeon`, `Hyeon Park` 잔존 | **Phase 0 교체** |

## 6. Phase 0/1 구현 델타

23개 세부 항목을 코드에 대조한 결과:

```text
완전 구현   0
부분 구현   7
누락       7
설계 충돌   9
```

### Phase 0

| 항목 | 상태 | 핵심 근거 |
|---|---|---|
| Content canonical contract | 충돌 | `content-ledger.js` alias 방향과 `work-orders.js` direct insert가 DB와 반대 |
| all-green baseline | 부분 | typecheck/build PASS, test/contracts FAIL |
| failed persistence vs preview | 충돌 | Content/Project/Calendar write가 실패도 preview로 표현 가능 |
| mock/live 분리 | 충돌 | Daily Brief, Projects, Work/Calendar 등에 fallback 유지 |
| Junhyuk Mun identity | 충돌 | Daily Brief/Sidebar/Content에 Hyeon 계열 copy |

### Phase 1A

| 항목 | 상태 | 핵심 근거 |
|---|---|---|
| task create/update/complete + idempotency | 누락 | task mutation route/RPC 없음 |
| Projects task write 연결 | 충돌 | local React state |
| Quick Capture task/inbox | 부분 | inbox→work_order만 존재 |
| task lane 계산 | 부분 | due bucket은 있으나 overdue와 due 없음 의미가 부정확 |
| 실패 복구/retry | 누락 | authoritative server row가 없음 |
| capture mobile/a11y | 누락 | UI entry 자체가 없음 |

### Phase 1B

| 항목 | 상태 | 핵심 근거 |
|---|---|---|
| AttentionItem + deterministic ranking | 충돌 | server domain heuristic + client tone sort 이중 규칙 |
| Follow-up + Calendar source | 부분 | repository/API는 있으나 Daily Brief가 호출하지 않음 |
| source timeout/partial contract | 부분 | `Promise.allSettled`만 있고 timeout/stale/correlation 없음 |
| urgent KA/focus/task slots | 누락 | signal 7개 단순 cap |
| exact deep links | 부분 | lead/deal helper만 있음 |
| disconnected Calendar | 충돌 | local fake event |
| owner verified gate | 충돌 | owner non-null을 `Me`로 처리 |

### Phase 1C

| 항목 | 상태 | 핵심 근거 |
|---|---|---|
| 요약·반응·다음 행동 sheet | 누락 | quick outcome button만 있음 |
| outcome/current task/next task atomicity | 충돌 | `executed` 후 outcome insert |
| `기약 없음` 30일 review | 누락 | schema/adapter 없음 |
| no-show/cancel follow-up | 누락 | Calendar event 업무 상태·고객 참조 없음 |
| owner sample verification | 부분 | seed는 있으나 20건 검증/gate 없음 |

## 7. 비교로 수정한 새 정본의 계약

이번 비교에서 새 정본 자체의 네 결손을 보완했다.

1. **쓰기 경계**
   - Browser → Hub session BFF → Engine shared-secret write API → Supabase RPC로 고정.
   - Hub repository에 신규 domain write를 추가하지 않는다.

2. **고객 task 연결**
   - V1은 `tasks.meta.entity_ref = {type,id}`를 사용한다.
   - 자동 이름 매칭과 선제 FK 확장은 하지 않는다.

3. **Calendar 고객 연결**
   - Google event `extendedProperties.private`에 Moonlight stable ref를 저장한다.
   - 참조가 없는 event는 general이며 제목으로 고객을 추측하지 않는다.

4. **owner 상태 투영**
   - config `disabled/unverified`는 Attention에서 모두 `ownerScope=unverified`.
   - 실제 차이는 source metadata로 보존하고, disabled는 고객 후보를 모두 차단한다.

추가로 Content draft materialization은 status transition과 variant insert를 한 RPC transaction으로 묶도록 Phase 0 완료 조건을 강화했다.

## 8. 미병합 Claude 작업 비교

| 브랜치/커밋 | 현재 기준 | 판단 | 통합 시점 |
|---|---|---|---|
| `claude/heuristic-darwin-897d6b` / `91cb6d2` | HEAD에서 1커밋 앞, cardnews canned stub을 실제 Gemini 생성으로 변경 | 기능 유지 | Phase 0 canonical content 계약 뒤 rebase/cherry-pick |
| `claude/inspiring-meitner-5e4bfa` / `46be9be` | `84d4f1c`에서 9커밋 분기, audit 잔여 디자인 수정 | 선택 유지 | Daily Brief/Content 겹침 검토 후 commit 단위 적용 |
| `claude/nervous-bun-5e46a1` / `5b932ca` | `64d3547` 기반, 현재 HEAD보다 오래됨 | wholesale merge 금지 | Phase 1 후 현재 import graph로 dead-code audit 재실행 |

미병합 브랜치를 한 번에 merge하지 않는다. 특히 `inspiring-meitner`는 새 Action Desk가 바꿀 Daily Brief/Projects/Content와 겹치며, `nervous-bun`은 현재 route 구조 이전 기준이다.

## 9. Architecture Review

### 권장 흐름

```text
Manual input
  Browser
    -> Hub BFF
      -> Engine command
        -> transactional RPC
          -> tasks / work_orders / outcomes / activity_logs

Claude producers
  Guru / Council / cron
    -> work_orders / project_updates / content_items

Read side
  tasks adapter -----------┐
  followups adapter -------┼-> Attention assembler -> Action Desk
  Calendar adapter --------┤
  work_orders adapter -----┘

Operator action
  Action Desk
    -> Hub BFF -> Engine command -> RPC
      -> authoritative result -> invalidate/refetch
```

### 소유권

- native ledger가 현재 상태를 소유한다.
- `activity_logs`/`project_updates`/`outreach_outcomes`가 실제 발생 기록을 소유한다.
- Attention은 정렬·설명·slot만 소유하고 source 상태를 복제 저장하지 않는다.
- Claude 자동화는 Attention score를 소유하지 않고 후보 work를 생산한다.

### 핵심 architecture issues

1. Hub direct write 설계가 AGENTS 경계와 충돌했다. 정본에서 BFF→Engine으로 수정했다.
2. customer-linked task가 stable ref 없이 설계돼 있었다. `tasks.meta.entity_ref`로 수정했다.
3. Calendar customer link가 정의되지 않았다. explicit private extended property로 수정했다.
4. owner disabled/unverified vocabulary가 달랐다. projection 규칙을 고정했다.
5. 현재 work order internal materialization이 원자적이지 않다. Content는 Phase 0 RPC, contact result는 Phase 1C RPC로 수정한다.

## 10. Code Quality Review

1. `preview`가 설정 전 상태와 write 실패를 동시에 뜻한다.
2. static mock이 live-empty/error를 덮는다.
3. priority가 server signal 생성과 client tone sort에 중복된다.
4. owner 표시가 여러 repository에서 `owner_id ? "Me" : ...`로 반복된다.
5. task/project/calendar 주요 mutation이 page-local state에 섞여 있다.
6. work order status와 downstream sink 결과가 분리돼 성공처럼 보일 수 있다.

권장 원칙은 새 framework가 아니라 explicit contract와 작은 adapter다. 공통 response taxonomy, owner resolver, Attention rank helper를 한 곳씩 둔다.

## 11. Test Review

### 현재 coverage

```text
CODE PATHS
==========
Content contract
  ├── repository ↔ schema parity                 [★★★ TESTED, 현재 실패]
  └── content approval materialization           [GAP -> integration]

Task
  ├── create / duplicate / conflict              [GAP -> integration]
  ├── complete / reopen / stale update            [GAP -> integration]
  └── reload persistence                          [GAP -> E2E]

Quick Capture
  ├── task destination                            [★★★ TESTED + LIVE]
  ├── inbox destination                           [★★★ TESTED + LIVE]
  ├── cross-destination duplicate/conflict        [★★★ TESTED + LIVE]
  └── failed input preserve + retry               [★★★ TESTED]

Attention
  ├── deterministic lane/rank/slot                [GAP -> unit]
  ├── source timeout -> named partial             [GAP -> integration]
  ├── owner unverified exclusion                  [GAP -> unit + integration]
  └── exact deep links                            [GAP -> component]

Contact outcome
  ├── outcome + next task transaction             [GAP -> SQL integration]
  ├── duplicate retry                             [GAP -> SQL integration]
  └── injected middle failure rollback            [GAP -> SQL integration]

USER FLOWS
==========
Action Desk
  ├── live-empty has no demo work                 [GAP -> E2E]
  ├── capture + first action at 390×844            [GAP -> Playwright/visual]
  └── keyboard-only capture/complete/retry         [GAP -> Playwright]

Follow-up
  ├── POST 500 never shows 기록됨                 [GAP -> component/E2E]
  └── summary/reaction/next action reload          [GAP -> E2E]

Calendar
  ├── disconnected shows CTA only                 [GAP -> component]
  └── linked customer event reaches correct row   [GAP -> integration]
```

Target plan has 16 grouped gaps. Phase별 구현 PR은 해당 범위의 gap을 함께 닫아야 한다. Prompt/LLM 계약을 변경하지 않으므로 Phase 0/1에는 별도 model eval이 필수는 아니다. 미병합 `91cb6d2`를 통합할 때는 cardnews structured-output eval을 별도 수행한다.

## 12. Failure Modes

| Failure | 현재 handling | Test | 사용자 경험 | 판정 |
|---|---|---|---|---|
| Content `blog` insert가 DB에서 거부됨 | preview/partial로 흐를 수 있음 | contract가 탐지 | 초안 승인 후 Studio에 없음 | critical |
| Daily Brief fetch 실패/live-empty | static 업무 대입 | 없음 | 가짜 긴급 업무를 실제로 오해 | critical |
| Projects task를 완료하고 reload | local state 소실 | 없음 | 완료가 되돌아옴 | critical |
| Follow-up POST 500 | `response.ok` 미확인 | 없음 | `기록됨` 거짓 성공 | critical |
| 다른 담당 고객 row | owner non-null이면 `Me` | 없음 | 잘못된 고객에 연락 가능 | critical |
| outcome sink 실패 | order는 `executed` 유지 | helper 일부만 | 다음 날 학습/후속 누락 | critical |
| Calendar 미연결 create | local event 추가 | 없음 | 저장됐다고 착각 가능 | high |
| capture double submit | 2026-07-15 atomic receipt로 해소 | duplicate/conflict + live smoke | 같은 key는 같은 destination ID, 다른 payload는 409 | resolved |
| one source hangs | source timeout 없음 | 없음 | 첫 화면이 늦거나 전체 실패 | high |

현재 critical gap은 6개다. 모두 Phase 0 또는 1C의 명시적 fix/test에 배정했다.

## 13. Performance Review

1. `getProjectLedger()`의 task read는 최신 row cap 이후 UI bucket을 만든다. Attention에 재사용하면 오래된 overdue가 누락될 수 있으므로 inclusion predicate를 먼저 적용하는 전용 adapter가 필요하다.
2. Follow-up read는 최대 leads 300 + deals 300 + companies 1000 + outcomes 500을 Node에서 합친다. 1인 V1에서는 동작하지만 owner filter와 stale predicate를 DB read에 최대한 앞당겨야 한다.
3. Action Desk source는 병렬 2초 timeout, 전체 2.5초 budget을 유지한다. Calendar disconnect는 빠른 preview이고 전체 error가 아니다.
4. initial payload는 actionable row만 반환하고 KPI/전체 목록은 count와 destination으로 접는다.

## 14. 권장 실행 순서

```text
0. 문서 계약 보정                              완료
1. Phase 0
   content canonical 5종
   internal materialization RPC
   response taxonomy
   mock 제거
   Junhyuk Mun identity
2. Phase 1A
   task/entity-ref/receipt migration
   Hub BFF -> Engine task/quick-capture command
   Projects durable task
   task-only Action Desk
3. Phase 1B
   task/followup/calendar/work_order adapters
   owner verification gate
   deterministic slots
   Daily Brief -> Action Desk
4. Phase 1C
   contact outcome RPC
   summary/reaction/next task/review
5. 미병합 Claude branch 선별 통합
```

`91cb6d2`는 Phase 0 content contract 이후 적용한다. `46be9be`의 디자인 수정은 Action Desk와 충돌하지 않는 commit만 선별한다. `5b932ca`는 현재 HEAD에서 dead-code 검증을 다시 한 뒤 별도 cleanup으로 처리한다.

## 15. Parallelization

| Lane | Modules | Depends on |
|---|---|---|
| A Phase 0 trust repair | Hub content/routes/pages, Supabase content RPC | — |
| B Test harness/fixtures | root scripts, Engine/Hub test helpers | — |
| C Durable task | Engine commands/routes, Hub BFF, task migration, Projects | A contract taxonomy |
| D Attention/Action Desk | Hub repositories, rank helper, Daily Brief | C task contract |
| E Contact outcome | Engine command, Supabase RPC, Follow-up sheet | C task/entity ref |

실행:

- A와 B를 병렬로 시작한다.
- A 완료 후 C를 시작한다.
- C의 API/schema 계약이 고정되면 D read-side와 E outcome backend를 병렬로 진행한다.
- D/E의 Hub UI 통합은 Daily Brief/Follow-up 파일 충돌을 피하려고 순차 merge한다.

## 16. What Already Exists

- actual ledgers: projects, tasks, leads, deals, content, work_orders, outcomes.
- actual producers: Guru/Council cron and Chief of Staff.
- actual integrations: Supabase, Gemini, Google Calendar, GitHub.
- actual UI assets: Daily Brief, Approval Queue, Follow-up, Projects, Studio, Calendar.
- actual safety assets: Hub write guard, Engine shared secret, work-order approval gate.
- actual design assets: DESIGN.md tokens/primitives/a11y rules.

새 설계는 위 자산을 재구축하지 않는다.

## 17. NOT in Scope

- 모든 업무의 Unified Work Graph migration.
- 새 raw `captures` table.
- 전체 Contact-first CRM migration.
- PMS 후보 생성·월간/분기 review 전체.
- ClassIn 완전 양방향 sync.
- push notification과 service worker.
- 자동 고객 발송.
- 음성 STT와 회의 자동 분석.
- 복잡한 콘텐츠 성과 분석.
- 미병합 Claude branch wholesale merge.

## 18. TODOS 교차검토

`TODOS.md`의 아래 기존 P1이 이미 이번 구현을 포괄한다.

- Today Actions Read Model
- Route Response Taxonomy
- Production Write Auth Boundary
- Behavioral Test Harness
- Content Variant Schema Contract
- Today-First Decision Stack

새 TODO를 추가하지 않는다. owner gate, task entity ref, Calendar explicit link, atomic contact outcome은 deferred work가 아니라 Phase 1 구현 계약으로 정본에 포함했다.

## 19. Review Completion Summary

- Step 0: 기존 원장을 재사용하고 Phase 0/1 vertical slice로 범위를 유지.
- Architecture Review: 5 issues, 4개 정본 수정, 1개 Phase 0/1 RPC로 배정.
- Code Quality Review: 6 current trust gaps.
- Test Review: coverage diagram 작성, 16 grouped gaps.
- Performance Review: 3 query/timeout risks와 payload budget 확인.
- NOT in scope: 작성.
- What already exists: 작성.
- TODOS.md updates: 신규 0개.
- Failure modes: critical 6개.
- Outside voice: Claude 계보, implementation delta, UX/data의 3개 독립 서브에이전트 검토.
- Parallelization: 5 lanes, A+B 및 D+E 일부 병렬.
- Lake Score: 5/5 핵심 권고가 shortcut보다 complete vertical loop를 선택.

## 20. 최종 권장 결정

새 정본의 전제 1~7과 Approach B는 **승인 권장**이다.

다만 승인 의미는 Claude 작업을 대체한다는 뜻이 아니다.

```text
Claude가 만든 producer와 domain surface는 유지한다.
새 설계가 durable write, Attention, owner trust, atomic result를 책임진다.
Action Desk가 둘을 하나의 개인 업무 루프로 합친다.
```

구현은 Phase 0부터 시작하고, 현재 red contract와 거짓 success state를 남긴 채 Action Desk UI부터 만들지 않는다.
