# CRM 탭 디벨롭 기획 — 연락 · 미팅 내용 · 기록 · 매출 · 니즈 · 위기

> 상태: **DRAFT v0.2 · 권장안(운영자 확정 전) · 적용 준비**. **2026-09-21 오후 추가: §0.5 최소 접근** — 운영자의 "기본만" 질문에 대한 답. §4~§5의 큰 설계는 보류 목록이고, 지금 실행 범위는 §0.5의 최소 세트다. v0.1(2026-09-21 오전)을 운영자 지시 "더 디벨롭해서 적용하자"에 따라 같은 날 2차로 다시 썼다. v0.1의 진단·방향은 유지하되 (1) 코드를 함수 단위로 다시 읽어 **틀렸던 사실 2건을 정정**하고 **새로 확인한 결함 5건을 추가**했으며, (2) 화면·데이터·정렬을 구현 가능한 계약(필드·함수 시그니처·상태별 화면·카피)까지 내렸고, (3) 미정이던 질문 전부에 **권장 기본값**을 달아 "반대 없으면 이걸로 진행"할 수 있게 했다. 0·1단계의 파일 단위 실행 계획은 [`plans/2026-09-21-crm-tab-develop-phase0-1.md`](../plans/2026-09-21-crm-tab-develop-phase0-1.md)에 분리했다.
> 작성일: 2026-09-21 (Asia/Seoul) · 브랜치 `09.bigmac1.02` · HEAD `d8e2abe`
> 상위 정본: [`docs/README.md`](../../README.md) 우선순위 → [운영자 프로필](../../operator-workflow-profile.md) → [개인 운영 OS 심화 설계](2026-07-13-moonlight-personal-operator-os-deep-design.md) → 주제별 최신 스펙.
> 관계:
> - [CRM 기록·리드 스코어링·넛지 운영 지침](2026-09-13-crm-recording-and-lead-scoring-guidelines-design.md)(v0.2)을 **상속한다.** §3 입력 계약(메모/연락 결과 분리·후속 3상태·빠른 버튼 4개·템플릿 3개·저장 신뢰 7항), §5 세 축, §6 화면 순서, §8 정렬 원칙, §9 넛지를 대체하지 않는다. 이 문서는 그 지침이 좁혀 둔 세 화면을 CRM 탭 전체와 여섯 축으로 넓히고, 지침이 "구현 전"으로 남긴 부분을 계약으로 내린다. 두 문서가 어긋나면 지침의 원칙이 이긴다.
> - [개인 워크플로우 OS 세 축·Action KPI 기획](2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md) §6.3·§6.4의 "집계 원천 교정"과 "딜 단계 이동 한 줄"은 이 문서 0단계와 **같은 변경**이다 — 먼저 하는 쪽이 하고 다른 쪽은 참조한다. 09-03 성장 기획서의 F-0 → F-1 → F-3/F-3a 순서는 그대로 유지한다.
> - [첫 화면 디자인 디벨롭](2026-09-21-home-screen-design-development.md)(같은 날, 병렬 세션)과 **짝이다.** 그 문서의 D3(집중 고객 5행이 전부 필러)의 **원인**을 이 문서 §2 P7이 코드에서 찾았고, 그 문서의 Q135(집중 고객 행 내용)는 이 문서 §4.8이 같은 답을 낸다.
> - [성장 기획서](2026-09-03-sales-content-marketing-to-branding-growth-plan.md) F-3a(소스 배지·24h 레일·정렬 규칙)는 §4.6 계층 안의 **층 내 정렬**로 그대로 쓴다.
> - DESIGN.md를 대체하지 않는다. §6은 기존 토큰·프리미티브 안에서만 움직인다.
> 근거: 로컬 읽기 전용 조사 — `apps/hub/components/hub/pages/{revenue,customers,followups,inquiries,discovery,daily-brief}.jsx`, `apps/hub/components/hub/{hub-primitives,related-memos,journal-links,hub-nav,hub-data}.js(x)`, `apps/hub/lib/repositories/{revenue-ledger,followups-ledger,crm-activities,outcomes-ledger,weekly-report,attention-ledger}.js`, `apps/hub/lib/sales-os/{followup-scoring,lead-enrichment,lead-view,contact-tracking,snooze,revenue-write,stalled-scan}.js`, `apps/hub/lib/{deal-stages,daily-focus,operator-revenue-scope,personal-revenue-roadmap}.js`, `apps/hub/app/api/hub/{followups,revenue/activity,revenue/contact-outcome}/route.js`, `scripts/enrich-eeocrm-leads.mjs`, `supabase/migrations/{0008,0014,0015,0016,0018}`, `supabase/schema.sql`; `classinkr-web` `origin/home_v4.2`의 `components/admin/crm/{CrmSubnav,Customer360DetailClient,Customer360Drawer,rail/ActivityQuickForm,rail/activity-contract,leads/board/ContactLogForm}.tsx`, `lib/crm/{priority,contact-log,customer-health,coverage,capture/parsers}.ts`.
> 하지 않은 것: 코드 변경, 마이그레이션, 운영 DB 조회, 실제 건수 확인, 배포 상태 확인, 외부 발송. 수치 제안은 전부 **승인 전 정책 후보**다. 본문의 고객 예시는 전부 합성이다.

---

## 0. 한 장 요약 (v0.2)

**결론 한 줄(v0.1 유지): CRM 탭은 객체별 표면으로 쪼개져 있고, 운영자가 중요하다고 말한 여섯 축은 어느 표면에도 정본이 없다.** v0.2가 더한 것은 "왜 그렇게 됐는가"의 코드 증거와 "그래서 정확히 무엇을 바꾸는가"의 계약이다.

### 여섯 축 — 현재 (v0.2 갱신)

| 축 | 현재 | v0.2에서 확인한 근거 |
|---|---|---|
| 연락 | **있다·정렬 반대·행 절반 죽음.** 원자 저장·되돌리기·프리셋은 완성. 정렬은 무접촉 우선. 행 컴포넌트가 다른 데이터 소스의 아이템 모양을 기대해 **버킷 필터·지남 레일·행 클릭·최근 반응 줄이 렌더되지 않는다** | `followups.jsx` `FollowupRow`가 `item.bucket/href/lastNote/lastReaction`을 읽는데 `getFollowups`(`followups-ledger.js`)는 그 필드를 만들지 않는다. 그 필드를 만드는 곳은 `attention-ledger.js`뿐 |
| 미팅 내용 | **부분.** 종류는 있고 내용 자리가 없다 | `record_contact_outcome_v1`: `summary`(1줄)·`reaction`·`next_action`만. 프로필 §11의 결정사항·우려·관심 신호 자리 없음 |
| 기록 | **분열.** UI는 `crm_activities`, 주간 리포트·큐 점수는 `outreach_outcomes` | 심화 설계 §10은 Phase 1C를 `outreach_outcomes`+멱등키+할 일 완료/생성으로 정의했는데, 실제 0018 RPC는 `crm_activities`만 쓰고 멱등키·할 일이 없다. **설계와 구현이 갈라진 지점이 분열의 뿌리**다 |
| 매출 내용 | **금액 한 숫자.** | `deals`: `amount`·`stage`·`expected_close_at`·`meta.stage_detail`. 프로필 §6의 HW/SW·수량·결제·종료 결과·재문의 없음 |
| 니즈 | **없다.** | `leads.meta.situation` 자유 텍스트 1칸. 고객 상세 첫 줄에 나오지 않음 |
| 위기 | **거의 없음 + 잘못된 것 1개.** | `reaction`(우려·거절·무응답) 읽는 곳 0. 대신 고객 DB의 `이탈위험` 세그먼트가 **리드 점수 < 40**(`scoreBand`)이고 danger 톤 — CRM 지침 §6.3이 금지한 바로 그 오용 |

### v0.2에서 새로 확인한 결함 5건 (전부 코드로 검증)

