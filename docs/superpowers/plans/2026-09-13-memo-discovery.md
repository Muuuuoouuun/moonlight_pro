# 메모 2A 검색·재발견 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 단계별 spec 검수 뒤 code quality 검수를 진행한다.
> 상태: 구현·검수·로컬 통합 완료. 운영자의 “고고 무엇보다 편의성에 중점”(2026-09-13)으로 2A 승인. 2B 선택 AI 분석은 별도 후속 범위다.

**Goal:** 검색 한 칸으로 오래된 메모까지 찾고, 프로젝트·고객·브랜드에서 연결된 메모를 바로 다시 읽고 활용한다.

**Architecture:** 기존 journal 원문/쓰기/복구를 유지하고 검색 read API·RPC를 추가한다. 목록 검색과 현재 편집 문서의 조회 상태를 분리한다. 관련 메모는 같은 검색 경계의 limit=3을 재사용한다.

**Tech Stack:** Next.js App Router, React, 기존 Hub primitives/CSS tokens, Supabase REST/RPC, node:test, 임시 PostgreSQL, Playwright.

## 편의성 계약

기본 화면에는 검색창·찾기·조건 열기만 보인다. Enter로 찾고 입력을 한 번에 지운다. 적용 조건은 제거 가능한 요약으로 보여준다. 세부 조건은 필요할 때만 열며 오늘/7일/30일 버튼으로 기간을 고른다. 검색·메모 열기·닫기·뒤로 가기에서 조건과 목록 위치를 보존한다. 같은 메모 편집 세션은 검색 갱신 때문에 초기화하지 않는다.

관련 메모는 업무 상세 안에서 최대 3개를 바로 읽고, 모두 보기로 같은 업무의 전체 메모에 진입한다. 목록·관련 메모는 읽기 상태와 0개를 구분한다. 1차의 입력 복구·충돌 비교·발췌 활용·중복 방지를 그대로 유지한다.

## Task 1: 검색 저장소 경계 (backend 담당)

Files: 새 `apps/hub/lib/journal-search.js`, `apps/hub/lib/repositories/journal-search-ledger.js`, `apps/hub/app/api/hub/journal/search/route.js`, 각 관련 `*.test.mjs`, `supabase/migrations/20260913_0030_journal_search.sql`.

- [x] 먼저 validation/route/repository와 실제 PostgreSQL 실패 테스트 작성. 단일 명령: `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/journal-search*.test.mjs apps/hub/lib/repositories/journal-search-ledger.test.mjs`.
- [x] 다음 명령/응답을 구현한다. 기존 journal GET/POST는 변경하지 않는다.

```js
// GET /api/hub/journal/search
// string query: q,dateFrom,dateTo,kind,contextType,contextId,used,cursor,limit
const filters = { q:'', dateFrom:'', dateTo:'', kind:'', contextType:'', contextId:'', used:'all' };
const response = {
  status:'live', configured:true, workspaceId, filters,
  context:null, // filtered context {type,id,label,href}, if present
  entries:[{id,title,excerpt,occurredAt,updatedAt,noteMeta:{kind},revision,
    match:null, // q present: {field:'title'|'body'|'enhancement',text} around first match
    used:false}],
  nextCursor:null,
};
```

