import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

function toneForSeverity(severity) {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }

  if (severity === "medium") {
    return "warning";
  }

  return "blue";
}

export default async function EvolutionIssuesPage() {
  const [issues, openCount, investigatingCount, mitigatedCount] = await Promise.all([
    fetchRows("issues", { limit: 8, order: "created_at.desc" }),
    countRows("issues", [["status", "eq.open"]]),
    countRows("issues", [["status", "eq.investigating"]]),
    countRows("issues", [["status", "eq.mitigated"]]),
  ]);

  const issueItems =
    issues?.map((item) => ({
      title: item.title || "Issue",
      severity: item.severity || "medium",
      status: item.status || "open",
      detail: `Captured ${formatTimestamp(item.created_at)}`,
    })) || [];

  return (
    <>
      <section className="summary-grid" aria-label="Issue summary">
        <SummaryCard
          title="Open"
          value={String(openCount ?? issueItems.filter((item) => item.status === "open").length)}
          detail="Current issues that can still damage speed or clarity."
          badge="Queue"
          tone="warning"
        />
        <SummaryCard
          title="Investigating"
          value={String(investigatingCount ?? issueItems.filter((item) => item.status === "investigating").length)}
          detail="The issues currently in a root-cause pass."
          badge="Focus"
          tone="blue"
        />
        <SummaryCard
          title="Mitigated"
          value={String(mitigatedCount ?? issueItems.filter((item) => item.status === "mitigated").length)}
          detail="Issues stabilized enough to stop damaging the loop."
          badge="Stability"
          tone="green"
        />
      </section>

      <SectionCard
        kicker="Risk board"
        title="Issues that should not stay vague"
        description="A system issue is only useful when it names the damage and the likely mitigation path."
      >
        <div className="timeline">
          {(issueItems.length
            ? issueItems
            : [
                {
                  title: "Issue lane waiting for data",
                  severity: "medium",
                  status: "open",
                  detail: "Once issue records land, this board will show severity and mitigation state.",
                },
              ]
          ).map((item) => (
            <div className="timeline-item" key={item.title}>
              <div className="inline-legend">
                <span className="legend-chip" data-tone={toneForSeverity(item.severity)}>
                  {item.severity}
                </span>
                <span
                  className="legend-chip"
                  data-tone={item.status === "mitigated" ? "green" : item.status === "investigating" ? "blue" : "warning"}
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
    </>
  );
}
