# Personal Sales OS 넛지 레이어 — CRM을 업무에 녹이는 적용 기획

> 목적: Moonlight CRM을 "기록하는 곳"에서 "매일 매출 행동을 자동으로 만드는 개인 Sales OS"로 발전시킨다.
> 폰 연동은 별도 하위 시스템으로 분리한다: [phone-bridge-priority-plan.md](phone-bridge-priority-plan.md)
> 구현 적용안은 별도 문서로 둔다: [personal-sales-os-application-plan.md](personal-sales-os-application-plan.md)

운영자: 문준혁. 핵심 업무 모션: 콘텐츠/DM/전화/문자/방문/카톡/팔로업.

## 1. 제품 원칙

Sales OS의 역할은 사용자를 부지런하게 만드는 것이 아니다.

**사용자는 판단만 한다. 시스템은 수집, 연결, 정리, 추천, 초안 생성을 한다.**

이를 위해 모든 기능은 아래 원칙을 따른다.

- 입력은 한 줄 또는 한 번의 클릭.
- 확정 전에는 Sales Inbox에 둔다.
- 모든 딜과 고객은 다음 액션을 가져야 한다.
- 넛지는 이유와 바로 실행 가능한 행동을 가진다.
- 시각화는 장식이 아니라 다음 행동 옆에 둔다.
- 자동 발송은 기본 금지, 초안과 승인 중심.

## 2. OS 레이어 구조

```text
Capture -> Resolve -> Ledger -> Judge -> Nudge -> Act -> Review -> Learn
```

### 2.1 Capture

업무 흔적을 받는다.

- Quick Capture 한 줄
- CRM에서 전화/문자/카톡 초안
- 미팅 종료 이벤트
- 딜 stage 이동
- 고객 노트
- 명함/인박스
- 향후 Phone Bridge

### 2.2 Resolve

흔적을 고객/딜/리드에 연결한다.

- 이름, 회사명, 전화번호, 이메일, 최근 열린 entity, calendar attendee로 후보 추정.
- confidence 낮으면 Sales Inbox review.
- 매칭 실패는 신규 리드 staging.

### 2.3 Ledger

정본 기록으로 남긴다.

- `crm_activities`
- `leads`
- `deals`
- `customer_accounts`
- `work_orders`
- 향후 `next_actions`

### 2.4 Judge

상태를 판단한다.

- 다음 액션 없음
- 정체 딜
- 제안 후 무응답
- 미팅 후 미기록
- forecast 근거 부족
- 고객 health risk

### 2.5 Nudge

판단을 행동 가능한 카드로 바꾼다.

넛지 구성:

- `why`: 왜 지금 봐야 하는가
- `entity`: 어떤 고객/딜인가
- `evidence`: 근거
- `action`: 바로 할 수 있는 버튼
- `escape`: 스누즈/무시/부적합/포기

### 2.6 Act

실행 표면.

- 전화
- 통화 기록
- 팔로업 초안
- 다음 액션 추가
- 딜 이동
- 고객 노트
- 미팅 잡기
- 포기/lost 처리

### 2.7 Review

매일/매주 정리.

- Daily Brief: 오늘 매출 행동 3~5개.
- End-of-day Sweep: 미기록 접점/내일 follow-up.
- Weekly Sales Review: win/loss, stuck deals, next week focus.

### 2.8 Learn

성과를 playbook으로 되돌린다.

- 잘 먹힌 메시지
- 잦은 반대 이유
- 승률 높은 소스
- 포기해야 할 패턴
- 다음 주 실험

## 3. 핵심 엔진 5개

### 3.1 Universal Quick Capture

어디서든 한 줄로 받는다.

예:

```text
대치수학 원장 통화. 가격은 괜찮고 법무 검토 후 금요일 회신. 목요일 오전 리마인드.
```

분해 결과:

- channel: phone
- account/contact 후보: 대치수학 원장
- activity: 통화
- status: 법무 검토
- objection/risk: 법무
- next_action: 목요일 오전 리마인드
- due: 날짜 추정
- target: Sales Inbox review 또는 바로 저장

UI:

- topbar New
- command palette
- 고객 상세 `N`
- 딜 카드 `L`
- 모바일 capture URL

### 3.2 Sales Inbox

자동 감지/분해된 후보를 확정하는 큐.

카드 종류:

- phone intent result
- pasted message
- meeting ended
- email/calendar event
- no next action
- stale deal

액션:

