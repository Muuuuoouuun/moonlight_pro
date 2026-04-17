# AI Office Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard/ai/office` 상황실을 3-zone 가로 흐름 + 연결 가시화 + 라이브감 구조로 완전히 재설계한다.

**Architecture:** Source Zone(외부 연결 노드) → Agent Zone(Claude/Codex/Engine) → Order Rail(오더 레인) 가로 흐름으로 레이아웃을 교체하고, CSS 애니메이션(`rim-pulse`, `flow-dash`)으로 라이브감을 구현한다. 30초 polling으로 데이터 갱신. WebSocket/canvas 라이브러리 없이 Next.js + Supabase + CSS 기반.

**Tech Stack:** Next.js 15 App Router, React 19 (useEffect/useState), CSS custom properties (`--cm-*` tokens), `router.refresh()` polling

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `apps/hub/app/globals.css` | 3-zone 레이아웃 CSS 교체, 애니메이션 키프레임 추가 |
| `apps/hub/lib/server-data.js` | `getAiOfficePageData()` — sourceNodes, flowConnections 추가 |
| `apps/hub/components/dashboard/ai-office-scene.jsx` | 전체 재작성 (Health Strip, Canvas, Source/Agent/Order, Inspector overlay, Ticker) |

---

## Task 1: CSS — 3-zone 레이아웃 + Health Strip

**Files:**
- Modify: `apps/hub/app/globals.css` (기존 `.ai-office` 블록 교체)

- [ ] **Step 1: 기존 `.ai-office` 레이아웃 CSS 찾기**

  파일에서 `.ai-office {` 시작 줄 번호를 확인한다 (현재 약 5413번째 줄).

- [ ] **Step 2: 기존 `.ai-office` → `.ai-office__main, .ai-office__side` 블록 교체**

  아래 코드를 기존 `.ai-office { ... }` 와 `.ai-office__main, .ai-office__side { ... }` 블록 대신 삽입한다:

  ```css
  /* ── AI Office Mission Control Layout ───────────────────────── */

  .ai-office-health-strip {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .ai-office-health-strip__item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }

  .ai-office-health-strip__item strong {
    color: var(--text);
    font-family: var(--cm-font-mono);
    font-size: 13px;
  }

  .ai-office-health-strip__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--line);
    flex-shrink: 0;
  }

  .ai-office-health-strip__dot[data-status="ok"] { background: var(--success); }
  .ai-office-health-strip__dot[data-status="warn"] { background: var(--warning); }
  .ai-office-health-strip__dot[data-status="error"] { background: var(--danger); }

  .ai-office-canvas {
    display: grid;
    grid-template-columns: 180px 16px 1fr 16px minmax(260px, 320px);
    grid-template-areas: "source conn-left agent conn-right order";
    gap: 0;
    align-items: start;
    margin-top: 0;
  }

  .ai-office-canvas__source  { grid-area: source; }
  .ai-office-canvas__conn-l  { grid-area: conn-left; }
  .ai-office-canvas__agent   { grid-area: agent; }
  .ai-office-canvas__conn-r  { grid-area: conn-right; }
  .ai-office-canvas__order   { grid-area: order; }

  /* connector column — thin vertical separator with optional flow dot */
  .ai-office-conn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 28px;
    gap: 0;
    min-height: 200px;
  }

  .ai-office-conn__line {
    width: 1px;
    flex: 1;
    background: var(--line);
    position: relative;
    overflow: hidden;
  }

  .ai-office-conn__line[data-active="true"] {
    background: rgba(82, 116, 168, 0.5);
  }

  .ai-office-conn__line[data-active="true"]::after {
    content: "";
    position: absolute;
    top: -16px;
    left: -2px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--brand-strong);
    animation: flow-dot 1.8s linear infinite;
  }

  .ai-office-conn__line[data-active="error"]::after {
    background: var(--danger);
    animation: flow-dot 0.9s linear infinite;
  }
  ```

- [ ] **Step 3: Source Zone CSS 추가** (위 블록 바로 아래 이어서 추가)

  ```css
  /* Source Zone */
  .ai-office-source {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ai-office-source__label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 2px;
    margin-bottom: 4px;
  }

  .ai-office-node {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    transition: border-color 160ms ease;
  }

  .ai-office-node[data-status="connected"] { border-color: rgba(82, 116, 168, 0.35); }
  .ai-office-node[data-status="error"]     { border-color: rgba(var(--danger), 0.4); border-color: rgba(200, 60, 60, 0.4); }

  .ai-office-node__rim {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--line);
  }

  .ai-office-node__rim[data-status="connected"] { background: var(--brand); }
  .ai-office-node__rim[data-status="error"]     { background: var(--danger); }
  .ai-office-node__rim[data-status="idle"]      { background: var(--line); }

  .ai-office-node__body {
    min-width: 0;
  }

  .ai-office-node__name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-office-node__meta {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ```

