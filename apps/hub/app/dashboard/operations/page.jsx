import Link from "next/link";
import { OperationsWorkbench } from "@/components/dashboard/operations-workbench";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { integrationCatalog } from "@/lib/dashboard-data";
import {
  countRows,
  fetchRows,
  formatTimestamp,
  getAiConsolePageData,
  getAutomationsPageData,
} from "@/lib/server-data";

function getAgentTone(status) {
  if (status === "ready" || status === "live") {
    return "green";
  }

  if (status === "working") {
    return "blue";
  }

  if (status === "stalled" || status === "error") {
    return "danger";
  }

  return "muted";
}

function getAutomationTone(status) {
  if (status === "success") {
    return "green";
  }

  if (status === "failure") {
    return "danger";
  }

  if (status === "ready") {
    return "blue";
  }

  if (status === "queued") {
    return "warning";
  }

  return "muted";
}

function getConnectionTone(status) {
  if (status === "connected" || status === "active") {
    return "green";
  }

  if (status === "ready") {
    return "blue";
  }

  if (status === "error" || status === "failed") {
    return "danger";
  }

  if (status === "supported via Google sync") {
    return "muted";
  }

  return "warning";
}

function buildFreshnessFromLabel(value, status = "") {
  const rawValue = String(value || "");
  const normalizedValue = rawValue.toLowerCase();
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus.includes("failure") || normalizedStatus.includes("error")) {
    return { label: "점검", tone: "danger" };
  }

  if (normalizedValue.includes("now") || rawValue.includes("방금")) {
    return { label: "방금", tone: "green" };
  }

  if (rawValue.includes("분 전") || normalizedValue.includes("min")) {
    return { label: "최근", tone: "blue" };
  }

  if (rawValue.includes("오늘") || normalizedValue.includes("today")) {
    return { label: "오늘", tone: "blue" };
  }

  if (
    normalizedStatus.includes("ready") ||
    normalizedStatus.includes("live") ||
    normalizedStatus.includes("success")
  ) {
    return { label: "정상", tone: "green" };
  }

  if (normalizedStatus.includes("working")) {
    return { label: "가동", tone: "blue" };
  }

  if (
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("planned") ||
    normalizedStatus.includes("queued")
  ) {
    return { label: "대기", tone: "warning" };
  }

  return { label: "관찰", tone: "muted" };
}

function buildFreshnessFromTimestamp(value, status = "") {
  const normalizedStatus = String(status || "").toLowerCase();

  if (!value) {
    if (normalizedStatus.includes("error") || normalizedStatus.includes("failed")) {
      return { label: "점검", tone: "danger" };
    }

    if (normalizedStatus.includes("connected")) {
      return { label: "상시", tone: "green" };
    }

    if (normalizedStatus.includes("active") || normalizedStatus.includes("ready")) {
      return { label: "준비", tone: "blue" };
    }

    if (
      normalizedStatus.includes("pending") ||
      normalizedStatus.includes("planned") ||
      normalizedStatus.includes("supported")
    ) {
      return { label: "설정", tone: "warning" };
    }

    return { label: "관찰", tone: "muted" };
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return { label: "관찰", tone: "warning" };
  }

  const minutes = (Date.now() - parsed) / 60000;

  if (minutes < 30) {
    return { label: "방금", tone: "green" };
  }

  if (minutes < 360) {
    return { label: "최근", tone: "blue" };
  }

  if (minutes < 1440) {
    return { label: "오늘", tone: "blue" };
  }

  if (minutes < 4320) {
    return { label: "관찰", tone: "warning" };
  }

  return { label: "지연", tone: "warning" };
}

