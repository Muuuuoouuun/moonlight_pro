# Guru 신호 소음 차단 구현 계획

> 기존 승인 설계: `docs/superpowers/specs/2026-09-23-work-order-queue-reassessment-design.md` A1·A2. 이 계획은 먼저 홈·오늘의 반복 노출과 기본 자문 공급을 끊는 독립 변경이다. 작업 지시의 상태 필터·삭제·되돌리기는 같은 설계의 다음 구현 단위다.

**목표:** 단순 자문에서 승인 대기를 만들지 않고, 저장된 승인 대기를 홈·오늘의 추천 신호로 반복 승격하지 않는다.

**구조:** Council의 지시 생성은 명시적 `createWorkOrder: true`에만 반응한다. Daily Brief는 기존 `queue` 데이터를 보조 정보용으로 보존하되 `signals`에는 넣지 않는다. 오늘 화면의 보조 요약은 이 신호의 존재 여부에 의존하지 않는다.

**기술:** Next.js App Router, Node `--test`, React JSX.

## 작업 1: 자문 기본값을 기록만 남기도록 변경

- [x] `apps/hub/lib/advisor-routes.test.mjs`에 빈 요청 `{}`도 `workOrder.reason === 'not-requested'`이고 `state.order`가 없는 테스트를 추가한다.
- [x] 같은 파일의 저장 실패 테스트는 `{ createWorkOrder: true }`를 보낸다. 명시적 생성 경로가 실패를 드러내는 계약을 유지한다.
- [x] 대상 테스트를 실행해 새 기본값 테스트가 실패하는지 확인한다: `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/advisor-routes.test.mjs`.
- [x] `apps/hub/app/api/hub/brand-mentor/route.js`의 조건을 `input.createWorkOrder === true`로 바꾸고, 주석도 명시적 생성에 맞춘다.
- [x] 대상 테스트를 다시 실행해 통과를 확인한다.

## 작업 2: 승인 대기를 홈·오늘 신호에서 제외

- [x] `apps/hub/lib/project-ledger-aggregate-routes.test.mjs`에 `state.orders`에 `proposed` 1건을 주고도 `body.signals`에 `queue-approvals`가 없으며 `body.queue.pending === 1`인 테스트를 추가한다.
- [x] 대상 테스트를 실행해 새 테스트 실패를 확인한다.
- [x] `apps/hub/app/api/hub/daily-brief/route.js`에서 `buildApprovalSignals` 호출과 함수를 제거한다. `queue` 봉투는 보존한다.
- [x] 더는 생성되지 않는 `queueApprovals` 목적지를 `apps/hub/lib/signal-targets.js`와 계약 테스트에서 제거한다.
- [x] 대상 테스트를 다시 실행해 통과를 확인한다.

## 작업 3: 오늘의 보조 요약 정리

- [x] `apps/hub/components/hub/pages/daily-brief.jsx`에서 `approvalPromoted` 분기를 없애고 대기가 1건 이상일 때만 보조 요약에 표시한다. 읽기 실패 문구는 유지한다.
- [x] `apps/hub/components/hub/pages/daily-brief-slots.test.mjs`와 `apps/hub/lib/state-usage.test.mjs`를 실행해 Today의 렌더·read 실패 가드 회귀를 확인한다.

## 검증

- [x] 관련 단위 테스트와 루트 `npm test`를 실행한다.
- [x] `git diff --check`와 변경 파일 목록을 확인한다.
- [x] 현재 기준 승인 대기 0건을 다시 조회하고, 코드 수정으로 운영 데이터가 새로 생성되지 않았음을 확인한다.

## 범위 경계

- 자동 Guru 후속 생성 기준과 승인 이후 CRM 결과 연결은 승인 설계 B 단계다. Q117 운영자 선별 정책을 반영한 별도 결정이 필요하다.
- 이 변경은 오늘의 보조 `ApprovalQueueCard`를 읽기 전용으로 바꾸는 A2의 나머지와 A0·A3~A5를 완료했다고 주장하지 않는다.
