# Personal Sales OS 적용방안 — 폰 연동 전 본체 구현 계획

> 목적: 폰 연동은 내일의 `Phone Bridge`로 분리하고, 지금은 Moonlight Hub 안에서 바로 작동할 Sales OS 요소를 구현 가능한 단위로 쪼갠다.
> 상위 개념: [personal-sales-os-nudge-layer.md](personal-sales-os-nudge-layer.md)
> 폰 기획: [phone-bridge-priority-plan.md](phone-bridge-priority-plan.md)

## 1. 오늘의 범위

폰 없이도 Sales OS가 돌아가야 한다.

오늘 디벨롭할 본체 요소:

1. `Next Action Ledger`
2. `Nudge Engine`
3. `Sales Inbox`
4. `Universal Quick Capture`
5. `Daily / Weekly Review`
6. `Guru Chief of Staff`

제외:

- 전화 기록 자동 수집
- SMS 원문 수집
- 카카오톡 원문 자동 수집
- Android companion
- Kakao Business API

## 2. 적용 원칙

Moonlight Hub는 이미 CRM, Daily Brief, work_orders, crm_activities, followups, stalled scan을 갖고 있다.
따라서 새 시스템을 따로 세우지 않고, **기존 레저 위에 얇은 OS 레이어**를 올린다.

- 새 DB는 마지막 수단.
- P0는 repository 계산 + 기존 `meta` + `work_orders`로 충분히 시작.
- 사용자는 새 페이지를 외워서 가지 않는다. 기존 Daily Brief, Accounts, Deals, Command Palette에 녹인다.
- 저장형 행동은 항상 preview/live 상태를 정직하게 표시한다.
- 자동 발송은 하지 않는다. 초안, 제안, 승인까지만.

## 3. 기존 코드 매핑

| OS 요소 | 기존 자산 | 적용 위치 |
|---------|-----------|-----------|
| Next Action | `leads.next_action`, `deals.meta.next_action`, `customer_accounts.next_action`, `work_orders` | `revenue.jsx`, `followups-ledger.js`, 새 repository |
| Activity Ledger | `crm_activities` | `crm-activities.js`, `/api/hub/revenue/activity` |
| Stale Deal | `stalled-scan.js`, `/api/hub/revenue/stalled-scan` | Deals board, Daily Brief |
| Approval Queue | `work_orders` | Daily Brief approval card, Agents Orders |
| Daily Signals | `/api/hub/daily-brief` | Daily Brief `CoreActionCenter` |
| Customer Cockpit | Accounts detail | `revenue.jsx` `DetailPanel` |
| Command Layer | `hub-command-palette.jsx` | 전역 빠른 실행 |
| Project/Work Review | `work.jsx`, `projects.jsx` | Weekly Review vNext |

## 4. P0 아키텍처

```text
revenue ledger + crm_activities + work_orders
        |
        v
next-action repository
        |
        v
nudge engine
        |
        +--> Daily Brief signals
        +--> Deal card chips
        +--> Account cockpit strip
        +--> Sales Inbox candidates
        +--> Guru draft prompts
```

### 4.1 `next-action repository`

역할:

- lead/deal/account에서 다음 액션 후보를 읽는다.
- 없으면 OS가 만든 후보를 계산한다.
- due/snooze/dismiss 상태를 합친다.

P0 구현 방식:

- `leads.next_action`은 그대로 사용.
- `deals.meta.next_action`, `deals.meta.snooze_until` 사용.
- `customer_accounts.next_action` 또는 `meta.next_action` 사용.
- `work_orders.kind = next_action | followup | onboarding`은 승인 대기 액션으로 간주.

반환 shape:

```js
{
  id: "deal:uuid",
  entityType: "deal",
  entityId: "uuid",
  accountId: "uuid|null",
  companyId: "uuid|null",
  title: "김대표에게 제안서 후속 확인",
  channel: "phone|sms|kakao|meeting|internal",
  dueAt: "ISO|null",
  status: "open|missing|queued|snoozed|done",
  priority: "critical|warning|info",
  source: "manual|rule|work_order|ai",
  evidence: {
    stage: "proposal",
    ageDays: 4,
    lastTouchAt: "ISO",
    reason: "proposal-followup"
  }
}
```

### 4.2 `nudge engine`

역할:

- next action과 revenue ledger를 읽어 행동 카드로 바꾼다.
- 보이는 위치마다 다르게 압축한다.

반환 shape:

```js
{
  id: "no-next-action:deal:uuid",
  ruleKey: "no_next_action",
  severity: "warning",
  surface: ["daily_brief", "deal_card", "account_detail"],
  title: "다음 액션 없는 딜",
  body: "Proposal 단계인데 후속 일정이 없습니다.",
  entity: {
    type: "deal",
    id: "uuid",
    label: "클래스인 Spring Cohort"
  },
  primaryAction: {
    label: "액션 추가",
    route: "dashboard/classin/pipeline?deal=uuid&action=next"
  },
  secondaryAction: {
    label: "팔로업 초안",
    route: "dashboard/agents/chat?agent=guru&mode=followup&ref=uuid"
  },
  escapeActions: ["snooze", "dismiss", "mark_lost"],
  evidence: []
}
```