1. **고객 연락 행의 절반이 죽어 있다.** 위 표. 버킷 `지남/오늘/이번 주` 카운트는 항상 0이고 선택하면 빈 화면, `overdue` 레일은 한 번도 그려지지 않으며, 이름이 클릭되지 않아 활동 패널은 `e` 키나 `?focus=` 딥링크로만 열린다.
2. **첫 화면 집중 고객은 기존 고객(`won`)만 뽑는다.** `selectOperatorFocusLeads`(`operator-revenue-scope.js`)가 `priorityLane === 'customer_success'`만 통과시키고, 그 lane은 `lead-enrichment.js` `resolvePipelineLane`에서 `status === 'won'`일 때만 붙는다. 진행 중인 리드(new/qualified/nurturing)는 **구조적으로 집중 고객이 될 수 없다.** 프로필 §8 정의("전환 가능성이 높아 지금 연락해야 하는 고객 수")와 반대다. 첫 화면 스펙 D3(5행 전부 필러)의 원인이 이것이다.
3. **이관 스크립트가 `leads.next_action`을 템플릿으로 채우고, 재실행 시 운영자가 고친 값을 되돌린다.** `buildJunhyukLeadEnrichment`의 `patch.next_action = resolveNextAction(...)`(템플릿 5종)이고, `scripts/enrich-eeocrm-leads.mjs`는 `lead.next_action !== built.patch.next_action`이면 `changed`로 판정해 덮어쓴다. "다음 행동"이 운영자 약속이 아니라 필러인 행이 다수 존재할 수 있다.
4. **위험 라벨의 유일한 원천이 점수 밴드다.** 고객 DB `SEGMENTS.risk` = `scoreBand(score) === 'risk'`(<40), Accounts `resolveHealth` = `health_score < 40 → risk`, 둘 다 danger 톤. 사건(거절·우려·약속 파기)이 아니라 숫자가 빨강을 결정한다.
5. **심화 설계 §10의 투영 규칙이 위기 신호를 지운다.** §10은 `positive/neutral/concern/rejected → replied`로 접어 `outreach_outcomes.action`에 넣도록 했다. 그 규칙대로면 `concern`·`rejected`가 `replied`로 뭉개져 **위기 축을 만들 원재료가 사라진다.** 따라서 학습 데이터을 `outreach_outcomes`로 되돌리는 길은 닫고, `crm_activities`를 단일 정본으로 확정하는 것을 권장한다(§9 Q144).

### v0.1 정정 2건

- "메모와 활동이 서로 보이지 않는다"는 **틀렸다.** 고객 360 드로어에 `RelatedMemos`(연결된 메모 3건)와 `MemoCaptureLink`가 이미 있다. 맞는 표현은 "메모는 별도 섹션이고 활동 타임라인과 한 줄기로 섞이지 않으며, 고객을 넘나드는 기록 렌즈가 없다"이다.
- "Q117 ①(트래킹 표시 고객)이 구현돼 있다"는 **절반만 맞다.** 구현된 것은 `workspaces.meta.contact_tracking_started_at` **워크스페이스 컷오버 시각** 하나다 — 그 이후 생성된 리드·딜 전부가 대상이 되며, 고객별 "트래킹 시작" 행동은 없다. followups 빈 화면 카피("리드 목록에서 트래킹을 시작하면")가 가리키는 버튼은 존재하지 않는다.

### 권장 방향 (v0.1 유지) + 이번에 확정 요청하는 결정 3건

- **정본 1 + 렌즈 3**: 고객 상세(여섯 축) · `오늘 연락` · `기록`(신설) · `돈`. 기록창은 하나.
- **결정 A(Q144)**: 활동 정본은 `crm_activities` 하나. 주간 리포트·큐 점수가 이것을 읽는다. `outreach_outcomes`는 외부 integrations 라우트 전용으로 남긴다(삭제하지 않음).
- **결정 B(Q145)**: 첫 화면 집중 고객 후보 조건을 `won`-only에서 CRM 지침 §8.3 조건(미종결 + 다음 행동 + 날짜 도래 또는 수동 상향)으로 바꾼다.
- **결정 C(Q146)**: 이관 스크립트는 운영자가 편집한 `next_action`을 덮어쓰지 않는다(`meta.next_action_source`로 구분).

**마이그레이션**: 테이블·컬럼 변경 **0**. 새 RPC 함수 1개(`record_contact_outcome_v2`, §5.3) = 마이그레이션 파일 1개. 그 외는 전부 `meta`와 코드다.

---

## 0.5 최소 접근 — "기본만 해도 된다"에 대한 답 (2026-09-21 오후 · 권장)

운영자 질문: *말이 CRM이지 아주 기본만 해도 큰 문제 없어 보이는데, 어떻게 접근해서 핵심에 집중하고 편리하게·유실 없이·빠르게 관리할 수 있나.*

**답: CRM을 만들지 않는다. "약속 기록"을 지킨다.** 운영자에게 매일 필요한 것은 세 가지뿐이다 — 오늘 누구에게 연락하나 · 연락 뒤 30초 기록 · 놓친 약속이 몇 건인가. 나머지(점수·세그먼트·계정·케이스·히트맵·니즈 칩·위기 엔진·돈 필드)는 필요할 때 찾아보는 참고 데이터다. §4의 큰 설계는 그 참고 데이터를 위한 것이고, **지금은 안 만들어도 된다.**

### 원칙 4개

1. **정본은 하나 — 약속.** `next_action`(무엇) + `meta.next_action_at`(언제) + `dormant`(기약 없음). 이미 원자 RPC가 쓴다. 고객 프로필·점수는 이 약속의 부속 정보다.
2. **입력은 사건 직후 한 번, 같은 폼.** 기존 `ContactOutcomeSheet`(요약·반응·다음 행동 프리셋·기약 없음·되돌리기)가 이미 최소 기록의 90%다. 새 기록창을 만들지 않고 이 시트를 **어디서든**(큐 행·목록 행·첫 화면 행·폰) 같은 compact Drawer로 연다.
3. **화면은 하나 — 오늘 연락.** 위 = 놓친 약속, 그 아래 = 오늘 약속, 나머지는 접힘. 다른 고객은 검색으로 찾는다.
4. **유실 방지는 UI가 아니라 계약.** 원자 저장·입력 복원·빈 다음 행동 경고는 이미 있다. 빠진 것은 "놓친 약속이 사건으로 보이는 것"과 "원문을 잃지 않는 붙여넣기 칸" 둘이다.

### 최소 세트 — 2~3일

| 순서 | 무엇 | 왜 | 규모 | 실행 계획 대응 |
|---|---|---|---|---|
| 1 | 기록 저장소 통일 + 반응 표시 | 남긴 기록이 주간 숫자·큐에 0으로 나오는 것부터 끝낸다 | 반나절 | PR-0a |
| 2 | 오늘 연락 행 살리기 + **2단 정렬**(놓친 약속 → 오늘 약속 → 나머지 접힘) | 죽은 필터·레일·클릭을 살리고, Q117·Q120·Q121을 화면 하나로 | 1일 | PR-0b(+2a의 0·1층만) |
| 3 | 컨택 시트 전역화 | 시트를 compact Drawer로 감싸 큐·목록·첫 화면·폰(바텀 시트)에서 같은 폼. 통화·미팅만 반응 필수, 카톡·메모는 원문만. 선택 `원문 붙여넣기` 칸(요약 120자 → 500자, 원문은 `note` 활동으로 같이 저장 — 비원자이지만 실패 시 텍스트 보존·재시도) | 1일 | PR-1b의 1/5 |
| 4 | 첫 화면 집중 고객 조건 교정 + 이관 가드 | 진행 중 리드가 집중 고객이 되게, 템플릿이 약속인 척 못 하게 | 반나절 | PR-0c |

**만들지 않는 것(지금은).** 고객 상세 7섹션(§4.2) · 니즈·막힌 조건 칩(§4.4) · 위기 엔진 5사건(§4.4 — 놓친 약속 1사건만 2번에 포함) · 돈 필드(§4.5) · IA 재배치·기록 렌즈(§4.1·§4.7) · RPC v2(§5.3) · 붙여넣기 캡처(4단계). 전부 §4·§5에 남겨 두고, **5영업일 실사용 뒤** 아래 판단 기준에서 필요가 증명된 것만 꺼낸다.

### 넛지로 유도·연결 — 운영자 2차 지시(2026-09-21 오후, "넛지 시스템") · 권장

지시: *넛지 시스템을 통해 — 최근·이번 주에 연락한 것이 요약 표시되고, 메모를 AI로 정리하고, 캘린더와 연결해 입력을 잊었을 때 체크되게. 행동(액션) 위주로 요약 탭이나 정리에 표시. 최대한 유도하고 연결 짓는 것이 포인트.*

**답: CRM 화면을 더 만드는 대신, 기회 탐색에 이미 있는 넛지 계약을 고객 기록에 그대로 적용한다.** 넛지 하나 = `계기 → 한 줄 이유 → 연결 행동 1개(미리 채워진 시트) → 탈출구(미루기·숨기기)`. 새 입력은 없고, 있는 연결(캘린더·메모·내 기록·Engine AI)이 계기를 만든다.

**재사용하는 부품(전부 코드에 있음).**

