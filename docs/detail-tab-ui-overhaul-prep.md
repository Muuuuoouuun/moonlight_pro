# Detail Tab UI Overhaul Prep

## Goal

`apps/hub` 상세 탭 전반을 랜딩페이지형 화면에서 운영형 화면으로 재정렬한다.

이번 개편은 `컨텐츠 문구 수정 없이`, 다음만 다룬다.

- 배경/표면 톤
- 패널 폭과 컬럼 비율
- 첫 화면 정보 위계
- 주요 액션 위치
- 탭/컨텍스트 구조
- 공통 카드 밀도와 간격

핵심 기준은 하나다.

`5초 안에 지금 중요한 것 + 다음 액션 + 운영 포인트가 보여야 한다.`

## What Is Broken Now

### 1. 랜딩페이지형 상단 구조

공통 `hero`, `page-head`, `summary-grid` 패턴이 탭 첫 화면을 설명형/소개형으로 만들고 있다.

- 큰 헤드라인
- 과한 도입 문장
- 상단 장식 패널
- 액션보다 먼저 나오는 요약 카드

이 패턴 때문에 실제 운영 액션이 fold 아래로 밀린다.

관련 파일:

- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css:908)
- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css:1015)
- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css:1119)
- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css:2366)

### 2. 카드 몸통이 너무 두껍고 장식적임

운영 UI여야 할 카드에 본문 그라디언트, 그림자, 큰 라운드, 높은 내부 여백이 반복된다.

- 카드끼리 위계 차이가 약함
- 전부 “중요해 보이는” 문제
- 실제 operator path가 묻힘

### 3. 메인 캔버스 폭 제어 부재

셸은 넓은데 메인 컨텐츠 폭을 clamp 하지 않아 탭에 따라 패널이 과하게 벌어진다.

- 정보가 좌우로 퍼짐
- 작업 흐름보다 전시형 느낌
- detail panel이 너무 많은 폭을 가져감

관련 파일:

- [apps/hub/components/shell/dashboard-shell.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/components/shell/dashboard-shell.jsx:118)
- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css:125)
- [packages/ui/tokens.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/packages/ui/tokens.css:84)

### 4. 운영 액션이 너무 아래 있음

대부분의 탭에서 사용자가 실제로 해야 하는 행동은 아래쪽에 있다.

- AI: dispatch/send/review
- Operations: workbench
- Work: quick update / cross-link
- Studio: editor / draft controls
- Webhooks: smoke test
- Integrations: reconnect / inspect / resync

## Shared Overhaul Rules

### A. 상단은 소개가 아니라 상황판

각 상세 탭 첫 화면은 아래 3개만 우선 배치한다.

1. `현재 상태`
2. `바로 해야 할 액션`
3. `문제가 있는 영역`

제거/축소 대상:

- 대형 hero
- 설명 위주의 lede
- 장식용 side panel
- KPI를 위한 KPI

### B. 카드 표면은 3단계만 허용

공통 표면 규칙:

- `base surface`: 기본 운영 카드
- `raised surface`: 선택/집중/활성 카드
- `critical strip`: 경고/실패/대기 카드

금지:

- 카드 본문 전체 그라디언트
- 의미 없는 glow
- 모든 카드 동일한 시선 강도

### C. 메인 컨텐츠 폭 제한

운영 탭 본문은 공통 래퍼로 묶는다.

목표:

- 너무 넓은 2열 분할 축소
- 텍스트/표/상태 리스트 가독성 개선
- form/list/detail 조합에서 액션 컬럼 우선

기본 원칙:

- overview: `metrics strip + primary split`
- detail tabs: `primary work area + secondary context rail`
- rail은 항상 main보다 약해야 함

### D. 첫 화면 배치 원칙

각 탭은 아래 순서를 기본값으로 한다.

1. `tab context/nav`
2. `operator header`
3. `action row`
4. `signal strip`
5. `primary work area`
6. `secondary context`

### E. 컨텍스트 바는 짧고 즉시성 있게

섹션 레이아웃의 `page-head`는 줄이고, `DashboardSectionNav` 바로 위/안에서 맥락을 끝낸다.

