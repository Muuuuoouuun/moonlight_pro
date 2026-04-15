# Hub Minimal Practical Redesign Plan

이 문서는 `apps/hub` 대시보드 전면 개편을 "요약형 허브"에서 "즉시 작업형 허브"로 바꾸기 위한 실행 계획이다.

핵심 방향:

- `Dashboard`만 요약과 판단면을 유지한다.
- 그 외 섹션은 들어가자마자 설명이 아니라 작업 패널이 보이게 만든다.
- 불필요한 박스 배경, 그라데이션, 입체감, 중복 설명을 공통 구조에서 걷어낸다.
- 섹션 루트는 overview가 아니라 각 레인의 대표 작업면으로 연결한다.

## 1. 현재 문제 진단

### A. overview가 너무 많이 반복된다

현재 구조는 대부분의 섹션에서 아래 패턴을 반복한다.

- `page-head`
- `summary-grid`
- `SectionCard` 여러 개

반복 지점:

- `apps/hub/app/dashboard/work/page.jsx`
- `apps/hub/app/dashboard/content/page.jsx`
- `apps/hub/app/dashboard/revenue/page.jsx`
- `apps/hub/app/dashboard/automations/page.jsx`
- `apps/hub/app/dashboard/evolution/page.jsx`
- `apps/hub/app/dashboard/ai/page.jsx`

문제:

- 상위 탭에 들어갔을 때 바로 행동을 시작하기 어렵다.
- overview와 세부 탭 요약이 중복된다.
- 설명을 읽고 내려가야 실제 기능이 나온다.

### B. 공통 네비가 설명형 UI를 더 두껍게 만든다

현재 공통 셸과 섹션 네비는 설명을 많이 싣고 있다.

- `apps/hub/components/shell/dashboard-shell.jsx`
- `apps/hub/components/dashboard/section-nav.jsx`

중복 요소:

- topbar의 section description
- topbar의 view description
- subnav의 설명형 카드
- context bar의 별도 박스

결과:

- 현재 위치는 잘 보이지만, 작업 시작 속도는 느리다.
- 탭 하나를 이동할 때마다 "설명 박스"를 다시 보게 된다.

### C. 공통 CSS가 과한 박스 감각을 만든다

현재 공통 스타일은 거의 모든 표면에 같은 장식을 부여한다.

- `apps/hub/app/globals.css`

대표 셀렉터:

- `.summary-card`
- `.section-card`
- `.mini-metric`
- `.project-card`
- `.timeline-item`
- `.template-row`
- `.section-nav-bar`
- `.section-context-bar`

문제:

- 거의 모든 블록이 카드처럼 보여서 우선순위가 무너진다.
- gradient, top highlight line, shadow가 누적되어 실용 패널보다 장식 패널처럼 느껴진다.

## 2. 개편 원칙

### 원칙 1. Dashboard만 summary-first

- `/dashboard`만 오늘의 판단면과 요약 KPI를 유지한다.
- 다른 섹션은 summary-first를 기본으로 쓰지 않는다.

### 원칙 2. 섹션 루트는 즉시 작업형

- 상위 탭을 누르면 해당 섹션의 대표 작업 레인으로 바로 진입한다.
- 섹션 root에서 다시 overview를 보여주지 않는다.

### 원칙 3. 설명은 제목 아래 1줄 이하

- 긴 `page-head` 문단 제거
- `SectionCard.description`은 필요한 카드에만 짧게 사용
- topbar의 설명 문구는 기본 제거

### 원칙 4. 박스는 정보 그룹일 때만 쓴다

- 모든 row, metric, note에 배경을 주지 않는다.
- 배경보다 간격, 구분선, 타이포 위계로 그룹을 만든다.

### 원칙 5. 컨텍스트는 inline

- project/brand/audience 선택은 별도 설명 박스 대신 탭 바로 아래 inline segmented row로 배치한다.

