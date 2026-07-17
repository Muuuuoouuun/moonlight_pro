# Moonlight 프로젝트 빠른 생성 드로어 설계

> 상태: APPROVED
> 작성일: 2026-07-17 (Asia/Seoul)
> 승인 범위: 프로젝트 탭 3단계 × 3요소 중 `1-1 · 빠른 생성 드로어`
> 상위 정본: `docs/operator-workflow-profile.md`, `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`, `DESIGN.md`
> 구현 표면: Projects Hub UI, PMS read adapter, Hub→Engine project command, Supabase project relation migration

## 1. 목표

프로젝트를 콘텐츠 브랜드의 하위 레코드가 아니라 여러 실행 항목을 묶는 큰 업무 문맥으로 생성한다. 생성 순간에는 결과와 첫 행동에 집중하고, 업무 분야·브랜드·고객 문맥을 필요한 만큼만 연결한다.

이번 슬라이스의 성공 상태는 다음과 같다.

1. 프로젝트명은 빈 값에서 시작하고 드로어가 열리면 즉시 포커스된다.
2. 핵심 필드는 `프로젝트명`, `목표 결과`, `다음 행동`이다.
3. `업무 분야`는 프로젝트의 필수 평면 분류이며 상위 폴더나 브랜드 계층이 아니다.
4. 브랜드는 선택 문맥이다. 브랜드가 없는 프로젝트도 현재 Hub workspace에 남는다.
5. 리드 또는 고객계정 하나를 선택 연결할 수 있다. 같은 리드에는 여러 프로젝트를 연결할 수 있다.
6. 상태·우선순위·기한·브랜드·고객 연결은 접힌 상세 설정에 둔다.
7. 저장 성공 뒤 durable project ID의 상세 패널이 자동으로 열린다.
8. 저장 실패·preview·conflict에서는 드로어와 입력값을 유지한다.

## 2. 제품·관계 원칙

- `Area`는 화면 위계가 아니라 프로젝트의 분류 차원이다. Projects의 기본 화면은 다음 요소에서 `전체 + 최근 활동순` 필터로 구현한다.
- `Project`는 Task·Milestone을 묶는 큰 실행 문맥이지만 전체 시스템의 강제 루트가 아니다.
- Task는 프로젝트 없이도 존재할 수 있다. Task 기한은 이후 Today와 Calendar에 같은 정본의 읽기 projection으로 나타난다.
- Calendar event는 프로젝트와 독립적으로 존재할 수 있다. 프로젝트/Task/리드 연결은 다음 슬라이스에서 명시적으로만 추가한다.
- 프로젝트와 고객 문맥은 이름이나 일정 제목으로 추측하지 않는다. 사용자가 선택한 stable ID만 저장한다.
- Deal 연결은 이번 범위에서 만들지 않는다. 데이터 안정화 후 후보 연결부터 검토한다.
- 완료 프로젝트는 삭제하지 않고 이후 기본 접힌 완료 이력으로 이동한다. 완료 상태 머신 자체는 3단계에서 구현한다.

## 3. 전체 개발 순서: 수정 3단계 × 3요소

| 단계 | 1 | 2 | 3 |
|---|---|---|---|
| 1. 구조와 생성 | **빠른 생성 드로어 — 이번 범위** | 전체/업무 분야 필터 | 누락 없는 상세 편집 |
| 2. 실행과 연결 | Task·Milestone 추가 | 하위 상세·메모 | Today·Calendar projection |
| 3. 완료와 고객 이력 | 완료 검증·축하 toast | 접힌 완료 보관함 | 리드별 프로젝트 이력 |

Deal 연동은 3×3 이후의 후순위다.

## 4. 생성 드로어 구조

### 4.1 헤더

- 제목: `프로젝트 만들기`
- 부제: `큰 결과와 첫 행동부터 기록하세요.`
- 닫기: 공용 Drawer 아이콘 버튼, accessible name `닫기`

### 4.2 항상 표시

1. `프로젝트명 *`
   - 빈 값
   - placeholder: `예: 갈무리 첫결제 SW`
   - 유일한 필수 텍스트 필드
2. `목표 결과`
   - textarea
   - placeholder: `완료됐을 때 어떤 상태가 되어야 하나요?`
   - `projects.summary`에 저장
3. `다음 행동`
   - text input
   - placeholder: `가장 먼저 할 한 가지`
   - `projects.next_action`에 저장

### 4.3 빠른 분류

- `업무 분야 *`
- active Area를 한 개 선택한다.
- 새 canonical Area는 `영업`, `마케팅`, `콘텐츠`, `IT`, `AI 기반 서드파티 개발`, `개인 프로젝트`다.
- 기존 Area 레코드는 삭제하거나 이름을 바꾸지 않는다.
- 현재 선택된 Area 필터에서 드로어를 열면 그 Area를 seed하고, 아직 필터 UI가 없는 이번 슬라이스에서는 첫 canonical Area를 초기값으로 사용한다.
- 기존 프로젝트의 null area는 이후 `미분류`로 보존한다. 이름이나 브랜드로 자동 추론하지 않는다.