- 섹션 소개 1~2문장 이하
- query context는 상단에서 바로 조작 가능
- “이 탭이 무엇인가”보다 “지금 무엇을 보고 있는가”가 먼저

## Tab-By-Tab Overhaul Targets

### Command Center

문제:

- 큰 hero가 점프 허브보다 먼저 보임
- quick jump, queue, recent가 늦게 등장

개편:

- hero 제거 또는 compact operator header로 축소
- quick jump를 첫 블록으로 승격
- summary metrics는 action row 옆 mini strip로 축소
- recent routes와 utility는 secondary lane으로 이동

관련 파일:

- [apps/hub/app/dashboard/command-center/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/command-center/page.jsx:88)

### Operations

문제:

- 상단 signal 섹션이 너무 많음
- 실제 workbench 진입이 늦음
- detail panel이 액션 리스트 대비 너무 넓음

개편:

- workbench를 첫 화면 주역으로 올림
- attention/queue/sync 상태는 compact strip로 묶음
- detail panel 폭 축소
- 선택 전 empty state도 operator instruction 중심으로 단순화

관련 파일:

- [apps/hub/app/dashboard/operations/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/operations/page.jsx:652)
- [apps/hub/components/dashboard/operations-workbench.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/components/dashboard/operations-workbench.jsx:53)

### AI Overview / Chat / Council / Orders

문제:

- hero/summary 이후 실제 입력/승인/배정 UI가 나옴
- 정보 카드 비중이 액션보다 큼

개편:

- AI overview는 active agents + pending decisions 중심으로 재배치
- Chat은 input composer와 recent context를 상단 고정
- Council은 pending review queue 우선
- Orders는 dispatch/review controls를 top control band로 승격

관련 파일:

- [apps/hub/app/dashboard/ai/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/ai/page.jsx:64)
- [apps/hub/app/dashboard/ai/chat/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/ai/chat/page.jsx:33)
- [apps/hub/app/dashboard/ai/council/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/ai/council/page.jsx:28)
- [apps/hub/app/dashboard/ai/orders/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/ai/orders/page.jsx:33)

### Work

문제:

- 서브탭 수가 많아 인지 부하가 큼
- summary와 보조 카드 뒤에 실제 업데이트/관리 기능이 숨음

개편:

- Work nav는 `Overview / Projects / Delivery / Plan / Decisions` 수준으로 재그룹 검토
- Projects는 quick update와 blockers를 최상단으로 승격
- Management/PMS/Calendar/Roadmap은 “운영 제어” 기준으로 묶고 보조 탭은 context switch로 처리
- KPI 요약은 top strip로만 유지

관련 파일:

- [apps/hub/app/dashboard/work/layout.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/work/layout.jsx:1)
- [apps/hub/app/dashboard/work/projects/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/work/projects/page.jsx:293)
- [apps/hub/app/dashboard/work/pms/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/work/pms/page.jsx:187)

### Content

문제:

- 레이아웃 소개문이 nav보다 먼저 보임
- Studio가 패널 수와 폭이 너무 큼
- 실제 draft/editor 중심감이 약함

개편:

- section-level `page-head` 제거 또는 nav 안 compact intro로 치환
- Studio는 `brief / draft / preview / handoff` 순서로 핵심 흐름만 first screen에 배치
- navigator/rules/assets context는 secondary rail 또는 collapsible block으로 이동
- 편집 영역 폭을 우선하고 주변 패널 폭을 줄임

관련 파일:

- [apps/hub/app/dashboard/content/layout.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/content/layout.jsx:1)
- [apps/hub/app/dashboard/content/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/content/page.jsx:22)
- [apps/hub/app/dashboard/content/studio/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/content/studio/page.jsx:703)

### Automations

문제:

- layout intro가 앞에 있고, 탭 공통 위계가 느림
- integrations/webhooks/email 모두 카드 무게가 비슷함
- smoke test, reconnect, inspect 같은 핵심 액션이 묻힘

개편:

- `Runs / Webhooks / Integrations` 중심으로 operator path를 재정렬
- Email은 utility/secondary 성격인지 재평가
- Webhooks는 test form을 첫 블록으로 승격
- Integrations는 health strip + actionable list + detail rail 구조로 전환

