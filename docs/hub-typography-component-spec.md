# Hub Typography and Component Spec

이 문서는 `apps/hub` 기준의 한국어 타이포그래피와 컴포넌트 밀도 기준을 정리한다.

목표:

- 허브를 `summary-heavy dashboard`가 아니라 `즉시 작업형 운영 면`으로 맞춘다.
- 한국어 기준으로 읽기 편하고, 밀도 높은 UI에서도 리듬이 무너지지 않게 한다.
- 현재 분산된 폰트 기준을 하나의 실행 방향으로 정리한다.

관련 문서:

- `DESIGN.md`
- `docs/hub-minimal-practical-redesign-plan.md`
- `docs/hub-design-priority-todo.md`

## 1. 현재 상태 정리

현재 저장소의 폰트 기준은 세 갈래로 나뉘어 있다.

- `DESIGN.md`: `MaruBuri / SUIT Variable / IBM Plex Mono`
- `packages/ui/tokens.css`: `Pretendard Variable` 우선 sans fallback
- `apps/hub/app/layout.jsx`: 실제 로딩은 `Noto Sans KR / Noto Serif KR / IBM Plex Mono`

이 상태는 아래 문제를 만든다.

- 문서와 실제 렌더링 결과가 다르다.
- 허브와 공용 토큰의 타이포 성격이 일치하지 않는다.
- 섹션별로 serif, sans, mono의 역할이 흔들린다.

## 2. 결정

허브의 다음 기준은 아래처럼 잡는다.

### 2.1 Primary sans

허브 기본 sans는 `Pretendard Variable`을 우선 기준으로 본다.

이유:

- 한국어 UI에서 가장 무난하고 안정적인 가독성을 제공한다.
- 운영 텍스트, 임의 입력, 테이블, 긴 리스트에 모두 안전하다.
- 플랫폼 혼합 환경에서 톤 차이가 적다.

단, 현재 실제 허브는 `next/font`로 `Noto Sans KR`를 로드 중이다.
따라서 다음 구현 라운드 전까지는 아래처럼 해석한다.

- 디자인 기준 폰트: `Pretendard Variable`
- 현재 배포 fallback: `Noto Sans KR`
- `SUIT Variable`은 후보군으로 유지하되, 허브 실데이터 기준 QA 후 채택 여부를 결정한다.

### 2.2 Serif

허브에서 serif는 기본 본문 계열이 아니다.

- 허브 내부에서는 브랜드명, 극히 일부 대제목, 예외적 프리미엄 모멘트에만 제한적으로 사용한다.
- 섹션 루트, 데이터 레인, 패널 제목에는 serif를 기본으로 쓰지 않는다.
- `apps/web`의 헤드라인 serif 운용은 허브 완료 이후 별도 정리한다.

### 2.3 Mono

숫자와 상태 정보는 계속 `IBM Plex Mono`를 유지한다.

사용 범위:

- KPI 수치
- 라벨
- 상태 pill
- timestamp
- command, id, run count, tabular number

## 3. 한국어 기준 타입 역할

허브는 한국어 밀도에 맞춰 작은 단계 차이로 위계를 만든다.

### 3.1 Size scale

- `11px`: mono micro label, overline, status code
- `12px`: meta, tag, caption, filter hint
- `13px`: dense supporting text, row secondary text
- `15px`: 기본 row title, button, input, interactive text
- `16px`: 기본 본문
- `20px`: section heading
- `24px`: page title
- `28px~32px`: dashboard KPI or major numeric callout only

### 3.2 Weight rules

- `400`: 본문, 설명
- `500`: 인터랙션 텍스트, row title
- `600`: section title, active state, important control
- `700`: KPI 숫자, 극히 제한된 page title

### 3.3 Letter spacing

- 한국어 본문은 과한 tracking을 쓰지 않는다.
- mono label은 `0.08em` 내외로만 사용한다.
- 대문자 영문 라벨은 허용하지만, 한국어 라벨은 uppercase 스타일에 의존하지 않는다.

## 4. 허브에서 좋은 폰트 조합

### 권장 조합 A

- sans: `Pretendard Variable`
- mono: `IBM Plex Mono`
- serif: `MaruBuri`

추천 상황:

- 운영 UI를 가장 안정적으로 정리하고 싶을 때
- 긴 한국어 데이터와 입력 폼이 많을 때

### 권장 조합 B

- sans: `SUIT Variable`
- mono: `IBM Plex Mono`
- serif: `MaruBuri`

추천 상황:

- 더 날렵하고 차가운 인상의 허브를 원할 때
- 실데이터 QA에서 glyph coverage 문제가 없을 때

### 비권장