### 4.4 상세 설정

기본은 접힘이며 토글에 `aria-expanded`를 반영한다.

- 브랜드: 선택, 기본값 없음
- 관련 리드/고객: 선택, 기본값 없음
  - UI 후보는 `리드 · {name}` 또는 `고객 · {name}`
  - 한 프로젝트에는 둘 중 하나만 저장한다.
  - 같은 리드/고객에 여러 프로젝트가 연결될 수 있다.
- 상태: 기본 `계획` (`draft`)
- 우선순위: 기본 `보통` (`medium`)
- 기한: 기존 date-only 계약

생성 화면에서 제외:

- 수동 진행률
- Deal/Opportunity
- 의존성
- 담당자·협업자
- 캘린더 event 생성
- 하위 Task 자동 생성

### 4.5 푸터

- 보조 행동: `취소`
- 주 행동: `프로젝트 만들기`
- 저장 중: `만드는 중…`
- shortcut hint: `⌘↵`

## 5. 상호작용 계약

### 열기와 닫기

- 기존 생성 버튼, 페이지 레벨 `N`, `?new=project`를 유지한다.
- 드로어가 열리면 프로젝트명에 포커스한다.
- ESC, overlay click, 닫기 버튼을 지원한다.
- 닫을 때 opener focus를 복원한다.
- focus trap과 Tab 순서는 시각 순서를 따른다.

### 검증과 저장

- 프로젝트명과 업무 분야를 검증한다.
- 첫 오류 필드로 포커스한다.
- 오류는 필드 바로 아래에 표시하고 `aria-describedby`로 연결한다.
- `Cmd/Ctrl+Enter`는 열린 드로어 하나에서만 한 번 실행된다.
- 저장 중에는 버튼과 shortcut의 재진입을 막는다.
- 성공 전에는 입력값을 지우지 않는다.

### 성공 후 전환

1. project write 응답에서 durable ID를 얻는다.
2. 프로젝트 원장을 재조회한다.
3. create drawer를 닫는다.
4. List view를 활성화한다.
5. 해당 project ID를 펼치고 우측 상세 패널을 연다.

`saved`와 동일 payload의 `duplicate`만 성공으로 취급한다. preview/degraded/conflict/error에서는 드로어를 유지한다.

## 6. 컴포넌트 경계

### `ProjectCreateDrawer`

페이지 전용 생성 폼이며 공용 `Drawer`를 조합한다. 범용 `EditDrawer`에 생성 전용 상태와 조건부 섹션을 억지로 넣지 않는다.

책임:

- 핵심 필드와 업무 분야 렌더링
- 상세 설정 접기/펼치기
- 관련 리드/고객 단일 선택
- inline validation과 save state
- 생성 전용 footer·shortcut

### 기존 `EditDrawer`

- 기존 프로젝트 편집과 다른 Hub 편집 표면에 계속 사용한다.
- 생성 드로어와 동시에 열리지 않는다.
- 기존 raw field 무손실 edit contract를 유지한다.

### Projects page

- Area·브랜드·CRM entity 후보 제공
- 현재 Hub workspace의 org scope seed
- create API 호출
- 저장 후 ledger reload와 상세 패널 handoff

## 7. 데이터 계약

### 7.1 Project 컬럼

기존 `projects.area_id`와 `projects.brand_id`를 사용한다. 다음 nullable FK를 추가한다.

```sql
projects.lead_id uuid null references leads(id) on delete set null
projects.customer_account_id uuid null references customer_accounts(id) on delete set null
check (num_nonnulls(lead_id, customer_account_id) <= 1)
```

- 두 FK에는 unique 제약을 두지 않는다.
- reverse lookup을 위해 `(workspace_id, lead_id, updated_at desc)`와 `(workspace_id, customer_account_id, updated_at desc)` index를 둔다.
- Deal 컬럼은 추가하지 않는다.

### 7.2 UI → Engine

| UI 의미 | write field | DB |
|---|---|---|
| 프로젝트명 | `title` | `projects.name` |
| 업무 분야 | `areaId` | `projects.area_id` |
| 브랜드 | `brandId` | `projects.brand_id` |
| 리드/고객 | `entityRef: {type,id}` | `lead_id` 또는 `customer_account_id` |
| 목표 결과 | `summary` | `projects.summary` |
| 다음 행동 | `nextAction` | `projects.next_action` |
| 상태 | `status` | `projects.status` |
| 우선순위 | `priority` | `projects.priority` |
| 기한 | `dueAt` | `projects.due_at` |
| Hub lane | `orgScope` | `projects.meta.org_scope` |

`entityRef.type`은 이번 범위에서 `lead | customer_account`만 허용한다. 빈 선택은 `null`이고 두 FK를 모두 null로 저장한다.

### 7.3 Workspace 무결성