- 저장
- 수정
- 연결 entity 변경
- 스누즈
- 무시

원칙:

- 모호하면 저장하지 않는다.
- 버리지 않는다.
- why와 evidence를 항상 보인다.

### 3.3 Next Action Ledger

Sales OS의 중심.

모든 열린 lead/deal/account는 다음 중 하나를 가진다.

- `next_action`
- `next_action_due`
- `next_action_channel`
- `next_action_owner`
- `next_action_source`
- `snooze_until`
- `dismiss_reason`

초기 구현은 `meta` 또는 기존 필드로 시작하고, 양이 늘면 독립 테이블로 승격한다.

P0 규칙:

- 열린 딜 + next action 없음 -> nudge
- proposal stage + 3일 무접점 -> follow-up
- meeting ended + activity 없음 -> recap
- close date 7일 이내 + next meeting 없음 -> forecast risk
- risk account + 7일 무접점 -> check-in

### 3.4 Nudge Engine

규칙 기반으로 시작한다.

넛지 우선순위:

1. Critical: 오늘 안 하면 손실 가능성 큼.
2. Warning: 이번 주 안에 처리해야 함.
3. Info: 정리/학습/품질 개선.

P0 넛지:

| Nudge | 조건 | 주 액션 | 탈출구 |
|-------|------|---------|--------|
| No Next Action | 열린 딜/고객에 다음 액션 없음 | 액션 추가 | 스누즈/포기 |
| Stale Deal | stage 기준일 초과 | 팔로업 초안 | 스누즈/lost |
| Meeting Recap | 미팅 종료 후 기록 없음 | 요약 남기기 | 무시 |
| Proposal Follow-up | 제안 후 N일 무응답 | 팔로업 | 스누즈 |
| Forecast Risk | close date 임박, 근거 약함 | confidence 조정 | 제외 |
| Customer Risk | warning/risk + 접점 없음 | 상태 확인 | 스누즈 |

### 3.5 Guru Chief of Staff

AI는 자동 실행자가 아니라 chief of staff다.

역할:

- 딜 진단
- 팔로업 초안
- 고객 브리핑
- 다음 액션 추천
- weekly review 초안
- 포기 근거 제안

제약:

- 자동 발송 금지.
- 근거 없는 confidence 상승 금지.
- 항상 evidence와 uncertainty 표시.
- 사람이 승인해야 ledger 확정.

## 4. 표면별 적용

### 4.1 Daily Brief

목표: 아침 3분 안에 오늘 매출 행동 결정.

블록:

- 오늘의 실행 허브
- 오늘 매출 액션 3~5개
- 썩는 기회
- 미팅 후 미기록
- next action 없는 딜
- 이번 달 forecast risk

CTA:

- 팔로업 초안
- 전화
- 노트
- 다음 액션 추가
- 스누즈

### 4.2 Customer Cockpit

목표: 고객 열고 10초 안에 상태 파악.

상단:

- health
- last touch
- next action
- active deal
- pinned note
- 최근 기록 3개

액션:

- `N`: 노트
- `L`: 활동 기록
- `F`: 팔로업 초안
- `P`: 전화
- `D`: 딜 생성

### 4.3 Deal Board

목표: 파이프라인이 다음 행동을 강제.

카드 필수:

- amount
- stage age
- last touch
- next action
- confidence
- risk chip

상호작용:

- 빈 lane 클릭 -> 해당 stage 새 딜.
- stage 이동 -> 활동 자동 기록.
- next action 없는 stage 이동 -> 작은 경고와 액션 입력.
- stale card -> follow-up CTA.

### 4.4 Calendar

목표: 미팅을 기록과 다음 액션으로 닫기.

기능:

- meeting ended card
- 미팅 전 고객 briefing
- 미팅 후 recap
- 다음 액션 due date 자동 제안
- follow-up draft

### 4.5 Command Palette

목표: 페이지 이동 없이 조작.

액션:

- New deal
- New account
- Add note
- Log activity
- Add next action
- Start focus
- Find stale deals
- Weekly review

### 4.6 Sales Review

목표: 학습 루프.

Daily end:

- 오늘 접점
- 미기록 접점
- 내일 follow-up

Weekly:

- created pipeline
- moved pipeline
- won/lost
- stale deals
- forecast truth
- top objections
- next week focus 5

## 5. 데이터 모델 제안

P0는 기존 테이블 우선.

기존 활용:

- `crm_activities`: 활동/노트/통화/메시지 요약.
- `deals.meta`: confidence, objection, next action 보조.
- `leads.next_action`: 리드 후속.
- `work_orders`: 승인 필요한 행동 큐.

vNext 테이블 후보:

### 5.1 `next_actions`

```sql
id uuid primary key
workspace_id uuid not null
entity_type text not null -- lead | deal | account | contact
entity_id uuid not null
title text not null
channel text -- phone | sms | kakao | meeting | email | internal
due_at timestamptz
status text -- open | done | snoozed | dismissed
source text -- manual | rule | ai | phone_bridge | calendar
priority text -- info | warning | critical
evidence jsonb
created_at timestamptz
updated_at timestamptz
```

### 5.2 `sales_inbox_items`

```sql
id uuid primary key
workspace_id uuid not null
source text not null -- quick_capture | phone_bridge | calendar | email | rule | ai
kind text not null
raw text
normalized jsonb
entity_candidates jsonb
confidence numeric
status text -- pending | routed | snoozed | dismissed | error
review_reason text
created_at timestamptz
decided_at timestamptz
```

### 5.3 `nudges`

초기에는 materialized view나 repository 계산으로 충분하다. 독립 저장은 snooze/dismiss history가 필요해질 때.

```sql
id uuid primary key
workspace_id uuid not null
rule_key text not null
entity_type text not null
entity_id uuid not null
severity text
title text
body text
evidence jsonb
status text -- active | done | snoozed | dismissed
snooze_until timestamptz
dismiss_reason text
created_at timestamptz
```

## 6. 구현 로드맵

### Phase 0: 지금 있는 표면 강화

- Daily Brief 액션 허브 유지/확장.
- Customer Cockpit 상태판 강화.
- Command Palette CRM 액션 확장.
- Deal Board quick-create와 stale warning 유지.

### Phase 1: Next Action Ledger

- 열린 딜 next action coverage 계산.
- `No Next Action` nudge.
- 고객/딜 상세에서 next action 추가 UI.
- Daily Brief에 오늘 due next actions.

### Phase 2: Sales Inbox

- Quick Capture 파서.
- pending item review UI.
- 저장/수정/무시/스누즈.
- 고객/딜 entity resolver.

### Phase 3: Nudge Engine

- stale deal rule.
- meeting ended rule.
- proposal follow-up rule.
- forecast risk rule.
- snooze/dismiss reason.

### Phase 4: Guru Chief of Staff

- 딜 진단 drawer.
- 팔로업 초안.
- 고객 briefing.
- weekly review draft.

### Phase 5: Phone Bridge 연결

- P0 전화 intent/result.
- 문자/카톡 초안.
- Quick Capture pasted message.
- 이후 Android companion.

## 7. QA 기준

사용성:

- Quick Capture 5초 이하.
- 고객 상세 상태 파악 10초 이하.
- 통화 후 기록 30초 이하.
- Daily Brief에서 오늘 액션 3분 이하.

운영 지표:

- 열린 딜 next action coverage 90% 이상.
- stale deal 평균 체류일 감소.
- 미팅 후 기록 누락률 감소.
- 주간 lost reason 기록률 상승.
- forecast에 들어간 딜의 evidence coverage 100%.

디자인:

- Moonlight dark surface 유지.
- status color는 chip/dot/left border에만 제한.
- CTA는 각 카드 1 primary + 1 secondary 이하.
- 모바일 375px에서 카드 겹침 없음.
- keyboard path 제공.

## 8. 명시적 비목표

- 엔터프라이즈 CRM처럼 모든 필드를 요구하지 않는다.
- 자동 발송을 기본값으로 두지 않는다.
- 차트를 먼저 만들지 않는다.
- 폰 원문 수집을 메인 OS 완성 전 핵심 의존성으로 만들지 않는다.
- 사람 판단 없이 forecast를 올리지 않는다.

## 9. 다음 구현 후보

가장 레버리지 높은 순서:

1. `Next Action Ledger`를 기존 `deals/leads/meta/work_orders` 위에 얇게 구현.
2. `No Next Action`과 `Stale Deal` nudge를 Daily Brief/Deal Board에 노출.
3. 고객 상세에 `다음 액션` 작성/완료/스누즈 UI 추가.
4. Universal Quick Capture를 command palette 액션으로 추가.
5. Sales Inbox pending review 화면 추가.

세부 적용 순서, repository/API/UI 매핑은 [Personal Sales OS 적용방안](personal-sales-os-application-plan.md)을 따른다.