- 허브 기본 sans를 serif와 섞어 과도하게 쓰는 것
- 섹션마다 sans를 바꾸는 것
- public용 display font를 허브 본문에 끌어오는 것

## 5. 컴포넌트 발전 방향

허브는 컴포넌트를 늘리는 대신, 역할이 명확한 저수준 primitive를 강화한다.

### 5.1 남겨야 할 핵심 primitive

- `SectionHeader`
- `Button`
- `StatusChip` / `StatusBadge`
- `KpiCard`
- `SlidePanel`
- `EmptyState`
- `DataTable`

### 5.2 새로 필요한 허브 전용 primitive

- `SegmentedControl`
  - 섹션 탭, view switcher, context switcher 공용
  - 설명 문구 없이 `label + count + active`만 우선
- `ActionBar`
  - 검색, 필터, primary action, secondary action을 한 줄에 배치
- `DataRow`
  - 카드 대신 리스트/큐/작업 레인에 쓰는 기본 행 단위
  - `title / status / next action / meta` 구조
- `DenseTable`
  - 허브 다크 표면 기준의 토큰형 테이블
  - 현재 `packages/ui/data-table.tsx`의 밝은 하드코딩을 대체
- `DetailDrawerLayout`
  - 우측 상세면 공통 구조
  - 상태, 다음 액션, 히스토리, 메모, 관련 링크 순서 고정

### 5.3 축소해야 할 패턴

- 설명형 `section card`
- 모든 블록에 배경을 넣는 mini metric
- description이 붙은 탭 카드
- 강한 shadow + gradient + top highlight의 중복

## 6. 밀도 규칙

허브의 기본 단위는 `card`보다 `row`에 가깝다.

원칙:

- `Dashboard`만 summary-first
- 나머지 섹션 루트는 action-first
- 박스는 정보 그룹일 때만 사용
- 기본 그룹은 배경보다 `spacing + divider + typography`로 만든다

실행 규칙:

- 페이지 상단 설명은 1줄 이하
- 섹션 헤더 아래 바로 action bar 또는 row list가 나와야 한다
- metric은 많은 카드보다 `2~3개의 핵심 수치 + queue` 구성이 낫다
- 모바일에서는 카드 그리드보다 단일 column row stack이 기본이다

## 7. 현재 컴포넌트에 대한 구체 피드백

### `apps/hub/components/dashboard/section-nav.jsx`

현재:

- `label + description` 카드형 탭
- context bar도 별도 박스

권장:

- `SegmentedControl` 기반 1줄 탭
- description 제거
- context switcher는 같은 시야 안의 inline row로 축소

### `apps/hub/components/dashboard/section-card.jsx`

현재:

- 많은 경우 설명형 박스로 소비됨

권장:

- `default / plain / compact` 밀도 variant로 축소
- 기본값은 `plain`
- 실제 강조 surface에만 배경 사용

### `packages/ui/data-table.tsx`

현재:

- 밝은 색 하드코딩
- 허브 다크 표면과 톤 불일치

권장:

- `surface="dark" | "light"` 지원
- 토큰 기반 border, text, hover, input 스타일 정리
- 모바일에서는 card fallback 또는 row fallback 제공

## 8. 구현 우선순위

### P0

- 허브 폰트 기준 문서화
- `SectionNav`를 segmented control 형태로 재설계
- `DataTable`을 토큰 기반 다크/라이트 양면 지원으로 재작성

### P1

- `SectionCard`를 `plain / default / compact`로 분리
- 공통 `ActionBar`와 `DataRow` primitive 추가
- 허브 섹션 루트에서 설명형 summary 제거

### P2

- 허브 실데이터 기준 `Pretendard` vs `SUIT` QA
- `apps/web` 폰트 재정렬
- serif 사용 범위 재정의

## 9. 실행 제안

다음 구현 라운드에서는 아래 순서로 진행한다.

1. 허브 폰트 기준을 확정한다.
2. `SectionNav`와 `DataTable`을 허브 실무형 컴포넌트로 바꾼다.
3. 카드성 UI를 줄이고 row 중심 구조로 이동한다.
4. 그 다음에야 섹션별 세부 화면을 다듬는다.

## 10. 외부 참고

공식 자료 기준으로 검토한 후보:

- `Pretendard`: <https://github.com/orioncactus/pretendard>
- `SUIT`: <https://sun.fo/suit/> / <https://github.com/sun-typeface/SUIT>
- `LINE Seed KR`: <https://seed.line.me/index_kr.html> / <https://github.com/line/seed>
- `Wanted Sans`: <https://github.com/wanteddev/wanted-sans>
- `Noto Sans CJK KR`: <https://notofonts.github.io/noto-docs/specimen/NotoSansCJKkr/>
- `IBM Plex`: <https://www.ibm.com/design/language/typography/typeface/>