| 부품 | 어디 | CRM에서 쓰는 방식 |
|---|---|---|
| 넛지 규칙 계약 `ruleId · triggerKey(내용 지문, 제목 무관) · 한 개만 제안 · 우선순위 뒤 억제` | `2026-09-13-discovery-nudge-design.md`, `read_discovery_nudge_v1` | 규칙은 **JS 순수 함수**로(SQL 엔진은 기회 탐색 전용 컬럼에 묶여 있음), 계약은 동일 |
| 억제 UI `미루기(명시 날짜) · 이 제안 숨기기 · 해제 · 다른 탭 동기화 · 충돌 시 최신 제안` | `discovery-nudge.jsx` | 컴포넌트를 고객 기록용으로 일반화(`record` → `subject`) |
| 억제 저장 | `discovery_nudge_states`(기회 전용 RPC) | **마이그레이션 0**: 고객·딜은 `meta.nudges[triggerKey] = {snoozedUntil, dismissed, at}` — `persistRevenueRecord`가 기존 meta를 읽고 병합하므로 안전. 고객 매칭이 안 된 캘린더 일정의 "고객 아님"만 브라우저 저장(`my-work-mute.js`와 같은 계층) |
| 첫 화면 신호 카드 `{id, subject, tone, kind, title, summary, meta, source, decisions[]}` | `daily-brief/route.js` `build*Signals`, `withoutFocusDuplicates` | CRM 넛지를 같은 피드의 항목으로 넣는다(`kind:'CRM'`). 확정 슬롯이 이미 보여준 고객은 자동 제외 |
| 캘린더 읽기 + 고객 매칭 + 제목 분류 | `readCombinedGoogleCalendarEvents`, `scripts/enrich-eeocrm-leads.mjs`의 `aggregateActivity`·`classifyCalendarTitle` | 매칭 규칙(정규화 고객명 ≥3자가 제목+장소에 포함, `next_meeting.eventId`면 확정)을 `calendar-touchpoints.js`로 옮김 |
| 메모 AI 전송 경로 | `journal/analyze → Engine pattern-analyze`(requestId·goal·≤10건·Gemini·usageMetadata) | goal `contact-record` 분기 하나 |
| 컨택 시트 | `ContactOutcomeSheet` | 모든 넛지의 **연결 행동**이 이 시트를 미리 채워 연다 |

**계기 목록(v1 · 고객당 1개, 위가 우선).** 표시 위치: `행동`은 오늘 연락 상단·첫 화면 신호, `정리`는 하루 리뷰(저녁)·오늘 연락 접힌 섹션.

| ruleId | 계기(무엇을 봤나) | 한 줄 이유(운영자 목소리) | 연결 행동(미리 채움) | 탈출구 | 종류 |
|---|---|---|---|---|---|
| `meeting_unrecorded` | 캘린더 일정이 고객과 매칭되는데 `[시작−2h, 종료+24h]`에 기록 없음 | `어제 한빛학원 미팅 — 기록이 없어요` | [기록 남기기] 시트 `미팅·시각·고객` | [취소·노쇼] `meta.calendar_outcomes[eventId]` · [고객 아님] | 행동 |
| `promise_missed` | `next_action_at < 오늘` ∧ 그 뒤 기록 없음 | `금요일에 견적서 보내기로 했어요 · 2일 지남` | [기록 남기기] / [날짜 다시] 프리셋 | 미루기(명시 날짜) | 행동 |
| `promise_due` | `next_action_at ≤ 오늘` | `오늘 연락하기로 한 고객` | [연락하기] 시트 채널 프리필 | 미루기 | 행동 |
| `reaction_open` | 최근 기록 반응 `우려/거절` 뒤 후속 없음 | `"가격 부담" 말한 뒤 정리 안 됨` | [후속 정하기] | 숨기기(triggerKey) | 행동 |
| `no_next_action` | 열린 딜·트래킹 고객이 마지막 기록 뒤 다음 행동 없음 | `다음 행동이 비어 있어요` | [정하기] `내일·3일·다음 주·기약 없음` | 숨기기 | 정리 |
| `memo_unlinked` | 메모 본문에 고객명(≥3자)이 있는데 고객 연결·기록 없음 | `이 메모, 한빛학원 이야기 같아요` | [기록으로 정리] AI 후보 → 시트 프리필 / [연결만] `journal_links` | [아님] | 정리 |
| `dormant_recheck` | 기약 없음 30일 경과 | `한 달 지났어요 — 다시 볼까요?` | [시점 정하기] | 미루기 | 정리 |
| `weekly_recap` | 월·목 아침 | `이번 주 연락 12건 · 고객 7명 · 기록 안 남긴 미팅 2` | [미기록부터 정리] | — | 요약 |

**규칙.** 고객당 넛지 1개(최고 우선순위 계산 뒤 억제 — 숨긴 직후 낮은 것이 대신 튀지 않음) · 첫 화면 최대 3개, 나머지는 오늘 연락·하루 리뷰 · 같은 사건·같은 누락은 세션 1회(CRM 지침 §9) · 미루기는 활동 기한을 몰래 바꾸지 않음 · 버튼 열기만으로 해소 처리하지 않음 · 저장은 항상 시트(서버 확인 뒤 저장됨) · 자동 발송·자동 완료 없음 · AI는 버튼·배치, 후보는 확인 뒤 저장, 사용량 표시.

**정직한 한계.** 카톡·전화는 API가 없어 계기가 안 생긴다(메모·시트가 안전망). 캘린더 제목에 고객명이 없으면 매칭 실패 — (a) 고객·할 일에서 일정 만들 때 `[조직명] 고객명 · 목적` 자동 제목(`createOrUpdateGoogleCalendarEvent` 있음), (b) 매칭 안 된 일정에 [고객 연결] 한 번 → `eventId→customer` 저장.

### 5일 실험과 판단 기준

최소 세트로 월~금을 굴리고 세 숫자를 본다 — 놓친 약속 건수(목표 0) · 하루 기록 건수(연락 수와 같아야 함) · 기록 1건 소요(30초 이내). 셋이 맞으면 CRM은 끝난 것이다. 안 맞는 항목이 §4의 어느 설계로 풀리는지 그때 고른다. 09-03 기획서가 진단한 최상위 약점이 기능 부족이 아니라 **사용 부재**이므로, 기능을 더 얹기 전에 이 5일이 먼저다.

## 1. 여섯 축 — 코드 지도 (v0.2)

### 1.1 연락

| | 내용 | 근거 |
|---|---|---|
| 있다 | 큐(`getFollowups`) — 리드 300·딜 300·회사·outreach 500을 읽고 정체/날짜 도래로 유입 판정, Q117 ①(컷오버 윈도)·②(`meta.next_action_at` 도래, 윈도 밖도 유입)·④(정체) 구현. 스누즈(`meta.snooze_until`), 휴면(`dormant`). 원자 RPC + 3.5초 되돌리기 + 실패 시 입력 복원 + 요청 id로 늦은 응답 무시 | `followups-ledger.js`, `snooze.js`, `followups.jsx` `persistLog/submitLog/undoLog` |
| 충돌 | 정렬 `priorityFor = staleness×10 + value + boost`. Q117 ③(단계)은 유입 조건에도 정렬에도 없다 | `followup-scoring.js` |
| 죽음 | `FollowupRow`가 읽는 `bucket`·`href`·`lastNote`·`lastReaction`·`whenLabel`·`kind==='event'`를 `getFollowups`가 만들지 않는다(그 모양은 `attention-ledger.js`의 것) | `followups.jsx` 287~370행 vs `followups-ledger.js` items push |
| 없다 | 채널↔결과 규약(카톡에도 반응 5종 필수), "내가 약속을 어겼다"는 사건 | — |

### 1.2 미팅 내용

| | 내용 | 근거 |
|---|---|---|
| 있다 | `kind`에 `meeting·demo·visit·info_session`. 딜 상세 `DealNextMeetingPanel`(Google Calendar breadcrumb `meta.next_meeting`) | 0014/0016 CHECK, `revenue-write.js` `buildDealWrite` |
| 부분 | 저장 필드 = 요약 1줄 + 반응 + 다음 행동. `crm_activities.meta`는 0016에 있으나 `recordActivity`에 `meta` 인자가 없고 RPC v1도 쓰지 않는다 | `crm-activities.js`, 0018 |
| 없다 | 미팅 전 브리핑, 결정사항·우려·관심 신호 자리, 미팅 상태(예정/취소/노쇼) | 프로필 §9 권장·§11 확정 |
| 의도적 보류 | 음성·전사 | 프로필 §15-5 |

### 1.3 기록

| | 내용 | 근거 |
|---|---|---|
| writer | UI 2곳 → `record_contact_outcome_v1` → `crm_activities`. 드로어 `QuickLog`·Accounts `LogComposer` → `/api/hub/revenue/activity` POST → `buildActivityWrite` → `crm_activities`(반응·메타 없음). `outreach_outcomes` writer = `/api/integrations/outcomes/record`(UI 소비자 0) | 코드 |
| reader | 고객 상세·followups 활동 패널·Leads 기록 탭 → `crm_activities`. 주간 리포트 `contacts`·큐 `lastOutcome/boost`·`recomputeLeadScores`·`context-assembler` → `outreach_outcomes` | `weekly-report.js`, `followups-ledger.js`, `context-assembler.js` |
| 조인 함정 | 라이브 `crm_activities`는 회사 기준으로 쌓여 왔다(코드 주석: 110행 중 company_id 109 · lead_id 1). 리드 id로만 걸면 "기록 없음"으로 보인다 — 모든 읽기는 `companyId` 우선 | `customers.jsx` `Customer360Drawer.reload`, `revenue.jsx` `LeadActivityPanel` 주석 |
| 있다(v0.1 정정) | 메모 연결: 드로어의 `RelatedMemos`(contextType/contextId 검색 3건) + `MemoCaptureLink` | `related-memos.jsx`, `journal-links.jsx` |
| 없다 | 고객을 넘나드는 시간순 기록 렌즈("그 얘기 언제 누구랑") | — |

