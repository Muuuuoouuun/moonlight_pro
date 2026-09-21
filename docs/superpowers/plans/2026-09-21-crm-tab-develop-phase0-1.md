# CRM 탭 디벨롭 — 0·1단계 실행 계획 (파일 단위)

> 상태: **DRAFT · 실행 대기.** [스펙 v0.2](../specs/2026-09-21-crm-tab-develop-design.md) §7의 0단계 PR 3개와 1단계 PR 2개를 파일·함수·테스트·완료 기준까지 내린 문서다. 스펙의 권장 기본값(§9 Q138~Q146)이 뒤집히지 않는다는 전제로 쓴다. 이 문서는 구현 기록이 아니다 — 착수 후 각 PR의 실측·커밋을 아래 표에 채운다.
> 작성일: 2026-09-21 · 브랜치 `09.bigmac1.02` · HEAD `d8e2abe`
> 전제: 활성 1순위는 여전히 09-03 성장 기획서 F-0(초안 크론 수리)이다. 0단계 3개 PR은 F-0이 만지는 파일(`apps/hub/app/api/cron/*`, `apps/engine/app/api/ai/*`, `automations-ledger.js`, `daily-brief.jsx` 승인 카드)과 겹치지 않아 병행할 수 있다. 여러 파일에 걸친 작업이므로 CLAUDE.md 규칙대로 **전용 worktree**(`git worktree add ../moonlight_pro-crm-p0 -b claude/crm-tab-p0`)에서 시작하고 병합 뒤 `git worktree remove`까지 마친다. `git add -A` 금지 — 만진 파일만 명시 경로로.

---

## 0. 범위와 순서

| PR | 이름 | 규모 | 의존 | 마이그레이션 |
|---|---|---|---|---|
| 0a | 집계 원천 통일 | S | — | 0 |
| 0b | 연락 행 살리기 + 반응 표시 | M | 0a(같은 파일 `followups-ledger.js`) | 0 |
| 0c | 집중 고객 후보 교정 + 이관 가드 | S | — | 0 |
| 1a | 고객 상세 섹션 세트 | L | 0b | 0 |
| 1b | 통합 기록창 + RPC v2 | L | 1a | **1**(함수) |

0a → 0b는 순서가 있고, 0c는 독립이다. 1a와 1b는 같은 주에 붙여서 한다(1a만 나가면 "기록 남기기" 버튼이 옛 세 폼 중 하나를 열게 되어 어정쩡하다).

**공통 완료 조건(모든 PR).** 루트 `npm test` 실패 0 · 스윕 3종 통과(`motion`·`focus-ring`·`no-mock-data`) · `state-usage.test.mjs` 통과 · `git show --stat`의 ±라인이 편집 규모와 맞음 · 이 문서의 해당 PR 행에 커밋 해시 기록.

---

## 1. PR-0a — 집계 원천 통일

**목표.** 앱에서 남긴 연락 기록이 주간 리포트 `연락 N건`과 연락 큐의 `왜 지금`·boost에 도달한다. `outreach_outcomes`는 더 이상 읽지 않는다(삭제·마이그레이션 없음).

### 1.1 파일과 변경

