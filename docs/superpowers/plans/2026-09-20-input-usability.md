# Input Usability Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the bounded memo task; remaining tasks run inline, with spec and quality review before integration.

**Goal:** Reduce repeated input actions while preserving saved records, scope, and draft safety.
**Architecture:** Reuse Drawer/EditDrawer and existing task/journal commands. Separate compact checklist interaction from memo metadata. Replace PMS navigation chrome without changing its data model.
**Tech Stack:** Next.js, React, CSS tokens, Node test runner, Supabase REST/RPC.

## 1. Isolated baseline
- [x] Snapshot current shared edits in a dedicated worktree; keep the snapshot out of integration.
- [x] Install dependencies and run baseline tests.

## 2. Checklist
Files: pages/project-task-checklist.jsx, its interaction helper/tests and scoped stylesheet.
- [x] Test Enter insertion after the current row, IME/empty/disabled/limit guards and trailing blank validation.
- [x] Put checkbox/title/actions on one line. Use existing fields and accessible names; disclosure owns notes and reorder actions.
- [x] Preserve stable IDs, focus, note content, conflict resolution and delete undo.

## 3. Memo tags and context
Files: memo-composer/context-picker, journal-client/validation/repository, journal migration and tests as needed.
- [x] Trace save/read/search path, add optional tags through existing note metadata without overwriting legacy fields.
- [x] Add bounded normalized tag input and read/search roundtrip coverage.
- [x] Expose business connection directly; retain post-save editing and draft restoration.
- [x] Preserve existing note kind, enhancement, idempotency and expectedRevision behavior.

## 4. Task capture and PMS chrome
Files: hub-primitives.jsx, pages/project-task-detail-drawer.jsx, pages/projects.jsx, project-pms-components.jsx and scoped CSS.
- [x] Reuse compact Drawer for task creation and group optional form fields behind a disclosure.
- [x] Add save-and-continue with project retained only after saved acknowledgement; failed save keeps the form.
- [x] Replace persistent container sidebar with a searchable compact menu retaining all management actions.
- [x] Remove redundant explanatory legends while preserving labels on data.

## 5. Verification and integration
- [x] Run focused behavior tests, token/motion/state/no-mock checks and full npm test.
- [x] Build Hub and inspect desktop/mobile rendered input surfaces; report any unavailable backend validation honestly.
- [x] Review spec compliance then quality; resolve actionable findings.
- [x] Transfer only the task diff onto the shared working tree after a conflict check. Preserve all concurrent work and remove the dedicated worktree after integration.
- [x] Record actual verification results and remaining practical checks here.


## 검증 기록 (2026-09-20)
- 작업 브랜치 전체 테스트: 1,458 pass / 0 fail / 11 skip (총 1,469). Hub production build 통과.
- 최신 공유 브랜치 통합 후 전체 테스트: 1,476 pass / 0 fail / 11 skip (총 1,487). 인증 게이트13개 재검증 및 Hub production build 통과. 동시 추가된 로그인 페이지의 useSearchParams에 Suspense 경계를 추가해 prerender 실패 수정.
- 이번 작업 diff만 공유 브랜치에 적용했고 기존 Engine 생성 파일·개발 seed 변경은 보존했다. 격리 worktree는 정리했다. localhost:3000 dev 서버 실행·HTTP200 확인. 앱 원격 배포는 하지 않았다.
- 기준선: 1,446 pass / 0 fail / 11 skip.
- 체크리스트 입력 행동 테스트3개, 메모/태그 테스트, PMS 키보드 게이트 회귀 검사 통과.
- JOURNAL_POSTGRES_TEST=1의 격리 PostgreSQL28개 통과: 태그 저장/조회/검색/삭제, 버전·중복·충돌·워크스페이스 격리·권한·재적용.
- 서울 DB ncgpnqfulnlshegalmbd에 0035 적용. read-only 확인: tag_search_installed=true, service_allowed=true, anon_allowed=false, auth_allowed=false.
- 브라우저: Codex in-app localhost:3107, 1280×720 및390×844. 중앙 팝업/모바일 시트, 6px 블러, 속성3열, 한 줄 체크리스트, Enter 다음 줄 포커스, 빈 줄 Enter 무반응, 메모·삭제 되돌리기, 필수 제목 오류 시 입력 보존, dirty ESC 확인, 소속 검색, 태그 칩 삭제, 메모 자동 포커스 확인. 메모 화면 console error/warn 없음.
- 실제 운영 레코드 생성·수정 없이 UI를 확인했다. 터치 장치의 실제 소프트 키보드, UI의 성공 저장 후 연속 입력은 실사용 확인 항목으로 남는다. 저장/재조회 자체는 격리 DB 테스트로 검증.
- 리뷰에서 소속 미지정 연속 입력의 필터 상속과 소속 다이얼로그의 하위 화면 ESC 전파를 수정하고 재검토 통과.

## 다음 실사용 점검
- 처음10건을 입력하며 저장까지 걸린 조작 수, 자주 펼치는 필드, 저장 위치를 찾지 못한 상황 기록.
- 메모 태그는 쉼표/칩, 업무 연결은 명시적 프로젝트·고객·브랜드 관계다. 임의 하위 프로젝트 계층은 추가하지 않았다.
- 목록 일괄 태그/소속 변경, 모든 입력창의 새로고침 초안 복원, 필터 밖 저장 안내는 후속 백로그다. 현재 task는 dirty 닫기 보호, 메모는 기존 탭별 복구를 유지한다.

- 전체 검증 중 기존 discovery 동시성 테스트의 요청 생성 순서 경합을 재현했다. 두 요청의 기준 revision을 쓰기 시작 전에 캡처하도록 테스트만 수정했다. RPC 로직 변경 없음.
