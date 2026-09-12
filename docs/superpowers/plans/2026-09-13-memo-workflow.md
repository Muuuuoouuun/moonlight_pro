# 메모 1차 — 작성에서 실제 사용까지

> 상태: 구현·로컬 검증 완료, 최종 코드 검수 승인·작업 공간 통합 중. 2026-09-13 운영자의 “이어서”로 앞서 제안한 첫 묶음을 진행한다.
> 범위: 빠른 메모·선택 보강 질문·명시적 업무 연결·선택 발췌의 할 일/Studio 생성.
> 후속 분석·추천·결과 피드백은 09-12 메모 설계의 DRAFT를 유지한다. 운영 DB 적용·배포는 이 실행 기록의 로컬 완료와 별개다.

**Goal:** 제목 없이 짧게 메모를 남기고, 원문을 유지한 채 필요한 발췌를 실제 할 일·콘텐츠로 연결한다.

**Architecture:** 하루 리뷰와 공유하는 `journal_entries`에서 `entry_kind=note`만 다룬다. Hub read repository와 guarded write route가 service-only 원자 RPC를 사용한다. 여러 단계의 HTTP 저장이 일부만 완료되는 것을 피하기 위해 메모→task 생성은 기존 `tasks`의 create 계약(소유자·상태·기한·프로젝트·설명)을 따르는 원자 명령으로 구현한다. 메모→콘텐츠는 기존 `content_workflow_v1`을 같은 DB 트랜잭션 안에서 호출한다. 기존 메모·task·Studio API의 계약은 유지한다.

**Stack:** Next.js App Router, React, 기존 Hub 프리미티브, Supabase REST/RPC, node:test, disposable PostgreSQL, Playwright.

## 승인 범위의 화면

- `내 작업 → 메모` (`/dashboard/work/memos`). 기존 사이드바 앵커 수는 유지하고 내 작업의 하위 목적지에 등록한다.
- 헤더 `메모 남기기` + N. `Drawer presentation=compact`에 본문 우선, 제목·시각·업무 연결은 선택 사항.
- 저장 후 같은 메모를 열어 한 가지 보강 질문에 선택적으로 답한다. 질문 종류를 바꿔도 원문은 바뀌지 않는다.
- 목록은 최신 40개와 더 보기. 본문 전체는 선택한 메모만 로드한다. 메모 선택은 `?note=<uuid>`, 새 입력은 `?new=note&draft=<uuid>`로 복구 가능한 주소를 가진다.
- 업무 연결은 프로젝트·고객(리드/계정)·브랜드의 실제 객체를 검색·선택한다. 현재 객체의 메모 버튼에서는 후보를 보이되 제거 가능하게 한다.
- 활용: 원문에서 발췌를 명시적으로 선택하고 `할 일로` 또는 `콘텐츠로`를 누른다. 제목과 선택 기한/프로젝트 또는 브랜드/채널을 확인한 후 한 번의 생성으로 저장한다. 원문 전체를 기본 선택하지 않는다.
- 생성한 객체로 가는 링크와 사용한 발췌·당시 버전은 메모에 남는다. 원문이 수정된 경우 당시 버전임을 표시한다. task와 Studio에서도 원문으로 돌아갈 수 있다.

## 고정할 데이터/API 계약

### 저장

`POST /api/hub/journal`:

```js
{ action: 'save', requestId, entryId, expectedRevision, body, title, occurredAt,
  noteMeta: { kind: 'note'|'conversation'|'idea'|'learning'|'blocked'|'decision', enhancement: '' },
  contexts: [{ type: 'project'|'lead'|'account'|'brand', id }] }
```

- body 1~20000자, 제목 200자, 보강 4000자. 시각은 유효한 ISO timestamp. 문장·줄바꿈 그대로 보존.
- 새 entryId는 클라이언트 UUID. expectedRevision=0은 생성, 이후 정확히 일치해야 수정.
- 수동 메모에는 content_hash를 쓰지 않아 같은 문장의 다른 날 기록도 독립 저장한다.
- `note_meta`와 `note_revision`을 추가하고 하루 리뷰의 review_data/review_revision 계약은 변경하지 않는다.
- 이전 버전은 journal_note_revisions에 보존. journal_links는 context 또는 use 연결과 출처 snapshot을 보존.
- workspace는 서버 설정에서만 결정. 모든 연결 대상의 workspace를 DB에서 확인한다.
- requestId의 같은 payload 재시도는 duplicate, 다른 payload는 conflict. 응답 유실도 같은 요청으로 복구.

