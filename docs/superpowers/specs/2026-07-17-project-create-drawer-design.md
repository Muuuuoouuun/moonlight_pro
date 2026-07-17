# Moonlight 프로젝트 빠른 생성 드로어 설계

> 상태: APPROVED
> 작성일: 2026-07-17 (Asia/Seoul)
> 승인 범위: 프로젝트 탭 3단계 × 3요소 중 `1-1 · 빠른 생성 드로어`
> 상위 정본: `docs/operator-workflow-profile.md`, `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`, `docs/superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md`, `DESIGN.md`
> 구현 표면: `apps/hub/components/hub/pages/projects.jsx`, 프로젝트 Hub/Engine write 경계, PMS read adapter

## 1. 목표

프로젝트 생성 시 모든 관리 필드를 한 번에 요구하지 않는다. 운영자가 프로젝트의 결과와 첫 방향을 빠르게 기록하고, 저장 직후 생성된 프로젝트의 상세 문맥으로 이어지게 한다.

이 슬라이스의 성공 상태는 다음과 같다.

1. 프로젝트명은 빈 값에서 시작하고 드로어가 열리면 즉시 포커스된다.
2. 생성 화면의 핵심은 `프로젝트명`, `목표 결과`, `다음 행동` 세 필드다.
3. 상태·우선순위·기한은 접힌 상세 설정에서만 보인다.
4. 프로젝트명만 입력해도 저장할 수 있다.
5. 저장 성공 뒤 생성된 durable project ID의 상세 패널이 자동으로 열린다.
6. 저장 실패·preview·conflict에서는 드로어와 입력값을 유지한다.
7. 기존 프로젝트를 편집할 때 브랜드·상태·우선순위·기한·원본 요약이 손실되지 않는다.

## 2. 제품 원칙

- 개인 PMS의 생성 흐름은 책임 배분보다 `어떤 결과를 만들고 다음에 무엇을 할지`를 빠르게 정하는 데 집중한다.
- 생성 입력의 마찰을 낮추되, 다음 행동이 없는 프로젝트를 감추지 않는다. 다음 행동은 이번 슬라이스에서 선택 입력으로 허용하고 이후 실행 준비 점검에서 보강 대상으로 올린다.
- 수동 진행률은 생성 화면에서 제거한다. 체크리스트·마일스톤 같은 관찰 가능한 데이터가 진척의 우선 근거다.
- 생성과 편집의 책임을 분리한다. 생성은 최소 정보와 안전한 저장을, 편집은 프로젝트 문맥의 보강을 담당한다.
- Moonstone Command Deck의 기존 토큰·공용 Drawer·hairline border·키보드 계약을 유지한다.

## 3. 전체 개발 순서: 3단계 × 3요소

각 요소는 하나씩 설계·구현·검증한다.

### 1단계 · 생성과 정의

1. **빠른 생성 드로어 — 이번 범위**
   - 프로젝트명·목표 결과·다음 행동
   - 접힌 상세 설정
   - 저장 후 상세 패널 자동 열기
2. **상세 편집기**
   - 목표·상태·중요도·기한의 무손실 수정
   - 변경 필드만 저장하는 edit contract
3. **실행 준비 점검**
   - 다음 행동 없음, 종료일 미정, 저장 실패를 명시
   - 필요한 보강 행동으로 연결

### 2단계 · 하위 작업

1. **인라인 빠른 추가**
   - 프로젝트 행을 떠나지 않고 Enter로 연속 생성
2. **하위 작업 편집**
   - 상태·기한·우선순위·완료를 한 흐름에서 수정
3. **정렬과 반복 구조**
   - 하위 작업 순서 변경
   - 실사용으로 검증된 작업 묶음 재사용

### 3단계 · 판단과 리뷰

1. **리스트 스캔 강화**
   - 다음 행동·기한·병목·위험을 행 단위로 우선 표시
2. **Board / Timeline 연결**
   - 같은 원장을 흐름과 시간 질문에 맞춰 전환
3. **월간 리뷰**
   - 지연·다음 행동 없음·클로징 후보를 한 화면에서 결정

## 4. 채택한 접근

### 핵심 3필드 + 접힌 상세 설정

기본 상태에서는 핵심 3필드만 보여주고, 기한이나 상태를 생성 전에 지정해야 하는 예외에만 상세 설정을 펼친다.

