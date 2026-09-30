# Research and Reports Completion Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development and verification-before-completion. Independent file ownership permits parallel implementation; root integrates shared readiness/configuration.

**Goal:** 실제 리서치 준비·검토·보고서 저장과 수신을 연결하고 기존 전환 결함을 고친다.
**Architecture:** 기존 Supabase RPC·Hub repository·Engine 모델 경로를 재사용한다. 보고서는 공통 읽기 투영과 주간 snapshot 원장을 사용하며 자동 리서치는 독립 실행 receipt와 서버 전용 AI 생성을 사용한다.
**Tech Stack:** Next.js App Router, JS/TS, Supabase PostgreSQL, Gemini, existing Hub primitives.

## Task 1 — 보고서 원장·API (root)
- [ ] `reports-contract.js`와 repository/API의 기간 검증·실측 보존·같은 요청 재시도 테스트를 작성하고 실패를 확인한다.
- [ ] migration `20261001_0056_report_documents.sql`: RLS, 서비스 전용 원자 명령, 중복 요청 receipt, workspace·revision 경계.
- [ ] `lib/repositories/reports-ledger.js`, `lib/reports-service.js`, `app/api/hub/reports/route.js`를 구현한다. 스펙 공통 보고서 계약을 지킨다.
- [ ] 이전 완료 주간 snapshot의 월·목 cron과 실제 DB 왕복을 확인한다.

## Task 2 — 보고서 허브 UI·리서치 복귀 (UI agent)
- [ ] 목록·장르/범위·주차 필터·상세, 사실/해석/판단 구분, API read 실패·partial, deep link·loading 계약 테스트가 실패하는 것을 확인한다.
- [ ] `pages/reports.jsx`·`reports.css`, hub-app/nav/data/workspace-map 진입점을 구현한다. DESIGN.md tokens와 기존 primitives를 쓴다.
- [ ] 주간 저장·QA/평가 문서 등록·판단 저장과 기존 Office 주간 정리를 스펙 API에 연결한다.
- [ ] 소재→Studio 후 복귀 링크를 현재 콘텐츠에 도달하도록 수정한다. 준비 실행·최근 결과를 연구함에 연결한다.
- [ ] 데스크톱·390px·dark/light·브라우저 저장/새로고침/필터를 검증한다.

## Task 3 — 자동 리서치 서버 (pipeline agent)
- [ ] 원문 확보·중복·request claim·실패·구조화 AI·검토 대기 저장 테스트가 실패하는 것을 확인한다.
- [ ] migration `20261001_0057_research_runs.sql`, Hub run service/API와 Engine `/api/research/prepare`, source hash·retry·usage를 구현한다.
- [ ] 공식 피드와 bounded discovery·안전한 공개 원문 접근을 연결한다. 검색 결과 발췌·미확인 인용을 검증된 사실로 저장하지 않는다.
- [ ] KST 브랜드 주기에 맞는 cron service/route를 구현한다. 설정 enabled 및 비용 상한 없음은 사용자 결정이다. 브랜드당 실제 수량·실패·usage를 기록한다.
- [ ] 실제 원문과 모델로 3브랜드 생성 후 brief/run 재조회를 확인한다.

## Task 4 — 운영 설정·통합 검증 (runtime agent/root)
- [ ] Vercel env·로그인 작업의 현재 상태를 읽고 인증·Hub/Engine 설정 누락을 확인한다. 기존 자격을 보존하고 출력하지 않는다.
- [ ] root가 database-readiness feature 등록·Vercel cron을 통합하고 적합한 설정을 적용한다.
- [ ] 전체 `npm test`, typecheck·contracts·Hub/Engine build, 독립 spec 및 code review를 실행하고 실패를 해결한다.
- [ ] 운영 DB 마이그레이션과 필요한 배포, 인증된 API·저장·화면 왕복, 실행/예상 비용을 확인한다.
- [ ] 실제 완료 범위와 남은 외부 제약을 기록하고 사용자에게 전달한다.
