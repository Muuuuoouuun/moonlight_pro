# Discovery nudge Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with independent spec and quality review.

**Goal:** 문맥별 주요 행동과 영속적인 미루기/숨김/해소를 하나의 계약으로 제공.
**Architecture:** SQL factual candidate + scoped state/receipt RPC, Hub read/write adapter, reusable nudge presentation in discovery.
**Tech Stack:** Next.js, React, Supabase REST/RPC, PostgreSQL, node:test.

- [x] SQL read/save RPC·state/receipt 및 실제 PostgreSQL tests. Read highest candidate first then suppression; save exact revision+trigger validation and idempotency.
- [x] Hub repository and guarded route with HTTP200 read error envelopes; validation/error/preview tests.
- [x] Shared rule copy/client request helper tests. Reusable UI context fetch, retry, snooze/dismiss/resume, cross-tab refresh.
- [x] Discovery detail placement and focus-to-field; same state consumed by due strip; staged disclosure and quiet feedback.
- [x] Independent spec and quality review, whole tests/contracts/build, desktop/mobile browser checks.
- [x] Documentation, explicit paths commit, local integration and worktree cleanup. Operating DB activation/deployment tracked separately.

## 검증 기록 (2026-09-13)
- Nudge JS/route + 실제 PostgreSQL 21 tests 통과(0 skipped). 권한·workspace 격리·기록 불변·멱등 재시도·동시 변경·receipt 실패 rollback 포함.
- 전체 npm test: 1,092 tests 중 1,087 pass, 5 기존 환경 의존 skip. contracts·typecheck·Hub/Engine build 통과.
- 스펙 리뷰: 완료 할 일 규칙의 불필요한 experiment 조건 제거, 외부 revision 변경 시 실제 최신 기록 불러오기 보강 후 승인.
- 품질 리뷰: write 중 수신한 변경 신호를 큐에 보존하고 응답 후 재조회하도록 수정 후 승인.
- Browser: localhost:3107, 임시 REST adapter → 격리된 실제 PostgreSQL RPC. 운영 데이터 미사용. CUA 인앱 브라우저 1280×800 / 390×844.
- 근거→저장→가설 제안, 결과/검토 날짜 직접 포커스, 단계적 펼침, ESC 닫기, 숨김 실패 시 유지·재시도, reload 후 지속, 다른 창 resume/snooze 반영, stale record 복구, 상단/상세 중복 억제 확인. 콘솔 관련 오류 없음.
- 동시 변경 재현: A의 committed POST 응답을 15초 지연 → B가 최신 상태를 읽고 resume → A가 아직 pending임 확인 → 늦은 A 응답 후에도 B 상태 유지 확인.
- 날짜는 실제 키보드 입력으로 선택 날짜 저장을 확인. CUA date.fill은 React 변경 이벤트를 전달하지 않았고 인앱 네이티브 달력 팝업은 브라우저 자체 crash가 발생해 해당 팝업 경로는 미검증. 앱 코드로 이를 우회하지 않았다.
- 0031 운영 DB 적용·배포는 이 로컬 완료와 구분한다. 문의 동기화 cron 변경 없음.
