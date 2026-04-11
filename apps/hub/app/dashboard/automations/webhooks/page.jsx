import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { WebhookTestForm } from "@/components/forms/webhook-test-form";
import { fetchRows, getAutomationsPageData, formatTimestamp } from "@/lib/server-data";

function countEndpoints(items, status) {
  return items.filter((item) => item.status === status).length;
}

export default async function AutomationWebhooksPage() {
  const [{ webhookEndpoints }, webhookEvents] = await Promise.all([
    getAutomationsPageData(),
    fetchRows("webhook_events", { limit: 8, order: "received_at.desc" }),
  ]);
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
      <section className="summary-grid" aria-label="Webhook summary">
        <SummaryCard
          title="Endpoints"
          value={String(webhookEndpoints.length)}
          detail="Explicit routes exposed to the current machine surface."
          badge="Catalog"
          tone="blue"
        />
        <SummaryCard
          title="Active"
          value={String(countEndpoints(webhookEndpoints, "active"))}
          detail="Routes currently expected to receive traffic."
          badge="Live"
        />
        <SummaryCard
          title="Events"
          value={String(eventRows.length)}
          detail="Recent webhook traffic available for audit and debugging."
          badge="Risk"
          tone="warning"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="Smoke Test"
          title="Send a webhook smoke test from the hub"
          description="This is the fastest operator path for confirming generic and shared intake behavior before an external bot is wired in."
        >
          <WebhookTestForm
            defaultWorkspaceId={defaultWorkspaceId}
            defaultEngineUrl={defaultEngineUrl}
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
