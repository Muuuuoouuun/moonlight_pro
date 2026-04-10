# Com_Moon Hub 상세 탭 / 컨텐츠 / MVP / UI 설계

## 1. 문서 목적

이 문서는 `apps/hub`의 새 정보구조를 실제 제품 설계 수준으로 구체화한다.

정리 범위:

- 탑레벨 탭과 세부 탭의 역할
- 각 탭에서 보여줄 핵심 컨텐츠
- MVP에 반드시 들어갈 블록
- 후속 단계에서 확장할 블록
- 데스크톱 / 모바일 UI 상세 원칙

이 문서는 현재 구현된 허브 라우트 구조를 기준으로 작성한다.

## 2. 현재 기준 라우트 맵

### 탑레벨

- `/dashboard` = Overview
- `/dashboard/work` = Work OS
- `/dashboard/revenue` = Revenue
- `/dashboard/content` = Content
- `/dashboard/automations` = Automations
- `/dashboard/evolution` = Evolution

### 세부 탭

- `Work OS`
  - `/dashboard/work`
  - `/dashboard/work/projects`
  - `/dashboard/work/rhythm`
  - `/dashboard/work/decisions`

- `Revenue`
  - `/dashboard/revenue`
  - `/dashboard/revenue/leads`
  - `/dashboard/revenue/deals`
  - `/dashboard/revenue/accounts`
  - `/dashboard/revenue/cases`

- `Content`
  - `/dashboard/content`
  - `/dashboard/content/queue`
  - `/dashboard/content/studio`
  - `/dashboard/content/assets`
  - `/dashboard/content/publish`

- `Automations`
  - `/dashboard/automations`
  - `/dashboard/automations/runs`
  - `/dashboard/automations/webhooks`
  - `/dashboard/automations/integrations`

- `Evolution`
  - `/dashboard/evolution`
  - `/dashboard/evolution/logs`
  - `/dashboard/evolution/issues`
  - `/dashboard/evolution/activity`

## 3. 제품 원칙

### 공통 질문

모든 허브 화면은 아래 질문 중 최소 하나에 5초 안에 답해야 한다.

- 지금 가장 중요한 것은 무엇인가
- 무엇이 멈춰 있거나 위험한가
- 다음 액션은 어디서 시작해야 하는가
- 어떤 흐름이 실제로 움직이고 있는가

### 허브에서 피해야 할 것

- 엑셀처럼 넓고 무거운 테이블 우선 설계
- 상태만 있고 액션이 없는 카드
- 같은 정보를 다른 탭에서 반복 노출하는 것
- “언젠가 쓰일 것 같은” 보조 정보의 선행 노출

### 허브에서 우선해야 할 것

- 짧고 강한 KPI
- 상태 + 맥락 + 다음 액션의 3점 세트
- 카드, 타임라인, 짧은 리스트 중심 구조
- 모바일에서도 읽히는 압축형 밀도

## 4. 전역 셸 설계

### 사이드바

역할:

- 탑레벨 섹션 이동
- 현재 섹션과 현재 뷰 인지
- 허브가 “운영 OS”라는 감각 유지

구성:

- 브랜드 영역
- 탑레벨 섹션 네비
- 현재 섹션 / 현재 뷰 / 모드 상태 박스

규칙:

- 탑레벨은 6개를 넘기지 않는다
- 레거시 진입점은 사이드바에 직접 노출하지 않는다
- 현재 활성 섹션만 강한 배경 강조

### 탑바

역할:

- 현재 위치 인지
- 글로벌 빠른 액션 제공

MVP 액션:

- `Open Work OS`
- `Open Studio`
- `Review Alerts`

후속 확장:

- `New memo`
- `Run command`
- `Capture idea`

### 섹션 서브탭 바

역할:

- 섹션 내부 세부 탭 전환
- 현재 섹션 안의 작업 레일 제공

규칙:

- 서브탭은 3개에서 5개 사이 유지
- 각 탭은 `이름 + 한 줄 설명` 구조
- 모바일에서는 2열 카드형, 데스크톱에서는 auto-fit 그리드