| 파일 | 변경 |
|---|---|
| `apps/hub/lib/sales-os/followup-scoring.js` | **추가** `export function activityToOutcomeAction({ kind, reaction })` — 순수. `kind ∈ {meeting, demo, visit, info_session}` → `'meeting'`; `reaction === 'positive'` → `'replied'`; `'no_response'` → `'no_response'`; `'rejected'` → `'lost'`; `concern`·`neutral`·그 외 → `'sent'`. 기존 `ACTION_MOMENTUM`·`outcomeBoost`·`priorityFor`는 **무변경**(정렬 교체는 2a) |
| `apps/hub/lib/repositories/crm-activities.js` | **추가** `export async function listRecentActivities({ workspaceId, since, limit = 500 })` — `select: id,kind,reaction,body,lead_id,deal_id,company_id,occurred_at`, `order: occurred_at.desc`. 읽기 실패는 `null` 반환(기존 `fetchSupabaseRows` 계약) |
| `apps/hub/lib/repositories/followups-ledger.js` | (1) `outreach_outcomes` fetch 2곳(`getFollowups`·`recomputeLeadScores`)을 `listRecentActivities`로 교체. (2) `lastOutcomeByLead/ByCompany` 구성은 그대로 두되 원소를 `{ action: activityToOutcomeAction(a), occurred_at, kind, reaction, body }`로. (3) `why` 문구를 `마지막 ${KIND_LABEL[kind]} ${n}일 전 · ${REACTION_LABEL[reaction]}`로(반응 없으면 생략). (4) `failedSources`의 `"outreach_outcomes"` → `"crm_activities"`. (5) **순수 코어 분리**: `export function buildFollowupItems({ leads, deals, companies, activities, trackingStartedAt, now })` — 지금 `getFollowups` 본문의 items 계산 부분을 그대로 옮긴다. `getFollowups`는 IO + `buildFollowupItems` 호출만 남긴다 |
| `apps/hub/lib/repositories/weekly-report.js` | (1) `outreach_outcomes` fetch → `crm_activities`(`select: id,kind,occurred_at`, `occurred_at gte since`, `limit 300`). `contacts = rows.filter(r => CONTACT_KINDS.has(r.kind)).length`, `CONTACT_KINDS = {call, kakao, meeting, demo, visit, info_session, email, quote}`(note·update·deal·ai 제외 — 대화가 아닌 기록은 "연락"이 아니다). (2) 완료 할 일 집계를 `updated_at gte since` → `completed_at gte since`로(09-20 §6.4). `tasks.completed_at`은 `20260420_0001_supabase_first_foundation.sql`이 추가한 실제 컬럼이다. (3) `failedSources` 라벨 갱신 |
| `apps/hub/lib/sales-os/context-assembler.js` | `getRecentOutcomes` → `listRecentActivities`. 소비 필드명이 다르면 어댑터 한 줄(`action`은 `activityToOutcomeAction`) |

### 1.2 테스트

| 파일 | 내용 |
|---|---|
| `apps/hub/lib/sales-os/followup-scoring.test.mjs` | **신설**(현재 없음): `activityToOutcomeAction` 매핑 표 전부 + 미지 값 → `'sent'` · 기존 `outcomeBoost`/`priorityFor` 회귀 케이스 2개 |
| `apps/hub/lib/repositories/followups-ledger.test.mjs` | **신설.** `buildFollowupItems`에 합성 리드·딜·활동을 넣고 (a) 최근 활동의 반응이 `why`에 나오는지 (b) `no_response`가 boost를 내리는지 (c) 활동이 회사 기준으로만 연결된 리드(lead_id null, company_id 있음)도 잡히는지 (d) 트래킹 윈도 밖 tier-2 행이 날짜 도래 전에는 빠지는지(기존 동작 회귀 방지) |
| `apps/hub/lib/repositories/weekly-report.test.mjs` | 기존 테스트의 `outreach_outcomes` 스텁을 `crm_activities`로 교체. `note`·`deal` kind는 연락에 안 세는 케이스 1개 추가 |

### 1.3 완료 기준

- 로컬 Supabase(또는 서울 운영 DB 읽기)에서 `select count(*) from crm_activities where occurred_at >= now() - interval '7 days' and kind in (...)`와 첫 화면 주간 카드 `연락` 숫자가 같다.
- 고객 연락 행의 `왜 지금`에 `반응 우려` 같은 문구가 실제로 나온다(스크린샷을 이 문서에 첨부하지 않고 커밋 메시지에 한 줄).

---

## 2. PR-0b — 연락 행 살리기 + 반응 표시

**목표.** `followups.jsx` `FollowupRow`가 이미 그리려고 하는 네 가지(버킷·레일·행 클릭·최근 반응 줄)가 실제로 그려진다. 컴포넌트는 거의 손대지 않는다 — **데이터 모양을 컴포넌트가 기대하는 모양으로 맞춘다.**

### 2.1 파일과 변경

