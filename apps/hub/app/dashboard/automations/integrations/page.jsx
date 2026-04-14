import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { integrationCatalog } from "@/lib/dashboard-data";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

export default async function AutomationIntegrationsPage() {
  const [connections, syncRuns, connectedCount, pendingCount, errorCount] = await Promise.all([
    fetchRows("integration_connections", { limit: 8, order: "created_at.desc" }),
    fetchRows("sync_runs", { limit: 8, order: "started_at.desc" }),
    countRows("integration_connections", [["status", "eq.connected"]]),
    countRows("integration_connections", [["status", "eq.pending"]]),
    countRows("integration_connections", [["status", "eq.error"]]),
  ]);

  const integrationRows =
    connections?.map((item) => ({
      title: item.provider,
      status: item.status || "pending",
      detail: item.last_synced_at
        ? `Last synced ${formatTimestamp(item.last_synced_at)}`
        : "No successful sync recorded yet.",
    })) || [];
  const syncRows =
    syncRuns?.map((item) => ({
      title: item.status || "sync run",
      detail: item.error_message || "Sync run captured.",
      time: formatTimestamp(item.finished_at || item.started_at),
    })) || [];
  const targetRows = integrationCatalog;

  return (
    <>
      <section className="summary-grid" aria-label="Integration summary">
        <SummaryCard
          title="Connected"
          value={String(connectedCount ?? integrationRows.filter((item) => item.status === "connected").length)}
          detail="Live integration already driving the machine."
          badge="Live"
        />
        <SummaryCard
          title="Pending"
          value={String(pendingCount ?? integrationRows.filter((item) => item.status === "pending").length)}
          detail="Connection ready to wire once the mapping is explicit."
          badge="Pending"
          tone="warning"
        />
        <SummaryCard
          title="Errors"
          value={String(errorCount ?? integrationRows.filter((item) => item.status === "error").length)}
          detail="Connections that still need inspection before the next sync."
          badge="Attention"
          tone="danger"
        />
        <SummaryCard
          title="Targets"
          value={String(targetRows.length)}
          detail="The full external stack that still needs to be wired and audited."
          badge="Catalog"
          tone="blue"
        />
      </section>

      <SectionCard
        kicker="GitHub"
        title="PMS and roadmap handoff"
        description="This is the bridge between GitHub events and the hub's delivery surfaces, kept intentionally small for MVP discoverability."
        action={
          <Link className="button button-secondary" href="/dashboard/work/pms">
            Open PMS
          </Link>
        }
      >
        <div className="split-grid">
          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>What GitHub feeds</h3>
                <p>Signals that should appear in the delivery surface.</p>
              </div>
              <span className="legend-chip" data-tone="blue">
                Intake
              </span>
            </div>
            <div className="inline-legend">
              <span className="legend-chip">Issues</span>
              <span className="legend-chip">Pull requests</span>
              <span className="legend-chip">Milestones</span>
            </div>
            <dl className="detail-stack">
              <div>
                <dt>PMS</dt>
                <dd>Review requests, blocked work, stale repos, and follow-up pressure.</dd>
              </div>
              <div>
                <dt>Roadmap</dt>
                <dd>Milestone progress, due dates, and now / next / later placement.</dd>
              </div>
            </dl>
          </article>

          <article className="project-card">
            <div className="project-head">
              <div>
                <h3>MVP contract</h3>
                <p>Simple wiring before any deeper automation behavior.</p>
              </div>
              <span className="legend-chip" data-tone="green">
                Read-only
              </span>
            </div>
            <div className="inline-legend">
              <span className="legend-chip" data-tone="warning">
                Sync runs
              </span>
              <span className="legend-chip" data-tone="green">
                Connected repo
              </span>
              <span className="legend-chip" data-tone="danger">
                Errors
              </span>
            </div>
            <dl className="detail-stack">
              <div>
                <dt>Setup</dt>
                <dd>Repository mapping, token, webhook secret, and snapshot sync.</dd>
              </div>
              <div>
                <dt>Next click</dt>
                <dd>Open integrations, then jump directly to the GitHub delivery pages.</dd>
              </div>
            </dl>
            <div className="hero-actions">
              <Link className="button button-primary" href="/dashboard/work/roadmap">
                Open Roadmap
              </Link>
              <Link className="button button-secondary" href="/dashboard/work/pms">
                Open GitHub PMS
              </Link>
            </div>
          </article>
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="Connections"
          title="Current integration lane"
          description="Only a few connections should exist, and each one should earn its place."
        >
          <div className="timeline">
            {(integrationRows.length
              ? integrationRows
              : [
                  {
                    title: "Integration lane waiting for data",
                    status: "pending",
                    detail: "Once connections are registered, this board will show provider and sync health.",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "connected"
                        ? "green"
                        : item.status === "error"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {item.status}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Syncs"
          title="Recent synchronization runs"
          description="Connected systems should reduce operator load, not multiply invisible failure paths."
        >
          <div className="timeline">
            {(syncRows.length
              ? syncRows
              : [
                  {
                    title: "No sync runs yet",
                    detail: "Synchronization history will appear here once a connected system reports in.",
                    time: "Pending",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
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
        description="Each provider should have a role, a connection mode, required secrets, and a first implementation step before it is allowed into the machine."
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
    </>
  );
}
