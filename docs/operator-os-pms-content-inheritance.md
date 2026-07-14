# 개인 운영 OS · PMS · 콘텐츠 lane 상속 가이드

> 상태: ACTIVE — Phase 1 핵심 UI·write path 구현 및 live 왕복 검증 완료
> 작성일: 2026-07-15
> 우선순위: `operator-workflow-profile.md` → 개인 운영 OS 심화 설계 → `DESIGN.md` → 이 문서
> 범위: 단순한 개인 운영 홈, 핵심 PMS, 작은 홈 요약/차트, `classmoon` / `classin_side` / `studyseagull` 콘텐츠 lane

이 문서는 현재 구현된 개인 운영 홈·PMS·콘텐츠 lane이 다음 작업에서도 같은 계약을 상속하도록 경계를 고정한다. 제품 사실을 새로 확정하는 문서가 아니다. 상위 문서와 충돌하면 상위 문서를 따른다.

## 1. 바뀌면 안 되는 흐름

### 1.1 개인 업무 정본

```text
빠른 입력 또는 도메인 화면
  -> Hub BFF에서 사용자·origin 검증
  -> Engine command에서 validation·idempotency·transaction
  -> Moonlight Supabase 원장에 저장
  -> Hub read repository로 재조회
  -> Today / PMS / Content에 같은 durable record 표시
```

- 최초 이관 뒤 Moonlight가 개인 고객·할 일·프로젝트·콘텐츠 운영의 정본이다.
- Hub component의 local state는 입력 중 draft나 optimistic 표시만 맡는다. 성공의 근거는 durable ID와 재조회다.
- 신규 domain mutation을 Hub read repository에 추가하지 않는다.

### 1.2 ClassIn 공식 정본

```text
ClassIn / Neo CRM
  -> 최초 이관 또는 missing-only 수동 동기화
Moonlight
  -> 개인 상세 메모·판단·할 일·프로젝트 운영
  -> official summary projection + outbox
ClassIn
  -> 회사 공식 객체·공식 활동 요약
```

- ClassIn은 리드·견적·오더·최종 거래와 공식 활동 요약의 정본이다.
- 자세한 미팅 원문, 개인 판단, 거친 메모, 개인 프로젝트는 ClassIn으로 복제하지 않는다.
- 같은 객체가 양쪽에서 다르면 자동 병합하거나 Moonlight를 덮어쓰지 않고 conflict로 보여준다.

### 1.3 정직한 상태

```text
source=supabase                         -> live 숫자와 row 표시
한 source만 live                        -> partial + source 이름 표시
연결 전 또는 설정 없음                 -> preview + setup CTA
연결됐지만 row 없음                    -> live-empty + 생성 CTA
read 실패                              -> error + retry
```

- preview/error 원장 안의 fixture 배열은 집계하지 않는다.
- `0`은 live 원장에서 실제로 0인 경우에만 운영 숫자로 보여준다.
- mock, preview, live record를 한 차트나 한 합계에 섞지 않는다.
- 저장 실패를 preview 성공이나 완료 toast로 바꾸지 않는다.

## 2. 확정

### 2.1 제품과 홈

- Moonlight는 문준혁 한 명을 위한 개인 운영체제다. 다중 사용자 SaaS가 아니다.
- 목표는 인지 에너지를 약 1/3로 줄이고 고객 연락·프로젝트 후속 누락을 0건으로 만드는 것이다.
- 홈은 별도 CRM/PMS/Content 대시보드의 합이 아니라 Action Desk다.
- 홈의 주인공은 Quick Capture, 긴급 KA 최대 1건, 집중 고객 3~5건, 오늘 일정과 필수 할 일이다.
- 매출·프로젝트·콘텐츠 숫자는 위 행동을 밀어내지 않는 보조 pulse다.
- 전제 1~7과 기존 원장 기반 접근안 B가 승인됐다. Phase 1A의 read foundation, 핵심 PMS write path, 홈 Quick Capture의 durable task destination이 연결됐고, dependency·milestone·custom workflow 같은 고급 PMS는 후속 Phase 3 범위다.

