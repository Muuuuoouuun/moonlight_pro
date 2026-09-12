# 기회 탐색 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Work only in the dedicated opportunity-discovery worktree. Steps use checkboxes for tracking.

**Goal:** 기회 등록부터 검증 결과·기존 업무 연결·보류/종료까지 지속 저장되는 독립 화면을 만든다.

**Architecture:** Hub의 기존 write guard와 Supabase REST RPC 패턴을 사용한다. 별도 discovery 테이블은 CRM Opportunity와 분리하고 optimistic revision, request receipt, workspace-scoped target validation을 원자 RPC에서 처리한다. UI는 공통 Drawer와 상태 프리미티브를 사용한다.

**Tech Stack:** Next.js App Router, React JSX, Node test, PostgreSQL, Supabase REST.

## 승인과 범위

2026-09-13 운영자 “구현”으로 설계 §7의 1차 흐름을 진행한다. AI 후보 탐색·외부 수집은 후속이다. 새 사이드바 앵커 `기회 탐색`을 프로젝트 앞에 배치한다. 전체/회사/개인 스코프를 지원한다.

## 1. 저장·API (하위 에이전트)

- [x] `apps/hub/lib/discovery.js`와 `discovery.test.mjs`: snapshot validation과 상태·날짜·연결 계약. 실패 테스트 확인 후 구현.
- [x] `supabase/migrations/20260913_0029_opportunity_discovery.sql`: discovery records, receipts, revision history, atomic save RPC; service-role only writes. workspace 내 실제 task/project/lead/deal만 연결 가능.
- [x] `apps/hub/lib/repositories/discovery-ledger.js`: read list 및 target search, write via server-write RPC. 해당 단위 테스트와 실제 PostgreSQL 테스트.
- [x] `apps/hub/app/api/hub/discovery/route.js`: GET은 HTTP 200 + 오류 봉투, POST는 guard + validation + status mapping. route 테스트.
- [x] migration delivery는 프로젝트 기존 파일 규칙을 확인해 반영.

공유 API 계약: GET `/api/hub/discovery` → `{status, configured, records, message?}`. GET `?targets=1&type=task|project|lead|deal&q=검색어` → `{status, targets:[{type,id,title,href}]}`. POST는 `{id:null|uuid,requestId:uuid,expectedRevision:0|n,title,orgScope:'personal'|'classin',discoveryMode:'capture'|'research',status:'captured'|'exploring'|'validating'|'connected'|'paused'|'closed',evidence,hypothesis,experiment,findings,decisionReason,resumeCondition,reviewDate:null|'YYYY-MM-DD',links:[{type,id}]}`. 응답 `{status:'saved'|'duplicate'|'conflict'|'invalid-input'|'error',record,message?}`. record는 snapshot 필드 + `id,revision,updatedAt`, links는 검증된 `{type,id,title,href}`. 읽기에는 requestId/expectedRevision 불필요.

`connected`는 project/lead/deal 중 하나의 실제 연결 필수. `paused`는 reviewDate 또는 resumeCondition 필수. `closed`는 decisionReason 필수. 문자열 title 300, 본문 각 4000, links 최대 30. 새 snapshot 저장 시 revision history로 이전 검증 기록을 유지한다.

## 2. 화면·클라이언트 (주 에이전트)

- [x] `apps/hub/lib/discovery-client.js` 및 테스트: HTTP 200 오류 봉투, duplicate/conflict 구분, 필터와 검토 시점 판정.
- [x] `apps/hub/components/hub/pages/discovery.jsx`, `discovery.css`: 목록 검색·관심 묶음·상태 필터·공통 EditDrawer를 통한 한 줄 capture·상세 편집. 저장 실패와 conflict 시 입력 유지, 성공한 서버 응답만 목록 반영. N/ESC, deep link `?discovery=id`, 모바일.
- [x] 저장된 상세에서 연결 대상 검색·추가·제거와 실제 대상 이동. 새 대상은 기존 생성 화면을 새 탭으로 열고 생성 후 검색하여 연결한다. 생성 실패를 연결 성공으로 표시하지 않는다.
- [x] `hub-nav.js`, `hub-data.js`, `hub-app.jsx`, `hub-nav.test.mjs`: 독립 앵커, scope, 검색 카탈로그, lazyPage ssr false 유지. 기존 전역 생성과 중복되지 않는 N 동작.

## 3. 검증·문서·통합

- [x] `npm test`, `npm run check:contracts`, `npm run typecheck`, Hub build.
- [x] 브라우저에서 desktop/mobile, preview/error, 저장·재조회·검증·연결 흐름을 가능한 로컬 DB 환경으로 검증.
- [x] 스펙 준수 검토 후 코드 품질 검토, 발견 사항 수정·재검증.
- [x] docs/README.md와 설계 문서에 실제 구현 범위·운영 DB 적용 여부 명시.
- [x] 명시 경로 stage 및 commit, 현재 통합 브랜치 상태 확인 후 병합·검증·worktree 정리. 원격 배포는 이 작업의 완료로 주장하지 않는다. (통합 결과는 아래 실행 기록을 따른다.)