| 파일 | 변경 |
|---|---|
| `apps/hub/lib/repositories/followups-ledger.js` (`buildFollowupItems`) | 각 item에 **추가**: `bucket`(= `attention-ledger.js` `bucketFor`와 같은 규칙 — KST day-key 비교; `meta.next_action_at` 없으면 `'later'`), `href`(리드 `dashboard/revenue/customers?customer=lead:<id>`, 딜 `dashboard/revenue/deals?deal=<id>`), `lastNote`(최근 활동 `body` 앞 80자), `lastReaction`(최근 활동 `reaction`), `lastKind`. `bucketFor`·`dateKey`는 `attention-ledger.js`에서 **export로 승격**해 import한다(중복 구현 금지 — 09-20 §6.3 "정체 기준 한 곳" 원칙과 같은 이유) |
| `apps/hub/lib/repositories/attention-ledger.js` | `dateKey`·`bucketFor` 앞에 `export` |
| `apps/hub/components/hub/pages/followups.jsx` | (1) `FollowupRow`의 `lastReaction` 라벨 조회를 `REACTION_OPTIONS`(outreach 어휘 `interested/considering/hold/declined`, `outcome-attribution.js`)에서 이 파일에 이미 있는 `CRM_REACTION_LABEL`(RPC 어휘)로 바꾼다 — `lastReaction`은 이제 `crm_activities.reaction`에서 오므로 옛 맵으로는 라벨을 못 찾는다. (2) 지남 레일 빨강 예산: 렌더 시 `overdue` 레일을 **앞 3행까지만** 주고 4번째부터는 시계 글리프 + `지남` 텍스트(DESIGN §5.3). (3) 그 외 무변경 |
| `apps/hub/components/hub/pages/customers.jsx` (`ActivityTimeline`) | 행에 `a.reaction`이 있으면 종류 라벨 옆에 `Badge tone="neutral" variant="outline"`로 반응 라벨(`REACTIONS` 배열 재사용). `rejected`·`concern`도 **중립 뱃지**다 — 위기 표현은 1a의 ②섹션이 맡는다(같은 사실을 두 곳에서 빨갛게 하지 않는다) |
| `apps/hub/components/hub/pages/followups.jsx` (`ActivityPanel`) | 같은 반응 뱃지. 이 패널의 `불러오는 중…` 리터럴을 `Skeleton lines={3}`으로(D1 일부 선반영) |

### 2.2 테스트

| 파일 | 내용 |
|---|---|
| `apps/hub/lib/repositories/followups-ledger.test.mjs` | `bucket` 4값 경계(어제=overdue, 오늘=today, 6일 뒤=week, 7일 뒤=later, 없음=later — **KST 자정 경계**: UTC 15:30 = KST 다음날 00:30인 케이스 1개 필수), `href` 형식, `lastNote` 80자 절단, `lastReaction` 전달 |
| `apps/hub/components/hub/lead-activity.test.mjs` | 존재하는 테스트다(경로 주의: `pages/` 아님) — 무엇을 고정하는지 착수 시 읽고, `ActivityTimeline`의 반응 라벨 매핑이 순수 함수로 분리되면 거기 케이스 추가 |

### 2.3 완료 기준

- 고객 연락 페이지에서 `지남 N`·`오늘 N`·`이번 주 N` 카운트가 0이 아니고, 선택 시 필터가 된다.
- 이름 클릭으로 활동 패널이 열린다(마우스). `e` 키 경로도 그대로.
- `overdue` 행 상단 3개에만 1px danger 레일.
- 타임라인 행에 반응 뱃지가 보인다.

---

## 3. PR-0c — 집중 고객 후보 교정 + 이관 가드

**목표.** 첫 화면 집중 고객이 `won`만이 아니라 "지금 연락해야 할 고객"을 뽑고, 3행이 서로 다른 말을 한다. 이관 스크립트가 운영자 약속을 되돌리지 않는다.

### 3.1 파일과 변경

