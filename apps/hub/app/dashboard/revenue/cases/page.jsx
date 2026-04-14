import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { countRows, fetchRows, formatTimestamp } from "@/lib/server-data";

export default async function RevenueCasesPage() {
  const [cases, activeCount, waitingCount, blockedCount] = await Promise.all([
    fetchRows("operation_cases", { limit: 8, order: "created_at.desc" }),
    countRows("operation_cases", [["status", "eq.active"]]),
    countRows("operation_cases", [["status", "eq.waiting"]]),
    countRows("operation_cases", [["status", "eq.blocked"]]),
  ]);

  const caseRows =
    cases?.map((item) => ({
      title: item.title || "Operation case",
      status: item.status || "active",
      detail: item.next_action || "Assign the next action before the case fades into background noise.",
      time: formatTimestamp(item.created_at),
    })) || [];

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Revenue</p>
        <h1>Cases and operational closure</h1>
        <p>
          Operational work should move quickly from issue capture to an owned action. This lane keeps
          blockers visible until they are resolved or escalated.
        </p>
      </section>

      <section className="summary-grid" aria-label="Case lane summary metrics">
        <SummaryCard
          title="Active"
          value={String(activeCount ?? caseRows.filter((item) => item.status === "active").length)}
          detail="Cases currently moving with a visible next action."
          badge="Motion"
          tone="green"
        />
        <SummaryCard
          title="Waiting"
          value={String(waitingCount ?? caseRows.filter((item) => item.status === "waiting").length)}
          detail="Cases stalled on input, approval, or an external dependency."
          badge="Watch"
          tone="blue"
        />
        <SummaryCard
          title="Blocked"
          value={String(blockedCount ?? caseRows.filter((item) => item.status === "blocked").length)}
          detail="Blockers that should be visible enough to change the day."
          badge="Risk"
          tone="warning"
        />
        <SummaryCard
          title="Ownership"
          value="Clear"
          detail="Every blocker should have a person who can move it forward."
          badge="Control"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Cases"
          title="Case motion board"
          description="Operational work should move quickly from issue capture to an owned action."
        >
          <div className="timeline">
            {(caseRows.length
              ? caseRows
              : [
                  {
                    title: "Case lane waiting for data",
                    status: "ready",
                    detail: "Once operation cases land, this board will show blockers, state, and next action.",
                    time: "Pending",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span
                    className="legend-chip"
                    data-tone={
                      item.status === "active" ? "green" : item.status === "waiting" ? "blue" : "warning"
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

        <SectionCard
          kicker="Rules"
          title="What to resolve"
          description="This lane is healthiest when the team can see what is blocked and what is already moving."
        >
          <ul className="note-list">
            <li className="note-row">
              <div>
                <strong>Capture the blocker immediately</strong>
                <p>Write down what failed before the context gets lost.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Assign the fix owner</strong>
                <p>The next operator should be obvious, not assumed.</p>
              </div>
            </li>
            <li className="note-row">
              <div>
                <strong>Close the loop</strong>
                <p>A case should finish with a decision, not just a symptom.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
