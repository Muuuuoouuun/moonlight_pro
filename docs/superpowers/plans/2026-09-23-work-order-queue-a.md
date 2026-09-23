# 작업 지시 큐 A 마무리 구현 계획

> 승인 설계: `docs/superpowers/specs/2026-09-23-work-order-queue-reassessment-design.md` A0·A2~A5. A1과 A2의 첫 화면 신호 제거는 `5087566`에서 완료됐다. 여러 파일 수정은 별도 worktree에서 진행한다.

**목표:** 작업 지시를 현재 대기 중심으로 읽고, 정확한 상태 건수를 표시하며, 운영자가 승인·보류·완료·삭제를 되돌리거나 보류 항목을 다시 열 수 있게 한다. 인박스 캡처는 이 표면에서 제외한다.

**구조:** 서버의 목록·건수·삭제를 `workspace_id`와 `source <> inbox`로 제한한다. 쓰기 전이는 기존 `work_orders` 정본에 유지한다. 클라이언트는 딥링크 상태를 기준으로 목록을 읽고 `useUndoableAction`으로 쓰기를 3.5초 지연한다.

**기술:** Next.js Hub API, Supabase REST, React, Node `--test`.

## 작업 1: 읽기 계약과 정확한 건수

- [x] `work-order-counts.js`에 상태별 `countSupabaseRows` 조회를 만들고 설정 없음은 `preview`, 어느 한 조회라도 실패하면 `error`를 돌려주는 테스트를 먼저 추가한다.
- [x] `getWorkOrders`에 선택형 `scope: 'proposals'` 필터를 추가한다. 기본 범위는 유지해 MCP의 인박스 조회를 바꾸지 않는다.
- [x] GET `/api/hub/work-orders`의 `status=proposed|approved|executed|dismissed|all`을 검증한다. `approved`는 `executing`을 포함한다. `summary=1&scope=proposals`는 정확한 건수 함수를 사용한다.
- [x] Daily Brief의 보조 요약과 카드가 같은 건수 함수를 쓰게 하고, 에러를 0건으로 바꾸지 않는다.

## 작업 2: 삭제·다시 열기 서버 계약

- [x] DELETE `/api/hub/work-orders`의 write guard, UUID 배열 1~50, workspace와 `source <> inbox` 필터, 부분 일치 삭제 결과, 0행 성공, 저장 실패 봉투를 테스트로 고정한 뒤 구현한다.
- [x] `decideWorkOrder`에 `approved|dismissed → proposed`를 추가하고 `decided_at=null`, `proposed_at=now`, `body.firstProposedAt` 최초 보존을 테스트로 고정한다. `executing|executed`는 재개방하지 않는다.
- [x] 열린 `followup` 유니크 충돌은 `open-followup-exists`로 보고한다.
- [x] MCP `decide_work_order` 설명을 실제 상태 전이 계약으로 정정한다.

## 작업 3: 오늘의 보조 카드

- [x] Today의 `ApprovalQueueCard`를 읽기 전용 건수와 “작업 지시에서 보기” 링크로 축소한다. 자체 fetch와 read 실패 가드는 유지한다.
- [x] `queue-approvals`는 홈·오늘의 신호에 재도입하지 않는다.

## 작업 4: 작업 지시 보기

- [x] 상태 필터의 기본값을 `proposed`로 두고 `?status=` 딥링크를 유지한다. `view=jobs` 전환 때 status를 보존한다.
- [x] 정확한 건수와 한국어 헤더·`LifecycleBadge`를 쓰고 PERSONAS 스키마 줄을 없앤다.
- [x] 승인·보류·완료·삭제는 지연 쓰기 + 되돌리기를 사용한다. 지연 중인 행은 다른 동작을 잠근다. 삭제는 최대 50건을 선택할 수 있게 한다.
- [x] 허위 실행 버튼을 없앤다. 실제 연락은 연결 딜의 연락 기록으로 이동하고, 완료는 상태 표시만 한다.

## 검증·통합

- [x] 대상 테스트의 red→green과 전체 `npm test`, `git diff --check`를 확인한다.
- [x] 주 워크트리의 다른 변경을 보존한 채 fast-forward 병합하고 전용 worktree를 제거한다.

## 검증 기록

- 최신 메인 병합 기준 `npm test`: 2,559개 중 통과 2,548 · 실패 0 · DB 연결 필요 skip 11.
- `npm --workspace @com-moon/hub run build`: 성공.
- 로컬 실데이터 읽기 QA: 기본 대기 0건, 완료 1건, 보류 25건, 전체 26건. 보류 필터와 코드 작업 전환 후 복귀 시 `status=dismissed` 유지. 운영 데이터에 쓰기 동작은 수행하지 않았다.
- `git diff --check`: 공백 오류 없음.
