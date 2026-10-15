# Office 역할 배정·상호 검토 구현 계획

**Goal:** 역할별 기능을 담당 추천에 연결하고, 실제 동료 발언과 반론 처리 결과를 추적할 수 있는 검토·평가 로직을 제공한다.

**Architecture:** frozen role card → capability projection → routing v2; discussion v2 → first positions → ring peer review → synthesis resolutions → deterministic structural evaluation. 기존 회의 JSON 저장과 v1 읽기 유지.

**Tech stack:** Next.js Hub/Engine, JavaScript contracts, TypeScript inference core, node:test. 전용 worktree에서 구현하고 관련 파일만 통합한다.

- [x] 역할 기능 투영과 routing v2 — `apps/engine/lib/office/{capabilities,routing}.*`, `packages/agent-contracts/office-routing.*`. 실패 테스트 후 기능/검토 질문/legacy 호환 구현.
- [x] discussion v2 — `packages/agent-contracts/office-deliberation.js`, `office.d.ts`, 엔진 `deliberation.ts`, `source-review.ts`, `response-core.ts`, `workflow-core.ts`. 순환 대상·실제 인용·출처 개수·반론 처리·구조 평가, 실패 테스트와 기존 호출 예산 회귀.
- [x] Hub 입력·표시 — `office-session.js`, `pages/office-council.jsx`, `office-deliberation-{client,controls}.*`, Hub routing tests. 현재 질문 우선, 늦은 응답 차단, 기존 접힌 상세의 공통 표시, v1/v2 읽기.
- [x] 평가 harness 점검 — `scripts/office-evaluation/review.mjs`를 읽고 실제 상호 검토 근거와 독립 품질 심사의 계약을 확인한다. 필요 시 새 버전으로 강화하고 기존 평가 기록은 유지한다.
- [x] 통합 검증 — 관련 테스트 → 전체 테스트 → typecheck → build → 독립 코드 리뷰. 발견된 결함만 추가 수정/검증한다.
- [x] 검증 결과와 남은 실모델 품질 한계를 이 문서와 README에 기록하고 명시 경로로 커밋한다.

## 검증 기록

2026-10-04 전용 브랜치 `codex/office-agent-evolution-1004`에서 완료했다.

- routing v2: 기존 9명 카드의 기능 투영, 주관 산출물·검토 질문, v1 읽기 호환. 역할 카드·말투 변경 없음.
- discussion v2: 2~3명 순환 검토, 첫 발언의 실제 인용, 출처 추적 수, 전수 반론 처리, 구조 평가. 추가 모델 호출 없음.
- 회의 맥락: 열린 반론·구조 점검은 다음 판 assistant history에 유지하고, 명시적 멘토 요청에도 남은 이견 원문을 전달한다. 기존 길이 상한·생략 안내 유지.
- 평가 인용 정책 v2: 응답↔첫 의견 쌍, 변경 전후·이유·이전 요청, 응답 시점별 원문 근거. 기존 심사 결과는 legacy-v1로 보존하고 새 토론의 구 정책 우회는 차단한다.
- 전체 테스트: **4,258개 · 통과 4,245 · 실패 0 · skip 13**. 로컬 Office 회의 PostgreSQL 테스트를 활성화했고 다른 opt-in PostgreSQL 13건은 제외 상태다. 로그 `/tmp/office-role-logic-full-tests-final.log`.
- 타입 검사: **4/4 tasks 통과** (`/tmp/office-role-logic-typecheck.log`). 빌드: **Hub·Engine 포함 3/3 tasks 통과** (`/tmp/office-role-logic-build.log`).
- UI QA: Browser 플러그인 부재로 설치된 Playwright 사용. `http://127.0.0.1:3172/dashboard/agents/office-council`, 1440×1000 라이트·390×844 다크, 테스트 HTTP 응답. 페이지 제목·본문 렌더·오류 오버레이 없음·console/page error 0·모바일 가로 넘침 없음. 회의 복원→검토 상세, 2/2 관점·동료 인용·부분 출처, 현재 질문+결정+원본 안건으로 추천, 계획 표시→명시적 참석자 적용, 업무 쓰기 0, 수정된 질문에 늦은 추천이 들어오지 않음을 확인했다. 로그 `/tmp/office-role-logic-qa.log`, 스크린샷 `/tmp/office-role-logic-qa/{desktop-review-light,desktop-assignment-light,mobile-review-dark}.png`.
- 독립 코드 리뷰: 토론/Hub 96개·후속 이견 전달 16개 테스트 통과. 평가 도구는 구현에 참여하지 않은 검토자가 별도 점검했다. 분모 표시·추천 응답 수명 가드를 수정하고 재검토했다. 남은 구체적 결함 없음.

실제 모델 호출·의미 품질 독립 재채점·운영 배포·DB 적용은 실행하지 않았다. 테스트의 인용 일치·구조 통과는 v25 의미 품질 인증이나 독립 사실 검증이 아니다. 운영 반영 시 기존 영속 회의의 0069 마이그레이션·환경 준비는 이전 단계 배포 절차를 따른다. 이번 논리 확장에는 새 마이그레이션이 없다.
