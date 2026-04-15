# Moonlight Hub Operator Command Redesign Plan

이 문서는 `apps/hub`를 "잘 정리된 대시보드"에서 "상위 1% 운영자용 조작면"으로 바꾸기 위한 구체 실행안이다.

핵심 전제:

- 운영자는 섹션을 탐색하려고 허브를 여는 것이 아니다.
- 운영자는 `판단 -> 위임 -> 대기/승인 -> 검증` 루프를 10초 안에 돌리려고 허브를 연다.
- AI는 별도 부서가 아니라 `위임 레이어`다.
- 자동화는 관찰 대상이 아니라 `예외 처리 대상`이다.

이 문서는 현재 코드 구조를 기준으로 "바로 구현 가능한 1차 개편"과 "데이터 모델까지 바꾸는 2차 개편"을 분리해 제안한다.

---

## 1. 북극성 운영 모델

Moonlight Hub의 최상위 운영 루프는 아래 네 단계여야 한다.

1. `Decide`
지금 내가 직접 판단해야 하는 것

2. `Dispatch`
사람, AI, 자동화로 바로 위임할 수 있는 것

3. `Wait / Approve`
대기 중인 것, 승인 필요한 것, 재확인 필요한 것

4. `Verify / Learn`
결과 증거, 실패 원인, 다음 루프 개선

현재 허브는 이 네 단계를 섹션별 overview에 흩어 놓고 있다.

목표는 반대다.

- 모든 섹션은 이 네 단계 중 하나에 `보고`해야 한다.
- 운영자는 섹션을 읽는 대신 루프를 돌려야 한다.

---

## 2. 현재 구조의 핵심 한계

### A. 섹션 중심 사고가 너무 강하다

현재 네비는:

- `Work`
- `Revenue`
- `Content`
- `Automations`
- `Evolution`
- `AI`

이 구조는 도메인 정리에는 좋지만 운영 루프에는 약하다.

문제:

- "지금 승인 필요한 것"이 어느 섹션인지 먼저 찾아야 한다.
- "위임 가능한 것"이 `AI`, `Content`, `Work`에 흩어진다.
- 머신 예외가 `Automations` 안에 숨어 있다.

### B. `AI`가 목적지가 되어 있다

현재 `apps/hub/app/dashboard/ai/page.jsx`는 `AI Console`을 하나의 독립 섹션으로 다룬다.

하지만 운영자 관점에서 AI는:

- 별도 부서가 아니라
- 위임 방식 중 하나이며
- `사람 위임`, `자동화 위임`과 같은 레벨에서 보여야 한다.

즉 `AI`는 장르가 아니라 `dispatch rail`이다.

### C. `Automations`가 건강도 보드에 가깝다

현재 `apps/hub/app/dashboard/automations/page.jsx`는 잘 만든 관제판이지만, 운영자가 정말 먼저 봐야 할 건 성공 런이 아니다.

운영자가 먼저 봐야 하는 것은:

- 실패
- 재시도 필요
- 사람 검토 대기
- 인증/연결 문제
- 입력은 왔는데 처리 정의가 비어 있는 상태

즉 `automations`는 summary board보다 `exception board`가 먼저여야 한다.

### D. 공용 위임 객체가 없다

지금 위임성 데이터는 아래처럼 흩어져 있다.

- `ai_orders`
- `automation_runs`
- `project_updates`
- `routine_checks`
- `error_logs`
- `content_items`
- `webhook_events`

하지만 운영자는 이것들을 따로 보지 않는다.

운영자는 한 줄로 본다:

- 무엇을
- 누구에게
- 언제까지
- 어떤 기준으로
- 어떤 증거가 나오면 끝인지

즉 허브에는 `handoff` 또는 `command item`이라는 상위 객체가 필요하다.

---

## 3. 목표 IA

### 3-1. 최종 개념 IA

최종적으로는 아래 구조가 가장 자연스럽다.

- `Overview`
- `Work`
- `Revenue`
- `Content`
- `Dispatch`
- `Machine`
- `Learn`