다른 접근은 다음 이유로 채택하지 않았다.

- 핵심 3필드 전용: 가장 빠르지만 이미 정해진 기한을 입력하려면 생성 직후 상세 패널을 다시 편집해야 한다.
- 2단계 마법사: 구조화 품질은 높지만 개인용 빠른 입력에 단계 전환 비용을 추가한다.
- 기존 전체 폼 유지: 진행률·우선순위·상태를 모두 먼저 결정하게 해 생성 자체를 새 업무로 만든다.

## 5. 화면 구조와 카피

### 5.1 헤더

- 제목: `프로젝트 만들기`
- 부제: `목표와 다음 행동만 정하면 됩니다.`
- 닫기: 공용 Drawer의 아이콘 버튼, tooltip/accessible name은 `닫기`

### 5.2 저장 위치

진입 문맥에 따라 표시를 바꾼다.

- 특정 브랜드/컨테이너 또는 브랜드 섹션에서 열림:
  - 현재 저장 위치를 compact context row로 표시한다.
  - 해당 값으로 `brandId`를 미리 지정한다.
- 전체 브랜드 헤더, 전역 `N`, 브랜드 문맥이 없는 진입:
  - `저장 위치 *` select를 표시한다.
  - 첫 브랜드를 조용히 자동 선택하지 않는다.
  - placeholder는 `컨테이너 선택`이다.

### 5.3 핵심 필드

1. `프로젝트명 *`
   - text input
   - placeholder: `예: 8월 콘텐츠 운영`
   - 유일한 항상 필수 프로젝트 필드
2. `목표 결과`
   - textarea
   - placeholder: `완료됐을 때 어떤 상태가 되어야 하나요?`
   - `projects.summary`에 저장
3. `다음 행동`
   - text input
   - placeholder: `가장 먼저 할 한 가지`
   - `projects.next_action`에 저장

현재 기본값 `새 프로젝트`는 제거한다. 사용자가 입력하지 않은 일반명 프로젝트가 유효한 레코드로 저장되어서는 안 된다.

### 5.4 상세 설정

기본은 접힘이다. 토글에 실제 `aria-expanded`를 반영한다.

- 상태
  - 기본값: `계획` (`draft`)
  - 현재 durable enum 범위를 유지한다.
- 우선순위
  - 기본값: `보통` (`medium`)
  - 이번 슬라이스에서 중요도 어휘 migration을 하지 않는다.
- 기한
  - date input
  - 이번 슬라이스는 기존 date-only 계약을 유지하며 timezone/due precision 재설계는 하지 않는다.

생성 화면에서 제외:

- 수동 진행률
- 분야
- 병목
- 관련 고객·Opportunity
- 의존성
- 담당자·협업자

### 5.5 푸터

- 보조 행동: `취소`
- 주 행동: `프로젝트 만들기`
- 저장 중: `만드는 중…`
- shortcut hint: `⌘↵`

현재 공용 `완료`보다 생성 결과가 명확한 전용 카피를 사용한다.

## 6. 상호작용 계약

### 열기와 닫기

- 기존 생성 진입점과 `?new=project`를 유지한다.
- 드로어가 열리면 프로젝트명에 포커스한다.
- ESC, overlay click, 닫기 버튼을 모두 지원한다.
- 닫을 때 opener focus를 복원한다.
- focus trap과 Tab 순서는 시각 순서를 따른다.

### 저장

- 프로젝트명과 필요한 경우 저장 위치를 검증한다.
- 첫 오류 필드로 포커스한다.
- `Cmd/Ctrl+Enter`는 열린 드로어 하나에서만 한 번 실행된다.
- 저장 중에는 버튼과 shortcut의 재진입을 막는다.
- 성공 전에는 입력값을 지우지 않는다.

### 성공 후 전환

1. 프로젝트 write 응답에서 durable ID를 얻는다.
2. 프로젝트 원장을 재조회한다.
3. create drawer를 닫는다.
4. List view를 활성화한다.
5. 해당 project ID의 우측 상세 패널을 자동으로 연다.

상세 패널은 생성 결과, 목표 결과, 다음 행동을 즉시 확인하고 이후 하위 작업 흐름으로 이어지는 handoff 표면이다.

## 7. 컴포넌트 경계

### `ProjectCreateDrawer`