### 1.4 매출 내용

| 프로필 §6 확정 | 현재 | 두는 곳(권장) |
|---|---|---|
| HW/SW + 수량 | 리드 `meta.units` 숫자 1개 | `deals.meta.items[]` |
| 결제 `미결제/부분/완료` | 없음. `closing`=won 단계가 현금으로 취급됨(`personal-revenue-roadmap.js` `CERTAINTY_BY_STAGE.closing = confirmed`, 라이프사이클 `입금 대기`) | `deals.meta.payment` + `paid_amount` |
| 종료 결과 `성공/실패/보류` | `lost` 단계만 | `deals.meta.close_result` |
| 문의 유형 `신규/재문의` | 없음 | `deals.meta.inquiry_type` |
| 관계 신호 | 없음 | `deals.meta.relation_signals[]` |

### 1.5 니즈

- 있다: `leads.meta.situation`(자유 텍스트), 과목·지역 12키 어휘 + `label_source`(모범 사례).
- 없다: "고객이 중요하게 보는 것", "막힌 조건". CRM 지침 §6.3 상세 읽는 순서의 **첫 항목**이 화면에 없다.

### 1.6 위기

| 위기 사건 | 원천(현재) | 읽는 곳 |
|---|---|---|
| 우려 표명 | `crm_activities.reaction='concern'`, `leads/deals.meta.last_reaction` | **0** (저장소 전체에서 `reaction` 읽기 1곳 = `revenue-ledger.mapActivity` 투영뿐, 소비자 없음) |
| 명시적 거절 | `reaction='rejected'` | 0 |
| 무응답 누적 | `reaction='no_response'` | 0 |
| 약속 파기 | `meta.next_action_at < 오늘` ∧ 그 뒤 활동 없음 | 없음(첫 화면·큐는 "기한 지남"으로만 표시, 사건으로 남지 않음) |
| 취소·노쇼 | 없음 | — |
| **잘못된 위기** | 리드 점수 < 40 → `이탈위험` 세그먼트·danger 톤 / 계정 `health_score` < 40 → `위험` | `customers.jsx` `scoreBand`·`segmentFilter`, `revenue-ledger.js` `resolveHealth`, `revenue.jsx` `HealthDot` |

---

## 2. 구조 문제 — 검증된 8건

| # | 문제 | 증거 | 이 문서의 답 |
|---|---|---|---|
| P1 | 한 사람이 5표면에 흩어짐(Leads·고객 DB·Accounts·문의·연락). 고객 DB와 Leads는 같은 `useRevenueLedger`의 두 렌즈 | `customers.jsx` import | §4.1 IA, §4.2 상세 정본 |
| P2 | 기록 저장소 분열 → 주간 "연락" 0, 큐 boost 0 | §1.3 | 0단계 집계 원천 통일, Q144 |
| P3 | 필수 입력 `reaction`이 어디에도 안 나옴 | `ActivityTimeline`은 `msg·type·at`만 | 0단계 표시, §4.4 위기 판정 |
| P4 | 큐 정렬이 Q117과 반대 | `priorityFor` | §4.6 계층 정렬 |
| P5 | 매출·니즈·위기가 자유 텍스트이거나 없음 | §1.4~1.6 | §4.4·§4.5·§5 |
| **P6** | 고객 연락 행 컴포넌트가 다른 데이터 소스의 아이템 모양을 기대 → 필터·레일·클릭·반응 줄 전부 죽음 | §0 결함 1 | 0단계 아이템 모양 통일(§4.6.3) |
| **P7** | 집중 고객 = `won`만 + `next_action`이 이관 템플릿 | §0 결함 2·3 | §4.8, Q145·Q146 |
| **P8** | 위험 = 점수 밴드, 사건이 아님 | §0 결함 4 | §4.4 위기는 사건에서만, 점수 밴드는 위험 라벨에서 제거 |

---

## 3. ClassIn `home_v4.2`에서 가져올 것 · 버릴 것 (v0.2 보강)

v0.1의 7가져오기·5버리기는 그대로다(기록 최상위 탭 / bucket×lane+reason / 달력 경계 날짜 / 붙여넣기 순수 파서 / 채널↔결과 규약 / 상세 섹션 공유 / 커버리지 개념 — vs — 건강도 단일 점수 / 2단 탭 / 색 상태 / 팀 레이어 / 지도·파트너). v0.2가 더 본 것은 **입력 폼의 모드별 필드 매트릭스**다.

`rail/activity-contract.ts` `MODE_FIELDS`:

| 모드 | 기본 노출(primary) | 펼침(advanced) |
|---|---|---|
| 간단 메모·콜·문자 | 본문 | 다음 행동 · 분위기 · 태그 |
| 회의록 | 본문 · 참석자 · 목적 · **결정** · **막힌 것** · 다음 행동 · 분위기 · 단계 신호 · 태그 | — |
| 녹음 | 파일 | 결정 · 다음 행동 |

가져올 원칙 세 개: **(a)** 통화·문자는 본문만 기본이고 나머지는 접힘, **(b)** 미팅만 결정·막힌 것을 기본 노출, **(c)** 분위기는 3값(`positive/neutral/risk`)으로 좁다. Moonlight는 이미 5값 반응을 쓰므로 값은 유지하되 **노출 규칙 (a)(b)**를 §4.3 매트릭스에 채택한다. `STAGE_SIGNALS` 9종(신규 관심·데모 완료·견적 요청·가격 이견·의사결정 대기·갱신 리스크·계약 가능성·실패/보류)은 그대로 가져오지 않는다 — Moonlight의 확실성·라이프사이클 채널(§5.3)과 겹치고, 그중 "가격 이견·의사결정 대기"는 §4.4의 `blockers` 칩이 담당한다.

---

## 4. 권장 설계 v0.2

> 전부 **권장**. 확정 문구는 인용일 때만.

### 4.1 정보구조

```text
영업·매출
├─ 오늘 연락   dashboard/revenue/followups        (경로 유지)
├─ 고객       dashboard/revenue/customers        (경로 유지 · Leads·Accounts 흡수)
├─ 기록       dashboard/revenue/activity         (신설)
└─ 돈         dashboard/revenue/deals            (경로 유지 · 개요·히트맵을 뷰 토글로 흡수)
```

| 기존 자식 | 처리 | 방법 |
|---|---|---|
| `개요` `히트맵` | `돈` 안의 뷰 토글 | `LEGACY_REDIRECTS`에 `dashboard/revenue/overview → deals?view=overview`, `heatmap → deals?view=heatmap` |
| `Leads` `Accounts` | `고객` 목록의 세그먼트(`진행 중` · `계약 고객`) | `LEGACY_REDIRECTS` + `?lead=`·`?customer=` 딥링크는 그대로 열린다 |
| `문의 내역` | `고객`의 `유입` 세그먼트로 흡수(Q142) — F-1 `IntakeInbox`와 같은 자리 | `inquiries → customers?segment=inbound` |
| `Cases` | 사이드바에서 제거, 라우트는 유지(Q141) | `NAV_TREE`에는 남겨 ⌘K로만 도달 |
| `고객 연락`(primary 앵커) | `오늘 연락`으로 개명, `영업·매출` 자식으로 이동 | `hub-nav.js` `SIDEBAR_PRIMARY`에서 `followups` 앵커 제거 → primary 9 → **8** |
| `기회 탐색` | 그대로 | — |

**테스트 영향(반드시 같은 커밋).** `hub-nav.test.mjs`는 `SIDEBAR_PRIMARY.length === 9`와 `revenue.tabs.length >= 6`을 고정하고 있다 — 8과 4로 바꾼다. `LEGACY_REDIRECTS`는 `hub-data.js`에 있고 딥링크(`?lead=`·`?deal=`·`?customer=`·`?focus=`)는 경로가 아니라 쿼리라 살아남는다.

**순서.** 이 재배치는 **3단계**다. 1·2단계는 라우트를 하나도 옮기지 않는다.

### 4.2 고객 상세 = 여섯 축의 정본

**하나의 섹션 세트를 세 진입점이 공유한다** — 고객 DB 드로어(`Customer360Drawer`), Accounts `DetailPanel`, Leads `?lead=` 편집 드로어. 지금은 세 컴포넌트가 제각각이다(D6).