### 컨텍스트 바

역할:

- 같은 탭 안에서 대상군 또는 브랜드 축을 전환
- 하나의 화면을 복제하지 않고 운영 문맥만 바꾸기

우선 적용 대상:

- `Revenue` = `All / Individual / Company`
- `Content` = `All Brands / 시나브로 / 고래(Go;Re) / HolyFunCollector / BridgeMaker / MoonPM / Class.Moon / Study.Seagull / Politic Officer / 22th.Nomad`
- `Work OS` = `All Projects / Com_Moon / classinkr-web / sales_branding_dash / ai-command-pot`

규칙:

- 컨텍스트 바는 탭 바 아래, 본문 위에 위치
- 상태는 URL로 남긴다
- 기본값은 `All`
- 모바일에서는 pill wrap, 데스크톱에서는 segmented control

예시 URL:

- `/dashboard/revenue/leads?audience=individual`
- `/dashboard/revenue/deals?audience=company`
- `/dashboard/content/queue?brand=sinabro`
- `/dashboard/content/publish?brand=all`
- `/dashboard/work/projects?project=classinkr-web`

## 5. 공통 UI 컴포넌트 언어

### KPI 카드

용도:

- 숫자, 상태, 한 줄 의미 요약

구성:

- 상단 라벨
- 큰 숫자 또는 키워드
- 한 줄 설명
- 우측 상단 배지

규칙:

- 숫자는 최대 4자리 감각으로 유지
- 설명은 1문장
- 경고는 노랑, 정보는 파랑, 안정은 초록

### 섹션 카드

용도:

- 하나의 작업 단위 묶기

구성:

- kicker
- title
- description
- action
- body

규칙:

- 카드 하나는 질문 하나만 풀어야 한다
- description은 왜 이 카드가 존재하는지 설명해야 한다

### 타임라인

용도:

- 최근 이벤트, 상태 변화, 실행 로그

규칙:

- 최신순
- 각 row는 `상태칩 / 제목 / 설명 / 시간` 우선
- 8개를 넘기면 요약 또는 접기 고려

### 보드 / 레인

용도:

- Queue, Pipeline, Stage 기반 흐름 표현

규칙:

- 3~4 레인 권장
- 레인당 2~5개 item
- item은 `제목 / 메타 / 다음 액션`

## 6. Overview 상세 설계

### 목적

허브 전체의 오늘 상태를 한 화면에서 파악한다.

### 이 화면이 답해야 하는 질문

- 오늘 가장 먼저 봐야 할 것은 무엇인가
- 어떤 섹션에 지금 바로 들어가야 하는가
- 자동화나 로그 쪽 경고가 있는가

### MVP 블록

1. Hero
2. KPI strip
3. OS lanes card grid
4. Workspace pulse
5. Today focus
6. Progress movement
7. System checks
8. Engine watch

### UI 상세

- 상단 Hero는 탑레벨 중 유일하게 허용되는 감성 블록
- 그 아래는 바로 KPI 4~5개
- `OS lanes`는 탑레벨 5개 진입 카드
- 데스크톱은 `2:1` 비대칭 그리드
- 모바일은 Hero 아래 KPI 세로 스택

### MVP 제외

- 개인 캘린더
- 외부 알림 인박스
- 장문 리포트

## 7. Work OS 상세 설계

### 7.0 Work OS 공통 구조

Work OS는 브랜드가 아니라 프로젝트/운영 축으로 움직인다. 여기서의 컨텍스트는 콘텐츠 브랜드가 아니라 개발, PMS, 상황판의 대상 프로젝트다.

Project scope:

- `All Projects`
- `Com_Moon`
- `classinkr-web`
- `sales_branding_dash`
- `ai-command-pot`

운영 의미:

- `Com_Moon` = 허브 자체 운영과 통합 OS 레이어
- `classinkr-web` = 특정 프로젝트 개발/운영 레인
- `sales_branding_dash` = 세일즈/브랜딩 대시보드 개발 및 운영 레인
- `ai-command-pot` = 자동화/엔진/오케스트레이션 레인