### 2.2 PMS

- PMS는 영업뿐 아니라 마케팅, 콘텐츠, IT, AI 기반 서드파티 개발, 개인 프로젝트를 함께 관리한다.
- 공통 상태는 `수집 -> 계획 -> 진행 -> 대기 -> 완료`이며 `보류 / 취소`는 별도 종료·중단 상태다.
- 프로젝트 기본 정보는 제목, 분야, 목표 결과, 종료일 또는 종료일 없음, 다음 행동, 선택적 관련 고객이다.
- 홈과 프로젝트 화면은 지금 할 일, 위험/특이사항, 마감과 지연, 체크리스트, 간단한 진척을 우선한다.
- 진척은 체크리스트 완료율·완료 task·milestone 같은 확인 가능한 정량 데이터가 먼저다.
- Asana의 My Tasks/Portfolio, monday.com의 board/project 분리와 연결 패턴을 참고하되 화면을 복제하지 않는다.

### 2.3 콘텐츠

- 아이디어는 Moonlight의 단일 콘텐츠 아이디어함으로 모은다.
- 초기 최소 정보는 원문, 참고 링크, 떠오른 이유, 추천 채널이다.
- 원본 하나를 Threads, Instagram, YouTube Shorts 등 여러 variant로 재가공한다.
- 초기 선택은 복잡한 점수가 아니라 운영자의 직감과 지금 만들 수 있는가를 따른다.
- 이 foundation이 다루는 ClassIn company content lane key와 순서는 다음과 같다.

| key | 표시명 | 순서 | org scope |
|---|---|---:|---|
| `classmoon` | Class.Moon | 60 | `classin` |
| `classin_side` | ClassIn Side | 65 | `classin` |
| `studyseagull` | Study.Seagull | 70 | `classin` |

이 세 lane이 Moonlight의 모든 개인 브랜드를 대체한다는 뜻은 아니다. 이번 company content surface의 안정적인 lane 집합이다.

`20260710_0012_classin_side_brand_and_org_scope.sql`은 적용 완료됐다. DB에는 `classmoon`과 `studyseagull`의 `meta.org_scope=classin`, 그리고 `classin_side` row가 있다. `apps/hub/lib/repositories/content-ledger.js`도 `meta.org_scope`를 `orgScope`로 투영하므로 `workspace-map` 기반 ClassIn 필터와 홈 요약이 세 lane만 정확히 집계한다.

## 3. 권장

### 3.1 홈은 두 개의 작은 운영 요약만 더한다

현재 결정 큐 아래의 `지표` 영역에 최대 두 개의 작은 카드만 둔다.

1. **PMS pulse**
   - 열린 task
   - 오늘 task
   - 막힌 project
   - task 완료율
   - 작은 차트: `계획 / 진행 / 검토 / 막힘 / 완료 / 보관` 분포
   - CTA: `/dashboard/work/projects?view=todos`
2. **Content pulse**
   - 아이디어
   - 제작 중(`draft + review`)
   - 발행 대기
   - 발행/실패
   - 작은 차트: `idea / draft / review / scheduled / published` 분포
   - CTA: `/dashboard/classin/content`

차트는 추세를 꾸미지 않는다. 현재 원장의 상태 분포만 사용하고 각 카드에 다음 행동을 한 개 둔다. Action Desk의 명령 카드와 결정 큐보다 위로 올리지 않는다.

새 pure helper `apps/hub/lib/operator-home-summary.js`의 `buildOperatorHomeSummary({ projects, content })`가 이 read model을 만든다.