## 3. 정보구조 변경안

### 유지

- `/dashboard` = summary hub

### 기본 진입점 변경

- `Work` 클릭 시 기본 진입 = `/dashboard/work/projects`
- `Revenue` 클릭 시 기본 진입 = `/dashboard/revenue/leads`
- `Content` 클릭 시 기본 진입 = `/dashboard/content/queue`
- `Automations` 클릭 시 기본 진입 = `/dashboard/automations/runs`
- `Evolution` 클릭 시 기본 진입 = `/dashboard/evolution/logs`
- `AI Console` 클릭 시 기본 진입 = `/dashboard/ai/orders`

### 제거 또는 축소

- 각 섹션의 `Overview` 서브탭 제거
- overview 설명 페이지 제거
- 탭별 summary grid 제거

### 기대 효과

- 상위 탭 클릭 후 첫 화면에서 바로 작업 가능
- overview와 세부 작업 탭의 역할 중복 제거
- 사용자가 "어디서 실제 작업하지?"를 다시 해석하지 않아도 됨

## 4. 공통 구조 개편안

### Shell

대상 파일:

- `apps/hub/components/shell/dashboard-shell.jsx`
- `apps/hub/lib/dashboard-data.js`

변경:

- topbar에서 `sectionDescription`, `viewDescription` 제거 또는 아주 짧게 축소
- 현재 화면 제목만 남기고 설명은 숨김
- subnav는 pill형 텍스트 탭으로 축소
- utility 영역도 label 중심으로 단순화
- sidebar foot의 설명 박스는 상태 pill 중심으로 축소

### Section nav

대상 파일:

- `apps/hub/components/dashboard/section-nav.jsx`
- `apps/hub/app/globals.css`

변경:

- 탭 카드형 UI를 pill/segmented row로 축소
- 각 탭 description 제거
- context bar를 별도 박스가 아닌 같은 줄 또는 다음 줄 segmented control로 변경
- `label + active state`만 먼저 보이게 조정

## 5. 공통 비주얼 개편안

대상 파일:

- `apps/hub/app/globals.css`
- `apps/hub/components/dashboard/section-card.jsx`
- `apps/hub/components/dashboard/summary-card.jsx`

변경 원칙:

- gradient background 제거
- pseudo top highlight 제거
- heavy shadow 제거
- border와 spacing 위주로 재구성
- card를 "항상 있는 배경 박스"가 아니라 "필요할 때만 쓰는 surface"로 축소

구체 변경:

- `.summary-card`, `.section-card`, `.mini-metric`, `.project-card`, `.timeline-item`, `.template-row`의 gradient 제거
- `::before` 선 장식 제거
- 공통 shadow를 최소화하거나 제거
- 기본 row는 투명 배경 + 하단 border
- 강조 패널만 약한 solid background 사용

추가 권장:

- `section-card`를 `default / plain / compact` 같은 밀도 변형으로 나눈다.
- dashboard 전용 summary surface와 일반 work surface를 분리한다.

## 6. 섹션별 개편 방향

### Work

목표:

- 설명형 overview를 없애고 프로젝트 실행면을 첫 화면으로 쓴다.

첫 화면:

- 프로젝트 리스트
- blocker/next action
- PMS pressure
- roadmap milestone

개편 포인트:

- `apps/hub/app/dashboard/work/page.jsx`는 제거 또는 redirect
- `apps/hub/app/dashboard/work/projects/page.jsx`를 사실상 루트 경험으로 승격

### Revenue

목표:

- funnel 설명보다 리드 처리와 딜 진행이 먼저 보여야 한다.

첫 화면:

- leads queue
- next follow-up
- active deals

개편 포인트:

- `apps/hub/app/dashboard/revenue/page.jsx` summary 제거
- `leads`를 대표 진입점으로 변경

### Content

목표:

- 브랜드 설명보다 queue와 studio가 먼저 보여야 한다.

