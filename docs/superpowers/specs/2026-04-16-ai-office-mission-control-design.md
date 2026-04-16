# AI Office Mission Control — 상황실 레벨업 디자인 스펙

**날짜:** 2026-04-16  
**대상 라우트:** `/dashboard/ai/office`  
**파일:** `apps/hub/components/dashboard/ai-office-scene.jsx` (교체)

---

## 1. 목표

기존 에이전트 상황실을 **3-zone 가로 흐름 + 연결 가시화 + 라이브감** 구조로 완전히 재설계한다.

해결해야 할 문제:
- 에이전트 상태가 정적으로 느껴진다
- 자동화 실행과 AI 에이전트의 연결이 보이지 않는다
- 오더 흐름의 진행감이 없다
- 5초 안에 시스템 상태가 읽히지 않는다
- 노드가 늘수록 인지 부담이 같이 늘어난다

성공 기준:
- 5초 안에 "지금 누가, 뭐가, 어디서" 읽힌다
- 노드가 추가될수록 구조가 채워지는 느낌, 무너지지 않는다
- 라이브러리 없이 CSS만으로 라이브감 구현
- 모바일에서 구조 유지

---

## 2. 전체 레이아웃 구조

```
┌─────────────────────────────────────────────────────┐
│  HEALTH STRIP  │  engine ok · 3 running · 1 blocked │  ← 항상 노출
├───────────┬────────────────────┬────────────────────┤
│  SOURCE   │    AGENT ZONE      │    ORDER RAIL      │
│  ZONE     │                    │                    │
│  [TG]     │  [Claude] [Codex]  │  큐대기  실행중    │
│  [Engine] │     ↕  active      │    ↕               │
│  [GH]     │  [Engine Agent]    │  리뷰대기 완료     │
│  [n8n]    │                    │                    │
└───────────┴──────┬─────────────┴────────────────────┘
                   │  FOCUS INSPECTOR (선택 시 오버레이)
┌─────────────────────────────────────────────────────┐
│  ACTIVITY TICKER  ← → ← → (최근 이벤트 흐르는 스트립) │
└─────────────────────────────────────────────────────┘
```

**흐름 방향:** Source Zone → Agent Zone → Order Rail (좌→우)

### 2.1 Health Strip
- 항상 최상단 고정
- 노출 항목: engine 상태 / 실행 중 수 / 주의 필요 수 / 마지막 sync 시각
- 5초 안에 시스템 건강도 판단 가능해야 함

### 2.2 Source Zone (좌측)
- Engine에 붙은 외부 노드들 (Telegram, GitHub, webhook sources)
- `integration_connections` 테이블 + engine 라우트 목록에서 읽음
- 새 provider 붙으면 자동 노출 — 코드 변경 불필요
- 노드 상태: `connected` / `idle` / `error`

### 2.3 Agent Zone (중앙)
- Claude / Codex / Engine 에이전트 셀
- 각 셀: 이름 + 역할 한 줄 + 현재 focus + 상태 림 라이트
- 클릭 → Focus Inspector 오픈

### 2.4 Order Rail (우측)
- 4 레인: 큐 대기 / 실행 중 / 리뷰 대기 / 완료
- 기존 가로 레인 → 세로 배치로 전환 (3-zone 구조에 맞춤)
- 오더 토큰: 제목 + 대상 에이전트 + 우선순위 chip

### 2.5 Focus Inspector
- 기존 우측 사이드 패널 → **오버레이**로 전환
- 에이전트 또는 오더 선택 시 노출
- 포함: focus 요약 / 관련 오더 / 관련 스레드 / 관련 카운슬 / 액션 버튼
- 배경 클릭 또는 ESC로 닫기

### 2.6 Activity Ticker (하단)
- 하단 고정 스트립
- `automation_runs`, `ai_messages`, `ai_council_turns`, `project_updates`, `error_logs` 소스
- 30초 `router.refresh()` polling

### 2.7 모바일
- Health Strip + Activity Ticker: 유지
- Source Zone: 숨김 (모바일에서 생략)
- Agent Zone + Order Rail: 탭 전환 (`에이전트` / `오더`)
- Focus Inspector: 풀스크린 시트로

---

## 3. 연결선 & 라이브감

### 3.1 연결선 시각

SVG 오버레이 없이 **CSS border + pseudo-element** 구현.

| 상태 | 시각 |
|---|---|
| 비활성 | `──────` whisper border, 1px, `--border-subtle` |
| 활성 | `══════` moonstone 색, opacity 0.6 |
| 실행 중 | `━━━━━━` `@keyframes flow-dash` (dash-offset 이동) |
| 에러 | `──────` danger tone + 깜박임 |

Source Zone과 Agent Zone 사이, Agent Zone과 Order Rail 사이 각각 연결선 적용.