function normalizeProvider(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCatalogEntry(provider) {
  const normalized = normalizeProvider(provider);

  if (!normalized) {
    return null;
  }

  return (
    integrationCatalog.find((item) => normalizeProvider(item.provider) === normalized) ||
    integrationCatalog.find((item) => normalized.includes(normalizeProvider(item.provider))) ||
    integrationCatalog.find((item) => normalizeProvider(item.provider).includes(normalized)) ||
    null
  );
}

function buildConnectionRows(connections) {
  if (!connections?.length) {
    return integrationCatalog.slice(0, 4).map((item) => {
      const freshness = buildFreshnessFromTimestamp(null, item.status);

      return {
        id: `connection-${normalizeProvider(item.provider)}`,
        title: item.provider,
        lane: item.lane,
        status: item.status,
        tone: item.tone,
        detail: item.detail,
        nextAction: item.nextAction,
        freshnessLabel: freshness.label,
        freshnessTone: freshness.tone,
      };
    });
  }

  return connections.slice(0, 4).map((item) => {
    const catalog = resolveCatalogEntry(item.provider);
    const status = item.status || catalog?.status || "pending";
    const freshness = buildFreshnessFromTimestamp(item.last_synced_at, status);

    return {
      id: `connection-${item.id || normalizeProvider(item.provider)}`,
      title: item.provider || catalog?.provider || "Integration",
      lane: catalog?.lane || "Connected system",
      status,
      tone: getConnectionTone(status),
      detail: item.last_synced_at
        ? `Last synced ${formatTimestamp(item.last_synced_at)}`
        : catalog?.detail || "No successful sync recorded yet.",
      nextAction: catalog?.nextAction || "Review the mapping and run one control sync.",
      freshnessLabel: freshness.label,
      freshnessTone: freshness.tone,
    };
  });
}

function buildAttentionItems({
  reviewCount,
  failedRunCount,
  errorConnectionCount,
  pendingConnectionCount,
  unreadThreadCount,
  activeCouncilCount,
}) {
  const items = [];

  if (reviewCount > 0) {
    items.push({
      id: "attention-review-orders",
      title: "리뷰 대기 오더",
      detail: `${reviewCount}개의 오더가 결과를 내놨고, 최종 승인이나 다음 배정만 기다리고 있습니다.`,
      href: "/dashboard/ai/orders",
      action: "Orders",
      tone: "warning",
      scope: "AI Orders",
      statusLabel: "Review",
      freshnessLabel: "즉시",
      freshnessTone: "warning",
      nextStep: "결과를 승인하거나 재배정해서 디스패치 흐름을 다시 움직입니다.",
      links: [
        { href: "/dashboard/ai/orders", label: "Orders 열기", variant: "primary" },
        { href: "/dashboard/ai", label: "AI overview", variant: "ghost" },
      ],
    });
  }

  if (failedRunCount > 0) {
    items.push({
      id: "attention-failed-runs",
      title: "실패한 자동화 런",
      detail: `${failedRunCount}개의 런이 재시도 또는 원인 확인이 필요합니다.`,
      href: "/dashboard/automations/runs",
      action: "Runs",
      tone: "danger",
      scope: "Automation Runs",
      statusLabel: "Failure",
      freshnessLabel: "점검",
      freshnessTone: "danger",
      nextStep: "깨진 단계부터 확인하고 재시도 또는 우회 경로를 정합니다.",
      links: [
        { href: "/dashboard/automations/runs", label: "Runs 열기", variant: "primary" },
        { href: "/dashboard/automations/webhooks", label: "Webhooks", variant: "ghost" },
      ],
    });
  }

  if (errorConnectionCount > 0) {
    items.push({
      id: "attention-connection-errors",
      title: "연결 에러",
      detail: `${errorConnectionCount}개의 integration connection이 오류 상태입니다.`,
      href: "/dashboard/automations/integrations",
      action: "Integrations",
      tone: "danger",
      scope: "Integrations",
      statusLabel: "Error",
      freshnessLabel: "점검",
      freshnessTone: "danger",
      nextStep: "권한, 시크릿, 마지막 sync 결과를 확인해 연결을 다시 세웁니다.",
      links: [
        { href: "/dashboard/automations/integrations", label: "Integrations 열기", variant: "primary" },
        { href: "/dashboard/automations/runs", label: "Runs", variant: "ghost" },
      ],
    });
  }

  if (pendingConnectionCount > 0) {
    items.push({
      id: "attention-pending-connections",
      title: "셋업 대기 연결",
      detail: `${pendingConnectionCount}개의 연결이 매핑 또는 권한 설정만 남겨두고 멈춰 있습니다.`,
      href: "/dashboard/automations/integrations",
      action: "Setup",
      tone: "warning",
      scope: "Integration Setup",
      statusLabel: "Setup",
      freshnessLabel: "대기",
      freshnessTone: "warning",
      nextStep: "먼저 한 provider만 연결해서 sync contract를 고정하는 편이 가장 빠릅니다.",
      links: [
        { href: "/dashboard/automations/integrations", label: "설정 마무리", variant: "primary" },
        { href: "/dashboard/automations/webhooks", label: "Webhooks", variant: "ghost" },
      ],
    });
  }

  if (unreadThreadCount > 0) {
    items.push({
      id: "attention-unread-chat",
      title: "읽지 않은 AI 대화",
      detail: `${unreadThreadCount}개의 새 메시지가 스레드 레일에 쌓여 있습니다.`,
      href: "/dashboard/ai/chat",
      action: "Chat",
      tone: "blue",
      scope: "AI Chat",
      statusLabel: "Unread",
      freshnessLabel: "최근",
      freshnessTone: "blue",
      nextStep: "먼저 가장 최근 스레드 하나만 열어도 전체 맥락 회복 속도가 빨라집니다.",
      links: [
        { href: "/dashboard/ai/chat", label: "Chat 열기", variant: "primary" },
        { href: "/dashboard/ai/orders", label: "Orders", variant: "ghost" },
      ],
    });
  }

  if (activeCouncilCount > 0) {
    items.push({
      id: "attention-active-council",
      title: "수렴 중인 카운슬",
      detail: `${activeCouncilCount}개의 주제가 아직 결정으로 닫히지 않았습니다.`,
      href: "/dashboard/ai/council",
      action: "Council",
      tone: "muted",
      scope: "AI Council",
      statusLabel: "Debate",
      freshnessLabel: "관찰",
      freshnessTone: "muted",
      nextStep: "결정이 필요한 세션 하나를 닫아 오더로 넘기면 운영 흐름이 훨씬 빨라집니다.",
      links: [
        { href: "/dashboard/ai/council", label: "Council 열기", variant: "primary" },
        { href: "/dashboard/ai/orders", label: "Orders", variant: "ghost" },
      ],
    });
  }

  if (items.length) {
    return items;
  }

  return [
    {
      id: "attention-clean-board",
      title: "보드가 깨끗합니다",
      detail: "지금은 급한 실패보다 다음 액션을 선택하는 쪽에 집중하면 됩니다.",
      href: "/dashboard/command-center",
      action: "Command",
      tone: "green",
      scope: "Command Center",
      statusLabel: "Clear",
      freshnessLabel: "정상",
      freshnessTone: "green",
      nextStep: "새 오더를 넣거나 다음 우선순위를 커맨드 센터에서 바로 선택하면 됩니다.",
      links: [
        { href: "/dashboard/command-center", label: "Command 열기", variant: "primary" },
        { href: "/dashboard/ai/orders", label: "Orders", variant: "ghost" },
      ],
    },
  ];
}

function buildQueueItems({ agents, openOrders, automationRuns, councilSessions, chatThreads }) {
  const items = [];

  agents
    .filter((agent) => agent.status === "working" || agent.status === "live" || agent.status === "ready")
    .slice(0, 2)
    .forEach((agent) => {
      const freshness = buildFreshnessFromLabel(agent.status, agent.status);

      items.push({
        id: `queue-agent-${agent.id}`,
        title: `${agent.name} · ${agent.focus}`,
        detail: `${agent.role} · ${agent.latency} · Load ${agent.load}`,
        tone: getAgentTone(agent.status),
        scope: "AI Agent",
        statusLabel: agent.status,
        freshnessLabel: freshness.label,
        freshnessTone: freshness.tone,
        nextStep: "새 작업을 얹기 전에 현재 load와 focus가 맞는지 한 번만 확인합니다.",
        href: "/dashboard/ai",
        links: [
          { href: "/dashboard/ai", label: "AI overview", variant: "primary" },
          { href: "/dashboard/ai/orders", label: "Orders", variant: "ghost" },
        ],
      });
    });

  openOrders
    .filter((order) => order.status !== "완료")
    .slice(0, 2)
    .forEach((order) => {
      const freshness =
        order.status === "리뷰 대기"
          ? { label: "즉시", tone: "warning" }
          : order.status === "실행 중"
            ? { label: "가동", tone: "blue" }
            : { label: "대기", tone: "muted" };

      items.push({
        id: `queue-order-${order.id}`,
        title: order.title,
        detail: `${order.lane} · ${order.target} · ${order.note}`,
        tone: order.tone,
        scope: "Open Order",
        statusLabel: order.status,
        freshnessLabel: freshness.label,
        freshnessTone: freshness.tone,
        nextStep:
          order.status === "리뷰 대기"
            ? "승인 또는 수정 지시를 내려 큐를 닫습니다."
            : order.status === "실행 중"
              ? "결과가 나올 때까지 로그와 에이전트 load만 가볍게 확인합니다."
              : "선행 작업이 끝나는 즉시 배정될 수 있게 타겟과 마감을 다시 봅니다.",
        href: "/dashboard/ai/orders",
        links: [
          { href: "/dashboard/ai/orders", label: "Orders 열기", variant: "primary" },
          { href: "/dashboard/ai/chat", label: "Chat", variant: "ghost" },
        ],
      });
    });

  automationRuns.slice(0, 2).forEach((run, index) => {
    const freshness = buildFreshnessFromLabel(run.time, run.status);

    items.push({
      id: `queue-run-${index}`,
      title: run.title,
      detail: run.detail,
      tone: getAutomationTone(run.status),
      scope: "Automation Run",
      statusLabel: run.status || run.time,
      freshnessLabel: freshness.label,
      freshnessTone: freshness.tone,
      nextStep:
        run.status === "failure"
          ? "실패 원인을 확인하고 재시도 또는 우회 경로를 정합니다."
          : "성공한 패턴이면 같은 입력 형식을 다음 런에도 재사용합니다.",
      href: "/dashboard/automations/runs",
      links: [
        { href: "/dashboard/automations/runs", label: "Runs 열기", variant: "primary" },
        { href: "/dashboard/automations/webhooks", label: "Webhooks", variant: "ghost" },
      ],
    });
  });

  const activeCouncil = councilSessions.find((session) => session.status !== "완료");
  if (activeCouncil) {
    const lastTurn = activeCouncil.turns[activeCouncil.turns.length - 1];

    items.push({
      id: `queue-council-${activeCouncil.id}`,
      title: activeCouncil.topic,
      detail: lastTurn?.body || "Active council needs a quick decision.",
      tone: activeCouncil.tone,
      scope: "Council Session",
      statusLabel: activeCouncil.status,
      freshnessLabel: "수렴 중",
      freshnessTone: activeCouncil.tone,
      nextStep: "결정된 내용은 바로 오더로 넘겨 실제 작업 단위로 고정합니다.",
      href: "/dashboard/ai/council",
      links: [
        { href: "/dashboard/ai/council", label: "Council 열기", variant: "primary" },
        { href: "/dashboard/ai/orders", label: "Orders", variant: "ghost" },
      ],
    });
  }

  const latestThread = chatThreads[0];
  if (latestThread) {
    const freshness = buildFreshnessFromLabel(latestThread.updated, latestThread.status);

    items.push({
      id: `queue-thread-${latestThread.id}`,
      title: latestThread.title,
      detail: `${latestThread.target} · ${latestThread.preview}`,
      tone: latestThread.unread > 0 ? "warning" : "muted",
      scope: "AI Chat",
      statusLabel: latestThread.unread > 0 ? `${latestThread.unread} new` : latestThread.updated,
      freshnessLabel: latestThread.unread > 0 ? "방금" : freshness.label,
      freshnessTone: latestThread.unread > 0 ? "warning" : freshness.tone,
      nextStep:
        latestThread.unread > 0
          ? "먼저 이 스레드를 읽고 필요한 요청을 오더로 넘깁니다."
          : "맥락을 이어받아 다음 질문이나 지시를 바로 던질 수 있습니다.",
      href: "/dashboard/ai/chat",
      links: [
        { href: "/dashboard/ai/chat", label: "Chat 열기", variant: "primary" },
        { href: "/dashboard/ai/orders", label: "Order로 이동", variant: "ghost" },
      ],
    });
  }

  return items.slice(0, 7);
}

export default async function OperationsPage() {
  const [
    { agents, chatThreads, councilSessions, openOrders, orderTemplates, osPulse },
    { automationRuns, webhookEndpoints },
    connections,
    syncRuns,
    connectedCount,
    pendingCount,
    errorCount,
  ] = await Promise.all([
    getAiConsolePageData(),
    getAutomationsPageData(),
    fetchRows("integration_connections", { limit: 6, order: "created_at.desc" }),
    fetchRows("sync_runs", { limit: 6, order: "started_at.desc" }),
    countRows("integration_connections", [["status", "eq.connected"]]),
    countRows("integration_connections", [["status", "eq.pending"]]),
    countRows("integration_connections", [["status", "eq.error"]]),
  ]);

  const connectionRows = buildConnectionRows(connections);
  const liveAgentCount = agents.filter(
    (agent) => agent.status === "ready" || agent.status === "live" || agent.status === "working",
  ).length;
  const runningOrderCount = openOrders.filter((order) => order.status === "실행 중").length;
  const reviewCount = openOrders.filter((order) => order.status === "리뷰 대기").length;
  const queuedCount = openOrders.filter((order) => order.status === "큐 대기").length;
  const unreadThreadCount = chatThreads.reduce((total, thread) => total + (thread.unread || 0), 0);
  const activeCouncilCount = councilSessions.filter((session) => session.status !== "완료").length;
  const failedRunCount = automationRuns.filter((run) => run.status === "failure").length;
  const successRunCount = automationRuns.filter((run) => run.status === "success").length;
  const liveRouteCount = webhookEndpoints.filter(
    (endpoint) => endpoint.status === "active" || endpoint.status === "ready",
  ).length;
  const liveConnectionCount =
    connectedCount ?? connectionRows.filter((item) => item.status === "connected").length;
  const pendingConnectionCount =
    pendingCount ??
    connectionRows.filter((item) => item.status === "pending" || item.status === "planned").length;
  const errorConnectionCount =
    errorCount ?? connectionRows.filter((item) => item.status === "error").length;
  const actionRequiredCount =
    reviewCount +
    failedRunCount +
    errorConnectionCount +
    pendingConnectionCount +
    (unreadThreadCount > 0 ? 1 : 0);

  const latestThread = chatThreads[0];
  const activeCouncil = councilSessions.find((session) => session.status !== "완료") || councilSessions[0];
  const latestRun = automationRuns[0];
  const latestSync = syncRuns?.[0];
  const attentionItems = buildAttentionItems({
    reviewCount,
    failedRunCount,
    errorConnectionCount,
    pendingConnectionCount,
    unreadThreadCount,
    activeCouncilCount,
  });
  const queueItems = buildQueueItems({
    agents,
    openOrders,
    automationRuns,
    councilSessions,
    chatThreads,
  });
  const latestOutputLabel =
    latestRun?.time ||
    (latestSync ? formatTimestamp(latestSync.finished_at || latestSync.started_at) : "Pending");
  const threadFreshness = latestThread
    ? buildFreshnessFromLabel(latestThread.updated, latestThread.status)
    : { label: "준비", tone: "muted" };
  const runFreshness = latestRun
    ? buildFreshnessFromLabel(latestRun.time, latestRun.status)
    : { label: "대기", tone: "muted" };
  const surfaceFreshness =
    errorConnectionCount > 0
      ? { label: "점검", tone: "danger" }
      : pendingConnectionCount > 0
        ? { label: "설정", tone: "warning" }
        : { label: "정상", tone: "green" };

  const quickActions = [
    {
      title: "최근 대화 이어서",
      detail: latestThread
        ? `${latestThread.target} · ${latestThread.preview}`
        : "가장 최근 스레드를 이어받아 바로 맥락을 복구합니다.",
      badge: latestThread?.unread > 0 ? `${latestThread.unread} new` : latestThread?.updated || "Ready",
      tone: latestThread?.unread > 0 ? "warning" : "blue",
      freshnessLabel: latestThread?.unread > 0 ? "방금" : threadFreshness.label,
      freshnessTone: latestThread?.unread > 0 ? "warning" : threadFreshness.tone,
      href: "/dashboard/ai/chat",
      action: "Chat 열기",
    },
    {
      title: "직접 오더 보내기",
      detail: `${runningOrderCount}개 실행 중 · ${reviewCount}개 리뷰 대기 · ${queuedCount}개 큐 대기. 가장 빠른 실행 단위를 바로 밀어 넣습니다.`,
      badge: `${openOrders.length} orders`,
      tone: "blue",
      freshnessLabel: reviewCount > 0 ? "즉시" : runningOrderCount > 0 ? "가동" : "대기",
      freshnessTone: reviewCount > 0 ? "warning" : runningOrderCount > 0 ? "blue" : "muted",
      href: "/dashboard/ai/orders",
      action: "Orders 열기",
    },
    {
      title: "실패 런 정리",
      detail: latestRun
        ? `${latestRun.title} · ${latestRun.detail}`
        : "최근 런과 실패 원인을 여기서 먼저 확인합니다.",
      badge: failedRunCount > 0 ? `${failedRunCount} failed` : `${successRunCount} clean`,
      tone: failedRunCount > 0 ? "danger" : "green",
      freshnessLabel: runFreshness.label,
      freshnessTone: runFreshness.tone,
      href: "/dashboard/automations/runs",
      action: failedRunCount > 0 ? "Failures 보기" : "Runs 보기",
    },
    {
      title: "연동과 웹훅 점검",
      detail: `${liveConnectionCount} connected · ${pendingConnectionCount} pending · ${liveRouteCount} routes visible.`,
      badge: "Surface",
      tone: pendingConnectionCount > 0 || errorConnectionCount > 0 ? "warning" : "green",
      freshnessLabel: surfaceFreshness.label,
      freshnessTone: surfaceFreshness.tone,
      href: "/dashboard/automations/integrations",
      action: "Connections 열기",
    },
  ];

  return (
    <div className="app-page">
      <section className="operator-header">
        <p className="operator-header__eyebrow">Operations Console</p>
        <h1>AI와 자동화를 한 화면에서 지휘</h1>
        <p>지금 뭐가 돌고 있고, 뭐가 막혔고, 무엇을 바로 눌러야 하는지를 첫 화면에서 정리하는 운영 콘솔입니다.</p>
      </section>

      <div className="operator-actions" aria-label="Operations primary actions">
        <Link className="button button-primary" href="/dashboard/ai/orders">
          새 오더
        </Link>
        <Link className="button button-secondary" href="/dashboard/automations/runs">
          런 보기
        </Link>
        <Link className="button button-secondary" href="/dashboard/automations/webhooks">
          웹훅 테스트
        </Link>
        <Link className="button button-ghost" href="/dashboard/command-center">
          커맨드 센터
        </Link>
      </div>

      <section className="signal-strip" aria-label="Operations signal strip">
        <article className="signal-strip__item">
          <span>Live agents</span>
          <strong>{`${liveAgentCount} / ${agents.length}`}</strong>
          <p>바로 배정 가능한 추론 레인.</p>
        </article>
        <article className="signal-strip__item">
          <span>Attention</span>
          <strong>{String(actionRequiredCount)}</strong>
          <p>지금 사람 손이 먼저 가야 하는 항목.</p>
        </article>
        <article className="signal-strip__item">
          <span>Routes + Connections</span>
          <strong>{`${liveRouteCount} + ${liveConnectionCount}`}</strong>
          <p>현재 열려 있는 인테이크와 연결된 시스템.</p>
        </article>
        <article className="signal-strip__item">
          <span>Fresh output</span>
          <strong>{latestOutputLabel}</strong>
          <p>{latestRun?.title || "가장 최근 실행 결과를 빠르게 확인합니다."}</p>
        </article>
      </section>

      <section className="summary-grid" aria-label="Operations summary">
        <SummaryCard
          title="라이브 디스패치"
          value={`${runningOrderCount} + ${liveAgentCount}`}
          detail="실행 중 오더와 지금 움직이고 있는 에이전트 레인을 함께 봅니다."
          badge="Dispatch"
          tone="blue"
        />
        <SummaryCard
          title="즉시 확인 필요"
          value={String(actionRequiredCount)}
          detail="막힌 항목만 모아서 먼저 사람 손이 가야 하는 보드."
          badge="Attention"
          tone={actionRequiredCount > 0 ? "warning" : "green"}
        />
        <SummaryCard
          title="연결된 표면"
          value={`${liveRouteCount}/${webhookEndpoints.length}`}
          detail={`${liveConnectionCount} connected · ${pendingConnectionCount} pending · ${errorConnectionCount} error`}
          badge="Surface"
          tone={errorConnectionCount > 0 ? "danger" : "green"}
        />
        <SummaryCard
          title="최근 출력"
          value={latestRun?.time || "Pending"}
          detail={latestRun?.detail || "최근 런 결과가 아직 없습니다."}
          badge="Output"
          tone={latestRun?.status === "failure" ? "danger" : "green"}
        />
      </section>

      <SectionCard
        kicker="Operator Workbench"
        title="빠르게 훑고 바로 열기"
        description="선택형 상세 패널을 붙여 페이지 이동 전에 상태, 다음 액션, 관련 화면을 한 번에 확인하게 만들었습니다."
        action={<span className="hub-command__hint">J / K · Enter · Esc</span>}
      >
        <OperationsWorkbench attentionItems={attentionItems} queueItems={queueItems} />
      </SectionCard>

      <SectionCard
        kicker="Dispatch"
        title="지금 필요한 액션만 앞으로"
        description="최근 대화 이어서, 오더 보내기, 실패 런 정리, 웹훅 스모크 테스트를 한 묶음으로 앞세웠습니다."
      >
        <div className="project-grid">
          {quickActions.map((item) => (
            <article className="project-card" key={item.title}>
              <div className="project-head">
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.badge}
                  </span>
                  <span className="legend-chip" data-tone={item.freshnessTone}>
                    {item.freshnessLabel}
                  </span>
                </div>
              </div>
              <div className="hero-actions">
                <Link className="button button-ghost" href={item.href}>
                  {item.action}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="AI Lane"
          title="대화, 카운슬, 오더를 붙여서 보기"
          description="말 걸기, 검토시키기, 실행 단위로 넘기기를 서로 끊기지 않게 붙였습니다."
          action={
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/ai/chat">
                Chat
              </Link>
              <Link className="button button-secondary" href="/dashboard/ai/council">
                Council
              </Link>
              <Link className="button button-secondary" href="/dashboard/ai/orders">
                Orders
              </Link>
            </div>
          }
        >
          <div className="ai-agent-grid">
            {agents.map((agent) => (
              <article className="ai-agent-card" key={agent.id}>
                <header className="ai-agent-head">
                  <div>
                    <p className="ai-agent-name">{agent.name}</p>
                    <p className="ai-agent-role">{agent.role}</p>
                  </div>
                  <span className="legend-chip" data-tone={getAgentTone(agent.status)}>
                    {agent.status}
                  </span>
                </header>
                <dl className="ai-agent-stats">
                  <div>
                    <dt>Latency</dt>
                    <dd>{agent.latency}</dd>
                  </div>
                  <div>
                    <dt>Load</dt>
                    <dd>{agent.load}</dd>
                  </div>
                </dl>
                <p className="ai-agent-focus">{agent.focus}</p>
              </article>
            ))}
          </div>

          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>최근 대화</strong>
                <p>{latestThread ? `${latestThread.title} · ${latestThread.preview}` : "최근 스레드가 없습니다."}</p>
              </div>
              <Link className="legend-chip" data-tone="blue" href="/dashboard/ai/chat">
                Chat
              </Link>
            </li>
            <li className="note-row">
              <div>
                <strong>수렴 중인 카운슬</strong>
                <p>
                  {activeCouncil
                    ? `${activeCouncil.topic} · ${activeCouncil.turns.length}개의 턴`
                    : "현재 열려 있는 카운슬이 없습니다."}
                </p>
              </div>
              <Link className="legend-chip" data-tone="warning" href="/dashboard/ai/council">
                Council
              </Link>
            </li>
            <li className="note-row">
              <div>
                <strong>대표 오더 템플릿</strong>
                <p>
                  {orderTemplates[0]?.title
                    ? `${orderTemplates[0].title} · ${orderTemplates[0].prompt}`
                    : "반복 오더 템플릿이 아직 없습니다."}
                </p>
              </div>
              <Link className="legend-chip" data-tone="green" href="/dashboard/ai/orders">
                Orders
              </Link>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          kicker="Automation Lane"
          title="런, 웹훅, 연동 상태를 한 묶음으로"
          description="무엇이 성공했고 무엇이 실패했는지보다, 다음 어디를 눌러야 하는지가 먼저 드러나게 구성했습니다."
          action={
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/automations/runs">
                Runs
              </Link>
              <Link className="button button-secondary" href="/dashboard/automations/webhooks">
                Webhooks
              </Link>
              <Link className="button button-secondary" href="/dashboard/automations/integrations">
                Integrations
              </Link>
              <Link className="button button-ghost" href="/dashboard/automations/email">
                Email
              </Link>
            </div>
          }
        >
          <div className="lane-grid">
            <div className="lane-column">
              <div className="lane-head">
                <div>
                  <strong>Recent runs</strong>
                  <p>스토리를 바로 읽을 수 있는 최근 실행 결과.</p>
                </div>
                <span className="lane-count">{automationRuns.length}</span>
              </div>
              <div className="lane-list">
                {automationRuns.slice(0, 3).map((run, index) => (
                  <div className="lane-item" key={`${run.title}-${index}`}>
                    <span>{run.time}</span>
                    <strong>{run.title}</strong>
                    <p>{run.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lane-column">
              <div className="lane-head">
                <div>
                  <strong>Sync + intake</strong>
                  <p>연결 상태와 웹훅 표면을 함께 봅니다.</p>
                </div>
                <span className="lane-count">{liveRouteCount}</span>
              </div>
              <div className="lane-list">
                <div className="lane-item">
                  <span>Latest sync</span>
                  <strong>{latestSync?.provider || connectionRows[0]?.title || "Sync lane"}</strong>
                  <p>
                    {latestSync
                      ? `${formatTimestamp(latestSync.finished_at || latestSync.started_at)} · ${latestSync.status || "captured"}`
                      : "아직 기록된 sync run 이 없습니다."}
                  </p>
                </div>
                <div className="lane-item">
                  <span>Webhook route</span>
                  <strong>{webhookEndpoints[0]?.name || "No route detected"}</strong>
                  <p>
                    {webhookEndpoints[0]
                      ? `${webhookEndpoints[0].method} ${webhookEndpoints[0].path}`
                      : "엔진에서 감지된 웹훅 라우트가 아직 없습니다."}
                  </p>
                </div>
                <div className="lane-item">
                  <span>Email lane</span>
                  <strong>Outbound + inbox workflow</strong>
                  <p>
                    템플릿, 발송 큐, provider 전환을 같은 운영 맥락에서 다루도록 Email lane으로 바로 연결합니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="Connections"
          title="연결된 시스템과 인테이크 표면"
          description="연동 카드는 역할, 현재 상태, 다음 액션까지 한 장에서 끝나야 합니다."
          action={
            <div className="hero-actions">
              <Link className="button button-secondary" href="/dashboard/automations/integrations">
                Integrations
              </Link>
              <Link className="button button-ghost" href="/dashboard/automations/webhooks">
                Webhooks
              </Link>
            </div>
          }
        >
          <div className="project-grid">
            {connectionRows.map((item) => (
              <article className="project-card" key={item.id}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.lane}</p>
                  </div>
                  <div className="inline-legend">
                    <span className="legend-chip" data-tone={item.tone}>
                      {item.status}
                    </span>
                    <span className="legend-chip" data-tone={item.freshnessTone}>
                      {item.freshnessLabel}
                    </span>
                  </div>
                </div>
                <p className="check-detail">{item.detail}</p>
                <div className="detail-stack">
                  <div>
                    <dt>Next</dt>
                    <dd>{item.nextAction}</dd>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="OS Pulse"
          title="다른 레인의 신호까지 놓치지 않기"
          description="AI와 자동화만 보다가 실제 작업 레인을 놓치지 않게, 핵심 펄스를 작게 같이 보여줍니다."
        >
          <div className="template-grid">
            {osPulse.map((pulse) => (
              <div className="template-row" key={pulse.label}>
                <div>
                  <strong>{pulse.label}</strong>
                  <p>{pulse.detail}</p>
                </div>
                <span className="legend-chip" data-tone={pulse.tone}>
                  {pulse.value}
                </span>
              </div>
            ))}
          </div>

          <div className="template-grid">
            {webhookEndpoints.slice(0, 3).map((item) => (
              <div className="template-row" key={`${item.method}-${item.path}`}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.note}</p>
                </div>
                <span className="endpoint-pill">
                  <span>{item.method}</span>
                  <code>{item.path}</code>
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Bridge Playbooks"
        title="가장 빠른 운영 플로우"
        description="화면 전환이 아니라 의사결정 흐름을 기준으로 길을 잡아, 무엇을 시키고 무엇을 검토해야 하는지 자연스럽게 이어지게 설계했습니다."
      >
        <div className="template-grid">
          <div className="template-row">
            <div>
              <strong>Chat → Order</strong>
              <p>대화로 시작한 요청이 확정되면 오더로 옮겨 실행 단위와 마감, 타겟을 붙입니다.</p>
            </div>
            <Link className="legend-chip" data-tone="blue" href="/dashboard/ai/orders">
              Dispatch
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>Council → Decision → Order</strong>
              <p>서로 검토가 필요한 주제는 카운슬로 보내고, 결정된 순간 바로 오더 큐로 연결합니다.</p>
            </div>
            <Link className="legend-chip" data-tone="warning" href="/dashboard/ai/council">
              Review
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>Webhook → Run → Retry</strong>
              <p>이벤트가 들어오면 최근 실행 결과와 실패 사유가 곧바로 Runs에 남아 재시도 동선을 줄입니다.</p>
            </div>
            <Link className="legend-chip" data-tone="green" href="/dashboard/automations/runs">
              Runs
            </Link>
          </div>
          <div className="template-row">
            <div>
              <strong>Integration → Sync → Publish</strong>
              <p>연결 상태와 싱크 결과를 먼저 확인한 뒤, 실제 콘텐츠나 이메일 발행 레인으로 넘어갑니다.</p>
            </div>
            <Link className="legend-chip" data-tone="muted" href="/dashboard/automations/email">
              Publish
            </Link>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