```text
apps/hub/components/hub/customer-detail/
  header.jsx       이름·소속·단계·정체성 · [기록 남기기] 1개
  needs.jsx        ① 중요하게 보는 것 · 막힌 조건 (칩)
  risk.jsx         ② 위기 (있을 때만 렌더)
  commitment.jsx   ③ 내 약속: 다음 행동+날짜 · 최근 결과 1줄(반응 포함)
  money.jsx        ④ 금액 · 구성 · 결제 · 결과
  timeline.jsx     ⑤ 기록 (접힘) · 연결된 메모(RelatedMemos 재사용)
  judgement.jsx    ⑥ 왜 이렇게 보이나 (접힘) — 기존 LeadEnrichmentPanel 흡수
  index.jsx        섹션 순서·데이터 로딩·상태 분배
```

**섹션 props 계약(공통).** `{ customer, state: 'live'|'partial'|'preview'|'error'|'loading', onRecord, onNavigate }`. 각 섹션은 자기 데이터가 없으면 **섹션 자체를 그리지 않는다**(②)이거나, 빈 상태를 한 줄로 말한다(①③④). 로딩은 `Skeleton`(D1), preview/error는 `TruthBadge`(D2).

**읽는 순서와 각 섹션의 내용.**

| 순서 | 섹션 | 보여주는 것 | 비었을 때 | 데이터 |
|---|---|---|---|---|
| 0 | 헤더 | `한빛학원 · 김OO 데이터` / `상담 · 개인` / **[기록 남기기]**(유일한 primary) | — | 리드·계정·회사·연락처 |
| 1 | ①니즈 | `중요하게 보는 것` 칩 ≤5 · `막힌 조건` 칩 ≤3 · 각 칩 hover/롱프레스에 출처(기록 날짜) | `아직 남긴 니즈가 없어요 — 다음 기록에서 한 줄만` | `meta.needs[]` `meta.blockers[]` |
| 2 | ②위기 | 1px danger 레일 + 사건 라벨 + 근거 1줄 + 다음 행동 제안 1개 | **섹션 없음** | §4.4 `deriveCustomerRisk` |
| 3 | ③약속 | `다음: 3/14(금) 견적서 발송 [완료][변경]` / `최근: 3/7 통화 · 우려 · "수량 20대면 단가?"` | `다음 행동이 없어요 — 정할까요? [내일][3일][다음 주][기약 없음]` | `next_action`·`meta.next_action_at`·최근 활동 1건 |
| 4 | ④돈 | `견적 ₩12.0M · HW 20 / SW 20 · 미결제 · 마감 3/31 · 결과 미정` | `열린 거래 없음 [새 거래]` | `deals` + `meta.items/payment/close_result` |
| 5 | ⑤기록 | 접힘. `전체 12건 ▾ · 통화 5 · 미팅 2 · 메모 5`. 펼치면 타임라인(반응·다음 행동 포함) + `연결된 메모` | `첫 기록을 남겨 보세요` | `crm_activities`(companyId 우선), `RelatedMemos` |
| 6 | ⑥판단 | 접힘. `왜 이렇게 보이나요? ▾` — 적합도·관심·준비도 근거·미확인 | `아직 판단 근거가 없어요` | 기존 `LeadEnrichmentPanel` 흡수 |

**하지 않는 것.** 헤더에 점수·건강도 뱃지를 두지 않는다(현행 드로어의 `스코어 NN`/`건강도` 뱃지 제거 — P8). 포커스 3단 조정(`올리기/기본/내리기`)은 ③약속 옆으로 옮기되 유지한다(프로필 §4 확정). 컨택 시트·빠른 기록·LogComposer 세 폼은 **전부 제거**하고 [기록 남기기] 하나로 통합한다(§4.3).

### 4.3 통합 기록창 — 채널 × 필드 매트릭스

컴포넌트 하나: `apps/hub/components/hub/contact-record-drawer.jsx`, `Drawer presentation="compact"`. 고객 상세에서 열면 **같은 Drawer의 기록 모드로 전환**(오버레이 1개), 큐·목록에서 열면 compact로 바로 뜬다.

**채널(무엇) — 버튼 6개 + 프리셋 2개.**

| 채널 | 기본 노출 | 펼침 | 반응 요구 | 비고 |
|---|---|---|---|---|
| 통화 `call` | 원문 · 반응 · 다음 | 니즈 · 막힌 조건 | 필수 | CRM 지침 §3.2 ① |
| 부재중 (프리셋: `call`+`no_response`) | 다음 시도 프리셋(오늘 오후·내일·모레) | — | 자동 `no_response` | §3.2 ② — 시도 기록이지 상담 증거 아님 |
| 카톡·문자 `kakao` | 원문 | 다음 · 니즈 | **없음** | 발신 사실만. `회신 받음` 토글을 켜면 반응 노출 (ClassIn `channelCarriesResult`) |
| 자료 전달 (프리셋: `kakao`+칩 `자료 전달`) | 자료 종류 칩(소개서·매뉴얼·견적서·PDF) | 다음 | 없음 | §3.2 ③ — 전송하지 않음, 보낸 사실 기록 |
| 미팅·데모·방문 `meeting/demo/visit` | 원문 · 반응 · **결정** · **막힌 조건** · 다음 | 참석자 · 니즈 | 필수 | ClassIn 회의록 primary 규칙. 프로필 §11 산출 5종 중 4종 |
| 견적 `quote` | 품목·수량(HW/SW) · 금액 · 반응 · 다음 | 막힌 조건 | 필수 | §3.3 견적 템플릿. 저장 시 `deals.meta.items/amount` 갱신 제안(체크 1개, 기본 켬) |
| 메모 `note` | 원문 | 니즈(관찰 칩) | 없음 | 단계·점수·할 일을 만들지 않음 |

**다음 행동 — 3상태(CRM 지침 §3.1).** `날짜 있음`(프리셋 내일·3일·다음 주·직접, 요일 표시) / `기약 없음`(휴면, 30일 뒤 렌즈) / `후속 없음`(이번 연락에서 끝 — 이유 칩: 최종 거절·요청 처리 완료·기타). 열린 딜인데 셋 다 아니면 저장 전 1회 경고(현행 `no-next-action` warning 재사용).

**저장 payload(§5.3 RPC v2).**

```json
{
  "requestId": "uuid-v4",
  "entityType": "lead", "entityId": "…", "companyId": "…", "contactId": null,
  "kind": "meeting",
  "occurredAt": "2026-09-21T14:00:00+09:00",
  "summary": "수량 20대 기준 단가 조정 가능한지 문의",
  "body": "…원문 전체(붙여넣기 포함)…",
  "reaction": "concern",
  "decision": "다음 주 데이터 참석 미팅에서 최종 확인",
  "needs": ["교사 교육 부담", "학부모 리포트"],
  "blockers": ["예산 승인 3월"],
  "followup": { "type": "dated", "text": "견적서 발송", "at": "2026-09-26" },
  "channelResult": null,
  "quote": { "items": [{ "kind": "HW", "qty": 20 }, { "kind": "SW", "qty": 20 }], "amount": 12000000 }
}
```

**신뢰 계약(CRM 지침 §3.4를 이번 범위에서 충족시키는 항목).** ① 낙관 카드는 `저장 중`, 서버 `saved` 뒤 `저장됨`. ② 초안은 `crm-record:<entityType>:<entityId>` 키로 같은 탭 복구(`sessionStorage`; `journal-browser-store`의 tab-id 패턴 재사용, 브라우저 종료 복구는 약속하지 않음). ③ `requestId`를 저장 전에 만들고 재시도는 같은 id — RPC가 `meta.request_id` 중복이면 기존 결과를 돌려준다. ④ 실패 시 원문·고객·날짜 유지 + 재시도 + 복사. ⑥ 활동 + 대상 `next_action` + 니즈/막힌 조건 + (견적이면) 딜 금액·품목이 **한 RPC** 안. 3.5초 되돌리기는 현행 유지(창이 닫히기 전엔 네트워크 없음).

**키보드·모바일.** `N`(목록에서 새 기록, 입력 요소·드로어 열림이면 무시), `⌘Enter` 저장(한글 조합 중 `isComposing`이면 무시), `ESC`·오버레이·닫기 3중. 모바일 바텀 시트에서 저장 버튼은 키보드 위에 고정, 칩은 줄바꿈, 터치 44px.

### 4.4 니즈 · 위기 — 데이터와 판정

**니즈(①).** `leads.meta.needs[]` / `deals.meta.needs[]`(딜 문맥에서 남긴 것), `blockers[]` 동일.

```json
{ "text": "예산 승인 3월", "source_activity_id": "…", "at": "2026-09-21", "resolved_at": null }
```

칩 5개·3개 상한(초과는 `+N`). `resolved_at`이 있으면 취소선 없이 **목록에서 빠지고** ⑥판단의 이력에만 남는다(막힌 조건이 풀린 것은 사실 변화이지 삭제가 아니다). 출처 없는 칩(직접 입력)은 `source_activity_id: null` — 하위 표시 `직접 입력`.

