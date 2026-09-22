# sales_branding_dash → Moonlight 응용 연구

> 상태: **DRAFT / 권장안** — 제품 승인·구현 완료 문서가 아니다.
> 작성일: 2026-09-07
> 요청: 참고 프로젝트를 Moonlight만의 버전으로 응용. 서브에이전트 사용, 여백·시각화 중점.
> 후속 지시 반영: 더 미니멀하게. 특히 모바일은 중요한 것만 표시하고 상세 진입을 기본으로 한다.
> Moonlight 코드 기준: `042d020832c17ec9c59d54e04ce7f22bee1783d6`
> 참고 코드 기준: `513fe222252898e2b280b2bba59bdd78672c7e1d`
> 상위 정본: [문서 지도](../README.md), [운영자 프로필](../operator-workflow-profile.md), [승인된 심화 설계](../superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md), [DESIGN.md](../../DESIGN.md)

## 1. 제안의 중심

**홈에서는 무엇을 열지 빠르게 고르고, 근거와 시각화는 들어가서 확인한다.**

참고 프로젝트에서 가져올 것은 간격의 단계, 숫자의 위계, 차트에서 실제 항목으로 들어가는 연결이다. Moonlight의 기본 화면은 Quick Capture, 긴급 KA, 집중 고객, 오늘 일정이라는 승인된 운영 순서를 따른다. 색상과 밀도는 Moonlight 정본을 사용한다.

더 미니멀하게, 모바일에서 중요한 것만 보여주고 상세로 들어간다는 방향은 사용자의 명시적 후속 지시다. 구체적인 행 수·간격·배치는 여전히 권장이다. 일반 UI 구현과 데이터 계약 보강을 구별하며, 현재 기능의 완료 상태는 오래된 Phase 메모 대신 문서 지도와 현재 코드를 함께 본다.

### 후속 지시를 반영한 홈

- 빠른 입력 한 줄.
- 우선 행동 3개: 첫 번째를 가장 강조. 각 행에는 다음 행동, 대상, 기한만 표시.
- 가장 가까운 일정 1개: 시각과 제목.
- 나머지는 전체 업무·일정 진입점으로 연결. 업무 전체 수와 기한 지난 항목 수를 표시.
- 이유, 최근 기록, 차트, 프로젝트 진척은 별도 상세 화면으로 이동.
- 행 전체를 누르면 화면이 상세로 전환되고, 뒤로 가면 이전 목록으로 돌아온다. 모바일 홈에 상세를 계속 펼쳐 늘리지 않는다.
- 일부 데이터·읽기 실패·입력 저장 실패는 홈에 짧게 표시한다. 숨긴 상세로 오류를 밀어 넣지 않는다.

총 3행 노출은 종전 긴급 KA 1건+집중 고객 3~5건을 축약하는 **권장 배치**다. 긴급 KA가 있으면 첫 행을 우선 배정하고 나머지 항목은 전체 목록에서 누락 없이 접근할 수 있어야 한다. 홈에 차트 한 영역을 두었던 최초 응용안은 이번 방향으로 대체한다.

## 2. 조사 방법과 한계

서브에이전트 3개가 독립적으로 조사했다.

1. 참고 저장소: 디자인 문서, 실제 CSS, 페이지 구성, 차트 계산.
2. Moonlight 여백: Today, 고객 연락, PMS, 전역·로컬 내비게이션.
3. Moonlight 시각화: 현재 API 필드, 집계 범위, empty/partial 의미.

주 에이전트는 결과를 교차 확인하고 참고 앱을 로컬에서 실행해 in-app browser로 화면을 확인했다. 참고 화면은 외부 시트·DB 연결이 없는 **Fallback 상태**다. 실제 매출 데이터가 채워졌을 때의 차트와 상호작용은 검증하지 않았다. Moonlight 운영 화면에 대한 평가는 현재 소스 분석이며 live 화면을 실측한 결과가 아니다.