| 파일 | 변경 |
|---|---|
| `apps/hub/lib/sales-os/lead-enrichment.js` | **추가** `export const NEXT_ACTION_TEMPLATES = new Set([...resolveNextAction가 돌려주는 5문장])` + `export function isTemplateNextAction(text)`. `resolveNextAction`은 그대로(스크립트가 여전히 씀) |
| `apps/hub/lib/operator-revenue-scope.js` (`selectOperatorFocusLeads`) | 필터를 스펙 §4.8로 교체: `owner==='Me'` ∧ `stage ∉ {Customer, Lost}`(리드 표시 단계 기준; 계약 고객은 열린 딜이 있을 때만 — `orderCount`/`deals` 확인) ∧ `nextAction` 비어있지 않음 ∧ `!isTemplateNextAction(nextAction)` ∧ (`nextActionAt` ≤ today+3 ∨ `focusOverride==='raise'`) ∧ `focusOverride!=='lower'`. 정렬: raise → `nextActionAt` asc(없으면 뒤) → id. 회사당 1건 규칙 유지. `priorityLane` 조건은 **삭제** |
| `apps/hub/lib/daily-focus.js` (`buildDailyFocus.focusCustomers.items`) | 행에 `lastReaction: lead.lastReaction`(아래 mapLead 추가분)과 `lastKind`를 실어 `reason`을 `최근 통화 3일 전 · 우려 · 다음 9/26`처럼 만든다. `dueLabel`·`href`는 유지 |
| `apps/hub/lib/repositories/revenue-ledger.js` (`mapLead`) | **추가** `lastReaction: meta.last_reaction \|\| null`(RPC v1이 이미 쓰는 키 — 새 읽기 0), `nextActionIsTemplate: isTemplateNextAction(row.next_action)` |
| `apps/hub/components/hub/pages/daily-brief.jsx` (`FocusSlots` 집중 고객 행) | 메타 줄을 `reason · dueLabel`에서 `최근 {lastKind} {N}일 전 · {반응} · 다음 {날짜}`로. 첫 화면 스펙 §5.2(집중 고객 5→3 + 더 보기)는 **그 문서의 PR**이 맡는다 — 여기서는 문구만 |
| `scripts/enrich-eeocrm-leads.mjs` | `changed` 판정과 `patch`에서 `next_action`을 조건부로: 현재 `lead.next_action`이 비어 있거나 `isTemplateNextAction(lead.next_action)`일 때만 패치. 운영자 문장이면 **건드리지 않는다**. 패치할 때 `meta.next_action_source='import-template'`도 함께 쓴다(1b의 RPC v2가 `'operator'`를 쓰기 시작하면 `isTemplateNextAction` 휴리스틱과 플래그가 함께 판정 근거가 된다) |

### 3.2 테스트

| 파일 | 내용 |
|---|---|
| `apps/hub/lib/sales-os/lead-enrichment.test.mjs` | `isTemplateNextAction`: 5문장 true, 운영자 문장 false, 공백/undefined false |
| `apps/hub/lib/operator-revenue-scope.test.mjs` | (a) `won` 리드가 조건 없이 뽑히던 회귀 케이스 → 이제 빠짐 (b) 진행 중 리드 + 오늘 날짜 → 뽑힘 (c) 템플릿 next_action → 빠짐 (d) `raise`는 날짜 없어도 뽑힘 (e) `lower`는 날짜 있어도 빠짐 (f) 회사당 1건 |
| `apps/hub/lib/daily-focus.test.mjs` | 집중 고객 행 `reason`이 반응·종류를 포함 |
| `scripts/` | 스크립트는 테스트가 없다 — `--apply` 없이 dry-run 리포트에서 `next_action` 패치 건수가 "운영자 문장" 행에서 0인지 눈으로 확인하고 커밋 메시지에 남긴다 |

### 3.3 완료 기준

- 첫 화면 집중 고객 3행의 문구가 서로 다르다(첫 화면 스펙 D3의 검증 항목과 공유).
- 진행 중 리드가 집중 고객에 뜬다.
- 스크립트 dry-run에서 운영자 문장 행의 `next_action` 패치 0건.

---

## 4. PR-1a — 고객 상세 섹션 세트

**목표.** 세 진입점(고객 DB 드로어·Accounts 상세·Leads 편집 드로어)이 같은 섹션 세트를 그린다. ①니즈 ②위기 ③약속 ④돈 ⑤기록 ⑥판단 순서. 점수·건강도 뱃지는 헤더에서 사라진다.

### 4.1 신규 파일

```text
apps/hub/lib/sales-os/customer-risk.js            deriveCustomerRisk (순수, @/ import 없음)
apps/hub/lib/sales-os/customer-risk.test.mjs
apps/hub/components/hub/customer-detail/index.jsx      CustomerDetail({ customer, activities, activityState, deals, onRecord, onNavigate, variant: 'drawer'|'panel' })
apps/hub/components/hub/customer-detail/header.jsx
apps/hub/components/hub/customer-detail/needs.jsx
apps/hub/components/hub/customer-detail/risk.jsx
apps/hub/components/hub/customer-detail/commitment.jsx
apps/hub/components/hub/customer-detail/money.jsx
apps/hub/components/hub/customer-detail/timeline.jsx   ActivityTimeline 이관 + RelatedMemos
apps/hub/components/hub/customer-detail/judgement.jsx  LeadEnrichmentPanel 이관
apps/hub/components/hub/use-customer-detail.js         활동 로딩(companyId 우선) · SWR · 반응 매핑
```

