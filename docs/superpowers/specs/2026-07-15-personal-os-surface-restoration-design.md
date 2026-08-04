# Moonlight 개인 OS 표면 복구 설계

> 상태: REVIEW REQUIRED — 복구 방향은 승인됐고, 이 구현 계약의 사용자 승인 전에는 코드 구현하지 않음
> 작성일: 2026-07-15
> 상위 정본: `docs/operator-workflow-profile.md`, `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`, `DESIGN.md`

## 1. 배경과 목표

가짜 운영 데이터와 VR Office를 제거한 작업은 데이터 정직성을 회복했지만, 함께 정리된 탐색 구조 때문에 다음 현역 기능이 사라진 것처럼 보이게 됐다.

- 개인 브랜딩 프로젝트·콘텐츠 제작
- 개인 매출의 Leads·Deals·Accounts·Follow-ups
- Calendar, Decisions, Rhythm, Roadmap
- Agents, Automations, Evolution, Settings
- 실제 데이터가 없을 때도 기능의 용도와 다음 행동을 설명하는 구조적 화면

이번 작업의 목표는 기능 수를 다시 과시하는 것이 아니다. **Today에서 판단하고 Customers·Projects·Content·Calendar에서 실행하며, 나머지는 More에서 찾는 작은 개인 OS**를 복구한다.

## 2. 불변식과 비목표

### 불변식

1. live 원장 데이터와 honest empty/preview/error 상태만 사용한다.
2. 가짜 고객·매출·일정·프로젝트·캠페인·자동화 레코드는 되살리지 않는다.
3. VR Office의 라우트·내비게이션·컴포넌트·문서 표현은 되살리지 않는다.
4. ClassIn과 Personal은 별도 홈이 아니라 동일 화면의 데이터 스코프다.
5. 출처를 판별할 수 없는 레코드는 `All`에서만 보이고 특정 스코프로 추측 배정하지 않는다.
6. 이번 복구를 위해 DB 스키마를 늘리거나 외부 발행·실행 권한을 추가하지 않는다.

### 비목표

- 완전한 자동화 플로우 편집기
- 소셜 채널 직접 발행
- 복잡한 콘텐츠 성과 분석
- Roadmap 자동 일정 생성
- VR/3D/아바타 기반 업무 화면
- 공개 개인 브랜딩 사이트 제작

## 3. 검토한 접근안

### A. 과거의 큰 아코디언 내비게이션 복원

모든 기존 경로를 쉽게 찾을 수 있지만 매일 쓰는 판단 화면과 후순위 도구가 같은 무게로 노출된다. 개인 OS의 인지 부하를 다시 키우므로 선택하지 않는다.

### B. 핵심 5개 + 활성 하위 메뉴 + More — 선택

매일 쓰는 다섯 목적지를 고정하고, 현재 작업에 필요한 하위 화면만 문맥적으로 노출한다. 후순위 기능은 More 안에서 보존한다. 접근안 B의 Action Desk와 progressive disclosure 원칙에 가장 잘 맞는다.

### C. 모든 기능을 상단에 평면 노출

구현은 단순하지만 정보 위계가 사라지고 모바일·좁은 화면에서 탐색 비용이 커진다. 선택하지 않는다.

## 4. 정보 구조

### 4.1 고정 1차 내비게이션

| 항목 | 기본 목적지 | 역할 |
|---|---|---|
| Today | `/dashboard/daily-brief` | 지금 할 일과 주의 신호 판단 |
| Customers | `/dashboard/revenue/overview` | 고객·기회·매출·후속 연락 |
| Projects | `/dashboard/work/projects` | 회사·개인 프로젝트와 할 일 |
| Content | `/dashboard/content/queue` | 아이디어함과 제작 작업대 |
| Calendar | `/dashboard/work/calendar` | 오늘 agenda와 일정 편집 |
| More | 라우트가 아닌 펼침 버튼 | 후순위·시스템 도구 탐색 |

`All / ClassIn / Personal` 스코프 선택기는 내비게이션 상단에 한 번만 둔다. 스코프 변경 시 현재 의미 목적지는 유지하고 `scope` 쿼리만 바꾼다.