의미:

- `Overview` = 오늘의 운영 판단면
- `Work` = 제품/프로젝트 실행
- `Revenue` = 리드/딜/계정 실행
- `Content` = 제작/검토/발행 실행
- `Dispatch` = 사람/AI/자동화 위임
- `Machine` = 실행 상태, 실패, 예외, 연결
- `Learn` = 로그, 이슈, 검증, 회고

### 3-2. 현재 코드 기준 전이 IA

기존 라우트를 최대한 활용하면 1차 전이는 아래처럼 간다.

- `/dashboard` = Overview
- `/dashboard/work/projects` = Work
- `/dashboard/revenue/leads` = Revenue
- `/dashboard/content/queue` = Content
- `/dashboard/ai/orders` = Dispatch
- `/dashboard/automations/runs` = Machine
- `/dashboard/evolution/logs` = Learn

현재 라우트는 유지하고, 상단 명명과 진입점만 바꾸는 방식이다.

### 3-3. 즉시 바꿔야 하는 기본 진입점

- `Work` 클릭 시 기본 진입 = `/dashboard/work/projects`
- `Revenue` 클릭 시 기본 진입 = `/dashboard/revenue/leads`
- `Content` 클릭 시 기본 진입 = `/dashboard/content/queue`
- `AI` 클릭 시 기본 진입 = `/dashboard/ai/orders`
- `Automations` 클릭 시 기본 진입 = `/dashboard/automations/runs`
- `Evolution` 클릭 시 기본 진입 = `/dashboard/evolution/logs`

이 단계에서 `overview` 서브탭은 제거하거나 숨긴다.

---

## 4. 화면 계약

아래는 각 상위 화면이 "무엇을 보여줘야 하는가"에 대한 계약이다.

### 4-1. `/dashboard`

목표:

- 오늘의 운영 루프를 한 장에 접는다.

화면 블록:

- `Direct Decisions`
  - 내가 직접 판단해야 하는 3개
- `Ready To Dispatch`
  - 지금 바로 위임 가능한 3개
- `Waiting / Approval`
  - 승인 대기, 응답 대기, 검토 대기 3개
- `Machine Exceptions`
  - 실패, 인증 오류, 끊긴 연결 3개
- `Verification`
  - 오늘 결과 증거가 필요한 것 3개

금지:

- 큰 설명 문단
- 섹션 소개형 overview 반복
- "건강해 보이는 숫자" 위주 구성

### 4-2. `/dashboard/work/projects`

목표:

- 프로젝트 실행의 진짜 조작면

필수 요소:

- active project list
- blocker
- next action
- owner
- due
- current proof
- dispatch button

한 줄 질문:

- "무엇이 움직이고 있고, 무엇이 멈췄고, 지금 누구에게 넘길 것인가?"

### 4-3. `/dashboard/revenue/leads`

목표:

- follow-up 중심 수익 실행면

필수 요소:

- 연락 필요 리드
- 딜 단계 변화
- 다음 follow-up 시점
- owner
- proof of motion
- templated dispatch

한 줄 질문:

- "누구에게 지금 바로 응답해야 하며, 무엇을 위임해야 하는가?"

### 4-4. `/dashboard/content/queue`

목표:

- 제작 상태판이 아니라 리뷰/발행 관제면

필수 요소:

- review 대기
- publish 대기
- owner 없는 초안
- 브랜드/채널 컨텍스트
- 승인 필요 여부
- studio / publish / email handoff 바로가기

한 줄 질문:

- "무엇이 리뷰를 기다리고 있고, 무엇이 지금 퍼블리시로 넘어갈 수 있는가?"

### 4-5. `/dashboard/ai/orders`

목표:

- AI 페이지가 아니라 위임 조작면

필수 요소:

- new order composer
- target: claude / codex / both / engine
- due / priority / lane
- definition of done
- evidence expectation
- waiting review / blocked / verify 상태 필터

한 줄 질문:

- "이 판단을 누구에게 어떤 계약으로 넘길 것인가?"

### 4-6. `/dashboard/automations/runs`