- `projects.source === "supabase"`와 `content.source === "supabase"`만 live 집계한다.
- 한 source만 live면 전체 `state`는 `partial`이다.
- preview/error source의 summary는 `null`이다. 알 수 없는 값을 0으로 바꾸지 않는다.
- `projectStatusSeries`, `taskStatusSeries`, `pipelineSeries`는 작은 categorical bar/segment chart의 안정적 순서를 제공한다.

### 3.2 핵심 PMS는 세 view로 제한한다

| view | 역할 | 필수 정보 |
|---|---|---|
| Portfolio/List | 전체 프로젝트 판단 | 상태, 목표/다음 행동, 기한, 진척, 병목/위험 |
| My Tasks | 여러 프로젝트의 개인 작업대 | 오늘, 예정, 나중, 완료; project/customer deep link |
| Board | 공통 상태 이동 | 수집, 계획, 진행, 대기, 완료; 보류/취소는 별도 필터 |

- 프로젝트 상세는 checklist, 최근 update, 결정, note를 기존 원장에서 읽는다.
- project 후보, dependency, 분야별 custom workflow, 70/30 AI 진척 점수는 Phase 3 계약 뒤에 추가한다.
- task와 project mutation은 `Browser → Hub BFF → Engine command → Supabase → Hub read repository` 경계를 재사용한다.
- Hub BFF는 `POST/PATCH /api/hub/projects`, `POST/PATCH /api/hub/tasks`이고, 실제 validation·workspace scope·persistence는 Engine의 `POST /api/pms/command`가 담당한다.
- 지원 범위는 project create/update/complete, task create/status update다. delete, dependency, milestone, saved view는 아직 포함하지 않는다.
- create는 클라이언트가 만든 UUID를 사용하고 같은 ID 재시도는 기존 row를 반환해 중복 생성을 막는다.
- Board는 project 카드를 섞지 않고 task만 `inbox / todo / doing / blocked / done`에 대응하는 `수집 / 계획 / 진행 / 대기 / 완료` 열로 표시한다.
- `/api/projects/update`는 계속 project update event 경로이며 durable project CRUD로 해석하지 않는다.

### 3.3 콘텐츠 lane은 identity와 운영 데이터를 분리한다

새 pure helper `apps/hub/lib/content-brand-catalog.js`는 세 lane의 **key, 표시명, 순서, org scope**만 코드 계약으로 소유한다. 실제 브랜드 설명과 제작 규칙은 Supabase `brands` row가 소유한다.

권장 상속 순서:

```text
DESIGN.md
  -> Hub chrome, spacing, type, accessibility
live brands row + brands.meta
  -> name, voice, philosophy, direction, cadence, content_rules, forbidden_terms
content item
  -> source idea, brand_id, working status, item-specific context
content variant
  -> channel format and channel-specific copy
```

- live brand row가 없으면 static copy로 live인 척하지 않고 `missing`으로 표시한다.
- 생성 시 stable URL에는 brand key를 쓰고, write payload에는 live row에서 해석한 `brandId`를 쓴다.
- `brandKey`만 meta에 남기고 `content_items.brand_id`를 비우는 것을 정상 연결로 취급하지 않는다.
- 세 lane 모두 Hub chrome은 Moonstone 디자인을 상속한다. lane별 full-card 색, 별도 테마, 두꺼운 border를 만들지 않는다.
- 회사/개인 구분은 `company`/`personal` identity badge로 표현하고 status color와 섞지 않는다.
- 콘텐츠 mutation은 `Browser → Hub BFF /api/hub/content → Engine /api/content/command → Supabase → Hub content repository` 경계를 쓴다. Hub route에서 `server-write`로 직접 insert/update하지 않는다.
- create는 client-generated content/variant UUID를 그대로 사용하며 동일 ID 재시도는 `duplicate`로 정상 종료한다. variant 저장 실패 시 해당 command가 새로 만든 item을 롤백한다.
- 2026-07-15 live smoke는 ClassIn Side 임시 draft 생성, duplicate retry, PATCH, Hub read-back을 통과했고 item/variant를 삭제해 lane count를 원복했다.

