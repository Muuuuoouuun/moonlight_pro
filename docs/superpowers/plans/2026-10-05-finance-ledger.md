# 개인 소비·구독 원장 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for backend/import and superpowers:subagent-driven-development for the independent UI task. Track steps below; user authorized implementation on 2026-10-05 with “진행 ㄱㄱ”.

**Goal:** 수집한 실제 금융 자료를 개인 금융 원장에 저장하고 기존 현금 흐름 탭에서 소비·구독·회사 청구 검토를 조회·수정한다.

**Architecture:** source 관측을 삭제하지 않는 금융 전용 테이블 3개(imports/entries/subscriptions)를 추가한다. expense 순액과 wallet movement를 분리하고 확인된 duplicateOf만 합계에서 제외한다. RPC는 import 원자성·재시도·검토 revision 충돌을 처리하고 Hub 인증·write guard·repository를 따른다.

**Tech Stack:** Next.js Hub, React shared primitives, PostgreSQL service_role-only RPC, Supabase REST, node:test.

## 1. 금융 계산·검증

Files: `apps/hub/lib/finance-ledger.js`, `apps/hub/lib/finance-ledger.test.mjs`.

- [x] 테스트 먼저 작성: 충전은 소비에서 제외, 확인된 중복만 제외, 취소 순액 반영, 외화 미환산 합산 금지, 사용 미확인 보존.
- [x] `node --test apps/hub/lib/finance-ledger.test.mjs`로 누락 기능 실패 확인.
- [x] `validateFinanceImport(payload)`, `projectFinance(entries, subscriptions, imports)` 구현. DTO entry는 id/source/sourceKey/type/date/merchant/grossAmount/refundAmount/netAmount/movementAmount/walletKind/duplicateOf/group/claimCandidate/review/revision; subscription은 id/name/statedAmount/statedCycle/amount/currency/cycle/nextDate/accountAlias/usageNote/purpose/revision.
- [x] 같은 테스트의 성공과 입력 오류를 확인한다.

## 2. 저장소·인증 API

Files: `supabase/migrations/20261005_0067_personal_finance.sql`, `scripts/database-readiness.mjs`, `apps/hub/lib/repositories/finance.js`, `apps/hub/lib/finance-service.js`, `apps/hub/app/api/hub/finance/route.js`.

- [x] import 재시도·다른 입력 충돌, 검토 stale revision, 개인 자료 ClassIn 격리를 테스트한다.
- [x] 세 테이블은 RLS, anon/authenticated 접근 없음, service_role SELECT 및 RPC만 허용한다. `finance_import_v1(uuid,jsonb)` 원자적 저장, `finance_review_v1(uuid,text,uuid,integer,jsonb)` 검토 필드만 수정한다.
- [x] GET 봉투는 HTTP 200 error를 유지하고 private/no-store. POST는 write guard와 bounded JSON, workspace 서버 결정, 검토 revision 필수. GET DTO는 entries/subscriptions/imports/monthly/totals/groups/wallet/coverage.
- [x] 검토 API: `{action:'review',entity:'entry'|'subscription',id,expectedRevision,changes}`. entry changes는 purpose/claimStatus/approvedAmount/recoveredAmount/note. subscription changes는 amount/currency/cycle/nextDate/accountAlias/usageNote/purpose. 미확인 금액은 null, 금융 관측은 수정하지 않는다.
- [x] migration을 readiness에 등록하고 테스트한다.

## 3. 개인 현금 흐름 UI

Files: `apps/hub/components/hub/pages/finance.jsx`, `finance.css`, `hub-nav.js`, `hub-data.js`, `hub-app.jsx`, 해당 navigation/surface 테스트.

- [x] 개인 기존 다섯째 탭을 cashflow로 교체하는 실패 테스트를 먼저 쓴다. 옛 revenue/overview는 개인 매출 전망으로 보존한다.
- [x] `흐름 / 구독·고정비 / 회사 청구` SegmentedControl, 월 필터, 월별 순소비와 wallet 충전 분리, 거래 검색·목록·상세 검토 드로어를 구현한다.
- [x] 구독은 자술·관측·약정·사용을 구분하고 Claude 두 플랜에 공동 관측액을 중복 합산하지 않는다. 청구 후보는 업무 목적·신청·승인·회수를 따로 편집한다.
- [x] CFO 검토 자료는 더보기 드로어에 수집 범위·추가 확인을 담고 기존 Office로 연결한다. 자동 요청·발송·해지·신규 상시 연동은 만들지 않는다.
- [x] error/preview/loading/empty 구분, 저장 실패 초안 보존, 모바일 390px, light/dark를 확인한다.

## 4. 실제 가져오기·출시

Files: `scripts/import-finance.mjs`, 로컬 비공개 finance bundle; 코드에는 개인 금융값을 넣지 않는다.

- [x] 비공개 원본 검토한 원본 행과 초기 구독 계약를 표준 bundle로 변환하고 명시적으로 검증한 중복을 연결한다. source key는 파일 근거 해시이며 날짜/금액만 비슷한 항목을 합치지 않는다.
- [x] importer dry-run에서 소비/머니/중복을 대사하고, 서울 ref를 명시해야만 apply할 수 있게 한다.
- [x] migration 적용 → 실제 import → 재시도 duplicate → DB 재조회 → UI 대사를 순서대로 검증한다.
- [x] root tests, typecheck, Hub build, 인증 read/write, 실제 모바일·light/dark 화면을 검증한다.
- [x] 운영 화면 접근 가능한 런타임에 반영하고 저장된 범위·미확인 은행 입출금·사용량을 보고한다. git staging은 수정한 경로만 사용한다.

이번 실행은 수집 자료 등록과 검토 UI의 첫 버전이다. 전체 은행 계좌·할부·대출·자동 수집은 후속 범위이며 09-13 전체 금융 기획 완료로 표시하지 않는다.

검증 기록: 최신 main 통합 뒤 root tests 4,611건(통과 4,598, 조건부 skip 13), desktop 346건, typecheck·계약·ClassIn 검사, Hub·Engine 빌드, 운영 의존성 audit 통과. 서울 DB 0067과 준비 검사 통과. 실제 import·duplicate 재시도·원장 재조회, 브라우저 구독 검토 저장과 409 초안 보존을 확인했다. 운영 배포 뒤 접근·모바일 검증은 QA 기록에서 최종 확인한다.