관련 파일:

- [apps/hub/app/dashboard/automations/layout.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/automations/layout.jsx:1)
- [apps/hub/app/dashboard/automations/webhooks/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/automations/webhooks/page.jsx:1)
- [apps/hub/app/dashboard/automations/integrations/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/automations/integrations/page.jsx:286)

### Revenue

문제:

- section nav는 있지만 context bar가 약함
- overview/detail 모두 summary-card 중심으로 읽힘

개편:

- 리드/딜/어카운트/케이스별 현재 처리량과 next action을 같은 line에 노출
- account/deal table 또는 action queue를 first work area로 승격
- revenue context filter 추가 검토

관련 파일:

- [apps/hub/app/dashboard/revenue/layout.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/revenue/layout.jsx:1)

### Evolution

문제:

- section intro가 먼저 나오고 로그/이슈가 뒤로 밀림
- 메모리 레이어인데 설명이 운영 신호보다 강함

개편:

- logs/issues/activity 삼각 구조를 첫 화면에서 바로 노출
- failure ownership과 unresolved item을 top strip로 끌어올림
- section intro는 한 줄 context note 수준으로 축소

관련 파일:

- [apps/hub/app/dashboard/evolution/layout.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/evolution/layout.jsx:1)

### Settings

문제:

- 운영 설정 액션과 상태 리드가 섞임
- summary와 각 설정 섹션의 우선순위가 비슷함

개편:

- `connection/setup/security/workspace` 순으로 운영 빈도 기준 재배치
- 설정 상태와 바로 가능한 액션을 한 카드에 결합
- 관리성 낮은 설명성 블록 축소

관련 파일:

- [apps/hub/app/dashboard/settings/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/settings/page.jsx:194)

## Shared Files To Change First

1. [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css:1)
2. [apps/hub/components/shell/dashboard-shell.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/components/shell/dashboard-shell.jsx:1)
3. [apps/hub/components/dashboard/section-nav.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/components/dashboard/section-nav.jsx:1)
4. [packages/ui/tokens.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/packages/ui/tokens.css:1)
5. tab pages with the highest operator impact first:

- [apps/hub/app/dashboard/operations/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/operations/page.jsx:1)
- [apps/hub/app/dashboard/ai/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/ai/page.jsx:1)
- [apps/hub/app/dashboard/automations/webhooks/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/automations/webhooks/page.jsx:1)
- [apps/hub/app/dashboard/content/studio/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/content/studio/page.jsx:1)
- [apps/hub/app/dashboard/work/projects/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/work/projects/page.jsx:1)

## Implementation Order

### Phase 1. Shared shell normalization

- main canvas width clamp 추가
- `hero`, `page-head`, `summary-card`, `section-card` 밀도 축소
- 공통 action row / signal strip / operator header 스타일 추가

### Phase 2. Section nav normalization

- 섹션 intro 축소
- 컨텍스트 바를 즉시 조작 가능하게 정리
- 탭 수가 과한 섹션은 재그룹 초안 적용

### Phase 3. High-impact detail tabs

- Operations
- AI
- Automations
- Content Studio
- Work Projects / PMS

### Phase 4. Remaining detail tabs

- Revenue
- Evolution
- Settings
- 기타 overview 탭

## Done Criteria

아래를 만족하면 이번 개편 방향이 맞다.

- 각 탭 첫 화면에서 `핵심 액션`이 fold 위에 있다.
- 지표는 “무슨 의미인지”를 바로 읽을 수 있다.
- 보조 패널은 메인 워크 영역보다 약하다.
- 카드 배경이 기능을 설명하지 장식하지 않는다.
- 탭 소개보다 현재 상태와 다음 행동이 먼저 보인다.
- 넓은 화면에서도 정보가 퍼져 보이지 않는다.

## Notes

- 이번 준비 문서는 `콘텐츠 카피 수정 없이` 구조와 시각 위계만 다룬다.
- `docs/design-guidelines.md`는 최신 hub 방향과 일부 충돌하므로, 허브 작업 기준은 `DESIGN.md`와 실제 `Moonstone Command Deck` 토큰을 우선한다.
