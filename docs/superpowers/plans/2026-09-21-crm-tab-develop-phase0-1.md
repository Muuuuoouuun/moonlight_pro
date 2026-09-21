# CRM 탭 디벨롭 — 0·1단계 실행 계획 (파일 단위)

> 상태: **DRAFT · 실행 대기.** 2026-09-21 오후: 실행 범위를 §0-min 최소 세트로 축소(운영자 "기본만" 판단). [스펙 v0.2](../specs/2026-09-21-crm-tab-develop-design.md) §7의 0단계 PR 3개와 1단계 PR 2개를 파일·함수·테스트·완료 기준까지 내린 문서다. 스펙의 권장 기본값(§9 Q138~Q146)이 뒤집히지 않는다는 전제로 쓴다. 이 문서는 구현 기록이 아니다 — 착수 후 각 PR의 실측·커밋을 아래 표에 채운다.
> 작성일: 2026-09-21 · 브랜치 `09.bigmac1.02` · HEAD `d8e2abe`
> 전제: 활성 1순위는 여전히 09-03 성장 기획서 F-0(초안 크론 수리)이다. 0단계 3개 PR은 F-0이 만지는 파일(`apps/hub/app/api/cron/*`, `apps/engine/app/api/ai/*`, `automations-ledger.js`, `daily-brief.jsx` 승인 카드)과 겹치지 않아 병행할 수 있다. 여러 파일에 걸친 작업이므로 CLAUDE.md 규칙대로 **전용 worktree**(`git worktree add ../moonlight_pro-crm-p0 -b claude/crm-tab-p0`)에서 시작하고 병합 뒤 `git worktree remove`까지 마친다. `git add -A` 금지 — 만진 파일만 명시 경로로.

---

## 0-min. 최소 세트 (스펙 §0.5 · 2026-09-21 오후) — 지금 실행하는 범위

운영자의 "기본만" 판단에 따라 **실행 범위를 아래 4개로 줄인다.** 나머지 PR(1a 전체, 1b의 RPC v2·초안 저장소·세 폼 제거)은 5영업일 실사용 뒤 필요가 증명되면 꺼낸다.

| 순서 | 항목 | 이 문서의 절 | 축소 내용 |
|---|---|---|---|
| 1 | 기록 저장소 통일 + 반응 표시 | §1 PR-0a + §2.1의 `ActivityTimeline` 반응 뱃지 | 그대로 |
| 2 | 오늘 연락 행 살리기 + 2단 정렬 | §2 PR-0b | `bucket/href/lastNote/lastReaction` 생산은 그대로. **추가**: `buildFollowupItems` 결과를 `promise_missed → due today → 나머지(접힘)` 세 묶음으로만 나누는 `groupFollowups(items, todayKey)` 순수 함수(+테스트). 5층 `rankFollowups`는 만들지 않는다 |
| 3 | 컨택 시트 전역화 | §5 PR-1b **축소판** | `ContactOutcomeSheet`를 `Drawer presentation="compact"`로 감싼 `ContactRecordDrawer`(파일 1개)로 승격하고 큐 행·고객 목록 행·첫 화면 집중 고객 행·Leads 편집 드로어에서 연다. 통화·미팅·방문만 반응 필수(`reactionRequired(kind)` 순수 함수 + 테스트), 카톡·메모는 원문만. 요약 `maxLength` 120 → 500. 선택 `원문 붙여넣기`는 저장 성공 뒤 `note` 활동으로 2차 저장(비원자 — 실패 시 텍스트 보존·재시도·복사). **RPC v2·마이그레이션·초안 저장소·세 폼 제거는 하지 않는다**(followups의 인라인 `LogForm`은 드로어로 대체, `QuickLog`·`LogComposer`는 남겨 둔다) |
| 4 | 집중 고객 조건 교정 + 이관 가드 | §3 PR-0c | 그대로 |

**2차 지시(2026-09-21 오후) — 넛지 엔진.** 스펙 §0.5 "넛지로 유도·연결". 실행 순서는 `0a → 3(시트 전역화) → N1 → N2 → N3 → N4`, 그다음 2·4.

