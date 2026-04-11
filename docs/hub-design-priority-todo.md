# Com_Moon Hub Design Priority Todo

이 문서는 허브 설계를 실제 구현 순서로 내리기 위한 실행용 체크리스트다.

원칙:

- 새 탭을 늘리는 일보다 기존 탭이 더 좋은 판단을 만들게 하는 일이 먼저다.
- 각 항목은 `질문`, `MVP`, `후속` 기준으로 끊는다.
- `P0`는 바로 다음 구현 라운드에서 다루고, `P1`은 공통 컴포넌트와 데이터 모델이 준비되는 대로 붙인다.

## P0

### 1. Revenue audience split

상태:
- `todo`

목표:
- `Revenue` 안에서 `All / Individual / Company`를 URL 상태와 UI 모두에 반영한다.

MVP:
- `Overview`, `Leads`, `Deals`, `Accounts`, `Cases` 모두 audience switcher 연결
- 개인/회사별 KPI 문구 분기
- 회사 view에서는 pipeline 중심, 개인 view에서는 relationship/follow-up 중심

후속:
- `lead_kind`, `deal_kind`, `account_kind`, `case_kind` 데이터 축 명시

### 2. Content brand operating layer

상태:
- `todo`

목표:
- `Content`를 브랜드 선택형 운영 면으로 완성한다.

MVP:
- 브랜드 switcher와 실제 브랜드 reference panel 연결
- `Overview / Queue / Studio / Assets / Publish`의 브랜드별 문맥 정리
- 브랜드별 톤, 금지 표현, 핵심 메시지, 포맷 규칙 추가

후속:
- 브랜드별 publish metrics
- 브랜드별 template presets

### 3. Overview today-first decision stack

상태:
- `todo`

목표:
- 허브 홈이 “현황판”이 아니라 “오늘의 판단면”이 되게 만든다.

MVP:
- `Today`
- `Alerts`
- `Approvals`
- `Cross-lane feed`
- `Next 3 actions`

후속:
- morning / midday / evening mode
- founder briefing snapshots

## P1

### 4. Shared detail drawer

상태:
- `todo`

목표:
- 모든 주요 레인에서 항목 클릭 시 같은 정보 구조를 가진 우측 상세면을 연다.

MVP:
- 상태
- 다음 액션
- 관련 링크
- 히스토리
- 메모

후속:
- inline edit
- linked object graph

### 5. Automations failure-response flow

상태:
- `todo`

목표:
- 실패를 보여주는 것에서 끝나지 않고, 사람이 개입해야 하는 지점을 설계한다.

MVP:
- failed runs queue
- retry candidates
- root-cause hints
- human handoff lane

후속:
- rerun diff
- approval gate

### 6. Evolution improvement loop

상태:
- `todo`

목표:
- 에러/이슈/활동이 실제 개선 액션으로 이어지는 구조를 만든다.

MVP:
- repeated issue grouping
- fix owner
- improvement memo
- next change proposal

후속:
- recurring pattern detection
- automated suggestion loop

## P2

### 7. Daily Brief tab hardening

상태:
- `in_progress`

목표:
- 아침 점검용 MVP mockup을 실제 daily control surface로 키운다.

MVP:
- 오늘 KPI
- approvals
- risk watch
- next-three-actions

후속:
- personalized routines
- scheduled brief generation

### 8. Playbooks tab hardening

상태:
- `in_progress`

목표:
- 반복 업무 SOP와 자동화 연결을 명확히 한다.

MVP:
- playbook categories
- trigger rules
- run steps
- automation hooks

후속:
- editable playbook builder
- run history

### 9. Settings tab hardening

상태:
- `in_progress`

목표:
- 설정을 단순 환경변수 목록이 아니라 운영 posture 화면으로 만든다.

MVP:
- environment posture
- integration readiness
- data source health
- mapping checklist

후속:
- secrets manager linkage
- per-workspace config

### 10. Command tab hardening

상태:
- `in_progress`

목표:
- 검색과 명령 dispatch를 하나의 조작면으로 만든다.

MVP:
- command search
- recent runs
- suggested actions
- syntax examples

후속:
- keyboard palette
- fuzzy object search
- saved command recipes

## Exit Rule

다음 라운드에서 “무엇을 할까”가 아니라, 이 문서의 가장 높은 `todo`부터 처리한다.