`customer-detail/`가 `components/hub/` 직속인 이유: 페이지 3개가 공유한다(CLAUDE.md "페이지 전용이 아닌 경우만 분리").

### 4.2 `deriveCustomerRisk` 계약

```js
// 입력: activities(최신순, {kind, reaction, occurredAt, meta}), nextActionAt(ISO|null), dealsOpen(boolean), todayKey('YYYY-MM-DD', KST)
// 출력: { level: 'none'|'urgent', events: [{ key, label, evidence, at }] }
promise_missed    nextActionAt < todayKey ∧ activities.some(a => a.occurredAt >= nextActionAt) === false
rejected_open     activities[0]?.reaction === 'rejected' ∧ dealsOpen
concern_recent    최근 30일 안 reaction==='concern' 존재 ∧ 그 이후(더 최신) positive 없음
no_response_streak activities[0..1] 둘 다 no_response            → level은 올리지 않음(중립 이벤트, rail=false)
meeting_lost      activities[0]?.meta?.outcome ∈ {cancelled,no_show} ∧ nextActionAt 없음
level = events.some(e => e.rail) ? 'urgent' : 'none'
```

테스트 케이스는 위 5사건 각각의 참/거짓 + 30일 경계 + `positive`가 `concern`을 지우는 케이스 + 활동 0건 + 날짜 KST 경계.

### 4.3 기존 파일 변경

| 파일 | 변경 |
|---|---|
| `apps/hub/components/hub/pages/customers.jsx` | `Customer360Drawer` 본문 → `<CustomerDetail variant="drawer" …/>`. **제거**: 헤더 `스코어/건강도` 뱃지, `ContactOutcomeSheet`(1b에서 기록창으로), `QuickLog`, `HEALTH_TONE`. `SEGMENTS.risk` 라벨 `이탈위험` → `위기`, `segmentFilter('risk')` = `deriveCustomerRisk(...).level==='urgent'`. `scoreBand`는 ⑥판단 전달용으로만. `toRows`에 `lastReaction`·`nextActionAt` 전달. 컨택 시트 자리에는 1b 전까지 임시로 기존 `ContactOutcomeSheet`를 ③약속 아래 유지(1a·1b를 같은 주에 붙이는 이유) |
| `apps/hub/components/hub/pages/revenue.jsx` | Accounts `DetailPanel` 헤더·탭 본문을 `<CustomerDetail variant="panel" …/>`로. **제거**: `HealthDot`·`H_TONE`, 헤더 `주의/위험/양호` 라벨, `ContactMenu` 하드코딩 그림자(D3 → `var(--shadow-pop)`). `LogComposer`·`QuickActions`는 1b 전까지 유지. Leads `EditDrawer`의 `기록` 탭 패널을 `CustomerDetail`의 ⑤타임라인 섹션으로 교체(`LeadActivityPanel` 이관). `불러오는 중…` 3곳 → `Skeleton` |
| `apps/hub/lib/repositories/revenue-ledger.js` | `resolveHealth`는 유지하되 소비자에서 색을 잃는다(계정 `health` 값은 ⑥판단에서 텍스트로만). `mapDeal`에 `meta.items/payment/close_result` 투영 추가(읽기 fallback: 없으면 `null`) |
| `apps/hub/components/hub/hub-tokens.css` | `.hub-seg[data-invalid]` 규칙(D5) — 1b에서 쓴다 |
| `SyncBadge` 13곳 | 만지는 파일 안에서 `TruthBadge`로(D2) |

### 4.4 상태 계약(모든 섹션 공통)

- `activityState ∈ {loading, live, partial, preview, error}`. `loading` → 섹션별 `Skeleton`. `error` → ⑤에만 오류 + 재시도, ①③④는 원장 데이터로 산다. `preview` → `TruthBadge preview` 한 번(헤더).
- ②위기는 `level==='none'`이면 **DOM에 없다.**
- ①③④ 빈 상태 카피는 스펙 §4.2 표.

### 4.5 테스트·검증