대화 내 화면 예시는 여백과 읽는 순서를 설명하는 가상 데이터 목업이다. 체험 입력, 상세 진입, 메모는 그 예시 안에서만 동작하며, 운영 데이터·API와 연결되지 않는다. 앱 코드는 수정하지 않았다.

## 3. 참고 프로젝트에서 실제로 발견한 것

| 관찰 | 근거 | Moonlight 응용 |
|---|---|---|
| 본문 최대 1440px, 페이지 여백 16~32px, 큰 두 열 간격 24px | [page.module.css](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.module.css#L149), [globals.css](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/globals.css#L316) | 공간을 항목 내부 / 카드 내부 / 업무 구역으로 구분 |
| 문서는 카드 최소 24px, 실제는 세로20·가로22px, 모바일16·18px | [DESIGN.md](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/DESIGN.md#L46), [Card.module.css](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/components/Card.module.css#L1) | 실제 화면의 간격을 참고하되 Moonlight 카드20px 계약을 우선 |
| 작은 제목 → 큰 숫자 → 짧은 해석 | [지표 스타일](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.module.css#L157) | Today는 다음 행동 문장을 가장 잘 보이게 하고, 상세 분석에서 큰 수치 활용 |
| KPI 5개와 보조 신호 3개, 링·막대·퍼널·지도·추세·체류가 함께 존재 | [page.tsx](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.tsx#L591) | 홈은 주요 행동만 표시. 시각화는 해당 업무 상세에서 확인 |
| 340px 보조열 + 가변 분석열. 1280px 이하에서는 차트가 핵심 딜·결정 영역보다 먼저 나옴 | [두 열](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.module.css#L243), [순서 전환](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.module.css#L665) | 반응형에서도 Capture와 첫 행동을 앞에 유지 |
| 요약 차트 → 상위 5개 목록 → 해당 항목 상세 | [드릴다운](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.tsx#L799) | 업무 상태 막대 → 해당 업무 목록 → 기존 실행 화면 |

참고 앱의 로컬 Fallback 화면에서는 목표·실적이 모두 0인데도 ‘목표 달성’, ‘On plan’ 문구가 보였다. Moonlight는 데이터 없음과 실제 목표 달성을 구분해야 한다.

### 차트 모양과 계산은 따로 평가한다

- **딜 체류 막대:** 미계약 계정의 경과일을 개별 접촉일이나 단계 진입일 대신 회계연도 시작 4월 1일부터 계산한다. [날짜 계산](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/lib/server/bdDashboard.ts#L724). 행 안의 막대 표현은 유용하지만 이 계산을 연락 공백으로 가져올 수 없다.
- **Execution funnel:** Lead/Account/Opportunity/Solution/Visit 활동 총량을 인접 비교한다. 동일 고객 코호트의 단계 전환이 아니다. [집계](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/lib/server/bdDashboard.ts#L1057), [표현](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.tsx#L886).
- **목표 링:** 분기 목표를 받으면서 남은 기간은 이번 달 말까지 계산한다. 기간을 맞추지 않은 ‘일당 필요’ 수치는 응용하지 않는다. [TargetGapRing](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/components/TargetGapRing.tsx#L15), [분기 목표 공급](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/lib/server/bdDashboard.ts#L1080).
- **기간별 지도:** 목록의 `displayProgress`와 지도 색의 `progress`가 다른 경로를 사용한다. 동일 필터는 모든 시각화·목록·설명에 같은 범위를 적용해야 한다. [목록](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/app/page.tsx#L381), [지도](https://github.com/Muuuuoouuun/sales_branding_dash/blob/513fe222252898e2b280b2bba59bdd78672c7e1d/src/components/KoreaProvinceMap.tsx#L112).

## 4. 여백: 바깥 폭보다 내부 위계부터

Today는 이미 최대 폭 1040px이다. 1440px 화면에서 전역 사이드바232px를 제외하면 메인1208px, Today 내부 패딩을 제외한 내용은 약992px이다. 중앙 정렬을 기준으로 내용 좌우에 각각 약108px가 남는다. 이는 CSS 산술이며 브라우저 실측은 아니다.

근거: [daily-brief.jsx](../../apps/hub/components/hub/pages/daily-brief.jsx), [hub-sidebar.jsx](../../apps/hub/components/hub/hub-sidebar.jsx).

### 사용할 간격

| 관계 | 권장값 | 상태 |
|---|---:|---|
| 같은 항목의 제목·보조 설명 | 4~8px | 기존 스케일 활용 |
| 같은 업무 묶음 내부 | 12px | 고정 밀도 계약 |
| 일반 카드 내부 | 20px | 고정 밀도 계약 |
| 의미가 다른 업무 구역 | 24px | 고정 밀도 계약 |
| 데스크톱의 별도 검토 구역 | 32px 후보 | 첫 행동을 밀어내지 않는 경우만 검토 |
| 모바일 외부 / 카드 내부 | 현재12px / 14px 우선 | 기존 반응형 값 유지 |

전역 행 높이36px는 단일 행의 기준이다. 설명이 두 줄인 고객 행동이나 현재68px PMS 행을36px로 강제하지 않는다. 새 밀도 토글도 만들지 않는다. 대화 예시에 있는 여백 조절은 검토용 컨트롤이며 제품 설정 제안이 아니다.

### Today 응용

1. 날짜·인사·상태·진입 버튼이 경쟁하는 헤더를 짧게 정리한다.
2. Capture와 가장 먼저 할 행동을 첫 구역으로 만든다. 반복 카드 대신 정렬된 행을 사용한다.
3. 우선 행동은 최대 3개를 권장한다. 첫 항목의 행동 문장을 더 크게 표시하고, 나머지는 짧은 제목과 대상·기한으로 요약한다.
4. 모바일은 한 열을 유지하고 다음 일정은 가장 가까운 1개만 표시한다. 데스크톱도 상세 설명과 차트를 홈에 상시 펼치지 않는다.
5. 핵심 행동은 글자를 줄이기보다 문구를 짧게 쓴다. 홈의 이유·최근 활동은 상세로 이동하고, 행동 제목이 길면 자연스럽게 줄바꿈한다.
6. 전체 업무 수·기한 지난 수와 전체 일정 진입점을 남긴다. 시각화는 내 작업·프로젝트·고객 상세에서 확인한다.

현재 `.daily-brief__panel`에는 일반 패널에도 공통 액센트 보더·그림자가 붙는다. [hub-tokens.css](../../apps/hub/components/hub/hub-tokens.css)의 해당 규칙을 검토해 일반 카드의 경계를 중립화하면, 공간을 더 쓰지 않고도 강조의 수를 줄일 수 있다.

### 고객 연락과 PMS 응용

- 고객 연락 행은 **고객+기한 / 다음 행동 / 이유·최근 대화** 순서로 정리한다. 반복되는 기록 버튼은 선택·펼침 맥락으로 모으는 안을 검토한다. 긴 조직명·전화번호·badge의 모바일 줄바꿈을 확인한다.
- PMS는 전역232px + 로컬240px 탐색 때문에1440px에서도 목록에 약920px만 남는다. 현재 열 최소합은 약940px이므로 외부 여백을 늘리면 압박이 커진다. 로컬 탐색을 접는 기존 동작을 활용하고, 보조 열을 축약해 다음 행동 칸을 확보한다.
- 프로젝트는 **이름 → 다음 행동 → 기한 → 작은 진척 막대** 순서로 읽는다. 동일 폭의 막대와 직접 표시한 `완료/전체` 수치가 카드마다 커다란 링을 두는 것보다 비교하기 쉽다.

근거: [followups.jsx](../../apps/hub/components/hub/pages/followups.jsx), [projects.jsx](../../apps/hub/components/hub/pages/projects.jsx), [globals.css](../../apps/hub/app/globals.css).

## 5. 시각화: 상세 화면에서 확인

분석 작업은 상태별 비교, 체크리스트 진척 비교, 일정과 사건 이력이다. 기본 구현은 기존 React/DOM·Progress와 필요할 때 작은 SVG다. 지금 제안하는 규모에서는 새 차트 라이브러리가 필수는 아니다.

| 위치 | 시각화와 질문 | 데이터 | 선택 후 행동 |
|---|---|---|---|
| 내 작업 상세 | 필요할 때 펼치는 미완료 후보의 4개 가로막대. 어디에 업무가 몰렸나? | `taskToday.counts.missed/today/waiting/inbox` | 같은 상태·같은 범위의 목록 확인 |
| 프로젝트 | 정렬된 진척 막대 + `2/3 완료` + 기한. 무엇을 다음으로 움직일까? | `displayProgress.value/source/done/total/partial`, `dueAt`, `nextAction` | 기존 프로젝트 상세와 남은 작업 |
| 일정 | 시작 시각의 마커 + 종일 일정 별도. 약속이 언제 몰렸나? | `whenAt/title/allDay/calendarLink` | 해당 일정 상세 |
| 고객 상세 | 실제 기록 한 건당 마커 하나인 활동 시간축. 무엇을 이어 이야기할까? | `id/type/occurredAt/msg/reaction` | 실제 기록의 요약·다음 행동 |

### 업무 분포의 정확한 의미

현재 `taskToday`는 **오늘 화면에 들어오는 미완료 후보**를 집계한다. 완료 업무는 제외되고, 미래의 모든 할 일을 포함하는 것도 아니다. 따라서 이 값을 재사용한 그래프는 범위를 `오늘 화면의 미완료 후보`처럼 명시한다. 생산성 점수·전체 업무 수·오늘 완료율로 바꾸지 않는다. 홈의 전체 업무 진입점에 쓰는 총수는 별도로 완전성이 검증된 목록 집계값이어야 한다. 목업의 12개 업무는 전부 포함된 가상 데이터다.

현재5개로 잘린 `items`를 다시 세지 말고 `counts`를 사용한다. 기록의160행 read 한도와 전체 count 비교로 partial 상태가 발생할 수 있다. partial에서는 `확인된 업무 기준`을 표시하고 전체 값으로 확정하지 않는다. 해당 상태 클릭 시 표시된5개에 없는 대상도 볼 수 있도록 목록 API/필터 경로를 검증해야 한다.

근거: [task-today.js](../../apps/hub/lib/task-today.js), [operating-ledger.js](../../apps/hub/lib/repositories/operating-ledger.js).

### 상세 시각화의 정확한 의미

- 프로젝트 `3/8 완료`와 `보고된 진척40%`는 출처가 다르다. `source` 라벨로 구분하고, 부분 집계나 분모 없음은0%로 그리지 않는다. [pms-ui.js](../../apps/hub/lib/pms-ui.js).
- 홈 Agenda는 최대8개이며 종료 시각이 없다. 지금은 시작점만 그린다. 지속시간 블록은 `endAt` 추가 후, 가용시간 계산은 페이지네이션과 조회 완전성까지 보강한 뒤 검토한다. Google Calendar 원본의 `nextPageToken` 전달도 확인해야 한다. [daily-focus.js](../../apps/hub/lib/daily-focus.js), [google-calendar.js](../../apps/hub/lib/google-calendar.js).
- 고객 활동은 최신200건 범위이며 회사 단위로 연결된 기록도 있다. 사람의 활동으로 단정하지 말고 연결 범위를 표시한다. 빈 날짜는 `기록 없음`이며 연락이 없었다는 증거가 아니다. [revenue-ledger.js](../../apps/hub/lib/repositories/revenue-ledger.js).
- Followups의 `daysSince`는 `last_touch_at → updated_at → created_at` fallback이다. 실제 마지막 연락의 경과일로 단정할 수 없다. 기본25개 후보와 leads/deals read 한도를 전체 고객 분포로 표현하지 않는다. [followups-ledger.js](../../apps/hub/lib/repositories/followups-ledger.js).

## 6. Moonlight만의 시각 문법

- 배경은 Hub의 dark-native 토큰. 카드 면은 흰색 투명도4~7% 범위.
- 보더는1px, dark `rgba(255,255,255,0.07)`. 일반 카드에 별도 색 레일을 반복하지 않는다.
- 문스톤 `#5274a8`은 현재 선택·포커스·상호작용에 쓴다.
- 일반 상태·분야는 중립 명도, 직접 라벨, 아이콘·선 패턴으로 구별한다.
- 위험색은 실제 기한 지남·실패·긴급 KA에 제한한다. 대기·새 기록·partial을 자동으로 빨갛게 만들지 않는다.
- 막대에는 수치와 단위를 직접 붙인다. hover나 별도 범례를 읽어야 이해되는 화면을 피한다.
- 수치는 큰 지표에 SUIT tabular, 작은 계기값에 JetBrains Mono를 사용한다.
- 원본의 흰 카드·초록 달성색·보라/초록 배경 번짐과 화면별 지표 수는 가져오지 않는다.

## 7. 지금 붙일 수 있는 것과 추가 계약이 필요한 것

| 단계 | 작업 | 범위 |
|---|---|---|
| A | Today 헤더·행 위계·간격·일반 카드 경계 정리 | 기존 읽기/쓰기·순위 계약 재사용 |
| A | 우선 행동과 다음 일정만 노출하고 상세 진입 연결 | 전체 목록 접근·진입점 총수·뒤로 가기·오류 가시성 검증 |
| B | 내 작업 분포, PMS 진척, 고객/일정 사건 시간축 | 상세에서만 표시. 현재 근거 필드와 조회 범위·부분 데이터 표기 |
| C | 기간 추세·전환·가용시간 | 아래 데이터 계약 보강 후 별도 설계 |

| 이후 후보 | 먼저 필요한 것 |
|---|---|
| 오늘 완료율·완료 추세 | `completed_at`, 재오픈 이력, 오늘 계획 분모 정의 |
| 프로젝트 번다운 | 일별 남은 작업 이력, 중간 범위 추가·삭제 기록 |
| 영업 전환율 퍼널 | 코호트 시작일, 단계 전이, 성공/실패/보류 정의, 전체 대상 집합 |
| 고객 연락 준수율 | 명시한 연락 기한, 실제 활동시각, 누락 없는 연결키·수집 범위 |
| 남은 자유시간 | 일정 시작·종료, 종일/중복 처리, 완전한 일정 조회 |

## 8. 실제 구현 시 확인할 기준

1. 390×844에서 Quick Capture와 첫 실행 항목의 행동 문장이 동시에 보이는가?
2. 1440px에서 다음 행동이 잘리지 않고 고객 영역이 일정 영역보다 명확한가?
3. 미완료 후보의 막대와 그 막대를 눌러 열린 목록이 같은 범위·상태를 사용하는가?
4. live-empty/preview/partial/error가0건으로 뭉개지지 않는가?
5. 업무 완료·연락 결과 기록·재조회 흐름과 중복 방지 계약이 유지되는가?
6. 키보드와44px 터치 영역으로 같은 핵심 행동을 할 수 있는가?
7. 일반 완료·대기·분야가 색상만으로 구별되지 않는가?

최초 응용 예시는736px 내용 폭과390×844 브라우저에서 확인했다. 이 검증은 이전의 차트 포함 홈에 대한 기록이다. 후속 축약안은390×844에서 홈 전체가 첫 화면에 들어왔고,320px 목업 폭에서도 높이 약588px·핵심 요소 가로 넘침0건을 확인했다. 상세 진입·뒤로 가기, 전체12개 목록 접근, 상세에서만 업무 분포 펼치기, 가상 입력12→13건 갱신, 상세 메모를 확인했다. 어느 목업도 운영 앱의 반응형·데이터 통합 검증을 대체하지 않는다.

시각화 담당 서브에이전트의 최종 문서 재검토에서도 데이터 의미와 확정/권장 구분의 수정 필수 사항은 없었다. 문서의 로컬 링크와 공백 검사도 통과했다.

첫 구현 범위로는 **Today의 주요 행동 요약 + 상세 진입**을 권장한다. 이후 같은 간결한 행 구조를 고객 연락과 PMS에 적용하고, 시각화는 상세 문맥에서 추가한다.
