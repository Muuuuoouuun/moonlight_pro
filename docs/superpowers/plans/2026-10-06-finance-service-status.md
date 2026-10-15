# 고정비 이용 상태 Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline execution. 운영자가 상태·통신비 관리를 요청했고 기존 금융 표를 이어서 구현한다.

**Goal:** 이용 상태·재개 예정일을 영속 관리하고 통신비 계약을 실제 결제 관측과 구분해 등록한다.

**Architecture:** 기존 JSON review에 두 필드를 추가하고 revision RPC를 유지한다. 계약 전용 import는 명시적으로 구분하며 결제 관측 범위에서는 제외한다. 표는 기존 상태 프리미티브와 상세 편집을 재사용한다.

**Tech Stack:** Next.js Hub, Supabase REST/PostgreSQL, React shared primitives, node:test.

- [x] `finance-ledger.test.mjs`·`finance-view.test.mjs`·`finance-migration.test.mjs`에 상태 enum, 재개 조건, 계약 전용 등록, 관측 범위와 역사 보존 검사를 추가하고 기존 구현에서 실패를 확인한다.
- [x] `finance-ledger.js`·`finance-view.js`에 검증과 투영을 구현하고 0068 migration에서 DB 검증·RPC를 갱신한다. `database-readiness.mjs`에 본문 버전 확인을 등록한다.
- [x] `finance.jsx`·`finance.css`에 계약 이름 옆 상태, 상세 이용 상태·재개 예정일, CFO 상태 합계를 넣는다. 본문에 새 패널을 증설하지 않는다.
- [x] `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/finance-ledger.test.mjs apps/hub/components/hub/pages/finance-view.test.mjs scripts/finance-migration.test.mjs scripts/database-readiness.test.mjs`와 전체 검사를 통과시킨다.
- [x] 서울 ref를 명시해 0068을 적용하고 통신비 계약만 등록한다. 기존 거래 수·소비 합계·수집 종료일과 새 계약의 미확인 금액을 재조회한다.
- [x] 실제 브라우저에서 상태 저장·새로고침·재개 필드·ESC·390px·중간 너비·라이트/다크를 검증한다. 금융 원문과 스크린샷은 비공개 경로에 둔다.
출시 후 PR 검사·운영 배포·작업 트리 정리 결과는 PR 상태와 비공개 검증 기록에서 확인한다.