- [ ] **Step 4: Order Rail (세로 레인) CSS 추가**

  ```css
  /* Order Rail — vertical lanes */
  .ai-office-order {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ai-office-order__label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 2px;
    margin-bottom: 4px;
  }

  .ai-office-lane {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }

  .ai-office-lane__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
  }

  .ai-office-lane__title {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .ai-office-lane__body {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ai-office-order-token {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid transparent;
    transition: border-color 120ms ease;
  }

  .ai-office-order-token:hover { border-color: var(--line); }

  .ai-office-order-token__title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }

  .ai-office-order-token__meta {
    font-size: 10px;
    color: var(--muted);
    margin-top: 2px;
  }

  .ai-office-lane__empty {
    padding: 10px 12px;
    font-size: 11px;
    color: var(--muted);
  }
  ```

- [ ] **Step 5: Activity Ticker (하단 고정 스트립) CSS 추가**

  ```css
  /* Activity Ticker — bottom fixed strip */
  .ai-office-ticker {
    display: flex;
    align-items: center;
    gap: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    margin-top: 16px;
    height: 44px;
    position: relative;
  }

  .ai-office-ticker__label {
    flex-shrink: 0;
    padding: 0 12px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    border-right: 1px solid var(--line);
    height: 100%;
    display: flex;
    align-items: center;
  }

  .ai-office-ticker__scroll {
    flex: 1;
    overflow: hidden;
    position: relative;
    height: 100%;
  }

  .ai-office-ticker__track {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 32px;
    padding: 0 16px;
    white-space: nowrap;
    animation: ticker-scroll 40s linear infinite;
  }

  .ai-office-ticker__track:hover { animation-play-state: paused; }

  .ai-office-ticker__item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
    flex-shrink: 0;
  }

  .ai-office-ticker__item strong {
    color: var(--text);
    font-weight: 500;
  }
  ```

- [ ] **Step 6: Focus Inspector overlay CSS 추가**

  ```css
  /* Focus Inspector — overlay */
  .ai-office-inspector-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 20px;
  }

  .ai-office-inspector {
    width: min(480px, calc(100vw - 40px));
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }

  .ai-office-inspector__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .ai-office-inspector__close {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms ease;
  }

  .ai-office-inspector__close:hover { background: rgba(255, 255, 255, 0.06); }
  ```

- [ ] **Step 7: 모바일 반응형 CSS 추가**

  ```css
  /* Mobile */
  @media (max-width: 768px) {
    .ai-office-canvas {
      grid-template-columns: 1fr;
      grid-template-areas:
        "agent"
        "order";
    }

    .ai-office-canvas__source,
    .ai-office-canvas__conn-l,
    .ai-office-canvas__conn-r {
      display: none;
    }

    .ai-office-agent-zone {
      border-bottom: 1px solid var(--line);
      padding-bottom: 16px;
    }
  }
  ```

- [ ] **Step 8: 기존 `.ai-office { display: grid ... }` 와 `.ai-office__main, .ai-office__side` 블록 제거**

  `globals.css`에서 아래 블록들을 삭제한다:
  - `.ai-office { display: grid; grid-template-columns: minmax(0, 1.4fr) ... }` (5413~5418줄)
  - `.ai-office__main, .ai-office__side { display: flex; flex-direction: column; gap: 20px; }` (5420~5425줄)

- [ ] **Step 9: 커밋**

  ```bash
  git add apps/hub/app/globals.css
  git commit -m "style: ai-office 3-zone 레이아웃 + health strip + order rail + ticker + inspector overlay CSS"
  ```

---

## Task 2: CSS — 애니메이션 키프레임

**Files:**
- Modify: `apps/hub/app/globals.css` (기존 `@keyframes` 섹션 또는 파일 끝에 추가)

- [ ] **Step 1: 키프레임 추가**

  `globals.css` 파일 끝 (또는 기존 `@keyframes` 블록 근처)에 아래를 추가한다:

  ```css
  /* ── AI Office Animations ─────────────────────────────────────── */

  @keyframes rim-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(82, 116, 168, 0.5);
    }
    50% {
      box-shadow: 0 0 0 5px rgba(82, 116, 168, 0);
    }
  }

  @keyframes rim-pulse-danger {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(200, 60, 60, 0.6);
    }
    50% {
      box-shadow: 0 0 0 5px rgba(200, 60, 60, 0);
    }
  }

  @keyframes flow-dot {
    0%   { top: -8px; opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { top: calc(100% + 8px); opacity: 0; }
  }

  @keyframes ticker-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  /* Agent cell — rim pulse on running state */
  .ai-office__agent-cell[data-status="running"] {
    animation: rim-pulse 2s ease-in-out infinite;
    border-color: rgba(82, 116, 168, 0.5);
  }

  .ai-office__agent-cell[data-status="error"],
  .ai-office__agent-cell[data-status="stalled"] {
    animation: rim-pulse-danger 1.4s ease-in-out infinite;
    border-color: rgba(200, 60, 60, 0.4);
  }

  .ai-office__agent-cell[data-status="working"] {
    animation: rim-pulse 2.4s ease-in-out infinite;
    border-color: rgba(82, 116, 168, 0.3);
  }
  ```