| 순서 | 항목 | 파일 | 테스트 |
|---|---|---|---|
| N1 | **캘린더 접점** — 매칭·분류·미기록 판정 | **신설** `apps/hub/lib/sales-os/calendar-touchpoints.js`(`matchEventToCustomers`·`classifyCalendarTitle`·`findUnrecordedMeetings` — 순수; 규칙은 `scripts/enrich-eeocrm-leads.mjs`에서 옮기고 스크립트는 import) | `calendar-touchpoints.test.mjs`: ≥3자 매칭·미매칭·`next_meeting.eventId` 확정·`[start−2h, end+24h]` 경계·KST |
| N2 | **넛지 엔진** — 계기 8종, 고객당 1개, 억제 적용 | **신설** `apps/hub/lib/sales-os/crm-nudges.js`(`buildCrmNudges({ leads, deals, activities, events, memos, suppressions, todayKey })` → `[{ ruleId, triggerKey, subject, severity:'act'|'organize'|'recap', title, reason, action:{ kind, prefill }, escape[] }]`, 순수 `@/` 없음) · **신설** `apps/hub/lib/repositories/crm-nudges-source.js`(리드·딜·최근 30일 활동·지난 3일 캘린더·정리 안 된 메모 30건 읽기 — 실패 소스는 `failedSources`) · 억제 저장: `revenue-write.js` `buildLeadWrite/buildDealWrite`에 `nudges` metaPatch(`{ [triggerKey]: { snoozedUntil, dismissed, at } }`) · 미매칭 일정 "고객 아님"은 `apps/hub/lib/crm-nudge-mute.js`(`my-work-mute.js` 복제, 키 `mlp.crm.nudge-muted`) | `crm-nudges.test.mjs`: 계기별 참/거짓·우선순위(숨긴 뒤 낮은 계기 미노출)·triggerKey가 제목 변경에 안정·억제 만료·고객당 1개 |
| N3 | **표시 3곳** | `daily-brief/route.js`에 `buildCrmNudgeSignals`(kind `CRM`, 최대 3, `withoutFocusDuplicates` 뒤) + `daily-brief.jsx` decisions에 `record` 액션(시트 프리필 열기) · `followups.jsx` 상단 `먼저 정리할 것`(severity `act`) + 접힌 `정리`(organize) · `daily-review.jsx` 컴포저 위 `오늘 정리할 것 N` 목록(organize + 미기록 미팅) · 넛지 카드는 `discovery-nudge.jsx`를 `subject` 기반으로 일반화한 `apps/hub/components/hub/crm-nudge.jsx` | `state-usage`·`motion`·`focus-ring` 스윕 · 카드 순수 매핑 테스트(넛지 → 신호 카드 필드) |
| N4 | **메모 → AI 후보** (`memo_unlinked`의 연결 행동) | Engine `pattern-analysis.ts` goal `contact-record`(입력: 메모 본문 + 고객명 후보 ≤50; 출력 `{customerName, customerId?, kind, summary, reaction, nextAction, nextAt, needs[]}`; 스키마 벗어나면 후보 없음) · Hub `journal/analyze` goal 통과 · **신설** `apps/hub/components/hub/contact-record-candidate.jsx`(후보 카드 → 시트 프리필) · 사용량: 응답 `usageMetadata`를 `agent_runs`에 남기고 월 합계 표시 | Engine 파서 테스트(스키마·고객명 매칭·미매칭 `customerId:null`) · 후보→시트 프리필 매핑 테스트 |

`weekly_recap`은 기존 주간 카드(`getWeeklyReport`)에 `touchpoints`(기록+캘린더, 고객·날짜·종류 중복 제거) 필드를 더해 그린다 — 새 카드 없음.

완료 기준은 스펙 §0.5의 세 숫자(놓친 약속 0 · 기록 건수 = 연락 수 · 기록 30초)다.

## 0. 범위와 순서

| PR | 이름 | 규모 | 의존 | 마이그레이션 | 상태 |
|---|---|---|---|---|---|
| 0a | 집계 원천 통일 | S | — | 0 | **완료** `282572a` (worktree `claude/crm-nudge-p0`, npm test 1512 · 실패 0) |
| 0b | 연락 행 살리기 + 2단 정렬 | M | 0a | 0 | **완료** `1a67949` (npm test 1529 · next build 통과) |
| 0c | 집중 고객 후보 교정 + 이관 가드 | S | — | 0 | **완료** `d4b57b5` + 보강 `1879595`(시트 템플릿 계열·빈 상태 카피, npm test 1537) |
| 1a | 고객 상세 섹션 세트 | L | 0b | 0 | 대기 |
| 1b | 통합 기록창 + RPC v2 | L | 1a | **1**(함수) | 대기 |

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

- `activityState ∈ {loading, live, partial, preview, error}`. `loading` → 섹션별 `Skeleton`. `error` → ⑤에만 오류 + 재시도, ①③④는 데이터로 산다. `preview` → `TruthBadge preview` 한 번(헤더).
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

## 5-실행. 0단계 실행 기록 (2026-09-21, worktree `claude/crm-nudge-p0`)

세 PR 모두 `npm test` 실패 0 + `next build` 통과로 닫았다. 계획과 달라진 곳만 적는다.