- [x] `normalizeJournalSearch(input)`와 `getJournalSearch(input)`를 제공한다. q는 trim 후 200자까지 문자 그대로, 종류는 기존 journal enum, used는 all/used/unused, limit는 3 또는 40(기본40). 날짜는 유효한 YYYY-MM-DD, KST 시작 포함/종료 다음 날 미포함. 업무 type/id는 쌍으로 검증하고 같은 workspace 실제 객체를 확인한다.
- [x] 매개변수 RPC `journal_search_v1`이 workspace+entry_kind=note를 먼저 한정하고 q는 title/body/note_meta.enhancement OR, 나머지 필터는 AND로 적용한다. context/use는 EXISTS. q의 %/_/backslash/*는 literal. body 전체와 enhancement 전체는 목록에 반환하지 않는다. match snippet은 해당 필드에서 최대180자, 저장 원문은 변형하지 않는다.
- [x] occurred_at desc,id desc cursor; 서버 cursor는 workspace와 정규화된 filters 식별값을 묶고 다른 조건·malformed cursor는 status:error. limit+1 조회로 더 보기만 판단한다. 전체 개수로 오인할 count를 만들지 않는다.
- [x] HTTP200 error/preview envelopes. RPC·table service-role 권한, migration 재적용, KST 경계·동일시각 페이지·오래된 기록·보강-only·literal 특수문자·다중 연결 중복·다른 workspace·삭제된 context를 실제 임시 DB로 확인한다. SQL 인덱스는 workspace/time 및 context 접근부터 사용하고 작은 개인 원장에 없는 확장 의존성을 추가하지 않는다.

## Task 2: 검색·편집 상태 분리 (root 담당)

Files: 새 `apps/hub/lib/journal-search-client.js`와 test, `pages/use-memo-search.js`, `pages/memo-search-controls.jsx`; 수정 `pages/memos.jsx`, `pages/memos.css`.

- [x] URL 보존과 KST preset 테스트부터 실행한다. `from=preview`는 날짜 필터와 분리한다.

```js
// Client helpers: filtersFromParams(params), memoSearchParams(filters),
// memoListHref(params), memoDocumentHref(params,{note,new,draft}),
// memoPeriod(days, now), memoMatchSegments(text, query).
// Starting from ?q=첫주&kind=conversation&note=<id>, closing leaves q/kind intact.
// memoPeriod(7, new Date('2026-09-12T15:01:00Z')):
// {dateFrom:'2026-09-07', dateTo:'2026-09-13'}
```

- [x] 적용된 필터와 폼의 입력 상태를 구분한다. 검색어·종류·업무·사용 이력·KST 날짜를 URL에 보존하고 조건 변경 시 cursor만 초기화한다. Enter/찾기 즉시 적용, 조건 해제는 한 번의 클릭. IME 조합 중 Enter는 제출하지 않는다.
- [x] 독립적인 목록 hook은 AbortController와 요청 세대로 늦은 검색/더 보기 응답을 무시하고 항목 ID를 중복 제거한다. GET200 error도 error로 처리하며 실패가 0개 결과로 보이지 않게 한다.
- [x] 문서 GET은 note/new/draft 또는 명시적 새로고침에만 의존한다. list query는 문서 모델의 source/workspace/entry를 초기화하지 않는다. 저장 후 검색 목록만 재조회하고 활성 편집/발췌/대상 링크는 유지한다. 요청 미확인 draft가 다른 문서로 섞이지 않게 1차 문서 epoch 테스트를 유지한다.
- [x] 목록 컨테이너가 그대로 있는 동안 scroll 상태를 유지한다. 메모 drawer 주소만 바뀌는 열기/닫기에 검색 재조회나 목록 초기화를 하지 않는다. 다른 업무 화면에서 돌아오는 경우 URL 조건으로 복원하고 이전 잘못된 cursor는 재사용하지 않는다.
- [x] safe text match 강조와 일치 필드 표시. 비어 있는 제목, 보강에서만 찾은 행, 한 번에40개/더 보기, 조건 없는 empty와 조건에 맞는 결과0개의 다른 문구. 모바일44px/입력16px, 기존 프리미티브와 tokens만 사용한다.

## Task 3: 업무 상세에서 바로 다시 보기 (root 담당)

Files: 새 `components/hub/related-memos.jsx`; 수정 `pages/project-detail-panel.jsx`, `pages/customers.jsx`, `pages/brands.jsx`, 필요 시 `journal-links.jsx`.

- [x] 실제 객체 `{type,id}`만 전달하는 공통 RelatedMemos를 넣는다. 검색 API에 context+limit3으로 요청하고 즉시 요약/날짜/명시적 연결 이유를 표시한다.
- [x] `모두 보기`는 해당 context 필터의 메모 URL, 원문 열기는 같은 필터와 note ID를 함께 가져간다. 메모 생성은 같은 context를 가진 기존 capture 경로를 유지한다.
- [x] 내부 메모 변경 이벤트로 동일 화면의 관련 목록을 갱신한다. component unmount/type/id 변경에서 요청을 취소하고 이전 업무 결과가 다음 업무에 보이지 않게 한다. 원장의 진짜 UUID가 없는 preview 객체는 요청하지 않는다.
- [x] 여러 곳에서 쓰는 관련 목록은 기존 UI font/border/spacing에 맞추며 새 전역 스타일·새 사이드바를 추가하지 않는다.

## Task 4: 검수·통합

- [x] backend spec review → backend quality review, UI/전체 spec review → 전체 quality review. 실제 결과로 발견한 회귀는 테스트로 고정한다.
- [x] 브라우저 실제 Hub→임시 RPC/DB: 최신40개 밖 검색, 특수문자/보강, preset/조건 해제, 원문 열고 닫아 조건·스크롤 유지, 새로고침, 입력 중 늦은검색응답, context모두보기/원문복귀, 사용이력필터, 읽기오류, 두탭복구, 390px.
- [x] `npm test`, `npm run typecheck`, `npm run check:contracts`, Hub/Engine build. 실DB 테스트는 임시 클러스터에서만 실행한다.
- [x] 스펙/README 상태를 2A 구현·2B DRAFT로 정리한다. 소유 파일만 commit하고 stat 확인. 현재 main 작업 공간의 동시 변경을 보존해 통합하고 통합 code 기준 필요한 검증을 실행한다. 자기 임시 서비스와 worktree를 정리하고 branch 이력은 남긴다.

## 검증 기록

- 기준: 7749e02에서 전용 worktree로 시작. 기준 테스트 1,027개 중 1,023 통과·4 opt-in 제외.
- 전체 테스트: 1,048개 중 1,043 통과·5 opt-in PostgreSQL 제외·실패 0.
- 실제 임시 PostgreSQL 포함 journal 회귀: 80/80 통과, 제외 없음. 0030 migration 재적용·권한·workspace 격리·literal·KST·cursor와 150/180/200자 검색 문맥 확인.
- 브라우저: 실제 Hub → 로컬 REST bridge → 임시 PostgreSQL에 저장한 55개 메모로 최신 40개 밖 검색, 보강-only, 특수문자, 기간+종류, 조건 초기화, URL 복구, 프로젝트/고객/브랜드 최근 3개와 전체 이동, 읽기 실패·재시도, 390px 화면 확인. 페이지 오류 0.
- 저장 후 펼친 55개 목록과 스크롤 유지, 두 탭 초안 분리, 발췌→할 일→활용한 메모 필터 반영을 확인했다. 실제 지연시킨 이전 검색 응답이 최신 결과·열린 초안을 덮어쓰지 않으며 브라우저 뒤로 가기도 검색 조건을 보존했다.
- `npm run typecheck`, `npm run check:contracts`, Hub/Engine production build 통과. Hub production build를 로컬 임시 DB에 연결해 검색·지우기·모바일·cold 고객 상세의 관련 메모를 재확인했고 페이지 오류는 없었다.
- 검수: backend spec 승인 → quality 지적의 긴 검색어 문맥 수정 → UI spec 3개 보완 → 전체 quality 승인. 저장 중 목록 축소와 cold 고객 딥링크 문제는 회귀 테스트로 고정했다.
- 운영 DB 적용·배포는 이 로컬 기능 구현에 포함하지 않는다. 운영에서는 기존 메모 0027 의존 스키마 뒤 20260913_0030_journal_search.sql을 적용해야 검색 RPC가 동작한다. 운영 자격 증명은 읽거나 복사하지 않았다.

- 기능 커밋 `b03abc3`, 로컬 통합 커밋 `795d9a4`. 통합 직후 기능 브랜치와 통합 커밋의 tracked tree 차이가 없어 검증한 코드와 통합 코드가 동일함을 확인했다.
- 메인 작업 공간에 이미 있던 `apps/engine/next-env.d.ts` 변경은 SHA-1 `b23d2b0e9411866941f1dd73e7477766d205cb8e` 그대로 보존했다.
- 전용 worktree와 자기 Hub dev/production 서버·REST bridge·임시 PostgreSQL 클러스터를 정리했다. `codex/memo-discovery-20260913` 브랜치는 이력으로 보존했다. 다른 작업 공간·서비스는 건드리지 않았다.