- [ ] **Step 2: 커밋**

  ```bash
  git add apps/hub/app/globals.css
  git commit -m "style: rim-pulse, flow-dot, ticker-scroll 애니메이션 키프레임 추가"
  ```

---

## Task 3: 데이터 — `getAiOfficePageData()` 확장

**Files:**
- Modify: `apps/hub/lib/server-data.js` — `getAiOfficePageData()` 함수 (4717번째 줄 근처)

- [ ] **Step 1: `buildAiOfficeSourceNodes` 헬퍼 함수 추가**

  `server-data.js`에서 `getAiOfficePageData` 함수 바로 위에 아래 헬퍼를 추가한다:

  ```js
  // Engine에 고정된 webhook 라우트 소스 목록
  const ENGINE_WEBHOOK_SOURCES = [
    { id: "telegram", label: "Telegram", type: "webhook" },
    { id: "project-generic", label: "Project Webhook", type: "webhook" },
    { id: "openclaw", label: "OpenClaw", type: "webhook" },
    { id: "moltbot", label: "Moltbot", type: "webhook" },
  ];

  function buildAiOfficeSourceNodes({ connections, automationRuns }) {
    const recentSources = new Set(
      (automationRuns || [])
        .map((r) => r.source || r.provider || null)
        .filter(Boolean)
    );

    // integration_connections에서 노드 생성
    const connectionNodes = (connections || []).map((c) => ({
      id: c.id,
      label: c.provider.charAt(0).toUpperCase() + c.provider.slice(1),
      type: "integration",
      status: c.status === "connected" ? "connected" : c.status === "error" ? "error" : "idle",
      lastEventAt: c.last_synced_at ? formatRelativeTime(c.last_synced_at) : "미연결",
    }));

    // engine 고정 webhook 소스
    const webhookNodes = ENGINE_WEBHOOK_SOURCES.map((s) => ({
      id: s.id,
      label: s.label,
      type: s.type,
      status: recentSources.has(s.id) ? "connected" : "idle",
      lastEventAt: recentSources.has(s.id) ? "최근 활성" : "대기",
    }));

    // 중복 방지: integration_connections에 이미 있는 provider는 제외
    const connectionLabels = new Set(connectionNodes.map((n) => n.label.toLowerCase()));
    const filteredWebhooks = webhookNodes.filter(
      (n) => !connectionLabels.has(n.label.toLowerCase())
    );

    return [...connectionNodes, ...filteredWebhooks];
  }

  function buildAiOfficeFlowConnections({ sourceNodes, agents, automationRuns }) {
    const connections = [];

    // 최근 automation_runs에서 source → agent 연결 추론
    const recentRuns = (automationRuns || []).slice(0, 8);
    const hasRecentRun = recentRuns.length > 0;
    const hasRecentError = recentRuns.some((r) => r.status === "failure");

    // Source → Engine Agent 연결
    sourceNodes.forEach((node) => {
      const status = node.status === "connected"
        ? hasRecentError ? "error" : "active"
        : "idle";
      connections.push({ from: node.id, to: "engine", status });
    });

    // Agent → Order Rail 연결 (에이전트가 활성 오더가 있으면 active)
    agents.forEach((agent) => {
      const status = agent.assignedCount > 0 ? "active" : "idle";
      connections.push({ from: agent.id, to: "order-rail", status });
    });

    return connections;
  }
  ```

  > **주의:** `formatRelativeTime`이 server-data.js에 이미 존재하는지 확인한다. 없으면 아래처럼 간단히 추가:
  > ```js
  > function formatRelativeTime(isoString) {
  >   if (!isoString) return "—";
  >   const diff = Date.now() - new Date(isoString).getTime();
  >   const mins = Math.floor(diff / 60000);
  >   if (mins < 1) return "방금";
  >   if (mins < 60) return `${mins}분 전`;
  >   const hrs = Math.floor(mins / 60);
  >   if (hrs < 24) return `${hrs}시간 전`;
  >   return `${Math.floor(hrs / 24)}일 전`;
  > }
  > ```
  > `formatRelativeTime`이 이미 있으면 중복 정의하지 않는다.