적용 탭:

- `Work OS > Overview`
- `Work OS > Projects`
- 필요하면 `Overview` 상단에도 약하게 노출 가능

규칙:

- Work OS에서는 `project context switcher`
- Content에서는 `brand switcher`
- 두 컨텍스트는 절대 같은 것으로 취급하지 않는다

### 7.1 Overview

목적:

- 프로젝트, 리듬, 의사결정의 연결 상태를 요약한다

핵심 블록:

- Active Projects KPI
- Cadence Blocks KPI
- Reset Prompts KPI
- At-Risk Lanes KPI
- Portfolio movement
- Recent motion

데이터:

- `projects`
- `project_updates`
- `routine_checks`
- `decisions`

MVP 액션:

- 프로젝트로 이동
- 리듬으로 이동
- 결정 로그 확인

### 7.2 Projects

목적:

- 현재 실제로 움직이는 프로젝트와 막힌 프로젝트를 본다

핵심 질문:

- 어떤 프로젝트가 진행 중인가
- 어디가 막혔는가
- 각 프로젝트의 다음 액션은 무엇인가

MVP 블록:

- Status KPI
- Live project board
- Recent updates

카드 구성:

- 프로젝트명
- owner/priority
- progress
- milestone
- next action
- risk

후속:

- milestone drill-down
- task rollup
- due date heatmap

### 7.3 Rhythm

목적:

- 하루와 주간 운영 리듬을 고정한다

핵심 질문:

- 오늘 어떤 체크포인트가 남아 있는가
- 주간 리뷰에서 무엇을 물어야 하는가

MVP 블록:

- Done / Active / Pending / Reset KPI
- Today checkpoints
- Weekly reset prompts

UI:

- 체크카드 3~4개
- 상태칩은 `done / active / pending`

후속:

- 시간대 기반 reminder
- missed rhythm warning

### 7.4 Decisions

목적:

- 중요한 결정과 그 후속 실행을 연결한다

핵심 질문:

- 최근 어떤 판단이 방향을 바꿨는가
- 그 판단이 실제 액션으로 연결됐는가

MVP 블록:

- Recent decisions KPI
- Decision log timeline
- Reset prompts

데이터:

- `decisions`
- `project_updates`

후속:

- ADR 링크
- decision to task conversion

## 8. Revenue 상세 설계

### 8.0 Revenue 공통 구조

Revenue는 탭만으로 충분하지 않다. 같은 `리드 / 딜 / 계정 / 케이스`라도 개인 고객과 회사 고객은 흐름이 다르기 때문이다.

권장 구조:

- 1차: 탭
- 2차: `Audience switcher`

Revenue audience:

- `All`
- `Individual`
- `Company`

운영 의미:

- `Individual` = 개인 문의, 1:1 고객, 개인 브랜딩/코칭/컨설팅형 파이프라인
- `Company` = 기업 문의, 팀/조직 단위 계약, B2B 운영 파이프라인

MVP 동작:

- `All`에서는 개인/회사 블록을 분리 표시
- `Individual`, `Company`에서는 해당 데이터만 필터링

UI 규칙:

- KPI는 현재 audience 기준으로 바뀐다
- `All`에서는 KPI 아래에 `Individual lane`, `Company lane`을 나란히 또는 위아래로 보여준다
- 상세 탭에서는 audience를 바꿔도 같은 라우트를 유지하고 내용만 바뀐다

데이터 규칙:

- MVP에서는 `company_id` 존재 여부로 `Company / Individual`을 1차 추론 가능
- 후속으로는 `lead_kind`, `deal_kind`, `account_kind` 같은 명시적 필드 추가 권장

세부 컨텍스트 바 구성:

- 왼쪽: `Audience`
- 오른쪽: `Warm only`, `Needs follow-up`, `Blocked only` 같은 보조 토글은 후속

### 8.1 Overview

목적:

- 매출 흐름을 `리드 > 딜 > 계정 > 케이스`로 압축해 본다

MVP 블록:

- 리드 / 딜 / 케이스 KPI
- Working set board
- Operating rules

탭 안 세부 구성:

- `Audience switcher`
- `Audience KPI strip`
- `Individual snapshot`
- `Company snapshot`
- `Shared rules`

`All`일 때 화면 구성:

1. Audience switcher
2. KPI strip
3. `Individual pipeline snapshot`
4. `Company pipeline snapshot`
5. Shared rules

`Individual` 또는 `Company`일 때 화면 구성:

1. Audience switcher
2. KPI strip
3. Working set board
4. Risks / next actions
5. Rules

후속:

- 주간 파이프라인 변화율
- won/lost 요약

### 8.2 Leads

목적:

- 웜리드와 후속 액션을 관리한다

핵심 질문:

- 어떤 리드가 지금 제일 따뜻한가
- 누가 다음에 연락해야 하는가

MVP 블록:

- New / Qualified / Nurturing KPI
- Lead queue timeline
- Rules block

탭 안 세부 구성:

- `Audience switcher`
- `Lead KPI strip`
- `Lead queue`
- `Next actions`
- `Rules`

`All`일 때:

- 상단에 `Individual leads` 섹션
- 그 아래 `Company leads` 섹션
- 둘 다 같은 카드 구조를 쓰되 score와 source 강조

`Individual`일 때 핵심 필드:

- name or source label
- status
- score
- next action
- last touch

`Company`일 때 핵심 필드:

- company
- contact
- status
- score
- next action
- last touch

리드 row 필드:

- source
- status
- score
- next action
- created_at

MVP 행동:

- 다음 연락 정의
- 웜리드 우선순위 확인

후속:

- last touch
- owner
- company/contact join

### 8.3 Deals

목적:

- 딜 단계를 명확하게 보여준다

핵심 질문:

- 현재 어떤 단계에 몇 개가 있는가
- 어떤 딜이 close에 가까운가

MVP 블록:

- Prospect / Proposal / Negotiation KPI
- Opportunity board
- Rules block

탭 안 세부 구성:

- `Audience switcher`
- `Stage KPI`
- `Deal board`
- `Close watch list`
- `Rules`

`Individual` deals의 특징:

- deal amount보다 `service fit`, `decision timing`, `follow-up`이 더 중요할 수 있음

`Company` deals의 특징:

- amount, stage, expected close, decision maker가 더 중요함

UI 차이:

- `Individual` view는 카드형 설명 밀도 높게
- `Company` view는 금액/단계/예상 마감이 더 전면

딜 row 필드:

- title
- stage
- amount
- expected close
- created_at

후속:

- close forecast
- stage aging
- won/lost split

### 8.4 Accounts

목적:

- 클로즈 이후 고객 상태를 관리한다

주의:

- `Accounts`는 회사 중심 용어다
- `Individual` audience에서는 UI 라벨을 `Relationships`로 바꾸는 것이 자연스럽다

권장 표시 규칙:

- `Company` view = `Accounts`
- `Individual` view = `Relationships`
- `All` view = 둘 다 분리 노출

핵심 질문:

- 어떤 계정이 active인가
- paused 상태는 왜 paused인가

MVP 블록:

- Active / Paused / Closed KPI
- Account state board
- Rules block

탭 안 세부 구성:

- `Audience switcher`
- `Status KPI`
- `Account/Relationship board`
- `Renewal or follow-up watch`
- `Rules`

계정 row 필드:

- name
- status
- created_at

후속:

- company join
- renewal / expansion signals

### 8.5 Cases

목적:

- 고객 운영 이슈와 해결 흐름을 관리한다

핵심 질문:

- 어떤 케이스가 blocked인가
- 누가 다음 액션을 가져가야 하는가

MVP 블록:

- Active / Waiting / Blocked KPI
- Case motion board
- Rules block

탭 안 세부 구성:

- `Audience switcher`
- `Case status KPI`
- `Case queue`
- `Escalation watch`
- `Rules`

차이:

- `Individual` = 개인 고객의 요청/이슈/후속 대응
- `Company` = 조직 단위 운영 케이스, 전달문서, 커뮤니케이션 지연, 블로커

케이스 row 필드:

- title
- status
- next action
- created_at

후속:

- owner profile
- related account
- related documents/issues

## 9. Content 상세 설계

### 9.0 Content 공통 구조

Content는 탭보다 먼저 `brand context`가 있어야 한다. 브랜드가 섞이면 queue, studio, asset, publish가 모두 금방 읽기 어려워진다.

권장 구조:

- 1차: 탭
- 2차: `Brand switcher`

Brand scope:

- `All Brands`
- `시나브로`
- `고래(Go;Re)`
- `HolyFunCollector`
- `BridgeMaker`
- `MoonPM`
- `Class.Moon`
- `Study.Seagull`
- `Politic Officer`
- `22th.Nomad`

운영 의미:

- 브랜드마다 tone, target channel, publish rhythm, asset library가 다르다
- 같은 `Queue`라도 브랜드가 다르면 review 기준이 달라진다
- 프로젝트와 브랜드는 다르다. `Com_Moon / classinkr-web / sales_branding_dash / ai-command-pot`는 Work OS의 프로젝트 컨텍스트이고, 여기의 brand scope에는 포함하지 않는다.

브랜드 출처:

- `브랜드 디렉토리`
- `브랜드 포맷`

이 두 문서는 Content의 상위 참조 자산으로 취급한다.

MVP 동작:

- `All Brands`에서는 브랜드별 섹션을 묶어서 노출
- 특정 브랜드 선택 시 해당 브랜드 데이터만 필터링

UI 규칙:

- Brand switcher는 Content 서브탭 바로 아래에 둔다
- Brand badge는 모든 item row에 약하게 남긴다
- `All Brands`에서는 brand column 또는 brand section으로 그룹핑한다
- `브랜드 포맷`과 `브랜드 디렉토리`는 우측 보조 패널 또는 접이식 reference card로 노출 가능
- 브랜드가 선택되면 page head 아래에 현재 브랜드 badge와 짧은 brand note를 보여준다

데이터 규칙:

- 브랜드 구분은 `workspace_id`를 1차 기준으로 쓸 수 있다면 그대로 활용
- 한 workspace 안에 여러 브랜드가 섞인다면 `areas.kind = 'brand'` 또는 별도 `brand_key` 추가 권장

세부 컨텍스트 바 구성:

- 왼쪽: `Brand`
- 오른쪽: 후속으로 `Channel`, `Status`, `Needs review` 토글 추가 가능

브랜드 reference 패널 권장 구성:

- `Brand overview`
- `Tone / 금지 표현`
- `핵심 메시지`
- `주력 채널`
- `대표 포맷`
- `CTA 패턴`
- `연결된 자산`

### 9.1 Overview

목적:

- 콘텐츠 생산 시스템 전체를 요약한다

핵심 질문:

- 지금 어떤 단계에 몇 개가 있는가
- 다음으로 발행 가능한 것은 무엇인가

MVP 블록:

- Content summary KPI
- Pipeline lane grid
- Current output pack
- Publish history
- Attention list
- Next move block

탭 안 세부 구성:

- `Brand switcher`
- `Brand KPI strip`
- `Brand reference card`
- `Brand pipeline summary`
- `Current output pack`
- `Publish history`
- `Attention`
- `Next move`

`All Brands`일 때:

- KPI는 전체 합산
- 그 아래 `brand summary cards` 3~4개
- 각 브랜드 카드 안에 `idea / draft / ready / published` 작은 메트릭

특정 브랜드일 때:

- 브랜드 전용 KPI
- 브랜드 전용 reference card
- 브랜드 전용 pipeline
- 브랜드 전용 최근 publish / attention

`Brand reference card` 내용:

- 브랜드명
- 한 줄 설명
- 톤 키워드
- 금지 톤
- 핵심 채널
- 이번 주 집중 포맷

### 9.2 Queue

목적:

- 아이디어와 초안을 단계별로 정리한다

핵심 질문:

- 어떤 아이템이 review로 가야 하는가
- 어떤 아이템이 stale한가

MVP 블록:

- 단계별 KPI
- Lane board
- Review attention

탭 안 세부 구성:

- `Brand switcher`
- `Queue KPI`
- `Brand reference mini`
- `Lane board`
- `Review attention`
- `Stale items`

레인:

- Idea
- Draft
- Review
- Publish

`All Brands`일 때 권장 레이아웃:

- 방식 A: 브랜드별 섹션 아래에 4단계 레인
- 방식 B: 4단계 레인 유지 + item에 brand badge 표시

MVP 추천:

- `All Brands`에서는 brand badge 방식
- 특정 브랜드에서는 현재 구현처럼 4레인 집중

브랜드별 queue 차이:

- 어떤 브랜드는 카드뉴스 비중이 높고
- 어떤 브랜드는 메모/아카이브/브리지 카피 비중이 높을 수 있다

그래서 lane 이름은 같게 유지하되, lane 안 item 예시와 주력 포맷을 브랜드별로 달리 노출한다

아이템 필드:

- title
- source/meta
- next action

후속:

- drag ordering
- stale warning
- assignee

### 9.3 Studio

목적:

- 카드뉴스 초안을 가장 빠르게 만든다

핵심 질문:

- 어떤 템플릿으로 쓸 것인가
- 어떤 채널을 우선 타깃으로 할 것인가
- 지금 draft가 handoff 가능한가

MVP 블록:

- Current drafting context
- Brand selector
- Template preset selector
- Channel selector
- Editor textarea
- Preview frame
- Handoff block
- Studio rules

UI 상세:

- 데스크톱: 좌 editor / 우 preview 2열
- 모바일: selector > editor > preview 순서
- preview는 실제 export 비율 감각 유지

입력 요소:

- brand
- template preset
- primary channel
- draft body

탭 안 세부 구성:

- `Brand switcher`
- `Current drafting context`
- `Brand tone note`
- `Template selector`
- `Channel selector`
- `Editor`
- `Preview`
- `Handoff`
- `Rules`

브랜드별 차이:

- 같은 템플릿이어도 브랜드별 훅 문장 길이, CTA 톤, 채널 우선순위가 달라진다
- 어떤 브랜드는 playful, 어떤 브랜드는 analytical, 어떤 브랜드는 documentary 톤일 수 있다
- 이 차이는 `Brand tone note`와 `preset recommendation`으로 먼저 반영한다

MVP에서 브랜드 선택 시 바뀌는 요소:

- 기본 템플릿 추천
- 기본 채널 추천
- preview badge
- handoff note

후속:

- 브랜드별 prompt preset
- 브랜드별 금지 문구 검사

후속:

- AI assist
- auto slide splitter
- asset export

### 9.4 Assets

목적:

- 생성된 자산과 재사용 가능한 결과물을 관리한다

핵심 질문:

- 어떤 자산이 이미 존재하는가
- 어떤 변형이 draft 상태인가

MVP 블록:

- Captured Assets KPI
- Draft Assets KPI
- Archived KPI
- Variant Links KPI
- Asset shelf timeline
- Rules block

탭 안 세부 구성:

- `Brand switcher`
- `Asset KPI`
- `Brand reference mini`
- `Asset shelf`
- `Variant relation`
- `Reuse rules`

`All Brands`일 때:

- asset row에 brand badge 필수
- 자산명만으로 브랜드를 구분하지 않음

특정 브랜드일 때:

- 같은 브랜드 자산끼리 `active library`, `archive`, `reusable block`으로 묶을 수 있다

필드:

- asset_type
- storage_path
- created_at

후속:

- thumbnail preview
- asset filter
- source variant link

### 9.5 Publish

목적:

- 발행 결과와 실패를 추적한다

핵심 질문:

- 어떤 채널에 무엇이 나갔는가
- 실패한 발행은 무엇인가

MVP 블록:

- Queued / Published / Failures / Channels KPI
- Publish history timeline
- Follow-up rules

탭 안 세부 구성:

- `Brand switcher`
- `Publish KPI`
- `Brand reference mini`
- `Channel history`
- `Failure watch`
- `Follow-up rules`

`All Brands`일 때:

- timeline row에 `brand + channel` 같이 보이게
- 실패는 브랜드 기준으로도 다시 모아볼 수 있어야 함

특정 브랜드일 때:

- `publish rhythm`
- `주력 채널`
- `최근 성공 포맷`
- `실패 반복 패턴`
를 함께 봐야 한다

필드:

- channel
- status
- external_id
- published_at

후속:

- retry action
- response metrics
- per-channel health

## 10. Automations 상세 설계

### 10.1 Overview

목적:

- 자동화 시스템의 현재 표면을 요약한다

MVP 블록:

- Live routes
- Recent runs
- Ready commands
- Surface board
- Execution pulse
- Intake catalog
- Rules

### 10.2 Runs

목적:

- 최근 실행 결과와 다음 dispatch 대상을 본다

핵심 질문:

- 최근 어떤 실행이 성공/실패했는가
- 지금 큐에 무엇이 쌓여 있는가

MVP 블록:

- Success / Queued / Failures / Commands KPI
- Execution pulse timeline
- Dispatch queue

후속:

- rerun
- input/output diff

### 10.3 Webhooks

목적:

- 외부 입력 라우트와 최근 이벤트를 본다

핵심 질문:

- 어떤 endpoint가 살아 있는가
- 최근 어떤 이벤트가 들어왔는가

MVP 블록:

- Endpoints / Active / Events KPI
- Endpoint catalog
- Recent intake

필드:

- endpoint name
- method
- path
- status
- event_type
- received_at

후속:

- endpoint filter
- raw payload drawer

### 10.4 Integrations

목적:

- 연결된 외부 시스템과 sync 상태를 본다

핵심 질문:

- 어떤 연결이 healthy한가
- sync가 실패하고 있는가

MVP 블록:

- Connected / Pending / Errors KPI
- Connection board
- Sync run timeline

필드:

- provider
- status
- last_synced_at
- sync run status
- error_message

후속:

- mapping overview
- last success / last failure split

## 11. Evolution 상세 설계

### 11.1 Overview

목적:

- 시스템이 무엇을 배우고 있는지 요약한다

핵심 질문:

- unresolved log나 issue가 얼마나 있는가
- 최근 메모와 활동은 무엇인가

MVP 블록:

- Captured signals / Open fixes / Memos / Recent activity KPI
- Learning signal board
- Recent learning events
- Improvement rules
- Follow-up block

### 11.2 Logs

목적:

- 에러 로그와 경고를 빠르게 확인한다

MVP 블록:

- Open / Resolved / Recent / Loop KPI
- Log stream
- Rules

필드:

- context
- detail
- severity
- timestamp

후속:

- resolve toggle
- linked automation run

### 11.3 Issues

목적:

- 반복적이거나 구조적인 문제를 escalation한다

MVP 블록:

- Open / Investigating / Mitigated KPI
- Risk board timeline

필드:

- title
- severity
- status
- created_at

후속:

- linked operation case
- mitigation owner

### 11.4 Activity

목적:

- 최근 활동과 메모를 memory lane으로 유지한다

MVP 블록:

- Activity feed
- Memo feed

필드:

- entity_type
- action
- payload summary
- created_at
- memo title
- memo body

후속:

- filter by entity
- linked route navigation

## 12. MVP 범위 정의

### MVP에 반드시 포함

- 모든 탑레벨 탭 접근 가능
- 각 섹션별 최소 3~5개 세부 탭
- `Revenue audience switcher`
- `Content brand switcher`
- KPI strip
- 최소 1개 live-data list 또는 timeline
- fallback 데이터가 있어도 빈 화면 금지
- 레거시 경로 redirect
- 모바일 대응

### MVP에서 의도적으로 제외

- 복잡한 인라인 편집
- drag and drop 우선 설계
- 대규모 테이블 필터 시스템
- 차트 중심 시각화
- 권한 관리
- 멀티 유저 협업 UI