### 4.2 활성 영역 하위 메뉴

하위 메뉴는 해당 1차 영역이 활성일 때만 노출한다.

- Customers: Overview, Leads, Deals, Accounts, Cases, Follow-ups
- Projects: Projects, To-dos
- Content: Queue, Studio, Campaigns

이 항목들은 More에 중복 배치하지 않는다. 한 목적지는 한 탐색 소유자만 갖는다.

### 4.3 More

More는 기본적으로 접혀 있고, 하위 경로가 현재 활성일 때 자동으로 열린다.

- Work & Review: All Tasks, Decisions, Rhythm, Roadmap
- Agents: Chat, Orders, Council
- Automations: Runs, Flows, Email, Webhooks, Sheets
- System: Evolution, Settings

More는 기능의 삭제 대기실이 아니다. 매일 고정 노출할 필요가 없는 현역·후순위 화면의 안정된 위치다.

## 5. Personal 스코프와 기존 경로

### 5.1 단일 스코프 계약

클라이언트의 표준 스코프는 `all | classin | personal`이다. 현재 저장소의 내부 workspace 명칭은 다음 어댑터에서만 번역한다.

| UI 스코프 | repository workspace |
|---|---|
| all | 필터 없음 |
| classin | `classin` |
| personal | `brand` |

기존 `/dashboard/brand/projects`, `/dashboard/brand/studio`, `/dashboard/brand/queue`는 북마크 호환 경로로 유지하되, UI의 정식 진입점은 Projects/Content에서 `Personal` 스코프를 선택하는 방식이다.

### 5.2 개인 매출

Customers의 Personal 스코프는 링크 모양만 바꾸는 것이 아니라 실제 데이터를 필터링해야 한다.

- Overview는 필터된 Leads·Deals를 기준으로 지표를 다시 계산한다.
- Leads·Deals·Accounts는 동일 workspace 어댑터를 사용한다.
- Follow-ups는 연결된 lead/deal/account 또는 명시적 workspace 정보로 소속을 판정한다.
- 소속을 판정할 수 없는 Follow-up은 `All`에만 포함한다.
- 필터 결과가 0건이면 개인 매출이 0건이라는 honest empty state와 생성/연결 CTA를 보여준다.

### 5.3 개인 브랜딩과 콘텐츠

개인 브랜딩은 삭제된 별도 제품이 아니라 Personal 스코프 안의 프로젝트·콘텐츠 운영이다.

- Projects Personal: 개인/브랜드 workspace의 실제 프로젝트만 표시
- Content Queue·Studio Personal: 개인 채널·브랜드 콘텐츠만 표시
- Campaigns Personal: 명시적 workspace 또는 연결된 실제 콘텐츠/프로젝트로 소속을 판정
- 소속을 판정할 수 없는 Campaign은 `All`에만 포함

## 6. 구조적 화면 복구

데이터가 없다는 이유로 화면의 기능 구조까지 삭제하지 않는다. 반대로 구조를 채우기 위해 예시 레코드를 만들지도 않는다.

### Automations / Flows

- 실제 automation 목록과 선택 영역을 복구한다.
- 선택된 automation에 저장된 trigger/action 메타데이터가 있으면 읽기 전용으로 표시한다.
- graph node 정보가 없으면 canvas 안에 honest empty state를 표시한다.
- 로컬 토글, 가짜 실행 이력, 저장되지 않는 노드 생성은 제공하지 않는다.

### Roadmap

- 기간 축과 프로젝트 연결 영역을 유지한다.
- 실제 시작일·마감일이 있는 프로젝트만 배치한다.
- 날짜가 없으면 임의 일정을 만들지 않고 일정 연결 CTA를 표시한다.

### Campaigns

- 캠페인 선택, 개요, 연결 콘텐츠/작업 영역의 구조를 유지한다.
- 실제 저장 데이터가 있는 섹션만 채운다.
- 전략 문구·성과 수치·콘텐츠를 자동 예시로 만들지 않는다.

### Evolution과 Settings

