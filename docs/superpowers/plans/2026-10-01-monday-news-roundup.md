# Monday News Roundup Implementation Plan

**Goal:** 월요일에 주말과 직전 한 주 브랜드 소식을 한 문서로 읽는다.
**Architecture:** Hub가 저장된 출처 기반 브리프를 편집 구성으로 재사용하고 새 service-role RPC가 회차별 문서를 보관한다. 기존 reports-sweep와 보고서 조회에 연결한다.
**Tech Stack:** Node.js, Next.js Hub, Supabase PostgreSQL.

- [ ] `apps/hub/lib/monday-news-roundup.test.mjs`: KST 회차·주말·근거 보존·중복·실패·재실행을 먼저 고정한다. `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/monday-news-roundup.test.mjs`의 모듈 부재 실패를 확인한다.
- [ ] `apps/hub/lib/monday-news-roundup.js`: 순수 기간/편집 함수와 RPC 기반 준비를 구현한다. 회차는 `news-weekly:<월요일 날짜>`이고 날짜를 키에 포함한다. 문자열은 Markdown 문법을 이스케이프한다.
- [ ] `supabase/migrations/20261001_0063_monday_news_roundup.sql`: research 종류 허용, 최신 브리프를 기간·브랜드·workspace로 읽는 RPC, 같은 회차의 저장/중복 RPC를 추가한다. `scripts/database-readiness.mjs`에 등록한다. 기존 적용 마이그레이션은 수정하지 않는다.
- [ ] `scripts/report-documents-migration.test.mjs`: 실제 PostgreSQL에서 새 종류, 회차 중복, 잘못된 기간, 다른 workspace 근거, 서비스 권한, 기존 운영자 판단 보존을 확인한다.
- [ ] `apps/hub/lib/reports-generation.js`: 월요일 08:30 이후 소식 종합을 기존 sweep에 연결한다. 추가 모델 호출은 없다. `apps/hub/lib/repositories/reports-ledger.js`에서 종합본의 기간·Markdown·한계를 보존한다.
- [ ] 대상 테스트, 전체 테스트, Hub build를 실행하고 DB 적용·커밋·CI·운영 배포를 확인한다. 다음 월요일 자동 생성까지 가짜 자료/과거 회차 쓰기는 하지 않는다.