## 13. 모바일 UI 상세

### 공통 원칙

- 우선순위 1개가 첫 스크롤 안에 보여야 한다
- 카드 간격은 넉넉하되 정보량은 유지한다
- 2열 이상 그리드는 대부분 1열로 붕괴한다
- 탑바 액션은 줄바꿈 허용

### 모바일 순서 규칙

- Hero 또는 page head
- KPI
- primary action card
- timeline
- rules / secondary info

### 탭 네비

- 탑레벨 사이드바는 상단 블록형으로 내려와도 허용
- 서브탭은 카드형 2열 또는 가로 스크롤 대신 2열 wrap 우선

### Studio

- preview보다 editor 우선
- preset selector를 textarea 위에 고정
- CTA copy 버튼은 항상 가시 영역 안

## 14. 데스크톱 UI 상세

### 레이아웃 원칙

- 메인 대시보드: `1.4fr / 0.9fr`
- 콘텐츠 스튜디오: `1fr / 0.92fr`
- 일반 detail 페이지: `2열 split` 또는 `stack + split`

### 밀도 규칙

- KPI는 4개 기준
- 보드/그리드는 2~4열
- timeline row는 6~8개까지 허용

### 시각 강조

- 초록: stable, success, active
- 노랑: queued, warning, pending
- 파랑: info, review, connected context
- 빨강: failure, critical, blocked

## 15. 빈 상태 설계

모든 탭은 아래 규칙을 따른다.

- 빈 상태에서도 화면 목적이 보이게 한다
- “데이터 없음” 대신 “다음에 무엇이 보일지”를 설명한다
- 가능한 경우 다음 액션을 함께 제시한다

예시:

- Leads: “첫 리드가 들어오면 source, status, next action이 여기 보입니다.”
- Assets: “자산이 생성되면 파일 경로와 타입이 이 선반에 쌓입니다.”
- Webhooks: “첫 이벤트가 들어오면 endpoint별 intake history가 나타납니다.”

## 16. 다음 구현 우선순위

### 우선순위 A

- `Revenue`에 company/contact join 추가
- `Content`에 asset/variant 관계 강화
- `Automations`에 webhook_events / sync_runs 밀도 확대
- `Evolution`에 issue/log/run 연결

### 우선순위 B

- Studio export flow
- publish retry UI
- activity filter
- decision-to-task 연결

### 우선순위 C

- charts
- user customization
- saved views

## 16.5 데이터 모델 보강 권장

현재 스키마 기준으로도 MVP는 가능하지만, 아래 보강이 있으면 개인/회사와 브랜드 분리가 더 안정적이다.

### Revenue 권장

- `leads.lead_kind` = `individual | company`
- `deals.deal_kind` = `individual | company`
- `customer_accounts.account_kind` = `individual | company`
- `operation_cases.case_kind` = `individual | company`

MVP 추론 규칙:

- `company_id`가 있으면 company
- 없으면 individual

### Content 권장

- `content_items.brand_key`
- `content_variants.brand_key`
- `content_assets.brand_key`
- `publish_logs.brand_key`

또는:

- brand를 `workspace_id` 또는 `area(kind='brand')`로 엄격하게 운영

## 16.6 구현 순서 보강

### 먼저 할 것

- Revenue audience switcher URL 상태 설계
- Content brand switcher URL 상태 설계
- Work OS project switcher URL 상태 설계
- `All / filtered` UI 패턴 공통화

### 그 다음

- Revenue individual/company row 구조 차별화
- Content brand badge / grouping 적용
- Studio brand preset 연동
- 브랜드 디렉토리 / 브랜드 포맷 reference card 연결

## 17. 최종 판단 기준

허브 설계가 잘 됐는지의 기준은 예쁘냐가 아니라 아래 4개다.

- 어디를 먼저 봐야 하는지 바로 알 수 있는가
- 각 탭이 하나의 운영 질문에 집중하는가
- 빈 상태에서도 다음 액션이 보이는가
- 모바일에서 정보가 무너지지 않는가