P0 규칙:

| Rule | Severity | Trigger | Primary action |
|------|----------|---------|----------------|
| `no_next_action` | warning | open deal/account, no next action | 액션 추가 |
| `stale_deal` | warning/critical | open deal age > threshold | 팔로업 제안 |
| `proposal_followup` | critical | proposal sent, 3d no touch | 팔로업 초안 |
| `customer_risk` | warning | account health warning/risk | 상태 기록 |
| `missing_meeting_recap` | info | calendar/work block ended, no activity | 요약 남기기 |
| `forecast_risk` | warning | close soon, no next meeting/action | confidence 조정 |

### 4.3 `sales inbox`

역할:

- 자동 감지된 항목을 바로 저장하지 않고 검수한다.
- P0는 DB 테이블 없이 `work_orders`를 review queue로 재사용할 수 있다.

P0 후보:

- Quick Capture parsing result
- stale scan proposal
- Guru follow-up draft
- meeting recap candidate
- no-next-action candidate

P0 저장:

- `work_orders.kind = note | next_action | followup | review`
- `work_orders.body.normalized`에 후보 저장
- 승인 시 기존 write route 호출 또는 활동으로 저장

vNext:

- `sales_inbox_items` 테이블로 분리.

## 5. 화면 적용안

### 5.1 Daily Brief

현재 있는 `CoreActionCenter`를 Sales OS home으로 확장한다.

추가 블록:

- `오늘 매출 액션` 3~5개
- `다음 액션 없음` count
- `정체 딜` count
- `오늘 due follow-up`
- `미기록 접점`

카드 규칙:

- 한 카드당 primary action 하나.
- secondary는 작게.
- dismiss/snooze는 hover 또는 more menu.
- chart보다 action list 우선.

작업:

1. `/api/hub/daily-brief`에서 nudge summary 포함.
2. `CoreActionCenter`에서 action priority 순 노출.
3. Approval Queue와 중복되는 work_order는 dedupe.

### 5.2 Accounts / Customer Cockpit

현재 상태판 위에 `Next Action` slot을 추가한다.

상단 구조:

```text
상태 | 다음 액션 | 최근 기록 | 핀 노트
```

다음 액션 slot:

- 없으면 `액션 추가` CTA.
- 있으면 title/due/channel 표시.
- due 지났으면 warning chip.
- 완료/스누즈/수정 가능.

작업:

1. account detail merge에 `nextAction` 포함.
2. `AccountStatusStrip`에 next action slot 추가.
3. `QuickActions`에 `다음 액션` 추가.
4. 저장은 P0에서 `customer_accounts.next_action` 또는 `meta.next_action`.

### 5.3 Deals Board

딜 카드는 다음 액션 없는 상태를 바로 보여야 한다.

카드 필수 chip:

- `No next action`
- `3d stale`
- `Proposal follow-up`
- `Queued`
- `Snoozed`

상호작용:

- stage 이동 후 next action 없으면 작은 inline composer.
- stalled CTA는 기존 `queueFollowup` 재사용.
- 빈 lane quick-create 유지.

작업:

1. `mapDeal`에서 `nextAction`, `snoozeUntil`, `confidence` 노출.
2. deal card에 next action row 추가.
3. `?deal=...&action=next` 딥링크 처리.
4. EditDrawer에 next action 필드 고정 노출.

### 5.4 Command Palette

OS 액션을 추가한다.

P0 액션:

- `Quick Capture`
- `Add Next Action`
- `Find Stale Deals`
- `Open Sales Inbox`
- `Weekly Sales Review`

작업:

1. `hub-command-palette.jsx` action 추가.
2. Quick Capture는 modal/drawer로 시작.
3. Sales Inbox는 초기엔 Agents Orders 또는 Daily Brief queue로 이동 가능.

### 5.5 Guru

Guru는 nudge의 secondary action으로 붙는다.

모드:

- `deal-diagnosis`
- `followup-draft`
- `customer-briefing`
- `weekly-review`
- `lost-reason`

작업:

1. nudge route에 mode/ref 담기.
2. Guru prompt에 entity context 주입.
3. 결과는 바로 발송하지 않고 `work_orders` 또는 `crm_activities` note로 저장.

## 6. API / Repository 계획

### 6.1 새 repository

`apps/hub/lib/repositories/sales-os-nudges.js`

역할:

- `getSalesOsNudges({ workspace, limit })`
- `getNextActionCoverage()`
- `buildNudgeSummary()`

입력:

- revenue ledger
- followups ledger
- work_orders
- crm_activities latest

출력:

```js
{
  source: "supabase|preview",
  summary: {
    openActions: 12,
    missingNextActions: 4,
    staleDeals: 3,
    dueToday: 5,
    inboxPending: 2
  },
  nudges: []
}
```

### 6.2 API