페이지 전용 생성 폼이다. 공용 `Drawer`를 조합하되 범용 `EditDrawer`의 field array를 과도하게 확장하지 않는다.

책임:

- 생성 draft 렌더링
- 저장 위치 문맥 표시
- 핵심/상세 필드 구분
- inline validation
- submit/save state
- create-specific footer copy

페이지 전용이므로 `components/hub/pages/` 아래 프로젝트 관련 모듈 또는 현재 Projects 페이지 내부의 집중된 컴포넌트로 둔다. 공용 primitive로 승격하지 않는다.

### 기존 `EditDrawer`

- 기존 프로젝트 편집과 다른 Hub 편집 표면에 계속 사용한다.
- 이번 슬라이스에서 열린 drawer만 shortcut listener를 등록하게 보강한다.
- `row` grouping과 date normalization을 포함한 현재 미커밋 변경을 보존한다.

### Projects page

책임:

- 생성 진입 문맥 결정
- 브랜드/컨테이너 목록 제공
- create API 호출
- 저장 후 ledger reload
- 생성된 상세 패널 열기

## 8. 데이터 계약

새 DB 컬럼과 migration을 추가하지 않는다.

| UI 의미 | write field | DB |
|---|---|---|
| 프로젝트명 | `title` | `projects.name` |
| 저장 위치 | `brandId` | `projects.brand_id` |
| 목표 결과 | `summary` | `projects.summary` |
| 다음 행동 | `nextAction` | `projects.next_action` |
| 상태 | `status` | `projects.status` |
| 우선순위 | `priority` | `projects.priority` |
| 기한 | `dueAt` | `projects.due_at` |

### 표시용 projection과 편집 원본 분리

현재 read adapter는 최신 `project_updates`의 summary/progress/next action을 프로젝트 표시값에 섞는다. 표시용 fallback을 편집 payload로 다시 저장하지 않는다.

Project read model은 최소 다음 원본 필드를 명시적으로 방출한다.

- `brandId`
- `statusKey`
- `priority`
- `projectSummary`
- `projectProgress`
- `projectNextAction`
- `dueAt`

목록·상세 표시에는 기존 derived 값을 사용할 수 있지만 편집 draft는 위 원본만 사용한다.

이 분리로 다음 회귀를 막는다.

- blocked/high 프로젝트를 단순 편집했는데 active/medium으로 바뀜
- 최신 update 요약이 project summary로 물질화됨
- 최신 update progress가 project row progress로 덮임
- 기존 브랜드 선택이 빈 값으로 열림

## 9. 저장 흐름과 신뢰 계약

```text
ProjectCreateDrawer
  -> client validation
  -> Hub POST /api/hub/projects
  -> guarded Hub BFF
  -> Engine /api/pms/command
  -> Supabase projects
  -> saved | duplicate | conflict | degraded | failed
  -> Hub ledger reload
  -> created project detail panel
```

- Browser → Hub BFF → Engine → Supabase 경계를 유지한다.
- 브라우저나 Hub client component에서 shared secret 또는 service role을 사용하지 않는다.
- `saved`만 새 영속 성공으로 취급한다.
- 동일 client project ID와 동일 payload의 안전한 재시도는 `duplicate`로 기존 durable ID를 반환할 수 있다.
- 동일 ID와 다른 payload는 성공 duplicate가 아니라 conflict다.
- preview를 실제 로컬 반영이라고 표시하지 않는다. 실제 optimistic project row를 만들지 않는 한 저장되지 않은 draft다.

## 10. 오류 처리

### validation

- 프로젝트명 누락: `프로젝트명을 입력하세요.`
- 전체 브랜드 문맥에서 저장 위치 누락: `프로젝트를 둘 위치를 선택하세요.`
- 오류 메시지는 필드 바로 아래 표시하고 `aria-describedby`로 연결한다.

### 저장 실패

- network/timeout: 입력과 client ID를 유지하고 재시도 제공
- preview/degraded: 저장 위치 미설정을 명시하고 드로어 유지
- conflict: 기존 저장 결과와 요청이 다름을 명시하고 새 요청 또는 reload 선택 제공
- unknown error: generic message와 correlation ID가 있으면 함께 표시

오류·저장 상태는 `aria-live` 또는 `role="alert"`로 알린다.

## 11. 반응형·접근성

