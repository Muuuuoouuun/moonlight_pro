import { SectionCard } from "@/components/dashboard/section-card";
import { WebhookTestForm } from "@/components/forms/webhook-test-form";
import { fetchRows, getAutomationsPageData, formatTimestamp } from "@/lib/server-data";
import Link from "next/link";

function countEndpoints(items, status) {
  return items.filter((item) => item.status === status).length;
}

function normalizePreset(value) {
  const preset = value?.trim().toLowerCase();

  if (preset === "openclaw" || preset === "moltbot") {
    return preset;
  }

  return "generic";
}

function getPresetCopy(preset) {
  if (preset === "openclaw") {
    return {
      title: "OpenClaw shared webhook smoke test",
      summary: "Smoke test fired from Hub OS to confirm the OpenClaw shared route can accept project updates.",
      nextAction: "Verify OpenClaw event persistence in webhook events, project updates, and routine checks.",
    };
  }

  if (preset === "moltbot") {
    return {
      title: "OpenClaw alias webhook smoke test",
      summary: "Smoke test fired from Hub OS to confirm the Moltbot route works as an OpenClaw alias.",
      nextAction: "Verify the alias event persisted cleanly and matches the same OpenClaw operating lane.",
    };
  }

  return {
    title: "Project webhook smoke test",
    summary: "Smoke test fired from Hub OS to confirm project progress intake.",
    nextAction: "Verify webhook persistence in automation and log views.",
  };
}

export default async function AutomationWebhooksPage({ searchParams }) {
  const [{ webhookEndpoints }, webhookEvents] = await Promise.all([
    getAutomationsPageData(),
    fetchRows("webhook_events", { limit: 8, order: "received_at.desc" }),
  ]);
  const preset = normalizePreset(searchParams?.preset);
  const presetCopy = getPresetCopy(preset);
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const defaultEngineUrl = process.env.COM_MOON_ENGINE_URL?.trim() || "";

  const eventRows =
    webhookEvents?.map((item) => ({
      title: item.event_type || "Webhook event",
      status: item.status || "received",
      detail: item.error_message || `${item.source || "webhook"} payload received.`,
      time: formatTimestamp(item.processed_at || item.received_at),
    })) || [];

  return (
    <>
      <section className="operator-header">
        <p className="operator-header__eyebrow">Webhooks</p>
        <h1>스모크 테스트와 최근 인테이크를 바로 보는 운영 화면</h1>
        <p>이 탭에서는 테스트를 먼저 보내고, 그 바로 아래에서 라우트와 최근 이벤트를 확인할 수 있어야 합니다.</p>
      </section>

      <section className="signal-strip" aria-label="Webhook summary">
        <article className="signal-strip__item">
          <span>Endpoints</span>
          <strong>{String(webhookEndpoints.length)}</strong>
          <p>현재 머신 표면에 노출된 라우트 수.</p>
        </article>
        <article className="signal-strip__item">
          <span>Active routes</span>
          <strong>{String(countEndpoints(webhookEndpoints, "active"))}</strong>
          <p>현재 트래픽을 기대하는 활성 라우트.</p>
        </article>
        <article className="signal-strip__item">
          <span>Recent events</span>
          <strong>{String(eventRows.length)}</strong>
          <p>바로 감사 가능한 최근 인테이크 기록.</p>
        </article>
      </section>

      <div className="stack">
        <SectionCard
          kicker="Smoke Test"
          title="허브에서 바로 스모크 테스트 보내기"
          description="외부 봇을 연결하기 전에 가장 먼저 확인해야 하는 운영 경로입니다."
        >
          <div className="operator-actions">
            <Link className={`button ${preset === "generic" ? "button-primary" : "button-secondary"}`} href="/dashboard/automations/webhooks">
              Generic
            </Link>
            <Link className={`button ${preset === "openclaw" ? "button-primary" : "button-secondary"}`} href="/dashboard/automations/webhooks?preset=openclaw">
              OpenClaw preset
            </Link>
            <Link className={`button ${preset === "moltbot" ? "button-primary" : "button-secondary"}`} href="/dashboard/automations/webhooks?preset=moltbot">
              OpenClaw alias
            </Link>
          </div>
          <WebhookTestForm
            defaultWorkspaceId={defaultWorkspaceId}
            defaultEngineUrl={defaultEngineUrl}
            defaultTargetRoute={preset}
            defaultTitle={presetCopy.title}
            defaultSummary={presetCopy.summary}
            defaultNextAction={presetCopy.nextAction}
          />
        </SectionCard>

        <div className="split-grid">
        <SectionCard
          kicker="Routes"
          title="Endpoint catalog"
          description="Integrations stay healthy when the intake surface is explicit and small enough to audit."
        >
          <div className="template-grid">
            {webhookEndpoints.map((item) => (
              <div className="template-row" key={item.name}>
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

        <SectionCard
          kicker="Events"
          title="Recent intake"
          description="The event stream should make failures and processed payloads visible before they become invisible damage."
        >
          <div className="timeline">
            {(eventRows.length
              ? eventRows
              : [
                  {
                    title: "No webhook events yet",
                    status: "ready",
                    detail: "Live intake history will appear here once the first events land.",
                    time: "Pending",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "processed"
                        ? "green"
                        : item.status === "failed"
                          ? "danger"
                          : item.status === "received"
                            ? "blue"
                            : "warning"
                    }
                  >
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
      </div>
    </>
  );
}