P0:

- `GET /api/hub/sales-os/nudges`
- `POST /api/hub/sales-os/action`

`POST action`은 아래만 처리:

- `snooze`
- `dismiss`
- `complete`
- `create_next_action`
- `queue_followup`

저장 위치:

- P0: `work_orders` 또는 entity `meta`.
- vNext: `next_actions`, `nudges`.

### 6.3 Daily Brief 통합

`/api/hub/daily-brief`가 `getSalesOsNudges`를 호출한다.

주의:

- 추가 fetch 폭발 금지.
- Supabase 미설정이면 preview summary.
- work_order와 stalled scan 중복 제거.
- 오래 걸리면 signals는 유지하고 nudges는 partial로 표시.

## 7. 데이터 적용 세부

### 7.1 Deal next action

현재 `buildDealWrite`는 `payload.next_action`을 `meta.next_action`에 저장할 수 있다.

P0:

- EditDrawer에 `next_action` 필드 추가.
- 저장 시 기존 deal write route 사용.
- `revenue-ledger.mapDeal`에서 `meta.next_action`을 `nextAction`으로 노출.

### 7.2 Lead next action

현재 `leads.next_action`이 실제 컬럼이다.

P0:

- Leads drawer에서 next action 필드 유지/강화.
- Followups에서 nextAction을 action due로 해석.

### 7.3 Account next action

스키마에 `customer_accounts.next_action`이 있다.

P0:

- Account drawer에 next action 필드 추가.
- Customer Cockpit에 표시.
- `customer_accounts.next_action` 없으면 최근 activity에서 후보 계산.

### 7.4 Snooze / dismiss

P0:

- `meta.snooze_until`
- `meta.dismissed_nudges = [{ rule_key, until, reason }]`

주의:

- dismiss는 영구 삭제가 아니다.
- 같은 rule이라도 evidence가 바뀌면 다시 뜰 수 있다.

## 8. 구현 순서

### Step 1. Read-only nudge summary

목표: 아무 write 없이 오늘의 Sales OS 상태를 계산한다.

- `sales-os-nudges.js`
- `/api/hub/sales-os/nudges`
- Daily Brief summary card

완료 기준:

- missing next action count 표시.
- stale deal count 표시.
- due today count 표시.
- preview/live 구분.

### Step 2. Next Action UI

목표: 고객/딜에서 다음 액션을 직접 추가/수정한다.

- Account detail next action slot.
- Deal card/EditDrawer next action.
- Command Palette `Add Next Action`.

완료 기준:

- 저장 후 Daily Brief count가 줄어든다.
- preview 환경에서는 로컬/preview 표시.

### Step 3. Nudge actions

목표: 넛지 카드에서 바로 처리한다.

- snooze
- dismiss
- complete
- queue follow-up

완료 기준:

- 처리 후 해당 카드 사라짐.
- work_orders 중복 생성 없음.

### Step 4. Sales Inbox v0

목표: Quick Capture 결과를 검수 큐에 넣는다.

- Quick Capture drawer.
- rule-based parser v0.
- Sales Inbox section in Daily Brief or Agents Orders.

완료 기준:

- 한 줄 입력 -> 후보 카드 -> 저장/무시.
- entity 후보가 낮으면 review.

### Step 5. Weekly Review

목표: 학습 루프 생성.

- 이번 주 움직인 딜.
- stale/lost/won.
- top objections.
- 다음 주 focus 5.

완료 기준:

- Guru가 draft 작성.
- 사용자가 note/playbook으로 저장.

## 9. Acceptance Criteria

### 운영

- 열린 딜 중 next action 없는 비율이 화면에 보인다.
- 다음 액션 추가 후 즉시 상태가 갱신된다.
- 정체 딜은 보드와 Daily Brief 양쪽에서 보인다.
- 넛지에는 항상 why/evidence/action이 있다.
- 스누즈/무시는 이유가 남는다.

### UX

- Daily Brief에서 오늘 할 세일즈 액션이 3분 안에 파악된다.
- 고객 상세에서 다음 액션이 첫 화면에 보인다.
- 딜 보드에서 next action 없는 카드가 눈에 띈다.
- Quick Capture는 5초 안에 열리고 저장 후보를 만든다.
- 모바일에서 카드 텍스트가 겹치지 않는다.

### Safety

- 자동 발송 없음.
- Supabase 없는 환경에서 mock/live 혼합 없음.
- preview는 preview로 표시.
- Guru 결과는 초안/제안이며 사람이 승인한다.

## 10. 오늘 구현 후보

폰을 빼고 바로 시작한다면 가장 좋은 순서:

1. `sales-os-nudges.js` read-only 계산기.
2. Daily Brief에 `Sales OS 상태` 요약.
3. Deal `nextAction` 노출 및 `No next action` chip.
4. Account cockpit `다음 액션` slot.
5. Command Palette `Quick Capture` entry.

이 5개가 들어가면 Sales OS는 아직 자동 수집이 없어도 매일 업무 압력을 만들기 시작한다.

