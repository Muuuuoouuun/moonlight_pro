# 펫 Office 작업 목록과 클릭 반응 구현 계획

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Independent backend work follows superpowers:dispatching-parallel-agents.

**Goal:** 선택한 1안의 최근 Office 요청·결과 읽기를 단일 Mac 펫 창에 구현하고, 단일 클릭의 더블클릭 대기 지연을 제거한다.

**Architecture:** 기존 Office 요청 정본을 제한된 서버 요약 RPC로 읽는다. Native Store는 공용 Hub 세션을 쓰고 늦은 응답·범위·연결 변경을 구분한다. 클릭은 mouse-up에 즉시 반응하고, 더블클릭의 고정 동작은 창 전환을 넘어 보존한다.

**Tech Stack:** SwiftUI/AppKit, Next.js read API, Supabase REST/RPC, node test, Swift 진단 스크립트.

## 1. 클릭 지연

- [x] 원인 추적: PetClickView.mouseUp가 NSEvent.doubleClickInterval 전체를 기다린다.
- [ ] 즉시 반응 회귀 검사부터 추가하고 기존 구현에서 실패 확인.
- [ ] 단일 클릭 즉시 열기, 더블클릭 고정, 드래그/우클릭 취소 보존.
- [ ] 같은 화면 위치의 perched 메모로 넘어간 뒤 두 번째 클릭도 고정으로 처리.
- [ ] native SelfCheck와 실제 펫 열기/탭 전환 확인.

주 파일: Support/WindowCoordinator.swift, Support/SelfCheck.swift, Views/PetVisual.swift, 필요한 경우 Support/PanelInteraction.swift.

## 2. 인증된 요청 요약

- [ ] GET /api/hub/office/inbox의 인증·범위·커서·데이터 최소화 검사부터 작성.
- [ ] 기존 테이블을 읽는 service_role 전용 RPC와 안정적인 createdAt/id 페이지 구현.
- [ ] 만료 우선, 기한 지난 running→unknown, 개인/회사·actor/workspace 격리 검증.
- [ ] DATABASE_FEATURES에 RPC와 함수 본문 버전을 등록.

Wire 계약:

```js
// GET /api/hub/office/inbox?scope=personal&limit=20&cursor=<base64url>
{
  status: 'ready', source: 'live',
  items: [{ requestId, intent, scope, originRef, ownerId, mode,
    participants, createdAt, status, state, expired }],
  hasMore, nextCursor: null // 또는 {createdAt,id}
}
```

기존 특정 origin 요청 목록은 변경하지 않는다. 결과 본문·스냅샷·토큰·실행 명령은 요약에서 내보내지 않는다. 테스트는 workflow 서비스/라우트 및 독립 Postgres에서 수행한다.

## 3. Native 작업 목록·결과·대화

- [ ] Models/OfficeRequestModels.swift, OfficeRequestStore.swift의 범위·페이징·오류·취소·늦은 응답 검사.
- [ ] Support/HubOfficeRequestsAPI.swift에서 요약과 기존 요청 receipt를 엄격히 해석.
- [ ] Views/OfficeCompanionContent.swift에 작업/대화 전환, flat 요청 행, 결과 읽기/뒤로/복사 구현.
- [ ] CompanionPanelView의 Office portal을 교체하고 AppModel의 Store/연결/읽음/단축키를 연결.
- [ ] CompanionLayout의 Office 크기를 424×584pt + perch로 조정.

읽기 실패는 빈 상태로 바꾸지 않는다. 모델 응답과 업무 완료를 합치지 않는다. 입력·결과를 자동으로 전송하거나 업무에 반영하지 않는다.

## 4. 검증·전달

- [ ] 집중 검사: 새 Hub 테스트, Swift requests/API/Store 테스트, 기존 Swift 스크립트.
- [ ] npm test, desktop test, 타입 검사와 Hub/native 빌드.
- [ ] 실제 Mac에서 단일 창·클릭·작업/대화·로그인/오류 상태 확인.
- [ ] 운영 적용이 필요하면 migration/ref/권한과 Hub 배포 버전 호환을 먼저 확인. 적용 여부를 결과에 명시.
- [ ] 명시 파일만 커밋하고 QA 기록 갱신.

참조: 2026-10-03-pet-office-work-first-proposal.md, DESIGN.md, agent-layer-direction, clear-material-correction. Windows는 이번 Mac 구현의 검증 범위에 포함하지 않는다.
