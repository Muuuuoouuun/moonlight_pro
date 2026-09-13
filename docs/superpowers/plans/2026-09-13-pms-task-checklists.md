# 하위 아이템 상세 체크리스트와 진행 게이지

**Goal:** 프로젝트 아래 하위 아이템을 클릭해 상세 내용과 세부 체크리스트를 설정하고, 저장된 체크 완료율을 목록에서 확인한다.

**Architecture:** 현재 프로젝트 아래의 tasks를 유지한다. 세부 항목은 tasks.meta.checklist에 ID·제목·완료 여부·메모를 저장하며, Hub → Engine의 기존 생성·수정 경로를 사용한다. 체크리스트 수정에는 정확한 updated_at 비교를 요구하고 기존 meta의 source_refs·deal_id 등을 보존한다.

**Tech Stack:** Next.js, React, 기존 EditDrawer·Checkbox·진행 게이지, Node test, Supabase REST.

## 동작 계약

- 현재 ‘하위 아이템’마다 체크리스트 완료 수/전체 수와 백분율을 표시한다. 체크리스트가 없으면 숫자를 만들지 않고 추가 안내를 표시한다.
- 클릭한 상세는 ‘상세 내용’과 ‘체크리스트’ 탭을 제공한다. 항목 추가·제목/메모 편집·체크·위아래 이동·삭제는 초안에 반영하고 저장 버튼으로 함께 저장한다. ESC의 변경 버리기 확인을 유지한다.
- 최대 50항목, 제목 200자, 메모 500자. ID는 UUID이고 중복될 수 없다. 빈 제목·잘못된 완료 값은 서버에서도 거부한다.
- Hub 작업 생성·수정과 Engine 커맨드는 UTF-8 기준 256 KiB까지 받는다. 허용된 최대 체크리스트와 작업 필드의 JSON 이스케이프를 포함하며, 초과 입력은 쓰기 전에 차단한다.
- 체크리스트 100%와 작업의 완료 상태는 별도로 표시한다. 프로젝트의 기존 완료 작업 수 집계는 유지한다.
- 리스트의 하위 항목, 백로그, 보드, 할 일, 프로젝트 상세가 같은 체크리스트 진척을 보여준다.
- 다른 창의 체크리스트도 변경됐다면 양쪽 내용을 유지하고, 사용할 목록을 선택한 다음 저장한다. 다른 필드의 변경만 있으면 기존 입력을 보존해 재시도한다.

## 구현과 검증

- [x] `apps/engine/lib/pms-command.ts`, `pms-command-service.ts`: checklist 생성/수정 검증과 meta 병합. 테스트에서 잘못된 입력·누락된 버전·관련 meta 보존·경합·실패 시 쓰기 방지를 먼저 확인한다.
- [x] `apps/hub/lib/task-checklist.js`, `pms-ui.js`, `pms-work-items.js`, `repositories/operating-ledger.js`: 조회·초안·차이·저장 응답·진척 계산. 빈 체크리스트와 순서 변경 및 부분 완료를 회귀 테스트한다.
- [x] `project-task-checklist.jsx`, `project-task-detail-drawer.jsx`, `project-execution.css`: 체크리스트 편집기와 공통 게이지, 기존 EditDrawer의 탭을 사용한 상세.
- [x] `projects.jsx`, `project-detail-panel.jsx`, `project-execution-backlog.jsx`: 모든 작업 표면에서 상세와 진척 연결, 충돌 시 목록 선택.
- [x] 전체 테스트·계약·타입·Hub/Engine 빌드. Playwright로 추가 → 체크 → 저장 → 새로고침, 정렬·삭제·충돌·실패·모바일·키보드 경로 확인.
- [x] 현재 통합 브랜치에 로컬 병합 완료. 독립 worktree·브랜치·임시 서버 정리 완료. 기존 사용자 `apps/engine/next-env.d.ts` 변경 보존.

## 검증 기록 · 2026-09-13

- `npm test`: 최신 메모 기능과 통합 후 1,061개 중 1,056개 통과, 환경 의존 5개 skip, 실패 0개. `npm run check:contracts`, `npm run typecheck`, `npm run build` 통과(Hub·Engine). 통합 후 프로덕션 빌드에서도 아래 브라우저 15개 흐름 재통과.
- Playwright 15개 흐름 통과: 실제 상세 화면에서 추가·메모·완료·순서 변경·삭제 되돌리기·저장 후 재조회, 모든 작업 화면의 같은 진척, 두 가지 충돌 선택, 실패 후 초안 보존, ESC 변경 확인, 390px 모바일 스크롤, 전체 비우기, 체크리스트를 포함한 하위 아이템 생성. 콘솔·런타임 오류 없음. 데스크톱·모바일 캡처도 시각 확인했다.
- 브라우저 검증은 가로챈 API fixture를 사용했다. Engine 라우트 테스트는 Supabase REST 응답을 대체하여 메타 보존·정확한 버전 필터·응답 재조회 경로를 검증했다. 운영 데이터 쓰기나 배포는 수행하지 않았다.
- 코드 리뷰 지적 2건 수정 후 23개 관련 테스트 재통과: JSONB 객체 키 순서에 독립적인 생성 재시도 비교, 최대 한글·이스케이프 입력과 실제 UTF-8 용량 제한. 재검토에서 추가 차단 사항 없음.