`buildContentBrandCatalog(contentLedger)`는 다음을 제공한다.

- 안정적인 lane 순서
- `live / missing / preview / error` 연결 상태
- lane별 `total / ideas / inProduction / scheduled / published / failed`
- 세 lane 밖 item 수 `outsideLaneCount`

### 3.4 UI 계약도 그대로 상속한다

- 기존 `Card`, `SectionTitle`, `SegmentedControl`, `SyncBadge`, `EmptyState`, `EditDrawer`를 우선 재사용한다.
- 390×844에서는 홈 요약을 한 열로 쌓고, PMS는 My Tasks/List를 먼저 보여준다. 넓은 board/table이 첫 진입을 막지 않게 한다.
- touch target은 44px 이상, 데이터 값은 12px 이상, 페이지에는 `<h2>`가 정확히 하나 있어야 한다.
- border는 항상 1px이고 card는 dark-native surface를 쓴다. 브랜드별 색 채움이나 새 accent를 추가하지 않는다.

## 4. 미정

다음 항목은 이 foundation에서 확정하거나 선제 구현하지 않는다.

### PMS

- 영업·마케팅·콘텐츠·IT·AI 서드파티·개인 분야의 세부 단계
- project candidate 만료·dismiss 규칙
- `중요` 프로젝트의 최종 지연 기준
- `수집/대기/보류/취소`와 현재 DB `draft/active/blocked/completed/archived`의 최종 migration mapping
- dependency와 milestone의 필수 스키마
- 정성 신호 및 70/30 진척 계산

### 콘텐츠

- Q116~Q120: 입력 방식, raw-only 저장, 공통 상태, 원본/variant 화면, 직접 발행 경계
- Instagram과 YouTube Shorts의 현실적인 발행 주기
- `classin_side`의 voice, philosophy, direction, cadence, content rules. 현재 migration 설명도 `추후 보완` 상태다.
- 세 lane별 최종 채널·계정 mapping과 직접 발행 여부
- 성과 분석과 고객/매출 attribution

### 홈

- 프로젝트·고객·콘텐츠가 같은 날 충돌할 때의 최종 우선순위 공식
- 작은 요약 카드의 장기 trend 기간. live history 계약 전에는 추세선을 만들지 않는다.

Q116 이후 인터뷰는 운영자의 요청 또는 Phase 1 실사용 결과 전에는 재개하지 않는다.

## 5. 정확한 배선 지점

### 5.1 홈

| 순서 | 파일·symbol | 배선 |
|---:|---|---|
| 1 | `apps/hub/app/api/hub/daily-brief/route.js` `GET` | 이미 병렬로 읽은 `projects`와 `content`를 `buildOperatorHomeSummary({ projects, content })`에 전달한다. 새 fetch를 만들지 않는다. |
| 2 | 같은 route response | `operatorHome`과 `contentBrands: buildContentBrandCatalog(content)`를 추가한다. 기존 `signals`, `queue`, `morningBrief`를 대체하지 않는다. |
| 3 | `apps/hub/components/hub/pages/daily-brief.jsx` `useDailyBriefLedger` | 초기 state와 live response normalization에 `operatorHome`, `contentBrands`를 추가한다. |
| 4 | 같은 파일 `DailyBrief`의 기존 `지표` block | `operatorHome.sources.*`가 live인 카드만 숫자를 렌더한다. partial/preview는 source badge와 CTA를 표시한다. |
| 5 | 같은 파일 page-local components | category label과 value를 함께 compact bar/segment chart에 전달한다. categorical 분포를 시간 추세 sparkline처럼 보이게 하지 않는다. |

권장 server wiring 예시:

```js
const operatorHome = buildOperatorHomeSummary({ projects, content });
const contentBrands = buildContentBrandCatalog(content);

return NextResponse.json({
  // existing response
  operatorHome,
  contentBrands,
});
```