- 데스크톱은 우측 drawer를 유지한다.
- 모바일은 390×844에서 본문이 가로 넘치지 않아야 한다.
- 모바일 input/textarea/select는 16px 이상이다.
- 모바일 touch target은 44px 이상이다.
- 헤더와 푸터는 고정하고 본문만 스크롤한다.
- 상세 설정이 펼쳐져도 한 열을 기본으로 한다. 데스크톱에서만 상태+우선순위를 한 행에 둘 수 있다.
- `prefers-reduced-motion`을 존중한다.

## 12. 테스트와 검증

### 단위/계약

1. 새 project draft의 제목은 빈 값이고 기본 status/priority는 draft/medium이다.
2. raw DB row의 brand/status/priority/summary/nextAction/dueAt이 edit draft까지 손실 없이 전달된다.
3. latest project update의 derived summary/progress가 project edit 원본으로 역기입되지 않는다.
4. 전체 브랜드에서는 저장 위치가 필수이고, 특정 브랜드 진입에서는 해당 brandId가 seed된다.
5. 닫힌 drawer는 `Cmd/Ctrl+Enter`에 반응하지 않고 열린 drawer의 submit은 저장 중 한 번만 실행된다.
6. 동일 ID+같은 payload는 duplicate, 동일 ID+다른 payload는 conflict다.

### Hub/Engine 경계

- guard·workspace 주입·shared secret forwarding을 기존 계약대로 유지한다.
- saved/duplicate/conflict/degraded/timeout의 HTTP와 response envelope을 확인한다.
- 프로젝트 create 후 GET read model에서 생성 ID·summary·next action이 보인다.

### 브라우저

- 1440px와 390×844에서 기본/상세 펼침 상태를 확인한다.
- header 생성, 브랜드 섹션 생성, `?new=project` 진입을 각각 확인한다.
- Tab, Shift+Tab, ESC, overlay, 닫기 버튼, `Cmd/Ctrl+Enter`, focus 복원을 확인한다.
- validation과 저장 실패에서 드로어가 유지된다.
- 성공 후 새 project 상세 패널이 열린다.
- live 운영 workspace에는 테스트 레코드를 남기지 않는다. 저장 검증은 격리 workspace 또는 요청 interception을 사용한다.

## 13. 이번 범위에서 하지 않는 것

- 첫 하위 task 자동 생성
- 하위 작업 인라인 편집·정렬
- 프로젝트 분야·병목·고객·Opportunity 새 스키마
- status/importance 전체 어휘 migration
- due precision/timezone migration
- 수동 진행률 UI
- 프로젝트 후보·template·monthly review
- 콘텐츠 4단계 시드의 원자성 개편
- 다중 사용자·권한·승인 흐름

## 14. 현재 작업 트리 통합 주의

2026-07-17 설계 시점의 브랜치는 `real_v1.2`이며 프로젝트 관련 파일에 사용자 미커밋 변경이 있다.

특히 다음 파일은 충돌 가능성이 높다.

- `apps/hub/components/hub/pages/projects.jsx`
- `apps/hub/components/hub/hub-primitives.jsx`
- `apps/hub/lib/pms-ui.js`
- `apps/hub/lib/pms-ui.test.mjs`
- `apps/hub/lib/repositories/operating-ledger.js`

구현은 해당 변경을 기준으로 수동 통합한다. `row` field grouping, date input normalization, Timeline helper, `dueAt` read projection, 콘텐츠 프로젝트 시드 등 기존 미커밋 변경을 되돌리거나 덮어쓰지 않는다.

## 15. 구현 완료 기준

1. 새 프로젝트 생성 드로어가 승인된 핵심 3필드 구조로 렌더된다.
2. 상세 설정은 기본 접힘이며 상태·우선순위·기한을 보존한다.
3. 전체 브랜드 문맥에서 저장 위치를 명시적으로 선택한다.
4. 저장 실패·preview·conflict에서 입력과 드로어가 유지된다.
5. 중복 submit으로 create 요청이 두 번 실행되지 않는다.
6. 저장 후 정확한 상세 패널이 열린다.
7. 기존 프로젝트 편집 왕복이 brand/status/priority/due/summary/nextAction을 손상하지 않는다.
8. 관련 단위·계약 테스트와 브라우저 desktop/mobile 검증이 통과한다.