목표:

- 건강도 보드가 아니라 예외 보드

필수 요소:

- failed runs
- stuck runs
- queued too long
- missing provider connection
- retry CTA
- route detail
- human review required

한 줄 질문:

- "무엇이 조용히 고장났고, 어디에서 사람이 개입해야 하는가?"

### 4-7. `/dashboard/evolution/logs`

목표:

- 단순 로그 뷰가 아니라 검증/학습면

필수 요소:

- unresolved issue
- repeated failure pattern
- fix applied but unverified
- operator memo
- next rule to add

한 줄 질문:

- "이 시스템은 무엇을 배웠고, 다음부터 무엇을 자동으로 막아야 하는가?"

---

## 5. 공용 객체: `handoff item`

### 5-1. 필요한 이유

운영자는 `AI order`, `project update`, `automation run`, `content review item`을 따로 생각하지 않는다.

운영자는 이것들을 모두 `handoff item`으로 본다.

즉 공용 큐를 만들 수 있는 최소 객체가 필요하다.

### 5-2. 제안 필드

```ts
type HandoffItem = {
  id: string;
  sourceLane: "work" | "revenue" | "content" | "machine" | "learn";
  sourceType:
    | "project_update"
    | "content_item"
    | "ai_order"
    | "automation_run"
    | "webhook_event"
    | "error_log"
    | "manual";
  title: string;
  summary: string;
  ownerType: "self" | "human" | "ai" | "automation";
  ownerId: string | null;
  targetType: "claude" | "codex" | "engine" | "human" | "system" | null;
  priority: "P0" | "P1" | "P2" | "P3";
  status:
    | "queued"
    | "running"
    | "waiting_approval"
    | "waiting_reply"
    | "blocked"
    | "verify"
    | "done";
  dueAt: string | null;
  definitionOfDone: string | null;
  evidenceExpected: string | null;
  evidenceActual: string | null;
  approvalRequired: boolean;
  nextCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 5-3. 1차 구현 방식

바로 새 테이블을 만들지 않아도 된다.

먼저 `apps/hub/lib/server-data.js`에서 파생 집계를 만든다.

예:

- `ai_orders` -> handoff item
- `content_items` 중 review/publish -> handoff item
- `project_updates` 중 blocked/next_action 존재 -> handoff item
- `automation_runs` 실패/queued 지연 -> handoff item
- `error_logs` unresolved -> handoff item

즉 1차는 `derived operator queue`로 시작하고, 2차에 DB 정규화한다.

---

## 6. 구현 우선순위

### Phase A. 조작면 전환

목표:

- 큰 구조를 바꾸지 않고 운영자 경험을 바꾼다.

변경:

- 상위 탭 기본 진입점 redirect
- overview 탭 제거 또는 숨김
- `AI` 라벨을 `Dispatch` 또는 `위임`으로 바꾸는 준비
- `Automations` 루트를 `runs` 중심으로 변경
- `/dashboard`에 `Decide / Dispatch / Wait / Verify` 블록 추가

대상 파일:

- `apps/hub/lib/dashboard-data.js`
- `apps/hub/components/shell/dashboard-shell.jsx`
- `apps/hub/app/dashboard/*/layout.jsx`
- `apps/hub/app/dashboard/page.jsx`

### Phase B. 공용 큐 도입

목표:

- 운영자용 cross-lane queue를 만든다.

변경:

- `getOperatorQueueData()` 추가
- `handoff items` 파생 집계 추가
- `waiting approval`
- `ready to dispatch`
- `need verification`
- `machine exceptions`
  네 가지 뷰 생성

대상 파일:

- `apps/hub/lib/server-data.js`
- 신규 `apps/hub/lib/operator-queue.js`
- 신규 `apps/hub/components/dashboard/operator-queue-*.jsx`

### Phase C. Dispatch 재정의

목표:

- `AI Console`을 `Dispatch Console`로 바꾼다.

변경:

- `chat`과 `council`은 보조 rail로 축소
- `orders`를 메인 화면으로 승격
- `definition of done`, `evidence expected`, `approval required` 추가

대상 파일:

- `apps/hub/app/dashboard/ai/page.jsx`
- `apps/hub/app/dashboard/ai/orders/page.jsx`
- `apps/hub/components/dashboard/ai-orders-workspace.jsx`
- `apps/hub/app/api/ai/orders/route.js`

### Phase D. Machine 예외 보드화

목표:

- 성공 요약이 아니라 실패 조치면으로 전환

변경:

- runs 첫 화면에서 success list 축소
- failed / stalled / retry / auth / mapping issue 우선 배치
- "human review needed"를 명시적 상태로 표시

대상 파일:

- `apps/hub/app/dashboard/automations/page.jsx`
- `apps/hub/app/dashboard/automations/runs/page.jsx`
- `apps/hub/lib/server-data.js`

### Phase E. DB 정규화

목표:

- 진짜 운영 OS처럼 위임 객체를 장기 보존

변경:

- `handoff_items` 또는 `operator_queue_items` 테이블 도입
- source row와 evidence row 연결
- verification / approval 상태 이력 저장

대상:

- `supabase/schema.sql`
- `supabase/migrations/*`
- `apps/hub/lib/server-write.js`

---

## 7. 현재 코드 기준 파일별 실행 지시

### 7-1. 바로 바꿔야 하는 곳

- `apps/hub/lib/dashboard-data.js`
  - `navigationItems`에서 overview children 제거 준비
  - `ai` 섹션 라벨을 `Dispatch` 개념으로 재설계

- `apps/hub/app/dashboard/page.jsx`
  - KPI 요약 중심에서 `direct decisions`, `ready to dispatch`, `waiting / approval`, `exceptions`, `verification` 중심으로 재조합

- `apps/hub/app/dashboard/work/page.jsx`
  - overview 페이지 유지 시에도 `프로젝트로 이동하는 도입면`만 남기고 카드 수를 대폭 줄임
  - 가능하면 `/dashboard/work/projects`로 redirect

- `apps/hub/app/dashboard/content/page.jsx`
  - 루트 summary 제거
  - queue + current campaign + publish next만 남김

- `apps/hub/app/dashboard/automations/page.jsx`
  - pulse summary를 보조로 내리고
  - triage / exception / retry를 최상단으로 올림

- `apps/hub/app/dashboard/ai/page.jsx`
  - summary page가 아니라 `dispatch home`으로 재구성

### 7-2. 신규 집계 함수 제안

`apps/hub/lib/server-data.js`에 아래 함수 추가를 권장한다.

- `getDirectDecisionItems()`
- `getReadyToDispatchItems()`
- `getWaitingApprovalItems()`
- `getVerificationItems()`
- `getMachineExceptionItems()`
- `getOperatorQueueData()`

이 함수들은 기존 row들을 파생 집계하는 방식으로 시작한다.

---

## 8. 성공 기준

개편 성공 기준은 시각적 아름다움이 아니라 운영 속도다.

### 운영 기준

- 운영자가 허브 첫 화면에서 10초 안에 오늘의 직접 판단 3개를 말할 수 있다.
- 허브 첫 화면에서 15초 안에 하나 이상을 위임할 수 있다.
- 실패 중인 자동화를 20초 안에 찾을 수 있다.
- 승인 대기 항목을 섹션 탐색 없이 볼 수 있다.

### 제품 기준

- overview 중복 제거
- AI가 별도 섹션이 아니라 위임 레이어로 작동
- automations가 건강도 보드가 아니라 예외 보드로 작동
- 각 도메인 레인이 허브 전체 운영 루프에 연결

---

## 9. 한 줄 결론

Moonlight Hub는 "정보를 잘 모아둔 허브"에서 멈추면 안 된다.

목표는 이것이다:

- 무엇을 직접 결정할지 보이고
- 무엇을 누구에게 넘길지 보이고
- 무엇이 막혔는지 즉시 보이고
- 무엇이 검증 대기인지 닫을 수 있는

운영자용 command deck.
