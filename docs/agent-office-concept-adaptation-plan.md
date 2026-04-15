# Com_Moon x AgentOffice 개념 차용 적용안

## 1. 문서 목적

이 문서는 [`agent-office`](https://github.com/harishkotra/agent-office)의 핵심 개념을
`moonlight_proj`에 그대로 이식하지 않고, Com_Moon 허브 문맥에 맞게 재설계해
적용하는 방법을 정리한다.

핵심 목표는 하나다.

- 허브 안에서 `누가`, `무엇을`, `어떤 상태로`, `어디까지` 진행 중인지 5초 안에 읽히게 만든다.

이 문서는 특히 `apps/hub`의 `AI Console`, `Automations`, `Evolution` 레인을 잇는
새 운영 표면 설계에 초점을 둔다.

## 2. 결론 요약

`agent-office`에서 가져올 것은 아래 두 가지다.

- 에이전트가 살아 있는 운영 공간처럼 보이는 시각화 방식
- 작업, 대화, 기억, 실행 로그를 한 장면 안에서 연결해 보여주는 정보 구조

가져오지 않을 것은 아래와 같다.

- 픽셀 아트 오피스
- Phaser / Colyseus / 별도 실시간 서버 스택
- 자율 채용, 자율 증식 같은 과한 시뮬레이션 요소
- 현재 허브 데이터와 분리된 별도 AI 월드 모델

즉, Com_Moon은 `Agent Office`를 만들지 않는다.
대신 `Moonstone Situation Deck`를 만든다.

## 3. 현재 프로젝트와의 접점

이미 허브에는 개념상 필요한 재료가 대부분 있다.

- `AI Console` overview/chat/council/orders
- `Operating Pulse`
- `automation_runs`, `ai_threads`, `ai_messages`, `ai_council_sessions`, `ai_orders`
- `Evolution`의 logs / issues / memos

현재 구조상 가장 자연스러운 진입점은 `AI` 섹션의 새 하위 뷰다.

권장 라우트:

- URL: `/dashboard/ai/office`
- 사용자 라벨: `상황실`

이렇게 두면 개념 추적은 쉬우면서도, 실제 표면 언어는 Com_Moon 브랜드에 맞출 수 있다.

## 4. 제품 원칙

### 4.1 이 화면이 답해야 하는 질문

- 지금 어떤 에이전트가 살아 있나
- 누가 어떤 오더에 붙어 있나
- 어떤 대화가 결정으로 바뀌고 있나
- 자동화와 엔진 쪽에서 지금 무슨 움직임이 있나
- 사람 확인이 필요한 막힘은 어디인가

### 4.2 이 화면이 하면 안 되는 일

- 기존 챗/카운슬/오더 화면을 그대로 다시 복제하기
- 게임처럼 보이게 만들기
- 존재하지 않는 상태를 그럴듯하게 연출하기
- 실시간성 때문에 아키텍처를 과도하게 복잡하게 만들기

### 4.3 성공 기준

- 사용자가 5초 안에 `지금 누가 뭐 하고 있는지` 이해한다
- 오더, 챗, 카운슬, 자동화 실행으로 1클릭 이동이 가능하다
- 모바일에서도 구조가 무너지지 않는다
- 읽기 전용 MVP는 새 인프라 없이 구현 가능하다

## 5. 개념 번역표

`agent-office` 개념을 Com_Moon 문맥으로 번역하면 아래와 같다.

| AgentOffice 개념 | Com_Moon 번역 |
| --- | --- |
| Office floor | Situation Deck / 운영 상황실 |
| Agent sprite | Agent beacon / agent cell |
| Task board | Order rail |
| Follow camera | Focus lens |
| System log | Activity ticker |
| Persistent memory | Evolution memory lane |
| Tool execution | Engine dispatch / automation run |
| Autonomous talk | Chat / Council session |
| Dynamic hiring | 후순위. MVP 제외 |

핵심은 `사람이 읽기 쉬운 운영 언어`로 바꾸는 것이다.

## 6. 권장 정보 구조

상황실은 하나의 커다란 캔버스가 아니라, 하나의 장면처럼 읽히는 `복합 보드`로 설계한다.

### 6.1 상단 Command Strip

포함 요소:

- 활성 에이전트 수
- 실행 중 오더 수
- 리뷰 대기 수
- 엔진 상태
- 최근 동기화 시각

역할:

- 첫 시선에서 시스템 상태를 요약
- 현재 데이터가 실시간인지 아닌지 신뢰 신호 제공

### 6.2 중앙 Agent Grid

각 에이전트 카드가 아니라, `작업 위치가 있는 셀`처럼 보이게 구성한다.

노출 정보:

- 이름
- 역할
- 현재 상태
- 현재 focus
- 붙어 있는 오더
- 최근 액션 시각

행동:

- 클릭 시 우측 Focus Inspector 열기
- 오더/챗/카운슬로 점프

### 6.3 우측 Focus Inspector

선택한 에이전트 또는 오더의 문맥을 보여준다.

포함 요소:

- 현재 focus 요약
- 최근 메시지 2~3개
- 연결된 카운슬 세션
- 최근 엔진/자동화 이벤트
- 다음 액션 버튼

이 패널이 있어야 상황실이 단순 예쁜 대시보드가 아니라 실제 운영 도구가 된다.

### 6.4 하단 Order Rail

상태별 가로 레인:

- `큐 대기`
- `실행 중`
- `리뷰 대기`
- `완료 직전`

각 오더는 짧은 토큰 카드로 표시한다.

노출 정보:

- 제목
- 대상 에이전트
- 우선순위
- 레인
- 마감

행동:

- 클릭 시 오더 상세 또는 `/dashboard/ai/orders`로 이동
- 후속 단계에서 drag 보다는 `명시적 재배정` 버튼 우선

### 6.5 Activity Ticker

오피스 감각을 대체할 핵심 요소다.

소스:

- `automation_runs`
- `ai_messages`
- `ai_council_turns`
- `project_updates`
- `error_logs`

표현:

- "Codex가 P1 오더에 붙음"
- "Claude가 카운슬에서 결정 턴 남김"
- "Engine이 webhook run 실패"

중요 원칙:

- 실제 저장된 이벤트만 보여준다
- 상상 로그를 만들지 않는다

### 6.6 Memory Lane

`Evolution`과 연결되는 얇은 보조 레인이다.

포함 요소:

- 최근 memo
- 반복 이슈
- unresolved error
- 최근 결정

역할:

- 현재 움직임이 과거 학습과 연결되어 보이게 만들기

## 7. 라우팅 제안

기존 `AI` 섹션에 child 하나를 추가한다.

권장 순서:

- `/dashboard/ai`
- `/dashboard/ai/office`
- `/dashboard/ai/chat`
- `/dashboard/ai/council`
- `/dashboard/ai/orders`

이유:

- `overview`는 숫자와 스냅샷 중심
- `office`는 관계와 흐름 중심
- `chat/council/orders`는 세부 작업 surface

필수 수정 후보:

- `apps/hub/lib/dashboard-data.js`
- `apps/hub/components/shell/dashboard-shell.jsx`
- `apps/hub/app/dashboard/ai/office/page.jsx`

## 8. UI 방향

### 8.1 반드시 지킬 것

- 다크 허브 서피스 유지
- 문스톤 액센트만 사용
- whisper border 유지
- 허브 카드 배경은 반투명 다크만 사용
- 지나치게 큰 컬러 fill 금지

### 8.2 절대 피할 것

- 픽셀 캐릭터
- 게임 타일맵
- 귀여운 이모지 중심 시각화
- 두꺼운 보더
- 화이트 카드

### 8.3 시각 언어 제안

상황실은 `공간`처럼 느껴지되 실제 구현은 CSS 그리드 기반으로 간다.

시각 요소:

- agent cell: 얇은 림 라이트가 있는 다크 셀
- order token: 좁고 긴 metal-tag
- activity ticker: 흐르는 로그가 아니라 고정 밀도 레일
- focus line: 선택 항목을 moonstone 하이라이트로 연결
- background: 아주 얕은 grid / plotting line 정도만 허용

레퍼런스 톤:

- Linear의 밀도
- Bloomberg의 상태 리듬
- Apple Pro 장비 같은 정밀도

## 9. 기술 적용 전략

### 9.1 Phase 1에서 하지 않을 것

- Phaser 도입
- Colyseus 도입
- WebSocket 전용 서버 추가
- 별도 SQLite 메모리 스토어 추가
- Ollama 기반 독립 에이전트 런타임 추가

이 프로젝트는 이미 `Next + Supabase + hub server-data` 구조가 있으므로,
첫 버전은 그 위에 얹는 편이 맞다.

### 9.2 Phase 1 데이터 전략

기존 `getAiConsolePageData()`를 재사용하거나 확장한다.

읽을 테이블:

- `agents`
- `ai_threads`
- `ai_messages`
- `ai_council_sessions`
- `ai_council_turns`
- `ai_orders`
- `automation_runs`
- `error_logs`
- `memos`

추천 방식:

- `getAiOfficePageData()` 신설
- 내부에서 `getAiConsolePageData()`, `getOperatingPulseData()`, `getLogsPageData()` 성격의 데이터를 묶어 조합

반환 shape 예시:

```js
{
  commandStrip: {...},
  agents: [...],
  orderRail: {
    queued: [...],
    running: [...],
    review: [...],
    closing: [...],
  },
  activityTicker: [...],
  memoryLane: [...],
  inspectorDefault: {...},
  lastSyncLabel: "방금"
}
```

### 9.3 Phase 1 렌더링 전략

- 서버 컴포넌트로 첫 렌더
- 클라이언트 컴포넌트로 선택 상태만 관리
- 자동 갱신은 30초 `router.refresh()` 또는 단순 polling

이유:

- 현재 허브도 완전 실시간 구조가 아니다
- 우선 신뢰 가능한 운영 표면을 만드는 게 중요하다

### 9.4 Phase 2 상호작용 전략

읽기 전용 MVP가 안정화되면 아래를 붙인다.

- 에이전트 선택 후 오더 재배정
- 오더에서 챗/카운슬 생성
- 최근 활동에서 원본 로그 열기
- Engine 상태에서 수동 재시도 버튼 연결

이 단계에서도 `게임 인터랙션` 대신 `운영 버튼`을 우선한다.

## 10. 구현 컴포넌트 제안

신규 컴포넌트 후보:

- `apps/hub/components/dashboard/ai-office-scene.jsx`
- `apps/hub/components/dashboard/ai-office-command-strip.jsx`
- `apps/hub/components/dashboard/ai-office-agent-grid.jsx`
- `apps/hub/components/dashboard/ai-office-order-rail.jsx`
- `apps/hub/components/dashboard/ai-office-activity-ticker.jsx`
- `apps/hub/components/dashboard/ai-office-memory-lane.jsx`
- `apps/hub/components/dashboard/ai-office-focus-inspector.jsx`

초기에는 한 파일로 시작해도 된다.
다만 아래 순서로 쪼개면 유지가 쉽다.

1. `page.jsx`
2. `ai-office-scene.jsx`
3. 하위 섹션 컴포넌트 분리

## 11. 단계별 로드맵

### Phase 0. Spec + mock

목표:

- 정보 구조 고정
- 더미 데이터로 시각 구조 검증

산출물:

- 새 route 스캐폴드
- mock office scene
- 모바일/데스크톱 레이아웃 확인

### Phase 1. Live read-only

목표:

- 실제 DB 기반 상황실 구축

범위:

- live agent grid
- live order rail
- live activity ticker
- live memory lane
- inspector

비포함:

- write action
- 실시간 push

### Phase 2. Dispatch actions

목표:

- 상황실에서 직접 운영 액션 수행

범위:

- 오더 재배정
- 챗으로 보내기
- 카운슬 시작
- 엔진/자동화 재실행 점프

### Phase 3. Guided autonomy

목표:

- 완전 자율이 아니라 `권고형 자동화` 추가

예시:

- "이 오더는 Codex보다 Claude 검토가 먼저 필요"
- "실패 3회 반복으로 수동 확인 권장"
- "카운슬 종료 후 오더 생성 제안"

### Phase 4. Limited orchestration

목표:

- 일부 안전한 범위만 자동 디스패치

조건:

- 명확한 승인 장치
- audit log
- 취소 가능성

## 12. 데이터 모델 확장 우선순위

Phase 1은 기존 테이블로 충분하다.

Phase 2 이후 필요 시 아래를 고려한다.

- `ai_agent_events`
  - 에이전트 상태 변화 이벤트 저장
- `ai_order_events`
  - 오더 이동, 재배정, 리뷰 요청 기록
- `ai_focus_snapshots`
  - 주기적 focus 상태 스냅샷

이 확장은 `상황실을 더 정확하게 만들기 위해서만` 도입한다.
시각효과를 위해 테이블을 먼저 만들지 않는다.

## 13. 리스크와 대응

### 리스크 1. 너무 게임처럼 보임

대응:

- 셀/레인/인스펙터 중심으로 설계
- 캐릭터 표현 제거
- 정밀 장비 UI 톤 유지

### 리스크 2. 기존 AI Console과 중복

대응:

- `overview`는 숫자 요약
- `office`는 관계 시각화
- `chat/council/orders`는 작업 전용

### 리스크 3. 실시간성이 약해 보임

대응:

- last sync 표시
- 상태 라벨 명확화
- phase 1에서는 polling 기반으로 충분

### 리스크 4. AI가 실제보다 똑똑해 보이는 연출

대응:

- persisted 상태만 렌더
- 추정/예측은 separate badge로 구분
- activity는 실제 source 기반만 허용

## 14. 권장 첫 구현 스프린트

첫 스프린트 목표는 `읽기 전용 상황실 1장`이다.

작업 순서:

1. `AI` child route에 `/dashboard/ai/office` 추가
2. `page.jsx`와 `ai-office-scene.jsx` 생성
3. mock 데이터로 레이아웃 고정
4. `getAiOfficePageData()` 추가
5. live agent / order / activity / memory 연결
6. 모바일 레이아웃과 빈 상태 다듬기

첫 스프린트의 완료 기준:

- 새 상황실 화면이 허브 셸 안에서 자연스럽게 열린다
- 5초 안에 에이전트 상태와 오더 흐름이 읽힌다
- 상세 surface로 1클릭 이동이 된다
- 디자인 시스템 위반이 없다

## 15. 구현 시작 파일 제안

- `apps/hub/app/dashboard/ai/office/page.jsx`
- `apps/hub/components/dashboard/ai-office-scene.jsx`
- `apps/hub/lib/server-data.js`
- `apps/hub/lib/dashboard-data.js`
- `apps/hub/components/shell/dashboard-shell.jsx`
- `apps/hub/app/globals.css`

## 16. 최종 제안

가장 좋은 적용 방식은 이것이다.

- `agent-office`를 통합하지 않는다
- `상황실`이라는 새 AI 하위 뷰를 만든다
- 첫 버전은 읽기 전용 운영 시각화로 간다
- 실제 persisted 데이터만 보여준다
- 이후에만 제한된 디스패치 액션을 붙인다

즉, 이 프로젝트에서의 정답은 `AI agent office`가 아니라
`문스톤 운영 상황실`이다.
