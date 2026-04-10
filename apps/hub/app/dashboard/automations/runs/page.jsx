import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getAutomationsPageData } from "@/lib/server-data";

function countRuns(items, predicate) {
  return items.filter(predicate).length;
}

export default async function AutomationRunsPage() {
  const { automationRuns } = await getAutomationsPageData();

  return (
    <>
      <section className="summary-grid" aria-label="Automation run summary">
        <SummaryCard
          title="Successful"
          value={String(countRuns(automationRuns, (item) => item.status === "success"))}
          detail="Recent runs that completed cleanly."
          badge="Healthy"
        />
        <SummaryCard
          title="Queued / Ready"
          value={String(countRuns(automationRuns, (item) => item.status === "queued" || item.status === "ready"))}
          detail="Runs waiting for dispatch or review."
          badge="Waiting"
          tone="warning"
        />
        <SummaryCard
          title="Watch"
          value={String(countRuns(automationRuns, (item) => item.status === "failure"))}
          detail="Runs that need a retry or operator inspection."
          badge="Attention"
          tone="danger"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Runs"
          title="Execution pulse"
          description="Each run should explain what happened without forcing the operator to reconstruct the story."
        >
          <div className="timeline">
            {automationRuns.map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}-run`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "success" ? "green" : item.status === "failure" ? "danger" : "warning"
                    }
                  >
                    {item.time}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Rules"
          title="Dispatch guardrails"
          description="Runs stay trustworthy when the queue is readable and failure handling is boring."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Queue before complexity</strong>
                <p>If the next run is not obvious, the lane is already doing too much.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Failures should name the broken step</strong>
                <p>The operator should know what to retry without reading raw traces first.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Successful runs should teach reuse</strong>
                <p>When an automation works, the input and output pattern should be easy to repeat.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