**위기(②) — 순수 함수 `deriveCustomerRisk({ activities, nextActionAt, todayKey })` → `{ level: 'none'|'urgent', events: [...] }`.** 새 입력을 요구하지 않는다.

| 사건 키 | 판정 | 라벨(운영자 목소리) | 레일 |
|---|---|---|---|
| `promise_missed` | `nextActionAt < today` ∧ 그 뒤 활동 0건 | `약속한 연락일 N일 지남` | danger |
| `rejected_open` | 최근 활동 `reaction='rejected'` ∧ 딜이 열려 있음 ∧ 그 뒤 활동 0건 | `거절 뒤 정리 안 됨` | danger |
| `concern_recent` | 최근 30일 `reaction='concern'` 1건 이상 ∧ 그 뒤 `positive` 없음 | `"가격 부담" 언급` (요약에서 첫 12자) | danger |
| `no_response_streak` | 최근 활동 2건 연속 `no_response` | `무응답 2회` | **없음**(중립·시계 글리프) |
| `meeting_lost` | 최근 활동 `meta.outcome ∈ {cancelled,no_show}` ∧ 재약속 없음 | `미팅 취소 · 재약속 필요` | danger |
| (정체) | `STALLED_DAYS` | — | **위기 아님**(§4.6 4층·중립) |

**빨강 예산(DESIGN §5.3).** 상세: 레일 1개(사건 여러 개면 한 레일 안에 줄바꿈). 목록·큐: 상단 1개 + 전체 3개, 초과 시 섹션 헤더에 `위기 N` 합계만 danger, 행은 글리프. 깜빡임 없음.

**제거.** 고객 DB `이탈위험` 세그먼트를 `위기`로 바꾸고 원천을 `deriveCustomerRisk`로 교체. `HEALTH_TONE.risk = danger`·`resolveHealth`·`HealthDot`은 **중립**으로 내린다(계정 `health_score`는 남기되 색을 잃는다). 점수는 ⑥판단 안에서만 보인다.

### 4.5 돈 — 필드와 캐시플로 연결

`deals.meta`:

```json
{
  "items": [{ "kind": "HW", "qty": 20 }, { "kind": "SW", "qty": 20 }],
  "payment": "partial", "paid_amount": 4000000, "paid_at": "2026-09-30",
  "close_result": null,
  "inquiry_type": "repeat",
  "relation_signals": ["추가 구매 예정"]
}
```

| 규칙 | 내용 |
|---|---|
| 단계≠결과 | `closing`은 단계, `close_result ∈ {won,lost,hold}`는 결과. `lost` 단계는 읽기 호환만 유지하고 새 쓰기는 `close_result='lost'`로 |
| 캐시플로 | `personal-revenue-roadmap.js`의 확실성: `payment='paid'` → `confirmed`(금액=`paid_amount`), `partial` → `confirmed`(잔액만 `recommended`), `unpaid`+`closing` → `recommended`(가능성 높음). 2026-09-15 결정(3값 enum)과 정합 |
| 입력 위치(Q139) | 기록창 `견적` 채널 + 딜 상세 ④돈의 인라인 편집 둘 다. `입금 확인` 프리셋은 ④돈의 버튼(전액/부분 금액) |
| 표시 | `.stat`은 금액(≥18px)만. 수량·날짜는 `.mono` |

### 4.6 오늘 연락 — 계층 정렬과 행 모양

**4.6.1 계층(순수 함수 `rankFollowups(items, { todayKey })`, `followup-rank.js` 신설, `@/` import 없음).**

```text
0  위기        deriveCustomerRisk.level === 'urgent'          레일 danger · 섹션 제목 "먼저 정리할 것"
1  약속 도래    next_action_at ≤ today                        섹션 "오늘 연락하기로 한 고객"   (Q117 ②·Q121)
2  단계        deal stage ∈ {quote, final, consult}          섹션 "견적·상담 진행 중"          (Q117 ③)
3  트래킹 윈도  컷오버 이후 생성 ∧ 정체                          섹션 "지켜보는 고객"              (Q117 ① 현행 해석)
4  무접촉       그 외 정체                                     섹션 "오래 조용한 고객" · 기본 접힘 (Q117 ④)
```

층 안 정렬 = F-3a 규칙(구매 신호 → 미접촉 경과 desc, 24h 초과만 danger → 오늘 due) → `focusOverride`(raise 먼저) → id. `기약 없음`은 이 큐에 없다(Q120). 각 행 `why` 한 줄은 계층이 만든다: `약속한 연락일 2일 지남` / `견적 보낸 지 5일` / `컷오버 이후 8일 무접촉`.

**4.6.2 CRM 지침 §8.2와의 정합.** 지침은 "기한 있는 약속은 별도 상단 영역, 나머지는 Q117 계층순, 계층 안 수동 집중도, 그 뒤 ID"라고 했다. 위 0층은 그 "상단 영역"의 확장(약속 도래 + 위기 사건)이고 1~4층이 Q117 계층이다. 어긋남 없음.

**4.6.3 행 모양 통일(P6 수리).** `getFollowups`가 `attention-ledger` 아이템 계약의 필드를 **직접 만든다**: `bucket`(next_action_at 기준 `overdue/today/week/later`), `href`(`dashboard/revenue/customers?customer=lead:<id>` / `deals?deal=<id>`), `lastNote`·`lastReaction`(최근 `crm_activities` 1건 — 회사 우선 조인), `tier`·`tierLabel`·`why`. 그러면 `FollowupRow`의 죽은 분기 4개가 코드 변경 없이 살아난다. 기존 `LANE_OPTIONS`(리드/딜/일정)는 **행 안의 작은 라벨**로 내리고, 상단 필터는 `계층`으로 바꾼다.

### 4.7 기록 렌즈 (신설, 3단계)

`dashboard/revenue/activity`. 서버 검색(기회 탐색 2A의 `discovery-ledger` 검색 계약 재사용). 날짜 그룹 헤더 + 행 = `시각(.mono) · 종류 글리프 · 고객명 · 요약 1줄 · 반응 라벨`. 필터 `종류 · 반응 · 기간 · 고객`. 행 클릭 → 그 고객의 상세 ⑤기록으로. 빈 상태·읽기 오류는 `EmptyState`/`TruthBadge` 분리(followups 패턴).

### 4.8 첫 화면 접속 — 집중 고객 후보 조건 교체 (P7)

`selectOperatorFocusLeads`의 `priorityLane === 'customer_success'` 조건을 **CRM 지침 §8.3 조건**으로 바꾼다.

```text
후보 = 운영자 소유 ∧ 미종결(status ∉ {won,lost} 또는 열린 딜 있음)
     ∧ next_action 있음 ∧ next_action_source !== 'import-template'
     ∧ (next_action_at ≤ today+3 또는 focusOverride === 'raise')
     ∧ focusOverride !== 'lower' ∧ 위기 사건이 rejected_open이 아님
정렬 = focusOverride(raise) → next_action_at asc → id
```

행 내용(Q135 답, 첫 화면 스펙과 동일): `이름 · 소속 / 마지막 접점(종류·N일 전·반응) · 다음 연락일 · 다음 행동`. 템플릿 문구는 화면에 내지 않는다.

**구현 결과(2026-09-21 `d4b57b5`).** 날짜 조건은 **필수가 아니라 정렬 축**으로 넣었다 — 날짜 도래(+3일)·raise를 필수로 두면 약속 날짜가 드문 현재 상태에서 첫 화면이 빈 채로 시작한다. 실제 조건은 `실제 약속(템플릿 아님) · lower 아님 · Lost 아님 · 휴면 아님`이고, 정렬이 `raise → 임박·지남 → 점수 → id`다. `rejected_open` 제외는 위기 판정이 생기는 1a로 미뤘다. §8.3의 엄격한 자동 후보 조건은 실사용 뒤 다시 본다.

**이관 템플릿 구분(Q146).** `scripts/enrich-eeocrm-leads.mjs`가 쓰는 `next_action`에는 `meta.next_action_source='import-template'`을 함께 쓰고, 운영자가 기록창/RPC로 저장하면 `'operator'`로 바뀐다. 스크립트는 `next_action_source==='operator'`인 행의 `next_action`을 **패치하지 않는다**.

---

## 5. 데이터 계약 v0.2

### 5.1 변경 목록