첫 화면:

- queue
- studio shortcut
- current campaign
- publish next

개편 포인트:

- `apps/hub/app/dashboard/content/page.jsx`의 summary + brand explanation 축소
- `queue`를 대표 진입점으로 변경
- 브랜드 reference는 side reference가 아니라 필요 시 펼치는 compact panel로 축소

### Automations

목표:

- pulse summary보다 run queue와 failure triage가 먼저 보여야 한다.

첫 화면:

- latest runs
- failed runs
- retry / handoff

개편 포인트:

- `apps/hub/app/dashboard/automations/page.jsx`의 operating summary를 dashboard로 한정
- `runs`를 대표 진입점으로 변경

### Evolution

목표:

- 회고형 overview보다 unresolved logs/issues가 먼저 보여야 한다.

첫 화면:

- open logs
- open issues
- follow-up owner

개편 포인트:

- `apps/hub/app/dashboard/evolution/page.jsx` summary 제거
- `logs`를 대표 진입점으로 변경

### AI Console

목표:

- agent 설명보다 orders와 active work가 먼저 보여야 한다.

첫 화면:

- open orders
- agent availability
- latest chat/council shortcuts

개편 포인트:

- `apps/hub/app/dashboard/ai/page.jsx` overview 제거
- `orders`를 대표 진입점으로 변경

## 7. 구현 순서

### Phase 1. Shell and route cleanup

파일:

- `apps/hub/lib/dashboard-data.js`
- `apps/hub/components/shell/dashboard-shell.jsx`
- 각 section `layout.jsx`
- 각 section root `page.jsx`

작업:

- overview child 제거
- section root redirect 추가
- topbar/subnav 설명 축소

### Phase 2. Shared visual simplification

파일:

- `apps/hub/app/globals.css`
- `apps/hub/components/dashboard/section-nav.jsx`
- `apps/hub/components/dashboard/section-card.jsx`
- `apps/hub/components/dashboard/summary-card.jsx`

작업:

- gradient/shadow/box chrome 제거
- plain row/panel 스타일 추가
- context switcher inline화

### Phase 3. Section root rewiring

파일:

- `apps/hub/app/dashboard/work/page.jsx`
- `apps/hub/app/dashboard/revenue/page.jsx`
- `apps/hub/app/dashboard/content/page.jsx`
- `apps/hub/app/dashboard/automations/page.jsx`
- `apps/hub/app/dashboard/evolution/page.jsx`
- `apps/hub/app/dashboard/ai/page.jsx`

작업:

- summary grid 제거
- 설명 문단 제거
- 대표 작업 패널 우선 배치

### Phase 4. Detail page cleanup

작업:

- 세부 탭의 `page-head` 제거 또는 1줄화
- 반복 summary 제거
- 기능 패널을 첫 fold 안에 재배치

## 8. 수용 기준

- `Dashboard` 외 섹션에서 첫 화면 진입 시 summary 카드 0개
- 상위 탭 진입 후 3초 안에 실제 액션 버튼 또는 작업 리스트 노출
- 공통 row/card의 gradient background 제거
- 설명 문단 없이도 현재 화면 목적이 제목과 데이터만으로 이해됨
- 모바일에서 subnav와 context가 2줄 이내로 유지됨

## 9. git pull 관련 현재 상태

현재 저장소 상태:

- `main...origin/main [ahead 3, behind 3]`
- 로컬 수정 파일 다수
- untracked 파일 다수

의미:

- 지금 바로 `git pull`을 실행하면 merge/rebase 충돌 가능성이 높다.
- 특히 이번 개편 대상인 `apps/hub` 주요 파일이 이미 로컬 변경 중이다.

권장 순서:

1. 현재 작업을 별도 브랜치나 커밋으로 먼저 보호
2. `pull --rebase` 또는 수동 merge 전략 선택
3. 동기화 후 이 문서 순서대로 개편 착수
