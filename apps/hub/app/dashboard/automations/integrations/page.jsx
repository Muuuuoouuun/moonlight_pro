import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { integrationCatalog } from "@/lib/dashboard-data";
import { countRows, fetchEngineHealth, fetchRows, formatTimestamp, getAiConsolePageData } from "@/lib/server-data";

export const dynamic = "force-dynamic";

function normalizeStatus(value) {
  const status = value?.trim().toLowerCase();

  if (!status) {
    return "pending";
  }

  if (["connected", "live", "ok", "success"].includes(status)) {
    return "connected";
  }

  if (["error", "failed", "failure", "auth_error", "quota"].includes(status)) {
    return "error";
  }

  if (["ready", "planned", "supported via google sync"].includes(status)) {
    return "pending";
  }

  if (["degraded", "partial"].includes(status)) {
    return "degraded";
  }

  return status;
}

function getTone(status) {
  if (status === "connected") {
    return "green";
  }

  if (status === "error") {
    return "danger";
  }

  if (status === "degraded") {
    return "warning";
  }

  return "blue";
}

function getStatusLabel(status) {
  if (status === "connected") {
    return "connected";
  }

  if (status === "error") {
    return "attention";
  }

  if (status === "degraded") {
    return "degraded";
  }

  return "pending";
}

function buildProviderRow(item, liveConnection) {
  const normalizedStatus = normalizeStatus(liveConnection?.status || item.status);
  const syncDetail = liveConnection?.last_synced_at
    ? `Last success ${formatTimestamp(liveConnection.last_synced_at)}`
    : item.detail;

  return {
    key: item.provider,
    title: item.provider,
    lane: item.lane,
    status: getStatusLabel(normalizedStatus),
    tone: getTone(normalizedStatus),
    detail: syncDetail,
    meta: `${item.mode} · ${item.priority}`,
    action: item.nextAction,
  };
}

function buildAiProviderRow({ title, configured, detail, action, meta }) {
  return {
    key: title,
    title,
    lane: "AI model",
    status: configured ? "connected" : "pending",
    tone: configured ? "green" : "warning",
    detail,
    meta,
    action,
  };
}

function buildPartnerRow({ title, provider, detail, route, action, configured }) {
  return {
    key: provider,
    title,
    lane: "Shared webhook alias",
    status: configured ? "connected" : "ready",
    tone: configured ? "green" : "blue",
    detail,
    meta: route,
    action,
  };
}