### 5.2 PMS

| 파일·symbol | 현재 역할 | 후속 연결 |
|---|---|---|
| `apps/hub/lib/repositories/operating-ledger.js` `getProjectLedger` | `brands`, `projects`, `tasks`, updates/decisions/notes/checks read | read SSOT 유지. `statusKey`, `priority`, `dueAt`, `brandId`를 UI edit contract에 투영한다. |
| 같은 파일 `mapProjects` | DB status를 `Planning / In progress / Blocked / Done / Backlog`로 투영 | 최종 공통 상태 migration 전에는 `waiting/paused/cancelled`를 추측하지 않는다. |
| 같은 파일 `mapTodos` | task를 project/brand, due bucket, raw status, done, priority에 연결 | 같은 durable task ID를 My Tasks, project detail, Board에서 재사용한다. |
| `apps/hub/lib/pms-ui.js` | draft, client UUID fallback, board/status projection | Browser crypto가 없는 표면에서도 유효 UUID를 만들고, Board를 task-only 5열로 고정한다. |
| `apps/hub/lib/quick-task-capture.js` / `DailyBrief.QuickTaskCapture` | 한 줄 task payload와 홈 capture UI | `tasks.status=inbox`로 저장하고 `saved/duplicate`에서만 입력을 비운다. 실패 시 원문과 client UUID를 유지한다. |
| `apps/hub/app/api/hub/projects/route.js` | project ledger GET + guarded POST/PATCH BFF | shared secret은 서버에서만 Engine에 전달한다. 원격 production은 Hub write secret, 로컬 production은 loopback same-origin만 허용한다. |
| `apps/hub/app/api/hub/tasks/route.js` | task GET + guarded POST/PATCH BFF | create와 status update를 Engine command로 전달한다. |
| `apps/engine/app/api/pms/command/route.ts` | authenticated PMS command endpoint | workspace owner를 해석하고 normalized command를 Supabase에 저장한다. |
| `apps/engine/lib/pms-command.ts` / `pms-command-service.ts` | validation, workspace filter, idempotent persistence | PostgreSQL UUID 형식을 수용하고 update는 항상 workspace ID로 범위를 제한한다. |
| `apps/hub/components/hub/pages/projects.jsx` `Projects` | `tree / board / todos`, brand scope, create/edit/status UI | `tree=Portfolio/List`, `todos=My Tasks`, `board=공통 task 상태`로 운영한다. 저장 후 live ledger를 재조회한다. |
| `apps/hub/app/api/projects/update/route.js` | project update event와 일부 patch | create/edit/checklist CRUD로 확장하지 않는다. persistence 실패를 durable 성공으로 해석하지 않는다. |
| `apps/hub/components/hub/hub-nav.js` | 할 일과 프로젝트·기획이 같은 Projects surface 공유 | `?view=todos` 계약을 유지한다. 새로운 top-level PMS menu를 만들지 않는다. |

2026-07-15 live smoke는 임시 project/task를 생성하고 task를 `doing`, project를 `active / 25%`로 변경한 뒤 같은 ID와 값을 재조회했다. 홈 Quick Capture도 별도 임시 task를 저장하고 같은 ID를 재시도해 `duplicate`와 row 1건을 확인했다. 검증 row는 즉시 삭제했고 기존 live count는 project 4, task 6으로 복구됐다. 390×844에서 입력과 저장 버튼은 첫 fold 안에 있고 document overflow는 0이다.

### 5.3 세 콘텐츠 브랜드

