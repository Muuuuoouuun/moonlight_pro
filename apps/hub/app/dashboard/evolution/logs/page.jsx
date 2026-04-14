import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getLogsPageData } from "@/lib/server-data";

export default async function EvolutionLogsPage() {
  const { logItems } = await getLogsPageData();
  const warningCount = logItems.filter((item) => item.severity === "warning").length;
  const stableCount = logItems.length - warningCount;

  return (
    <>
      <section className="summary-grid" aria-label="Log summary">
        <SummaryCard
          title="Captured logs"
          value={String(logItems.length)}
          detail="Recent notes, failures, and follow-up signals."
          badge="Stream"
        />
        <SummaryCard
          title="Attention"
          value={String(warningCount)}
          detail="Items that still need a fix owner or retry path."
          badge="Open"
          tone="warning"
        />
        <SummaryCard
          title="Stable"
          value={String(stableCount)}
          detail="Signals that are recorded and not actively blocking the loop."
          badge="Closed"
          tone="green"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Log stream"
          title="Recent system notes"
          description="A short history of what changed and what still needs follow-up."
        >
          <div className="timeline">
            {logItems.map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.severity === "warning" ? "warning" : "green"}>
                    {item.severity === "warning" ? "Attention" : "Stable"}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Loop"
          title="What the next iteration should learn"
          description="Keep the improvement loop short enough to act on after the current work block."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Capture the blocker immediately</strong>
                <p>Don&apos;t wait until the end of the day to write down what broke.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Assign a fix owner</strong>
                <p>Each log entry should know who can act on it next.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Close with a decision</strong>
                <p>The log should end with a next move, not just a symptom.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