| 변경 | 위치 | 마이그레이션 |
|---|---|---|
| 니즈·막힌 조건 | `leads.meta.needs[]/blockers[]`, `deals.meta.*` | 없음 |
| 매출 구성·결제·결과·유형·관계 신호 | `deals.meta.items/payment/paid_amount/paid_at/close_result/inquiry_type/relation_signals` | 없음 |
| 미팅 결정·원문·요청 id·채널 결과·미팅 결과 | `crm_activities.meta.{decision, body_full, request_id, channel_result, outcome}` | 없음(0016에 `meta` 있음) |
| 딜 단계 이동 이력 | `crm_activities(kind='deal', meta.{from,to})` — `recordActivity`에 `meta` 인자 추가 | 없음(코드) — 09-20 §6.3과 동일 |
| `next_action_source` | `leads.meta.next_action_source ∈ {operator, import-template}` | 없음 |
| 집계 원천 통일 | `weekly-report.js`·`followups-ledger.js`·`context-assembler.js`가 `crm_activities` 읽기 | 없음(코드) |
| RPC v2 | `record_contact_outcome_v2` 함수 신설 | **파일 1개**(함수만; 테이블·컬럼 변경 없음). 선택: `crm_activities((meta->>'request_id'))` partial unique index 같은 파일 |

### 5.2 읽기 fallback 원칙

- 필드가 없는 과거 행은 `미확인`이지 `0`이 아니다(CRM 지침 §5). `payment` 없음 → `결제 미확인`(캐시플로는 현행대로 `closing → confirmed` 유지, 운영자가 값을 넣는 순간부터 새 규칙).
- `leads.score`에는 아무것도 새로 쓰지 않는다. 기존 writer 3종(`lead-enrichment` / `operator-context`·`sheets-sync` / `recomputeLeadScores`)은 그대로 두되, `recomputeLeadScores`의 원천을 `crm_activities`로 바꿀 때 **값이 크게 흔들리면 minDelta 뒤에 숨는다** — 0단계에서는 재채점을 돌리지 않는다(읽기만 바꾼다).

### 5.3 `record_contact_outcome_v2` 시그니처(권장)

```sql
create or replace function public.record_contact_outcome_v2(
  p_workspace_id uuid, p_request_id text,
  p_entity_type text, p_entity_id uuid, p_company_id uuid, p_contact_id uuid,
  p_kind text, p_occurred_at timestamptz,
  p_summary text, p_body text, p_reaction text,          -- reaction은 kind에 따라 null 허용(§4.3)
  p_decision text, p_needs jsonb, p_blockers jsonb,       -- [{text, at}] · RPC가 source_activity_id를 채움
  p_followup jsonb,                                       -- {type: dated|unscheduled|none, text, at, reason}
  p_channel_result text, p_activity_meta jsonb,
  p_quote jsonb                                           -- {items, amount} · deal일 때만
) returns jsonb
```

동작: ① `meta->>'request_id'`가 같은 활동이 있으면 그 결과를 반환(멱등). ② `crm_activities` insert(`reaction`·`meta` 포함). ③ 대상 레코드 `next_action`·`meta.{next_action_at,dormant,dormant_since,last_reaction,next_action_source='operator'}` 갱신(v1 계약 유지) + `meta.needs/blockers` 병합(`text` 중복은 기존 유지). ④ `p_quote`가 있고 `deal`이면 `amount`·`meta.items` 갱신. ⑤ 대상 행 0건이면 전체 롤백(v1과 동일). ⑥ 반환 `{status:'saved', activityId, warning}`. v1은 남겨 두고 UI만 v2로 옮긴다(롤백 경로).

---

## 6. 디자인 · UI/UX 디벨롭 요소 (v0.2)

> 기본 방향 불변 — Moonstone Command Deck, 새 폰트·팔레트·밀도 전환기 없음, 새 프리미티브 0개.

### 6.1 확인된 부채 — v0.1 6건 + v0.2 3건

| # | 부채 | 근거 | 고치는 법 |
|---|---|---|---|
| D1 | CRM 표면 `Skeleton` 0건, `불러오는 중…` 리터럴 4곳 | `followups.jsx` `ActivityPanel`, `revenue.jsx` `DealTaskPanel`·`DealLinkedProjectsPanel`·`LeadActivityPanel` | 레이아웃 고정 목록·타임라인에 `Skeleton`; preview/error엔 금지 |
| D2 | `SyncBadge` 13곳 / `TruthBadge` 0곳 (revenue 7 · customers 3 · followups 3) | 세 페이지 | 이번 작업에서 전부 `TruthBadge` |
| D3 | 하드코딩 그림자 `oklch(0 0 0 / 0.5)` | `revenue.jsx` `ContactMenu` 드롭다운 | `var(--shadow-pop)` |
| D4 | 필수 입력 `반응`이 고객 DB 타임라인에 표시 0 (고객 연락의 활동 패널만 `CRM_REACTION_LABEL`로 표시 — v0.2 정정) | `customers.jsx` `ActivityTimeline` | 0단계에서 타임라인·③약속·큐 행에 표시 |
| D5 | 에러 보더 인라인 shorthand 우회 | `customers.jsx` 컨택 시트 `SegmentedControl` | `data-invalid` + `.hub-seg[data-invalid]`를 `hub-tokens.css`가 소유 |
| D6 | 고객 상세 3종 분열 | `Customer360Drawer`·`DetailPanel`·리드 `EditDrawer` | §4.2 섹션 세트 공유 |
| **D7** | 죽은 컨트롤: 버킷 필터 3개(항상 0)·지남 레일·행 클릭·최근 반응 줄 | `followups.jsx` vs `followups-ledger.js` | §4.6.3 아이템 모양 통일 — DESIGN §11 "동작하지 않는 컨트롤을 두지 않는다"의 실체 |
| **D8** | 색 단독 상태: `HealthDot`(7px 원, `title`만) — 목록 3곳에서 라벨 없이 단독 | `revenue.jsx` Accounts 카드·리스트·상세 | 점 제거. 상태는 §4.4 사건 라벨로만 |
| **D9** | 위험 라벨이 점수 밴드에서 나옴(`이탈위험` 세그먼트·`위험` 헤더) | `customers.jsx`·`revenue-ledger.js` | 원천 교체(§4.4). 점수는 ⑥판단으로 |

### 6.2 화면 × 상태 — 무엇을 그리나

| 화면 | loading | live·0건 | live·N건 | partial | preview | error |
|---|---|---|---|---|---|---|
| 오늘 연락 | 행 `Skeleton` 5줄 | `EmptyState`: "오늘 연락하기로 한 고객이 없어요 — 지켜보는 고객 N명은 아래에" + [고객 목록] | 계층 섹션. 4층 접힘 `오래 조용한 고객 N ▸` | `TruthBadge partial` + 실패 소스명 | `TruthBadge preview` | `EmptyState`: "연락 데이터을 읽지 못했어요 — 화면은 비어 보여도 실제 항목이 있을 수 있어요" + [다시 시도] |
| 고객 목록 | 행 `Skeleton` | 세그먼트별 카피(`위기 0`: "지금 위기 신호가 없어요") | 행 = 이름·소속 / 최근 대화 1줄 / 다음 행동·날짜 / (위기 글리프) | 배지 | 배지 | 분리 |
| 고객 상세 | 섹션별 `Skeleton`(①③④ 각 2줄) | 섹션별 빈 카피(§4.2 표) | §4.2 | 섹션별 배지(활동만 실패해도 ①③④는 산다) | 배지 | 섹션별 오류 + 재시도 |
| 기록창 | — | — | 작성 중 / 저장 중(낙관 카드 `저장 중`) / 저장됨(3.5초 되돌리기) / 실패(원문 유지·재시도·복사) / 초안 복구(같은 탭) / 충돌(두 내용 보존) | — | `preview`: 저장 불가 명시, 입력은 복사 가능 | 동일 |
| 기록 렌즈 | 그룹 `Skeleton` | "이 조건의 기록이 없어요" + [필터 지우기] | 날짜 그룹 | 배지 | 배지 | 분리 |

### 6.3 카피 — 운영자 목소리 (DESIGN §10)

| 자리 | 카피 |
|---|---|
| 큐 섹션 제목 | `먼저 정리할 것` · `오늘 연락하기로 한 고객` · `견적·상담 진행 중` · `지켜보는 고객` · `오래 조용한 고객` |
| 왜 지금 | `약속한 연락일 2일 지남` · `견적 보낸 지 5일` · `"가격 부담" 언급 · 답 안 함` · `컷오버 이후 8일 무접촉` · `직접 올림` |
| 위기 라벨 | `약속 놓침` · `거절 뒤 정리 안 됨` · `우려 있음` · `무응답 2회` · `미팅 취소 · 재약속 필요` |
| 니즈 | `중요하게 보는 것` · `막힌 조건` · 빈 상태 `다음 기록에서 한 줄만` |
| 돈 | `견적 ₩12.0M · HW 20 / SW 20 · 미결제` · `입금 확인` · `결과: 성공 / 실패 / 보류` |
| 기록창 | 채널 `통화 · 부재중 · 카톡·문자 · 자료 전달 · 미팅·데모·방문 · 견적 · 메모` · 다음 `내일 · 3일 · 다음 주 · 직접 · 기약 없음 · 후속 없음` · 저장 `기록 남기기` |
| 금지 | `혁신` `최적화` 류, 축하 문구, "점수 상승" |