### 3.2 노드 상태 시각 언어

```
[● Claude]   moonstone rim, 호흡 애니메이션 = 실행 중
[○ Codex]    dim rim = idle
[! Engine]   danger rim = 에러/주의
[+ GitHub]   muted = 연결됨, 비활성
```

### 3.3 라이브감 구현

| 요소 | 방법 |
|---|---|
| 실행 중 노드 | `data-status="running"` → `@keyframes rim-pulse` (림 라이트 호흡) |
| 연결선 흐름 | `@keyframes flow-dash` (dash-offset 이동) |
| Activity Ticker | `router.refresh()` 30초마다 |
| Health Strip 숫자 | 동일 refresh로 갱신 |

WebSocket, Phaser, 별도 실시간 서버 없음. Next.js + Supabase + CSS 기반.

---

## 4. 데이터 구조

### 4.1 `getAiOfficePageData()` 확장

기존 shape 유지, 2개 필드 추가:

```js
{
  // 기존 유지
  commandStrip: [...],
  agents: [...],
  orderRail: [...],
  activityTicker: [...],
  memoryLane: [...],
  chatThreads: [...],
  councilSessions: [...],
  operatingPulse: {...},

  // 신규
  sourceNodes: [
    {
      id: string,
      label: string,          // "Telegram", "GitHub", "OpenClaw"
      type: string,           // "webhook" | "integration" | "engine"
      status: string,         // "connected" | "idle" | "error"
      lastEventAt: string,    // 상대 시간 레이블
    }
  ],
  flowConnections: [
    {
      from: string,           // sourceNode.id 또는 agent.id
      to: string,             // agent.id 또는 "order-rail"
      status: string,         // "active" | "idle" | "error"
    }
  ],
}
```

`sourceNodes` 읽기 소스:
- `integration_connections` 테이블 (provider, status, last_sync_at)
- Engine 공개 라우트 목록 (Telegram, project, OpenClaw, Moltbot)

`flowConnections` 결정 로직:
- `automation_runs` 최근 실행에서 source → agent 매핑 추론
- 없으면 `status: "idle"` 기본값

### 4.2 변경 없는 데이터
- 오더 재배정 API (`/api/ai/orders`)
- 챗/카운슬/오더 딥링크 빌더 함수
- 기존 agent/order/activity 필드 shape

---

## 5. 컴포넌트 분해

```
ai-office-scene.jsx              ← 최상위 클라이언트 컴포넌트 (기존 파일 교체)
  ├─ AiOfficeHealthStrip         ← Health Strip (신규)
  ├─ AiOfficeCanvas              ← 3-zone CSS Grid 래퍼 (신규)
  │    ├─ AiOfficeSourceZone     ← Source 노드 목록 (신규)
  │    ├─ AiOfficeAgentZone      ← Agent 셀 그리드 (기존 재작성)
  │    └─ AiOfficeOrderRail      ← Order 레인 세로 배치 (기존 재작성)
  ├─ AiOfficeFocusInspector      ← 오버레이 패널 (기존 사이드 → 오버레이로 전환)
  └─ AiOfficeActivityTicker      ← 하단 고정 스트립 (기존 재작성)
```

각 컴포넌트는 동일 파일에서 시작하고, 파일이 커지면 별도 분리.

---

## 6. UI 규칙 (CLAUDE.md + DESIGN.md 준수)

- 배경: void-black 캔버스, 반투명 다크 카드만
- 보더: 1px, whisper border 기본
- 액센트: moonstone only — 초록/골드/보라 재도입 금지
- 화이트 카드 없음
- 두꺼운 보더 없음
- 모바일 우선 설계

---

## 7. 구현 범위 경계

### Phase 1 (이번 스펙 범위)
- 3-zone 레이아웃 구조
- Health Strip
- Source Zone (더미 → integration_connections 연동)
- Agent Zone 재작성 (rim 라이트 애니메이션)
- Order Rail 세로 재배치
- Focus Inspector → 오버레이 전환
- Activity Ticker 하단 고정
- CSS 연결선 + flow-dash 애니메이션
- 30초 polling refresh

### Phase 1 제외 (후속)
- WebSocket 실시간 push
- Source Zone 노드 클릭 → provider 상세
- 연결선 클릭 → 해당 run 상세
- Memory Lane (Phase 1에서 생략, 후속 재통합)

---

## 8. 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `apps/hub/components/dashboard/ai-office-scene.jsx` | 전체 재작성 |
| `apps/hub/lib/server-data.js` | `getAiOfficePageData()` — sourceNodes, flowConnections 추가 |
| `apps/hub/app/globals.css` | rim-pulse, flow-dash 키프레임 추가, ai-office 레이아웃 CSS 교체 |
| `apps/hub/app/dashboard/ai/office/page.jsx` | 변경 없음 |