### 활용

```js
{ action: 'create_task'|'create_content', requestId, entryId, expectedRevision,
  selection: { prefix, text, suffix },
  target: { title, dueAt: null, projectId: null } // task
  // 또는 target: { title, brandId: null, channel: 'threads' }
}
```

- prefix+text+suffix가 현재 저장된 body와 정확히 같고 revision도 일치해야 한다. text는 공백 제외 1~3500자. 반복 문장·이모지 앞뒤도 정확한 발췌로 보존.
- target 생성+사용 연결+receipt는 같은 트랜잭션이다. 오류 시 어느 하나만 남지 않는다.
- content source_idea와 source_refs에는 선택 발췌만 넣는다. 기획 카드의 evidence도 그 발췌로 시작하고 결과물 본문은 빈 draft다. 분석/AI 호출·발행은 없다.
- source ref 공통 형식: `{ type:'journal', journal_id, revision, excerpt, href }`. 서버가 만든 상대 경로만 사용한다.
- `saved|duplicate` 응답은 `{ entry, link?, target? }`. target은 `{ type:'task'|'content', id, variantId?, href, title }`.
- entry 형식: `{id,body,title,occurredAt,noteMeta,revision,updatedAt,contexts,links}`. context는 `{type,id,label,href}`. link는 `{id,targetType,targetId,title,href,excerpt,sourceRevision,createdAt}`.
- `conflict`는 현재 entry를 포함한다. validation 오류 400, conflict409, persistence 실패502/503. read 실패는 HTTP200 + status:error.

### 조회

- GET `/api/hub/journal?note=<uuid>&before=<ISO>&beforeId=<uuid>`: `{status,configured,workspaceId,entries,entry,nextCursor}`. entries는 body 대신 excerpt와 metadata만 가지며 40개 제한. cursor는 `{before,beforeId}` 또는 null.
- GET `/api/hub/journal/contexts?type=project|lead|account|brand&q=<text>&id=<uuid>`: `{status,contexts,hasMore}`. 서버 검색 30개; 범위를 표시. id가 있으면 정확한 한 객체를 조회한다.
- 클라이언트는 status 봉투를 검사하며 연결 실패를 빈 목록으로 보이지 않는다.

## 작업 순서

- [x] 전용 worktree 생성, 콘텐츠 기능 branch와 현재 committed main 통합. 기준 `npm test`: 811개 중 808 통과, PG opt-in 3개 제외.
- [x] **1. 저장·활용 경계** — migration `20260913_0027_journal_notes.sql`, `lib/journal.js`, repository `journal-ledger.js`, API journal/contexts. 실패 테스트→구현→실제 PostgreSQL 원자성/격리/중복/리뷰 보존 검증. 저장 구현 담당자가 이 파일만 소유한다.
- [x] **2. 입력·복구 화면** — `journal-client.js`, `journal-browser-store.js`, `use-memos.js`, `memos.jsx`, `memo-composer.jsx`, `memo-use-composer.jsx`, `memos.css`. stable draft UUID와 동기 sessionStorage 복구 저장(탭 복제 후에도 입력·receipt가 서로 덮어쓰지 않음, 같은 탭 새로고침/내비게이션 복구), 전송 전 receipt 저장, 불확실 요청은 확정 전 해당 메모 편집·추가 활용을 막고 같은 요청으로 확인(다른 독립 메모의 입력은 허용). 문서 epoch로 늦은 응답 격리. 실패·충돌 비교·재시도 확인.
- [x] **3. 기존 업무 연결** — hub-nav/catalog/PAGE_MAP 등록. 업무 객체의 메모 진입, task의 description/source 참조, Studio의 journal 출처 표시. 단축키·딥링크·모바일 확인.
- [x] **4. 검수** — spec reviewer 후 quality reviewer. 실제 Hub→RPC→DB 흐름으로 신규/수정/보강/발췌/재시도/새로고침/두 창 충돌/원문 수정/읽기 실패/390px 검증. 관련 테스트와 full suite, typecheck, contracts, Hub/Engine builds.
- [ ] **5. 통합** — 소유 파일만 commit 후 stat 확인. 메인 작업 공간의 동시 변경을 보존하며 메모 변경만 통합. docs 실제 범위 기록, worktree 제거. 운영 배포 완료로 표현하지 않는다.