## 실행 기록

- 작업 기준 브랜치와 무관하게 dedicated worktree에서 진행. 기준선은 909 passed / 0 failed / 3 skipped였다.
- TDD: 입력 validation, RPC/권한/원자성·실제 PostgreSQL, repository·route, 클라이언트 오류/재시도/필터, 내비 계약.
- 독립 스펙·코드 검토로 목록 접근 제한, 전체 snapshot 충돌 비교, 이력 페이지 재시도, 공백 대상명, Supabase 기본 service_role 쓰기 권한을 발견하고 수정했다.
- 브라우저: `http://localhost:3107/dashboard/discovery`, 1280×720 / 390×844. 기존 브라우저 도구로 확인. 임시 실제 PostgreSQL + 로컬 REST 테스트 어댑터 사용; Supabase 운영 데이터에는 접근하지 않았다.
- 검증 흐름: 저장소 미설정에서 저장 실패·입력 보존 → 한 줄 생성 → 새로고침 → 근거·실험·결과와 실제 프로젝트 검색 연결 → 재조회 → 보류·검토 날짜 → 다시 볼 기회 → 이전 3개 버전 → 다른 요청으로 동시 수정 → 날짜·연결 포함 충돌 비교 → 내 입력 재저장.
- 개발용 어댑터에는 다른 Hub 원장이 없어 전역 문의 알림은 오류 상태였다. 기회 탐색 자체의 저장·조회와 구분한다. 외부 탐색·AI·실제 Supabase 배포는 검증하지 않았다.

### 운영 DB 적용 준비

신규 테이블과 RPC는 `supabase/migrations/20260913_0029_opportunity_discovery.sql`에 있다. 운영 적용을 실행할 때 기존 runner로 이 파일만 지정한다:

```bash
node scripts/apply-migrations.mjs 20260913_0029_opportunity_discovery.sql
```

현재 작업은 로컬 구현·검증이며 이 명령으로 운영 DB를 변경하지 않았다. 배포 전 migration 적용과 실제 인증 환경의 저장·재조회 검수가 필요하다.

### 최종 검사

- 전체 `npm test`: 947 passed / 0 failed / 3 skipped (950 tests). 신규 PostgreSQL discovery 테스트는 skip 없이 통과.
- `npm run check:contracts`, `npm run typecheck`, Hub production build 통과.
- 브라우저 desktop/mobile 및 밝은·어두운 테마 확인. 마지막 콘솔 error/warn 조회 0건.
- 코드 검토 최종 잔여 필수 수정 0건. 운영 DB 미적용·배포 미실행.

### 통합 검증

- 현재 통합 브랜치에 병합하면서 메모 화면의 lazy import·PAGE_MAP 및 내비 테스트를 모두 보존했다.
- 병합된 전체 코드 `npm test`: 1007 passed / 0 failed / 4 skipped (1011 tests).
- 병합 결과 contract 검사와 Hub production build 통과.


### 운영 적용 후속 (2026-09-13)

- 사용자 “ㄱㄱ”에 따라 운영 적용 진행. 기존 migration runner는 401로 실패해 로그인된 Supabase SQL Editor에서 0029를 적용했다.
- 운영 프로젝트 `rwqefdxalmbrkybxqwxj`: 테이블·RPC 존재, 3개 테이블 RLS, service_role SELECT/EXECUTE 허용 및 직접 INSERT/UPDATE/DELETE 금지 확인.
- 운영 DB 트랜잭션에서 생성 `saved`와 동일 requestId 재시도 `duplicate`·동일 record를 검증하고 ROLLBACK했다. 검증 데이터는 남기지 않았다.
- 검증된 통합 커밋 `f4a0f5f`에서 `codex/discovery-release`를 원격에 게시했다. 다른 세션의 이후 PMS 변경은 배포 후보에 포함하지 않았다.
- 첫 CI에서 기존 반복 업무 테스트 2개가 UTC/KST 날짜 경계 때문에 실패했다. 고정 날짜와 명시적인 now를 사용해 수정했고 UTC 전체 테스트 1007 passed / 0 failed / 4 skipped를 확인했다.
- Vercel은 기존 `/api/cron/inquiries-sync`의 `*/5 * * * *`를 Hobby 요금제에서 거부했다. 문의 동기화 주기 변경 여부를 운영자에게 질문했으며, 답변 전 설정을 변경하지 않는다. 운영 화면은 아직 배포하지 않았다.
- 기존 의존성 보안 검사 실패를 호환 범위의 lockfile 업데이트로 해결했다(Next 16.2.7 → 16.3.5 포함). 업데이트 후 보안 경고 0건, typecheck·contracts·ClassIn 검사·전체 테스트·Hub/Engine build 통과. 새 production build의 기회 탐색 페이지와 생성 drawer도 브라우저에서 확인했다.