export default async function AutomationIntegrationsPage() {
  const [
    connections,
    syncRuns,
    connectedCount,
    pendingCount,
    errorCount,
    engineHealth,
    aiConsole,
    openclawEvents,
    moltbotEvents,
  ] = await Promise.all([
    fetchRows("integration_connections", { limit: 8, order: "created_at.desc" }),
    fetchRows("sync_runs", { limit: 8, order: "started_at.desc" }),
    countRows("integration_connections", [["status", "eq.connected"]]),
    countRows("integration_connections", [["status", "eq.pending"]]),
    countRows("integration_connections", [["status", "eq.error"]]),
    fetchEngineHealth(),
    getAiConsolePageData(),
    fetchRows("webhook_events", { filters: [["source", "eq.openclaw"]], limit: 2, order: "received_at.desc" }),
    fetchRows("webhook_events", { filters: [["source", "eq.moltbot"]], limit: 2, order: "received_at.desc" }),
  ]);

  const liveConnections = connections || [];
  const targetRows = integrationCatalog;
  const connectionMap = new Map(
    liveConnections.map((item) => [item.provider?.trim().toLowerCase(), item]),
  );
  const liveAgentCount = aiConsole.agents.filter(
    (agent) => agent.status === "ready" || agent.status === "live" || agent.status === "working",
  ).length;
  const lastCheckTimestamp =
    syncRuns?.[0]?.finished_at ||
    syncRuns?.[0]?.started_at ||
    connections?.[0]?.last_synced_at ||
    engineHealth?.timestamp ||
    null;

  const coreApiRows = [
    {
      key: "engine-health",
      title: "Engine health",
      lane: "Core API",
      status: engineHealth?.status === "ok" ? "connected" : "attention",
      tone: engineHealth?.status === "ok" ? "green" : "danger",
      detail: engineHealth?.status === "ok"
        ? `${engineHealth.routes?.length || 0} routes exposed · ${engineHealth.commands?.length || 0} commands readable`
        : "Health endpoint is unreachable or not returning an OK posture.",
      meta: "GET /api/health · Runtime",
      action: engineHealth?.timestamp
        ? `Checked ${formatTimestamp(engineHealth.timestamp)}`
        : "Set COM_MOON_ENGINE_URL or NEXT_PUBLIC_APP_URL to make posture checks live.",
    },
    ...targetRows
      .filter((item) => ["Supabase", "Project tools", "GitHub"].includes(item.provider))
      .map((item) => buildProviderRow(item, connectionMap.get(item.provider.toLowerCase()))),
  ];

  const aiProviderRows = [
    buildAiProviderRow({
      title: "OpenAI",
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      detail: process.env.OPENAI_API_KEY?.trim()
        ? "API key detected. Use this lane for chat, generation, and structured reasoning tasks."
        : "No OpenAI API key detected in the current runtime.",
      meta: "OPENAI_API_KEY",
      action: "Wire a smoke test or model ping before routing production jobs here.",
    }),
    buildAiProviderRow({
      title: "Anthropic",
      configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      detail: process.env.ANTHROPIC_API_KEY?.trim()
        ? "API key detected. Claude-facing lane is ready to be called from the hub."
        : "No Anthropic API key detected in the current runtime.",
      meta: "ANTHROPIC_API_KEY",
      action: "Add one simple health or echo route so the shell can verify this lane directly.",
    }),
    buildAiProviderRow({
      title: "Gemini",
      configured: Boolean(
        process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
      ),
      detail:
        process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
          ? "Google AI credentials detected. Good fit for multimodal or secondary model routing."
          : "No Gemini / Google Generative AI key detected in the current runtime.",
      meta: "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY",
      action: "Keep this lane optional until one real workflow needs it.",
    }),
    {
      key: "internal-agents",
      title: "Internal agent lane",
      lane: "AI runtime",
      status: liveAgentCount > 0 ? "connected" : "degraded",
      tone: liveAgentCount > 0 ? "green" : "warning",
      detail: `${liveAgentCount} of ${aiConsole.agents.length} agent lanes are readable in the AI console snapshot.`,
      meta: "AI Console",
      action: "Use this row to answer whether operator-facing AI is actually alive before checking model vendors.",
    },
  ];

  const channelRows = targetRows
    .filter((item) => ["Telegram", "Google Calendar", "Samsung Calendar", "Email", "Slack"].includes(item.provider))
    .map((item) => buildProviderRow(item, connectionMap.get(item.provider.toLowerCase())));
  const partnerRows = [
    buildPartnerRow({
      title: "OpenClaw",
      provider: "openclaw",
      route: "/api/webhook/project/openclaw",
      configured: Boolean(process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()),
      detail: openclawEvents?.[0]
        ? `Last event ${formatTimestamp(openclawEvents[0].processed_at || openclawEvents[0].received_at)} · ${openclawEvents[0].event_type}`
        : "외부 agent workflow에서 project update를 바로 밀어 넣는 shared intake lane입니다.",
      action: process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()
        ? "Shared secret detected. Use the OpenClaw preset in Webhooks for repeat smoke tests."
        : "Secret is optional, but adding COM_MOON_SHARED_WEBHOOK_SECRET makes this lane safer for always-on use.",
    }),
    buildPartnerRow({
      title: "OpenClaw alias (moltbot)",
      provider: "moltbot",
      route: "/api/webhook/project/moltbot",
      configured: Boolean(process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()),
      detail: moltbotEvents?.[0]
        ? `Last event ${formatTimestamp(moltbotEvents[0].processed_at || moltbotEvents[0].received_at)} · ${moltbotEvents[0].event_type}`
        : "OpenClaw와 같은 운영 레인을 가리키는 alias route입니다.",
      action: process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim()
        ? "Shared secret detected. Use the alias preset in Webhooks when you need to test the moltbot route specifically."
        : "Alias route is open-ready, but a shared secret is recommended before frequent external use.",
    }),
  ];

  const incidentRows = [
    ...(syncRuns || [])
      .filter((item) => ["failure", "failed", "error"].includes(item.status))
      .map((item) => ({
        key: `sync-${item.id || item.started_at || item.status}`,
        title: item.integration_name || item.provider || item.status || "sync failure",
        status: "sync failure",
        detail: item.error_message || "The sync run failed and needs inspection before the next handoff.",
        time: formatTimestamp(item.finished_at || item.started_at),
      })),
    ...liveConnections
      .filter((item) => normalizeStatus(item.status) === "error")
      .map((item) => ({
        key: `connection-${item.id || item.provider}`,
        title: item.provider,
        status: "connection error",
        detail: item.error_message || "Connection is registered but not healthy yet.",
        time: item.last_synced_at ? formatTimestamp(item.last_synced_at) : "Needs review",
      })),
    ...(engineHealth?.status === "ok"
      ? []
      : [
          {
            key: "engine-incident",
            title: "Engine health",
            status: "unreachable",
            detail: "The main health endpoint did not return a clean OK response, so route posture is not trustworthy.",
            time: "Now",
          },
        ]),
  ].slice(0, 6);

  const healthyBoardCount = [...coreApiRows, ...aiProviderRows, ...channelRows].filter(
    (item) => item.status === "connected",
  ).length;
  const attentionBoardCount = [...coreApiRows, ...aiProviderRows, ...channelRows].filter(
    (item) => item.status === "attention" || item.status === "degraded",
  ).length;
  const pendingBoardCount = [...coreApiRows, ...aiProviderRows, ...channelRows].filter(
    (item) => item.status === "pending",
  ).length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Connection Health</p>
        <h1>API와 AI 연결 상태를 한 화면에서 보는 관제 탭</h1>
        <p>
          운영자가 먼저 확인해야 하는 건 설정 화면 자체가 아니라 지금 어떤 레인이 살아 있고, 어디가 멈췄고,
          다음 액션이 무엇인지입니다. 이 탭은 Core API, AI 모델, 채널 연결을 같은 프레임 안에서 읽게 합니다.
        </p>
        <p className="page-context">
          <strong>Signal first</strong>
          <span>
            연결 수보다 중요한 건 실제 health, 최근 성공 시각, 그리고 지금 막히는 이유가 한 번에 잡히는지입니다.
          </span>
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/dashboard/settings">
            Open Settings
          </Link>
          <Link className="button button-secondary" href="/dashboard/ai">
            Open AI Console
          </Link>
          <Link className="button button-ghost" href="/dashboard/automations/webhooks">
            Review Webhooks
          </Link>
        </div>
      </section>

      <section className="summary-grid" aria-label="Connection health summary">
        <SummaryCard
          title="Healthy lanes"
          value={String(healthyBoardCount)}
          detail="Right now readable or configured enough to trust for the next operating step."
          badge="Connected"
        />
        <SummaryCard
          title="Need attention"
          value={String(attentionBoardCount)}
          detail="Degraded or broken lanes that deserve inspection before the next sync or AI call."
          badge="Attention"
          tone="warning"
        />
        <SummaryCard
          title="Pending setup"
          value={String(pendingBoardCount)}
          detail="Configured in the operating plan but not live enough to rely on yet."
          badge="Backlog"
          tone="blue"
        />
        <SummaryCard
          title="Last check"
          value={lastCheckTimestamp ? formatTimestamp(lastCheckTimestamp) : "Waiting"}
          detail="Latest visible signal from sync history, connection records, or engine health."
          badge={`${connectedCount ?? 0}/${targetRows.length}`}
          tone={errorCount && errorCount > 0 ? "warning" : "green"}
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Core API"
          title="Core API health board"
          description="Source of truth, engine posture, and shipping-related providers should be visible before deeper automation expands."
        >
          <div className="timeline">
            {coreApiRows.map((item) => (
              <div className="timeline-item" key={item.key}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.status}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {item.meta}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.action}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="AI Models"
          title="AI provider and runtime board"
          description="Vendor key presence alone is not enough, but it is the first gate before model health and routing checks."
        >
          <div className="timeline">
            {aiProviderRows.map((item) => (
              <div className="timeline-item" key={item.key}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.status}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {item.meta}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.action}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          kicker="Channels"
          title="Channels and sync lane"
          description="Operator channels and communication surfaces should show whether they are merely planned, connected, or already failing."
        >
          <div className="timeline">
            {channelRows.map((item) => (
              <div className="timeline-item" key={item.key}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.status}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {item.meta}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.action}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Partner Agents"
          title="OpenClaw fast lane and alias route"
          description="Shared partner routes should stay one click away, with Moltbot shown as an OpenClaw alias instead of a separate partner."
          action={
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/automations/webhooks">
                Smoke Test
              </Link>
              <Link className="button button-secondary" href="/dashboard/command-center">
                Open Command Center
              </Link>
            </div>
          }
        >
          <div className="timeline">
            {partnerRows.map((item) => (
              <div className="timeline-item" key={item.key}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.status}
                  </span>
                  <span className="legend-chip" data-tone="muted">
                    {item.meta}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.action}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Incidents"
          title="Recent failures and inspection queue"
          description="If something is red, the page should say what broke, when it happened, and what to inspect next."
        >
          <div className="timeline">
            {(incidentRows.length
              ? incidentRows
              : [
                  {
                    key: "no-incidents",
                    title: "No critical incidents visible",
                    status: "stable",
                    detail: "Recent failures will appear here once connection or sync issues are recorded.",
                    time: "Watching",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={item.key}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.status === "stable" ? "green" : "danger"}>
                    {item.status}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <span className="muted tiny">{item.time}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Catalog"
        title="Connection backlog and operating contract"
        description="Every provider should have a role, a required secret set, and a first implementation step before it is allowed into the machine."
      >
        <div className="template-grid">
          {targetRows.map((item) => (
            <div className="template-row" key={item.provider}>
              <div>
                <strong>{item.provider}</strong>
                <p>{item.detail}</p>
                <p>{`Mode: ${item.mode} | Required: ${item.required.join(", ")}`}</p>
                <p>{`Next: ${item.nextAction}`}</p>
              </div>
              <div className="inline-legend">
                <span className="legend-chip" data-tone="muted">
                  {item.lane}
                </span>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.status}
                </span>
                <span className="legend-chip" data-tone="blue">
                  {item.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <section className="summary-grid" aria-label="Connection health database metrics">
        <SummaryCard
          title="Connected rows"
          value={String(connectedCount ?? 0)}
          detail="Rows currently marked as connected in the integration ledger."
          badge="Ledger"
          tone="green"
        />
        <SummaryCard
          title="Pending rows"
          value={String(pendingCount ?? 0)}
          detail="Rows registered but not yet healthy enough to trust."
          badge="Ledger"
          tone="warning"
        />
        <SummaryCard
          title="Error rows"
          value={String(errorCount ?? 0)}
          detail="Rows already marked as failed inside the integration ledger."
          badge="Ledger"
          tone="danger"
        />
      </section>
    </div>
  );
}