- Engine은 area, brand, lead, customer_account가 project와 동일한 `workspace_id`인지 insert/update 전에 확인한다.
- 존재하지 않거나 다른 workspace의 stable ID는 `invalid-reference`로 거절한다.
- FK가 있다는 이유만으로 cross-workspace 참조를 허용하지 않는다.
- 브랜드가 없어도 `meta.org_scope`로 Hub의 ClassIn/개인 lane을 보존한다.

### 7.4 Read model

Project read model은 다음을 방출한다.

- `areaId`, `areaName`
- `brandId`
- `entityRef`, `entityLabel`
- `orgScope`, `workspace`
- `statusKey`, `priority`
- `projectSummary`, `projectProgress`, `projectNextAction`
- `dueAt`

표시용 update fallback과 편집 원본은 분리한다. latest project update의 summary/progress/next action을 project row 원본으로 역기입하지 않는다.

Ledger catalog는 다음을 함께 반환한다.

- active `areas`
- active/nurturing `leads`
- active/paused `customerAccounts`

## 8. 저장 흐름과 오류

```text
ProjectCreateDrawer
  -> client validation
  -> Hub POST /api/hub/projects
  -> Engine /api/pms/command
  -> same-workspace reference validation
  -> Supabase projects
  -> saved | duplicate | invalid-input | error
  -> Hub ledger reload
  -> created project detail panel
```

오류 카피:

- 프로젝트명 누락: `프로젝트명을 입력하세요.`
- 업무 분야 누락: `업무 분야를 선택하세요.`
- invalid reference: `연결 항목을 다시 선택하세요.`
- network/timeout: 입력과 client ID를 유지하고 재시도
- preview/degraded: `저장 위치가 연결되지 않았습니다.`
- unknown: `프로젝트를 만들지 못했습니다. 다시 시도하세요.`

오류·저장 상태는 `aria-live` 또는 `role="alert"`로 알린다.

## 9. 반응형·디자인

- Moonstone Command Deck tokens와 공용 Drawer shell을 사용한다.
- warm gold/green/purple 액센트를 추가하지 않는다.
- desktop 우측 drawer, mobile `min(420px, 100vw)` 폭을 사용한다.
- 모바일 input/textarea/select는 16px 이상, touch target은 44px 이상이다.
- header/footer는 고정하고 body만 scroll한다.
- border는 항상 1px, surface는 기존 dark-native token을 사용한다.
- motion은 160–200ms이며 `prefers-reduced-motion`을 존중한다.

## 10. 테스트와 검증

### 단위/계약

1. 새 draft는 빈 title, canonical area seed, brand/entity null, draft/medium을 가진다.
2. create command가 area·nullable brand·entityRef·orgScope를 정확히 정규화한다.
3. invalid entity type과 두 entity 동시 저장을 거절한다.
4. area/brand/entity가 다른 workspace면 insert 전에 거절한다.
5. brand 없이 저장해도 orgScope가 read model과 workspace filter까지 왕복한다.
6. raw project fields와 entityRef가 edit draft까지 손실 없이 전달된다.
7. 저장 중 중복 submit이 한 번으로 제한된다.
8. saved/duplicate만 상세 panel handoff를 실행한다.

### 브라우저

- 1440px와 390×844에서 기본/상세 펼침 상태를 확인한다.
- 프로젝트명과 업무 분야 validation을 확인한다.
- Tab, Shift+Tab, ESC, overlay, 닫기, Cmd/Ctrl+Enter, focus 복원을 확인한다.
- 브랜드 없음, 리드 연결, 고객 연결 payload를 request interception으로 검증한다.
- 저장 실패에서 드로어와 입력값이 유지된다.
- saved 응답 뒤 생성 ID의 상세 패널이 열린다.
- live workspace에는 QA 레코드를 남기지 않는다.

## 11. 이번 범위에서 하지 않는 것

- Projects 상단 Area filter tab 자체
- 하위 Task·Milestone 생성/메모
- Task due의 Today/Calendar projection
- Calendar event link
- project completion toast·완료 보관함
- Customer 360의 프로젝트 이력 UI
- Deal/Opportunity 연결
- 첫 Task 자동 생성
- 수동 진행률 UI
- 다중 고객 연결

## 12. 구현 완료 기준

1. 생성 드로어가 핵심 3필드 + 필수 Area + 접힌 설정으로 렌더된다.
2. brand는 nullable이고 프로젝트가 현재 Hub lane에서 사라지지 않는다.
3. lead 또는 customer account 하나를 stable ID로 연결할 수 있다.
4. relation은 Engine에서 same-workspace 검증을 거친다.
5. 저장 실패·preview·conflict에서 입력과 드로어가 유지된다.
6. 중복 submit으로 create 요청이 두 번 실행되지 않는다.
7. 저장 후 정확한 프로젝트 상세 패널이 열린다.
8. 기존 프로젝트 raw fields의 read/edit 왕복이 손상되지 않는다.
9. 관련 단위·계약 테스트, build, desktop/mobile browser QA가 통과한다.