| 항목 | 계획 | 실제 | 이유 |
|---|---|---|---|
| KST 날짜 헬퍼 | `attention-ledger`의 `dateKey`·`bucketFor`를 export로 승격해 import | **`apps/hub/lib/kst-day.js` 신설**, attention-ledger·daily-focus·followups-ledger가 모두 여기서 import | followups-ledger가 attention-ledger를 import하면 tasks·revenue·calendar·inquiries 읽기가 통째로 딸려온다. 사본은 원래 2개(attention·daily-focus)였고 이제 0개 |
| 묶음 계약 위치 | `followups-ledger.js`에 `groupFollowups` | **`apps/hub/lib/sales-os/followup-groups.js` 신설**(순수, import 0) | 페이지가 저장소 모듈을 import하면 `server-read`/`server-write`가 클라이언트 청크로 끌려온다 |
| 집중 고객 후보 | 날짜 도래(+3일) **또는** raise를 필수 | 날짜 없는 실제 약속도 후보로 두되 **정렬에서 뒤로** | 날짜를 필수로 하면 첫 화면이 빈 채로 시작한다. 기존 정렬 계약 테스트 4건이 무수정 통과하는 것도 이 형태 |
| `rejected_open` 제외 | 0c 범위 | **미적용** | 위기 판정(`deriveCustomerRisk`)이 생기는 1a에서 붙인다 |
| 예상 밖 수리 | — | 활동 종류 `kind` 화이트리스트가 9종이라 `kakao`·`quote`·`ai`가 `update`로 접혀 저장되고 있었다(0016 CHECK는 12종) | 0a에서 함께 교정 |
| 예상 밖 수리 | — | 행에 `companyId`가 없어 활동 조회가 `lead_id`로만 나갔다 — 라이브 기록은 110행 중 109행이 `company_id`라 사실상 전 행이 "기록 없음"이었다 | 0b에서 함께 교정 |
| 테스트 갱신 | — | `state-usage.test.mjs`의 레일 계약을 `BUCKET_STRIPE` 리터럴 고정에서 **예산 규칙**(`rail` prop + `MAX_DANGER_RAILS`)으로 교체 | 레일이 상수에서 프로퍼티로 옮겨갔다 |

**아직 확인하지 않은 것**: 운영 데이터로 화면을 띄워 본 검증. 수용 체크리스트의 1~6번은 전부 실사용 확인이 필요하며, 현재까지는 단위 테스트와 컴파일만 통과했다.

## 5-실측. 운영 DB 확인 (2026-09-22, 읽기 전용 · dev :3050)

메인 워크트리의 `.env.local`로 워크트리 dev 서버를 띄워 서울 운영 DB를 **읽기만** 했다. 쓰기·재채점·스크립트 실행은 하지 않았다.

| 항목 | 실측 | 뜻 |
|---|---|---|
| `crm_activities` 전체 | **115행** | 실제 연락 기록 |
| `outreach_outcomes` 전체 | **3행** | 0a 이전에 주간 리포트·큐 점수가 읽던 테이블 |
| 활동 연결 | `account_id` 112 · `company_id` 109 · `deal_id` 3 · **`lead_id` 0** | 0b의 `companyId` 수리가 없으면 활동 패널이 사실상 항상 "기록 없음" |
| 활동 `reaction` | **115행 전부 null** | 컨택 시트(원자 RPC) 경로가 아직 한 번도 쓰이지 않았다. 반응 표시(0a)·`lastReaction`(0b)은 운영자가 그 폼을 쓰기 시작해야 보인다 |
| 활동 `kind` | call 64 · visit 27 · update 15 · meeting 6 · demo 3 (kakao·quote 0) | 0a가 고친 9종 화이트리스트가 kakao/quote를 `update`로 접던 흔적과 일치 |
| 최근 활동 | **2026-08-06**이 마지막 | 최근 7일 기록 0건 — 주간 "연락 N건"은 양쪽 원천 모두 0이라 이 숫자만으로는 0a를 증명할 수 없다. 115 vs 3이 증거다 |
| 리드 | 117건 · `next_action` 117건 · **`next_action_at` 0건** | 약속 날짜가 하나도 없다. 그래서 고객 연락 큐가 비어 있고(컷오버 2026-08-06), 묶음 섹션은 실데이터로 아직 못 봤다 |
| `next_action` 내용 | 이관 템플릿 16 · **시트 동기화 템플릿 101** · 운영자 문장 0 | 0c가 놓쳤던 **두 번째 템플릿 계열**을 여기서 발견해 `1879595`로 보강 |
| 소유권 | `owner_scope=junhyuk` 16건 | 집중 고객 후보가 될 수 있는 모집단이 16건뿐이고 그 16건이 전부 템플릿 |

**화면 확인**: 고객 연락에서 버킷 필터 4개가 사라지고 레인만 남았다(0b 반영). 첫 화면 집중 고객은 템플릿 5행 → **0행**이 되고 새 빈 상태 카피 + `리드 목록에서 약속 남기기` CTA가 렌더된다. 첫 화면 스펙 D3(633px가 같은 문장 5번)은 이로써 사라졌지만, **대신 슬롯이 빈다** — 운영자가 약속을 적기 시작해야 채워진다.

**아직 못 본 것**: 고객 연락의 세 섹션(먼저 정리할 것 / 오늘 / 지켜보는 고객)과 danger 레일 예산은 실데이터에 해당 행이 0건이라 단위 테스트로만 확인했다. 실제로 보려면 리드 한 건에 다음 연락일을 적어야 하고, 그건 운영 DB 쓰기라 운영자 확인이 필요하다.

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