- `customer-risk.test.mjs`(§4.2).
- `state-usage.test.mjs`·`motion`·`focus-ring`·`no-mock-data` 통과.
- 브라우저: 1440·390에서 세 진입점을 열어 섹션 순서·빈 상태·레일 1개·`TruthBadge` 확인. `preview_start`로 확인하고 스크린샷은 커밋에 넣지 않는다.

### 4.6 완료 기준

- 세 진입점이 같은 섹션 컴포넌트를 import한다(`grep -rn "customer-detail"` 3파일).
- 헤더에 점수·건강도 없음. 고객 DB `위기` 세그먼트 = 사건 기반.
- CRM 세 페이지에서 `SyncBadge` 0, `불러오는 중…` 0, 하드코딩 색 0.

---

## 5. PR-1b — 통합 기록창 + RPC v2

**목표.** 기록창 하나. 한 번 저장으로 ①③⑤(+④견적)가 갱신된다. 세 폼(`ContactOutcomeSheet`·`QuickLog`·`LogComposer`)은 제거.

### 5.1 마이그레이션 1개

`supabase/migrations/2026MMDD_0036_record_contact_outcome_v2.sql` — 번호는 착수 시 `ls supabase/migrations | tail -1`로 확인(README 기준 최신 0035). 내용: 스펙 §5.3 함수 + (선택) `create unique index if not exists idx_crm_activities_request_id on public.crm_activities ((meta->>'request_id')) where meta->>'request_id' is not null;`. v1은 삭제하지 않는다. 적용은 `npm run db:migrate`, 확인은 `npm run db:check`(복원 시 함수 실행 권한 회귀 함정 — `docs/supabase-korea-region-migration.md`). postgres 기반 RPC 테스트는 macOS에서 `LC_ALL`을 spawn env에 넣어야 뜬다(CLAUDE.md 함정 2).

### 5.2 신규 파일

```text
apps/hub/components/hub/contact-record-drawer.jsx      ContactRecordDrawer({ target:{kind,id,companyId,contactId,name}, preset:{channel,reaction,chips}, onClose, onSaved })
apps/hub/lib/sales-os/contact-record.js                buildContactRecordPayload(form) · CHANNEL_FIELDS 매트릭스(스펙 §4.3) · reactionRequired(channel, replied) · 순수
apps/hub/lib/sales-os/contact-record.test.mjs
apps/hub/lib/contact-record-draft-store.js             sessionStorage 초안 (키 crm-record:<kind>:<id>, journal-browser-store의 tabId 패턴 재사용)
apps/hub/lib/contact-record-draft-store.test.mjs
supabase/migrations/…_record_contact_outcome_v2.sql
apps/hub/lib/contact-outcome-v2-postgres.test.mjs      (기존 postgres 하네스 패턴 — `discovery-postgres.test.mjs`·`daily-review-postgres.test.mjs` 옆, 같은 initdb/pg_ctl 부트스트랩 재사용)
```

### 5.3 기존 파일 변경

| 파일 | 변경 |
|---|---|
| `apps/hub/app/api/hub/revenue/contact-outcome/route.js` | body에 `version: 2`가 있으면 `record_contact_outcome_v2` 호출, 없으면 v1(호환). 응답 봉투 동일 |
| `apps/hub/lib/repositories/crm-activities.js` (`recordActivity`) | `meta` 인자 추가(09-20 §6.3 딜 단계 이동 기록도 이 인자를 쓴다) |
| `apps/hub/lib/sales-os/revenue-write.js` | `buildActivityWrite`에 `meta` 통과. `buildDealWrite`에 `items/payment/paid_amount/paid_at/close_result/inquiry_type/relation_signals` metaPatch(2b가 UI를 붙이지만 쓰기 계약은 여기서 먼저) |
| `customers.jsx` `revenue.jsx` `followups.jsx` | 세 폼 제거. [기록 남기기]·`QuickActions`·`LOG_ACTIONS` 버튼은 전부 `ContactRecordDrawer`를 채널 프리셋으로 연다. followups의 3.5초 되돌리기·요청 id 최신성 로직은 드로어로 이관. `SegmentedControl`의 인라인 에러 보더 → `data-invalid`(D5) |
| `apps/hub/components/hub/hub-primitives.jsx` (`SegmentedControl`) | `invalid` prop → `data-invalid` DOM 속성(스타일은 `hub-tokens.css` 소유) |