경로와 기능 구조는 More에서 계속 접근 가능하게 한다. 연결되지 않은 통합이나 집계는 connected처럼 보이게 하지 않고 preview/empty 상태로 표시한다.

## 7. 상호작용과 시각 계약

- More는 `button`이며 `aria-expanded`와 키보드 조작을 지원한다.
- 현재 경로의 상위 항목과 하위 항목을 함께 식별할 수 있는 active 상태를 제공한다.
- 모바일의 내비게이션 항목은 최소 44px 터치 영역과 8px 간격을 확보하고 선택 후 drawer를 닫는다.
- focus-visible 상태와 DOM 탐색 순서를 시각 순서와 일치시킨다.
- UI/UX 패턴 검색 결과에서는 progressive disclosure, 모바일 터치 영역, 키보드 접근성만 채택한다.
- 색상·타이포·보더·서피스는 검색 도구의 일반 팔레트가 아니라 `DESIGN.md`와 Moonstone `#5274a8` 계약만 따른다.

별도 비주얼 콘셉트는 만들지 않는다. 이번 결정은 새 스타일이 아니라 기존 디자인 시스템 안의 정보 구조 복구다.

## 8. 구현 경계

1. 내비게이션 manifest와 스코프 어댑터를 한 곳에 둔다.
2. Hub route 판정은 pathname과 표준 `scope` 쿼리를 함께 읽는다.
3. 기존 repository를 우선 재사용하고, workspace attribution이 부족한 경우 read adapter/API projection만 보강한다.
4. 기존 브랜드 호환 경로는 정식 스코프로 매핑한다.
5. DB migration이나 운영 데이터 삭제는 하지 않는다.

## 9. 테스트와 검증

구현은 테스트 우선으로 진행한다.

### 계약 테스트

- 1차 내비게이션이 Today, Customers, Projects, Content, Calendar, More만 노출한다.
- More의 그룹과 하위 목적지가 정확하며 중복 소유가 없다.
- 현재 More 하위 경로에서 More가 자동 확장된다.
- Personal/ClassIn 스코프 전환이 현재 의미 목적지를 유지한다.

### 데이터 테스트

- Personal Revenue Overview가 필터 후 지표를 계산한다.
- Leads·Deals·Accounts·Follow-ups가 동일 attribution 규칙을 따른다.
- Personal Projects·Queue·Studio·Campaigns가 `brand` workspace만 표시한다.
- attribution 없는 레코드는 특정 스코프에서 제외되고 All에는 남는다.

### 정직성 회귀 테스트

- VR Office 문자열·라우트·컴포넌트가 다시 생기지 않는다.
- 운영 화면에 fixture/mock fallback 레코드가 다시 생기지 않는다.
- Flows·Roadmap·Campaigns가 live/empty 상태를 구분한다.

### 완료 검증

- 전체 `npm test`
- `npm run typecheck`
- Hub와 Engine production build
- 데스크톱·모바일에서 내비게이션, focus, scope 유지 수동 확인

## 10. 구현 순서

1. 내비게이션 manifest, 핵심 5개, More, 활성 하위 메뉴
2. 표준 scope 어댑터와 기존 brand 경로 호환
3. Revenue Overview·Follow-ups를 포함한 실제 개인 매출 필터
4. Personal Campaigns를 포함한 개인 브랜딩 표면
5. Flows·Roadmap·Campaigns의 live/empty 구조 복구
6. 접근성·회귀 테스트·typecheck·build

## 11. 수용 기준

다음이 모두 성립하면 완료다.

1. 사용자는 어느 화면에서도 한 번의 More 확장 이내에 기존 후순위 기능을 찾을 수 있다.
2. Calendar와 핵심 네 작업대가 항상 보이지만 사이드바가 기능 목록으로 포화되지 않는다.
3. Personal을 선택하면 개인 프로젝트·콘텐츠·매출이 실제로 필터링된다.
4. 개인 브랜딩과 기타 매출 기능은 보존되며 별도 홈을 강요하지 않는다.
5. 데이터가 없는 구조적 화면은 용도와 다음 행동을 설명하지만 가짜 레코드를 표시하지 않는다.
6. VR Office는 어디에도 다시 노출되지 않는다.