### 6.4 상태 문법 매핑(§5.3) — v0.1과 동일

상호작용=Moonstone(선택·주요 버튼 1개) / 긴급=danger(**②위기만**, 정체·오늘·대기·점수 금지) / 확실성=형태(④돈 결제·①칩 출처) / 라이프사이클=아이콘+텍스트(③약속·단계·활동 종류) / 원천 진실=`TruthBadge`. 충돌 시 영역 분리(레일·뱃지·버튼). 새 CRM read 라우트는 `HTTP 200 + {status:'error'}` 봉투(CLAUDE.md) — 소비자는 `d.status`를 읽는다.

### 6.5 모션·접근성 — v0.1과 동일

`--dur-*`·`--ease-hub`만, 위기 표시 무깜빡임, 포커스 outline만(`focus-ring.test.mjs`), 색 단독 금지, `role="button"` 3종 세트, `aria-expanded`, `Checkbox label`, 페이지 `<h2>` 1개, 터치 44px.

### 6.6 프리미티브 — 새로 만들 것 0개

칩 = `ChipToggle`/`EditDrawer chips` · 레일 = §8.1 inset 1px 인라인(`AttentionRail`은 §15 2026-08-05 결정대로 미채택 유지) · 원천 = `TruthBadge` · 확실성 = `CertaintyBadge` · 라이프사이클 = `LifecycleBadge` · 로딩 = `Skeleton` · 기록창 = `Drawer compact` · 필터 = `SegmentedControl` · 날짜 = `DateQuickPresets`.

---

## 7. 적용 순서 — PR 단위

활성 1순위는 여전히 F-0(초안 크론 수리)이다. 아래 0단계 3개 PR은 F-0과 파일이 겹치지 않아 병행 가능하다. 파일·함수·테스트·완료 기준은 [실행 계획](../plans/2026-09-21-crm-tab-develop-phase0-1.md).

| 단계 | PR | 내용 | 규모 | 게이트 |
|---|---|---|---|---|
| 0 | **0a 집계 원천 통일** | `weekly-report.js` 연락=`crm_activities.occurred_at`·완료 할 일=`completed_at`; `followups-ledger.js`의 `lastOutcome/boost`를 `crm_activities`로; `context-assembler.js` 동일 | S | 없음 (09-20 §6.4와 동일 변경) |
| 0 | **0b 연락 행 살리기 + 반응 표시** | `getFollowups`가 `bucket/href/lastNote/lastReaction/tier/why` 생산(§4.6.3) · `ActivityTimeline`·③에 반응 표시 · `followups-ledger.test.mjs` 신설 | M | 없음 |
| 0 | **0c 집중 고객 후보 교정 + 이관 가드** | `selectOperatorFocusLeads` 조건 교체(§4.8) · `next_action_source` · 스크립트 가드 · `daily-focus.test.mjs` 확장 | S | Q145·Q146 반대 없음 |
| 1 | **1a 고객 상세 섹션 세트** | `customer-detail/*` 7파일 · 세 진입점 교체 · D1·D2·D6·D8·D9 · `deriveCustomerRisk` + 테스트 | L | 0단계 |
| 1 | **1b 통합 기록창 + RPC v2** | `contact-record-drawer.jsx` · 마이그레이션 1(함수) · 세 폼 제거 · D5 · 초안·멱등 | L | 1a와 같은 주 |
| 2 | **2a 큐 계층 정렬** | `followup-rank.js` + 테스트 · `followups.jsx` 섹션 렌더 · F-3a 층 내 규칙 | M | 1단계 5영업일 실사용. **F-3a와 같은 파일** — 순서 조율 |
| 2 | **2b 돈 필드** | `buildDealWrite` 확장 · ④돈 인라인 편집 · 캐시플로 확실성 매핑 | M | Q139 |
| 3 | **3 IA 재배치 + 기록 렌즈** | `hub-nav.js`·`hub-nav.test.mjs`·`NAV_TREE`·`LEGACY_REDIRECTS` · `activity.jsx` | M | 2단계 실사용 |
| 4 | **4 붙여넣기 캡처** | 순수 파서 + 검토 행 + 매칭 | L | 행사 시트 실입력 |
| 보류 | F/I/R 실적용 | 그림자 평가부터 | — | CRM 지침 §12-5 |

**완료 기준은 "운영자가 그 화면으로 하루를 굴렸다"이다.** 1단계 뒤 5영업일 실사용 없이 2단계를 시작하지 않는다.

---

## 8. 지금 하지 않는 것

음성·전사·상시 AI 분석(§15-5) · F/I/R 실적용·백필 · ClassIn 양방향 동기화 · 외부 발송 · 새 저장소·대규모 스키마 · 건강도 단일 점수·색 코딩·팀 레이어·지도 · Cases 재설계 · 큰 매출 카드·차트 벽 · **`recomputeLeadScores` 재실행**(원천이 바뀐 뒤 값이 흔들리므로 그림자 평가가 생길 때까지) · **이관 스크립트 `--apply` 재실행**(Q146 가드 전까지).

---

## 9. 결정 — 권장 기본값 (반대 없으면 이걸로 진행)

프로필 §14·09-20 Q127~131·첫 화면 Q132~137 뒤에 붙인다. **v0.2는 각 질문에 기본값을 달았다.** 인터뷰 재개 없이도 진행할 수 있게 하기 위함이며, 운영자가 한 줄로 뒤집을 수 있다.

| # | 질문 | 권장 기본값 | 이유 |
|---|---|---|---|
| Q138 | 니즈 어휘 | **자유 칩 + 최근 사용 재사용**(고정 어휘 없음) | 과목·지역처럼 분류가 닫힌 축이 아니다. 3개월 실사용 뒤 상위 8개를 어휘로 승격 검토 |
| Q139 | 결제 입력 시점 | **둘 다** — 기록창 `견적` 채널의 `입금 확인` 프리셋 + ④돈 인라인 | 입력 경로를 하나로 강제하면 누락이 생긴다 |
| Q140 | 미팅 취소·노쇼 | **`meta.outcome`으로 시작**(마이그레이션 0). `kind` CHECK 확장은 보류 | 위기 판정에는 `meta`로 충분 |
| Q141 | Cases | **사이드바에서 제거, 라우트·⌘K 유지** | 삭제·이관 결정은 실사용 관찰 뒤 |
| Q142 | 문의·유입 통합 | **통합** — `고객`의 `유입` 세그먼트 = F-1 IntakeInbox 자리 | 같은 질문("아직 손 안 댄 새 사람") |
| Q143 | 4층 기본 상태 | **접힘**(상태 기억) | "자동 범람 반대"의 화면 표현 |
| **Q144** | 활동 정본 | **`crm_activities` 하나.** `outreach_outcomes`는 읽지 않음(integrations 라우트 전용으로 보존) | §0 결함 5 — §10 투영은 위기 신호를 지운다 |
| **Q145** | 집중 고객 후보 | **§4.8 조건으로 교체**(`won`-only 폐기) | 프로필 §8 정의와 정합, 첫 화면 D3 해소 |
| **Q146** | 이관 템플릿 | **`next_action_source` 구분 + 스크립트가 `operator` 값을 덮지 않음** | 운영자 약속이 필러로 되돌아가는 것을 막는다 |

---

## 10. 검증

**코드.** 루트 `npm test`(CLAUDE.md 기준선 1475 · 실패 0; README §3의 1433은 갱신 지연 — 실제 값은 돌려서 확인). 스윕 3종(`motion`·`focus-ring`·`no-mock-data`) + `state-usage.test.mjs`(read 봉투). 새 순수 함수 3개(`rankFollowups`·`deriveCustomerRisk`·집중 후보 조건)는 `@/` import 없이 `node --test`. `followups-ledger.js`는 **현재 테스트가 없다** — 0b에서 신설한다. 날짜는 전부 KST day-key(`daily-focus.js`·`attention-ledger.js` 패턴).

**운영자(각 단계 뒤).**
1. 고객 한 명을 열어 이전 기록을 뒤지지 않고 다음 행동을 정할 수 있는가.
2. 통화 직후 기록 30초, 메모 10초.
3. 이번 주 **놓친 약속 N건**을 화면이 답하는가.
4. 주간 리포트 `연락 N건` = 내가 남긴 기록 수 (0a의 유일한 합격 조건).
5. 큐 맨 위 고객이 "지금 연락하는 게 맞다"고 느껴지는가 — 아니면 `왜 지금`이 틀린 이유를 말할 수 있는가.
6. 첫 화면 집중 고객 3행이 **서로 다른 말**을 하는가(D3 해소 확인).

**하지 않는 검증.** 운영 DB 건수·크론 가동·배포 상태는 확인하지 않았다. 이 문서의 어떤 단계도 "운영에서 이미 작동한다"는 주장을 포함하지 않는다.