### 5.4 기록창 상태 기계

```text
idle → editing(초안 저장 중) → validating → optimistic('저장 중' 카드 + 3.5초 되돌리기) → posting → saved | failed(입력 복원·재시도·복사)
                                                    ↘ undone(네트워크 없음)
```

- `requestId`는 `editing` 진입 시 생성, 재시도는 같은 id.
- `⌘Enter`는 `e.nativeEvent.isComposing`이면 무시.
- 닫기 가드: `posting` 중 닫기 차단, `editing`에서 닫으면 초안 보존 안내 없이 조용히 보존(다음에 열면 `초안 복구` 한 줄).

### 5.5 테스트

| 파일 | 내용 |
|---|---|
| `contact-record.test.mjs` | 채널×필드 매트릭스(카톡은 반응 미요구, `회신 받음`이면 요구; 미팅은 결정·막힌 조건 노출; 부재중 프리셋은 `no_response` 자동), payload 빌더(견적 채널이면 `quote` 포함, 그 외 `null`), 후속 3상태 |
| `contact-record-draft-store.test.mjs` | 같은 탭 복구, 다른 고객 키 격리, 저장 성공 시 삭제 |
| RPC v2 테스트 | 멱등(같은 request_id 2회 → 활동 1건), 대상 없음 → 롤백, needs 병합(중복 text 유지), quote → deal amount/items 갱신, next_action_source='operator' |

### 5.6 완료 기준

- CRM 세 페이지에 기록 폼이 **하나**만 import된다.
- 통화 기록 30초·메모 10초를 운영자가 실측(스톱워치, 3회).
- 같은 request_id 재시도가 중복을 만들지 않는다(테스트 + 수동 1회).

---

## 6. 수용 체크리스트 (0·1단계 전체)

- [ ] 주간 카드 `연락 N` = `crm_activities` 건수
- [ ] 고객 연락 버킷 필터·레일·행 클릭·최근 반응 줄이 동작
- [ ] 첫 화면 집중 고객 3행 문구가 서로 다름 · 진행 중 리드 포함
- [ ] 이관 스크립트 dry-run: 운영자 문장 패치 0건
- [ ] 세 진입점이 같은 섹션 세트 · 헤더에 점수·건강도 없음 · `위기` = 사건
- [ ] CRM 세 페이지 `SyncBadge` 0 · `불러오는 중…` 0 · 하드코딩 색 0 · `HealthDot` 0
- [ ] 기록 폼 1개 · RPC v2 멱등 · 초안 복구
- [ ] `npm test` 실패 0 · 스윕 3종 · state-usage
- [ ] 이 문서 각 PR 행에 커밋 해시

---

## 7. 위험과 롤백

| 위험 | 완화 | 롤백 |
|---|---|---|
| 0a 뒤 `recomputeLeadScores`가 다른 원천으로 점수를 흔든다 | 0단계에서 재채점 **실행 금지**(스펙 §8). 크론/버튼이 호출하면 `minDelta` 뒤에 숨는다 | 읽기 함수만 되돌리면 된다(쓰기 변경 없음) |
| 0c로 집중 고객이 0건이 된다(날짜 도래 리드가 없을 때) | `raise` 오버라이드가 날짜 없이도 뽑히게 함. 0건이면 첫 화면은 슬롯을 비운다(자리표시자 금지 — 심화 설계 §2) | 필터 한 줄 되돌리기 |
| 1a에서 Accounts 상세가 계정 전용 정보(MRR·contacts)를 잃는다 | ④돈·헤더에 계정 필드를 variant='panel'에서 유지 | 이전 `DetailPanel` 파일은 커밋 이력에 |
| 1b RPC v2 권한 회귀(복원 시 anon 실행 가능) | `npm run db:check` 7/7 통과를 완료 조건에 포함 | v1 경로가 남아 있어 route의 `version` 분기만 끄면 된다 |
| followups·F-3a 충돌 | 0b는 `followups-ledger.js`의 items 필드 **추가**만, 정렬·필터 규칙은 2a까지 손대지 않는다 | — |

---

## 8. 규모 감

0a 반나절 · 0b 1일 · 0c 반나절 · 1a 2~3일 · 1b 2~3일. 1단계 뒤 **5영업일 실사용**이 2단계의 게이트다(스펙 §7).