### 복구 보관 범위

서버에 저장한 메모가 정본이다. 미저장 입력과 요청 receipt는 탭마다 독립적인 sessionStorage에 전송 전에 기록한다. 새로고침·같은 탭 이동·드로어 닫기를 복구하며, 브라우저 탭 자체를 닫은 뒤의 미저장 복구는 보장하지 않는다. 저장소 미연결 시 이를 표시한다. 저장 공간 실패 시 동일 페이지 세션의 메모리 사본과 입력 복사를 제공하며, durable receipt 쓰기가 실패하면 네트워크 mutation을 보내지 않는다.

## 검증 기록

- 전체 `npm test`: 849개 중 845개 통과, 실패 0, 선택 실행하는 PostgreSQL 4개 제외.
- backend 독립 검수: 37/37 통과. 그중 실제 임시 PostgreSQL 16개에서 동일 문장·동일 날짜 독립 기록, 리뷰 보존, revision/receipt 경쟁, 재시도, Unicode 발췌, 타 workspace 거절, 대상·링크·receipt 전체 rollback, 초기 콘텐츠 revision 출처, 권한과 migration 재적용을 검증했다.
- `npm run typecheck`, `npm run check:contracts`, Hub·Engine production build, `git diff --check` 통과.
- 실제 Hub→로컬 REST 연결→임시 PostgreSQL 브라우저 검증: 제목 없는 저장·같은 탭 복구·선택 보강·프로젝트 연결·반복 문장의 두 번째 발췌·할 일 생성/원문 복귀·Studio 선택 발췌/빈 본문·저장/활용 응답 유실 후 같은 요청 재확인.
- 복구 경계: GET 네트워크 실패와 HTTP200 error, workspace 없는 preview, 탭 복제로 복사된 sessionStorage의 입력 격리, 두 탭 revision 충돌 비교, 활용 대상으로 바꾼 프로젝트 복구, 저장 공간 부족 시 복사와 전송 차단, N/ESC, 390px 모바일의 가로 넘침 없음. 브라우저 pageerror 0.
- production build 실행에서도 메모 생성과 지연된 조회 중 다른 메모로 전환을 확인했다. 이전 메모 본문이 새 메모로 섞이지 않았다.
- UI·backend 스펙 검수 및 최종 코드 검수 승인. 연결을 다시 확인하는 도중 늦은 저장 응답이 새 입력을 덮는 문제를 재현한 뒤 편집 세션·저장소·응답 callback 격리로 수정했다. 실제 hook 회귀 테스트 2개와 브라우저 재검증 통과. 후속 분석·추천 구현이나 운영 DB 접근은 포함하지 않았다.

## 운영 적용 전제

기존 task description(`0021`), `0025_daily_review_journal`, `0026_content_workflow`의 적용 상태를 먼저 확인하고 `20260913_0027_journal_notes.sql`을 적용해야 한다. 이 작업은 임시 DB에만 적용했다. 0027은 note 메타·revision, 출처/사용 연결, 중복 확인 영수증, 업무 검색과 원자 저장 RPC를 추가한다. 기존 일별 리뷰 데이터·review revision은 유지한다.

운영 활성화 검수는 메모 API의 실제 저장소 상태, 새 메모 저장·재조회, 선택 발췌의 할 일/콘텐츠 생성과 양방향 출처, 같은 requestId 재확인으로 한다. 운영 배포·DB 적용 완료 여부는 별도 실행 기록으로 남긴다.