| 순서 | 파일·symbol | 배선 |
|---:|---|---|
| 1 | `apps/hub/lib/repositories/content-ledger.js` `mapBrands` | `meta.org_scope`를 `orgScope`로 투영한다. 현재 `workspace-map`이 이 필드를 요구하므로 누락하면 ClassIn lane이 personal로 잘못 분류될 수 있다. |
| 2 | 같은 파일 `getContentLedger` | `brands`, `items`, `publishLogs`를 계속 원본으로 제공한다. helper의 static catalog로 live brand row를 대체하지 않는다. |
| 3 | `apps/hub/app/api/hub/content/route.js` `GET` | `brandCatalog: buildContentBrandCatalog(ledger)`를 response에 추가한다. |
| 4 | `apps/hub/components/hub/workspace-map.js` `filterBrandsByWorkspace` / `filterContentByWorkspace` | `orgScope=classin`인 세 brand와 그 item만 ClassIn scope에 남긴다. unknown/untagged content를 회사 lane으로 추측하지 않는다. |
| 5 | `apps/hub/components/hub/pages/content.jsx` `Queue` | `brandCatalog.lanes` 순서로 lane control을 렌더하고 stable key로 필터한다. `connection=missing`은 disabled/setup state다. |
| 6 | 같은 파일 `Queue.openStudio` | `/dashboard/content/studio?brand=<stable-key>`로 이동한다. |
| 7 | 같은 파일 `Studio` | key를 live brand row로 해석하고 `brandId`를 draft/handoff write에 전달한다. row가 없으면 저장 CTA를 활성화하지 않는다. |
| 8 | `apps/hub/components/hub/hub-app.jsx` | 기존 `dashboard/classin/content -> <Queue workspace="classin" />` mount를 재사용한다. 새 브랜드별 page route를 만들지 않는다. |

`apps/hub/lib/dashboard-contexts.js`의 기존 generic `CONTENT_BRANDS`는 별도 컨텍스트 선택기다. 세 company lane을 그 배열에도 독립적으로 복제하면 다시 drift가 생긴다. 해당 surface가 세 lane을 필요로 할 때 `CONTENT_BRAND_LANES`에서 파생한다.

## 6. 최소 완료 기준

### helper

- 같은 fixture는 같은 순서와 count를 반환한다.
- preview/error fixture record가 live count에 들어가지 않는다.
- `classmoon -> classin_side -> studyseagull` 순서가 환경과 live row 정렬에 흔들리지 않는다.
- live에서 brand row가 없으면 lane을 숨기지 않고 `missing`으로 표시한다.

### 홈

- 첫 명령과 결정 큐가 작은 chart보다 먼저 보인다.
- chart는 최대 두 개이고 모두 CTA가 있다.
- source 하나 실패 시 다른 live summary는 유지하면서 `partial`을 표시한다.

### PMS

- create/update/complete 후 재조회 결과가 같다.
- List, My Tasks, Board가 같은 project/task ID를 사용한다.
- 진행률 0과 empty state를 mock으로 채우지 않는다.

### 콘텐츠

- Queue lane 선택 → Studio 진입 → 저장 → 재조회 후 같은 `brand_id`가 유지된다.
- missing brand row에서는 콘텐츠를 다른 brand에 몰래 저장하지 않는다.
- 개인 작업 상세와 ClassIn official summary 경계를 넘는 자동 복제가 없다.

## 7. 이번 foundation의 구현 자산

- `apps/hub/lib/operator-home-summary.js`
- `apps/hub/lib/operator-home-summary.test.mjs`
- `apps/hub/lib/content-brand-catalog.js`
- `apps/hub/lib/content-brand-catalog.test.mjs`
- `apps/hub/lib/pms-ui.js`
- `apps/hub/lib/pms-engine-client.js`
- `apps/engine/lib/pms-command.ts`
- `apps/engine/lib/pms-command-service.ts`
- `apps/engine/app/api/pms/command/route.ts`
- `apps/hub/app/api/hub/projects/route.js`
- `apps/hub/app/api/hub/tasks/route.js`

read model과 PMS command path는 현재 route/component/repository에 연결돼 있다. 후속 UI 작업은 위 경계를 유지하고, 각 단계에서 preview/live honesty와 create→update→read-back idempotency를 다시 검증한다.