- [ ] **Step 2: `getAiOfficePageData()` Promise.all에 integration_connections 추가**

  기존:
  ```js
  export async function getAiOfficePageData() {
    const [
      aiData,
      messages,
      councilTurns,
      orders,
      automationRuns,
      projectUpdates,
      memos,
      errorLogs,
      decisions,
    ] = await Promise.all([
      getAiConsolePageData(),
      fetchRows("ai_messages", { limit: 12, order: "created_at.desc" }),
      fetchRows("ai_council_turns", { limit: 12, order: "created_at.desc" }),
      fetchRows("ai_orders", { limit: 12, order: "updated_at.desc" }),
      fetchRows("automation_runs", { limit: 8, order: "created_at.desc" }),
      fetchRows("project_updates", { limit: 6, order: "happened_at.desc" }),
      fetchRows("memos", { limit: 4, order: "created_at.desc" }),
      fetchRows("error_logs", {
        limit: 4,
        order: "timestamp.desc",
        filters: [["resolved", "eq.false"]],
      }),
      fetchRows("decisions", { limit: 4, order: "decided_at.desc" }),
    ]);
  ```

  교체:
  ```js
  export async function getAiOfficePageData() {
    const [
      aiData,
      messages,
      councilTurns,
      orders,
      automationRuns,
      projectUpdates,
      memos,
      errorLogs,
      decisions,
      integrationConnections,
    ] = await Promise.all([
      getAiConsolePageData(),
      fetchRows("ai_messages", { limit: 12, order: "created_at.desc" }),
      fetchRows("ai_council_turns", { limit: 12, order: "created_at.desc" }),
      fetchRows("ai_orders", { limit: 12, order: "updated_at.desc" }),
      fetchRows("automation_runs", { limit: 8, order: "created_at.desc" }),
      fetchRows("project_updates", { limit: 6, order: "happened_at.desc" }),
      fetchRows("memos", { limit: 4, order: "created_at.desc" }),
      fetchRows("error_logs", {
        limit: 4,
        order: "timestamp.desc",
        filters: [["resolved", "eq.false"]],
      }),
      fetchRows("decisions", { limit: 4, order: "decided_at.desc" }),
      fetchRows("integration_connections", { limit: 12, order: "created_at.desc" }),
    ]);
  ```

- [ ] **Step 3: 반환 shape에 `sourceNodes`, `flowConnections` 추가**

  기존 `return { ... }` 블록에서:
  ```js
  return {
    commandStrip: buildAiOfficeCommandStrip({ ... }),
    agents,
    orderRail,
    activityTicker,
    memoryLane: buildAiOfficeMemoryLane({ memos, errorLogs, decisions }),
    chatThreads: aiData.chatThreads,
    councilSessions: aiData.councilSessions,
    operatingPulse: aiData.operatingPulse,
  };
  ```

  교체:
  ```js
  const sourceNodes = buildAiOfficeSourceNodes({
    connections: integrationConnections,
    automationRuns,
  });

  return {
    commandStrip: buildAiOfficeCommandStrip({
      agents,
      openOrders: aiData.openOrders,
      operatingPulse: aiData.operatingPulse,
      activityTicker,
    }),
    agents,
    orderRail,
    activityTicker,
    memoryLane: buildAiOfficeMemoryLane({ memos, errorLogs, decisions }),
    chatThreads: aiData.chatThreads,
    councilSessions: aiData.councilSessions,
    operatingPulse: aiData.operatingPulse,
    sourceNodes,
    flowConnections: buildAiOfficeFlowConnections({ sourceNodes, agents, automationRuns }),
  };
  ```

- [ ] **Step 4: 빌드 확인**

  ```bash
  cd apps/hub && npx tsc --noEmit 2>&1 | head -20
  ```

  에러가 없으면 다음 단계.

- [ ] **Step 5: 커밋**

  ```bash
  git add apps/hub/lib/server-data.js
  git commit -m "feat(data): getAiOfficePageData에 sourceNodes, flowConnections 추가"
  ```

---

## Task 4: `AiOfficeScene` 재작성 — Health Strip + Canvas 껍데기

**Files:**
- Modify: `apps/hub/components/dashboard/ai-office-scene.jsx` (전체 재작성)

- [ ] **Step 1: 파일 상단 — imports + 유틸 함수 유지**

  기존 파일에서 아래 함수들은 **그대로 유지**한다 (삭제 금지):
  - `matchesAgentTarget()`
  - `getAgentTone()`
  - `buildChatHref()`
  - `buildCouncilHref()`
  - `buildOrderHref()`
  - `normalizeTargetLabelToId()`
  - `TARGET_ROTATION`

  파일 최상단 import에 아래를 추가한다:
  ```js
  import { useEffect, useCallback } from "react";
  import { useRouter } from "next/navigation";
  ```

- [ ] **Step 2: `buildOrderRail()` 함수 유지**

  기존 `buildOrderRail(orders)` 함수는 그대로 유지한다.

