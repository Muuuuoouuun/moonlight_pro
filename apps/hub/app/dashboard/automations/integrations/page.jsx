import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
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
      </section>

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
    </>
  );
}