- [ ] **Step 3: `AiOfficeHealthStrip` 컴포넌트 추가**

  기존 `AiOfficeScene` export 바로 위에 추가:

  ```jsx
  function AiOfficeHealthStrip({ commandStrip, operatingPulse }) {
    const engineStatus = operatingPulse?.engineStatus || "unknown";
    const runningCount = operatingPulse?.metrics?.runningCount ?? 0;
    const attentionCount = operatingPulse?.metrics?.attentionCount ?? 0;
    const lastSync = operatingPulse?.lastSyncLabel || "—";

    const engineDotStatus = engineStatus === "ok" ? "ok" : engineStatus === "degraded" ? "warn" : "error";

    return (
      <div className="ai-office-health-strip" aria-label="시스템 상태 요약">
        <div className="ai-office-health-strip__item">
          <span className="ai-office-health-strip__dot" data-status={engineDotStatus} />
          <span>Engine <strong>{engineStatus}</strong></span>
        </div>
        <div className="ai-office-health-strip__item">
          <span>실행 중 <strong>{runningCount}</strong></span>
        </div>
        {attentionCount > 0 && (
          <div className="ai-office-health-strip__item">
            <span className="ai-office-health-strip__dot" data-status="warn" />
            <span>주의 <strong>{attentionCount}</strong></span>
          </div>
        )}
        <div className="ai-office-health-strip__item" style={{ marginLeft: "auto" }}>
          <span>마지막 갱신 <strong>{lastSync}</strong></span>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: `AiOfficeConnector` 컴포넌트 추가**

  ```jsx
  function AiOfficeConnector({ connections, fromIds, toId }) {
    const isActive = connections.some(
      (c) => fromIds.includes(c.from) && c.to === toId && c.status === "active"
    );
    const isError = connections.some(
      (c) => fromIds.includes(c.from) && c.to === toId && c.status === "error"
    );
    const lineStatus = isError ? "error" : isActive ? "true" : "false";

    return (
      <div className="ai-office-conn">
        <div className="ai-office-conn__line" data-active={lineStatus} />
      </div>
    );
  }
  ```

- [ ] **Step 5: 커밋**

  ```bash
  git add apps/hub/components/dashboard/ai-office-scene.jsx
  git commit -m "feat(ui): AiOfficeHealthStrip, AiOfficeConnector 컴포넌트 추가"
  ```

---

## Task 5: Source Zone + Agent Zone 컴포넌트

**Files:**
- Modify: `apps/hub/components/dashboard/ai-office-scene.jsx`

- [ ] **Step 1: `AiOfficeSourceZone` 컴포넌트 추가**

  ```jsx
  function AiOfficeSourceZone({ sourceNodes }) {
    if (!sourceNodes?.length) return null;

    return (
      <div className="ai-office-source">
        <p className="ai-office-source__label">Sources</p>
        {sourceNodes.map((node) => (
          <div key={node.id} className="ai-office-node" data-status={node.status}>
            <span className="ai-office-node__rim" data-status={node.status} />
            <div className="ai-office-node__body">
              <p className="ai-office-node__name">{node.label}</p>
              <p className="ai-office-node__meta">{node.lastEventAt}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 2: `AiOfficeAgentZone` 컴포넌트 추가**

  기존 agent-cell 마크업을 새 컴포넌트로 추출 + `data-status` 추가:

  ```jsx
  function AiOfficeAgentZone({ agents, selectedAgentId, onSelectAgent }) {
    return (
      <div className="ai-office-agent-zone">
        <p className="ai-office-source__label">Agents</p>
        <div className="ai-office__agent-grid">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="ai-office__agent-cell"
              data-active={agent.id === selectedAgentId ? "true" : "false"}
              data-status={agent.status}
              onClick={() => onSelectAgent(agent.id)}
            >
              <div className="ai-office__agent-head">
                <div>
                  <p className="ai-office__agent-name">{agent.name}</p>
                  <p className="ai-office__agent-role">{agent.role}</p>
                </div>
                <span className="legend-chip" data-tone={getAgentTone(agent.status)}>
                  {agent.status}
                </span>
              </div>

              <dl className="ai-office__agent-meta">
                <div>
                  <dt>Focus</dt>
                  <dd>{agent.focus}</dd>
                </div>
                <div>
                  <dt>Order</dt>
                  <dd>{agent.activeOrder?.title || "직접 배정된 오더 없음"}</dd>
                </div>
              </dl>

              <div className="ai-office__agent-stats">
                <span>{agent.assignedCount} orders</span>
                <span>{agent.threadCount} threads</span>
                <span>{agent.councilCount} councils</span>
              </div>

              <p className="ai-office__agent-foot">최근 · {agent.recentAction}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: 커밋**

  ```bash
  git add apps/hub/components/dashboard/ai-office-scene.jsx
  git commit -m "feat(ui): AiOfficeSourceZone, AiOfficeAgentZone 컴포넌트 추가"
  ```

---

## Task 6: Order Rail (세로 레인) 컴포넌트

**Files:**
- Modify: `apps/hub/components/dashboard/ai-office-scene.jsx`

- [ ] **Step 1: `AiOfficeOrderRail` 컴포넌트 추가**

  기존 order rail 마크업을 새 CSS 클래스로 교체:

  ```jsx
  const LANE_TONE_MAP = {
    queued: "muted",
    running: "blue",
    review: "warning",
    done: "green",
  };

  function AiOfficeOrderRail({ orderRail, onReassign, reassigningOrderId, connections }) {
    return (
      <div className="ai-office-order">
        <p className="ai-office-order__label">Orders</p>
        {orderRail.map((lane) => (
          <div key={lane.id} className="ai-office-lane">
            <div className="ai-office-lane__head">
              <span className="ai-office-lane__title">{lane.label}</span>
              <span className="legend-chip" data-tone={LANE_TONE_MAP[lane.id] || "muted"}>
                {lane.items.length}
              </span>
            </div>
            <div className="ai-office-lane__body">
              {lane.items.length ? (
                lane.items.map((item) => (
                  <div key={item.id} className="ai-office-order-token">
                    <div>
                      <p className="ai-office-order-token__title">{item.title}</p>
                      <p className="ai-office-order-token__meta">
                        {item.target} · {item.priority} · {item.due}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost"
                      style={{ fontSize: "11px", padding: "4px 8px" }}
                      onClick={() => onReassign(item)}
                      disabled={reassigningOrderId === item.id}
                    >
                      {reassigningOrderId === item.id ? "..." : "재배정"}
                    </button>
                  </div>
                ))
              ) : (
                <p className="ai-office-lane__empty">비어 있음</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 2: 커밋**

  ```bash
  git add apps/hub/components/dashboard/ai-office-scene.jsx
  git commit -m "feat(ui): AiOfficeOrderRail 세로 레인 컴포넌트 추가"
  ```

---

## Task 7: Focus Inspector overlay 컴포넌트

**Files:**
- Modify: `apps/hub/components/dashboard/ai-office-scene.jsx`

- [ ] **Step 1: `AiOfficeFocusInspector` 컴포넌트 추가**

  기존 focus 패널 마크업을 overlay 컴포넌트로 교체:

  ```jsx
  function AiOfficeFocusInspector({
    agent,
    relatedOrders,
    relatedThreads,
    relatedSessions,
    chatHref,
    councilHref,
    orderHref,
    onClose,
  }) {
    // ESC 키 닫기
    useEffect(() => {
      function handleKey(e) {
        if (e.key === "Escape") onClose();
      }
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }, [onClose]);

    if (!agent) return null;

    return (
      <div
        className="ai-office-inspector-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-label={`${agent.name} focus inspector`}
      >
        <div className="ai-office-inspector">
          <div className="ai-office-inspector__head">
            <div>
              <p className="section-kicker">{agent.role}</p>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{agent.name}</h3>
            </div>
            <button
              type="button"
              className="ai-office-inspector__close"
              onClick={onClose}
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          <div className="detail-stack">
            <div><dt>Focus</dt><dd>{agent.focus}</dd></div>
            <div><dt>Active order</dt><dd>{agent.activeOrder?.title || "없음"}</dd></div>
            <div><dt>Latency / Load</dt><dd>{agent.latency} · {agent.load}</dd></div>
          </div>

          <div className="template-grid">
            <div className="template-row">
              <div>
                <strong>관련 오더</strong>
                <p>{relatedOrders.length ? relatedOrders.map((o) => o.title).join(" · ") : "없음"}</p>
              </div>
              <span className="legend-chip" data-tone="blue">{relatedOrders.length}</span>
            </div>
            <div className="template-row">
              <div>
                <strong>관련 스레드</strong>
                <p>{relatedThreads.length ? relatedThreads[0].title : "없음"}</p>
              </div>
              <span className="legend-chip" data-tone="muted">{relatedThreads.length}</span>
            </div>
            <div className="template-row">
              <div>
                <strong>관련 카운슬</strong>
                <p>{relatedSessions.length ? relatedSessions[0].topic : "없음"}</p>
              </div>
              <span className="legend-chip" data-tone="warning">{relatedSessions.length}</span>
            </div>
          </div>

          <div className="hero-actions">
            <Link className="button button-secondary" href={chatHref}>챗 초안 열기</Link>
            <Link className="button button-ghost" href={councilHref}>카운슬 초안</Link>
            <Link className="button button-ghost" href={orderHref}>오더 초안</Link>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: 커밋**

  ```bash
  git add apps/hub/components/dashboard/ai-office-scene.jsx
  git commit -m "feat(ui): AiOfficeFocusInspector overlay 컴포넌트 추가"
  ```

---

## Task 8: Activity Ticker + 30초 polling

**Files:**
- Modify: `apps/hub/components/dashboard/ai-office-scene.jsx`

- [ ] **Step 1: `AiOfficeActivityTicker` 컴포넌트 추가**

  ticker-scroll 애니메이션을 위해 아이템을 2번 반복해 seamless loop 구현:

  ```jsx
  function AiOfficeActivityTicker({ items }) {
    if (!items?.length) return null;

    // seamless scroll: 아이템을 2번 반복
    const doubled = [...items, ...items];

    return (
      <div className="ai-office-ticker" aria-label="최근 활동">
        <span className="ai-office-ticker__label">Live</span>
        <div className="ai-office-ticker__scroll">
          <div className="ai-office-ticker__track">
            {doubled.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="ai-office-ticker__item">
                <span className="legend-chip" data-tone={item.tone} style={{ fontSize: "10px" }}>
                  {item.time}
                </span>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: `useAiOfficePolling` 훅 추가**

  `AiOfficeScene` export 바로 위에 추가:

  ```jsx
  function useAiOfficePolling(intervalMs = 30000) {
    const router = useRouter();
    useEffect(() => {
      const id = setInterval(() => router.refresh(), intervalMs);
      return () => clearInterval(id);
    }, [router, intervalMs]);
  }
  ```

- [ ] **Step 3: 커밋**

  ```bash
  git add apps/hub/components/dashboard/ai-office-scene.jsx
  git commit -m "feat(ui): AiOfficeActivityTicker, useAiOfficePolling 추가"
  ```

---

## Task 9: `AiOfficeScene` 최종 조립

**Files:**
- Modify: `apps/hub/components/dashboard/ai-office-scene.jsx`

- [ ] **Step 1: 기존 `AiOfficeScene` export 함수 전체 교체**

  기존 `export function AiOfficeScene({ ... }) { ... }` 블록을 아래로 교체한다:

  ```jsx
  export function AiOfficeScene({
    commandStrip,
    agents,
    orderRail,
    activityTicker,
    chatThreads,
    councilSessions,
    operatingPulse,
    sourceNodes = [],
    flowConnections = [],
  }) {
    useAiOfficePolling(30000);

    const [officeOrderRail, setOfficeOrderRail] = useState(orderRail);
    const [selectedAgentId, setSelectedAgentId] = useState(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [reassigningOrderId, setReassigningOrderId] = useState(null);

    const activeAgent = selectedAgentId
      ? agents.find((a) => a.id === selectedAgentId) || null
      : null;

    const flattenedOrders = officeOrderRail.flatMap((lane) => lane.items || []);

    const relatedOrders = activeAgent
      ? flattenedOrders.filter((o) => matchesAgentTarget(o.target, activeAgent.name))
      : [];
    const relatedThreads = activeAgent
      ? chatThreads.filter((t) => matchesAgentTarget(t.target, activeAgent.name))
      : [];
    const relatedSessions = activeAgent
      ? councilSessions.filter((s) => s.members.includes(activeAgent.name))
      : [];

    const activeAgentChatHref = activeAgent
      ? buildChatHref({
          target: activeAgent.name === "Engine" ? "engine" : activeAgent.name.toLowerCase(),
          title: `${activeAgent.name} focus handoff`,
          draft: `${activeAgent.name} 현재 focus: ${activeAgent.focus}\n다음 한 단계 제안 부탁`,
        })
      : "/dashboard/ai/chat";

    const activeAgentCouncilHref = activeAgent
      ? buildCouncilHref({
          topic: `${activeAgent.name} focus 검토`,
          context: `${activeAgent.name}의 현재 focus: "${activeAgent.focus}"`,
          members: activeAgent.name === "Engine" ? "engine,codex" : "claude,codex",
        })
      : "/dashboard/ai/council";

    const activeAgentOrderHref = activeAgent
      ? buildOrderHref({
          title: `${activeAgent.name} follow-up`,
          note: `${activeAgent.name} focus "${activeAgent.focus}" 기준 후속 작업`,
          target: activeAgent.name === "Engine" ? "engine" : activeAgent.name.toLowerCase(),
          lane: activeAgent.name === "Engine" ? "Automations" : "Hub UX",
        })
      : "/dashboard/ai/orders";

    const handleSelectAgent = useCallback((id) => {
      setSelectedAgentId(id);
      setInspectorOpen(true);
    }, []);

    const handleCloseInspector = useCallback(() => {
      setInspectorOpen(false);
    }, []);

    async function handleReassign(order) {
      const currentTargetId = normalizeTargetLabelToId(order.target);
      const currentIndex = TARGET_ROTATION.findIndex((t) => t.id === currentTargetId);
      const nextTarget = TARGET_ROTATION[(currentIndex === -1 ? 0 : currentIndex + 1) % TARGET_ROTATION.length];

      setReassigningOrderId(order.id);
      try {
        const response = await fetch("/api/ai/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "reassign",
            id: order.id,
            title: order.title,
            target: nextTarget.id,
            priority: order.priority,
            lane: order.lane,
            due: order.due,
            note: order.note,
            status: order.status === "큐 대기" ? "running" : order.status,
          }),
        });
        const data = await response.json();
        if (!response.ok || data.status === "error") throw new Error(data.error || "재배정 실패");
        const updated = flattenedOrders.map((o) => (o.id === order.id ? data.order : o));
        setOfficeOrderRail(buildOrderRail(updated));
      } catch (e) {
        console.error(e);
      } finally {
        setReassigningOrderId(null);
      }
    }

    const sourceIds = sourceNodes.map((n) => n.id);
    const agentIds = agents.map((a) => a.id);

    return (
      <>
        <AiOfficeHealthStrip commandStrip={commandStrip} operatingPulse={operatingPulse} />

        <div className="ai-office-canvas">
          {/* Source Zone */}
          <div className="ai-office-canvas__source">
            <AiOfficeSourceZone sourceNodes={sourceNodes} />
          </div>

          {/* Connector: Source → Agent */}
          <div className="ai-office-canvas__conn-l">
            <AiOfficeConnector connections={flowConnections} fromIds={sourceIds} toId="engine" />
          </div>

          {/* Agent Zone */}
          <div className="ai-office-canvas__agent">
            <AiOfficeAgentZone
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleSelectAgent}
            />
          </div>

          {/* Connector: Agent → Order */}
          <div className="ai-office-canvas__conn-r">
            <AiOfficeConnector connections={flowConnections} fromIds={agentIds} toId="order-rail" />
          </div>

          {/* Order Rail */}
          <div className="ai-office-canvas__order">
            <AiOfficeOrderRail
              orderRail={officeOrderRail}
              onReassign={handleReassign}
              reassigningOrderId={reassigningOrderId}
              connections={flowConnections}
            />
          </div>
        </div>

        <AiOfficeActivityTicker items={activityTicker} />

        {inspectorOpen && activeAgent && (
          <AiOfficeFocusInspector
            agent={activeAgent}
            relatedOrders={relatedOrders}
            relatedThreads={relatedThreads}
            relatedSessions={relatedSessions}
            chatHref={activeAgentChatHref}
            councilHref={activeAgentCouncilHref}
            orderHref={activeAgentOrderHref}
            onClose={handleCloseInspector}
          />
        )}
      </>
    );
  }
  ```

- [ ] **Step 2: 빌드 & 브라우저 확인**

  ```bash
  cd /Users/clmagi/Desktop/Projects/moonlight_proj
  pnpm --filter hub dev
  ```

  브라우저에서 `http://localhost:3000/dashboard/ai/office` 열고 확인:
  - [ ] Health Strip이 최상단에 보인다
  - [ ] 3-zone 레이아웃이 좌→우로 펼쳐진다 (Source / Agent / Order)
  - [ ] Agent 셀에 `data-status` 에 따라 rim-pulse 애니메이션이 보인다
  - [ ] Agent 셀 클릭 → Focus Inspector overlay가 열린다
  - [ ] ESC 또는 배경 클릭 → overlay가 닫힌다
  - [ ] Activity Ticker가 하단에 스크롤 애니메이션으로 보인다
  - [ ] 모바일 뷰포트(< 768px): Source Zone 숨겨짐, Agent/Order 수직 배치

- [ ] **Step 3: 최종 커밋**

  ```bash
  git add apps/hub/components/dashboard/ai-office-scene.jsx
  git commit -m "feat: ai-office mission control 상황실 — 3-zone canvas, health strip, inspector overlay, ticker, rim-pulse 완성"
  ```

---

## Self-Review

**스펙 커버리지 확인:**

| 스펙 요구사항 | 구현 Task |
|---|---|
| 3-zone 가로 흐름 레이아웃 | Task 1 (CSS), Task 9 (조립) |
| Health Strip 항상 노출 | Task 1 (CSS), Task 4 |
| Source Zone (`integration_connections`) | Task 3 (데이터), Task 5 |
| Agent Zone rim-pulse 애니메이션 | Task 2 (CSS), Task 5 |
| Order Rail 세로 레인 | Task 1 (CSS), Task 6 |
| Focus Inspector → overlay 전환 | Task 1 (CSS), Task 7 |
| Activity Ticker 하단 고정 스트립 | Task 1 (CSS), Task 8 |
| 30초 polling | Task 8 |
| flowConnections 연결선 | Task 3 (데이터), Task 4 |
| 모바일 반응형 | Task 1 (CSS) |
| WebSocket/라이브러리 없음 | CSS + polling 전용 |

**누락 없음. Placeholder 없음. 타입 일관성 확인:**
- `flowConnections` shape (`{ from, to, status }`) — Task 3에서 정의, Task 4·9에서 그대로 사용
- `sourceNodes` shape (`{ id, label, type, status, lastEventAt }`) — Task 3에서 정의, Task 5에서 그대로 사용
- `buildOrderRail()` — 기존 함수 그대로 유지, Task 6에서 그대로 사용
