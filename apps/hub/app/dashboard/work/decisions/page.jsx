import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { fetchRows, formatTimestamp, getPmsPageData } from "@/lib/server-data";

export default async function WorkDecisionsPage({ searchParams }) {
  const [{ weeklyReview }, decisions] = await Promise.all([
    getPmsPageData(),
    fetchRows("decisions", { limit: 6, order: "decided_at.desc" }),
  ]);
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);

  const decisionEntries =
    decisions?.map((item) => ({
      title: item.title || "Decision",
      detail: item.summary || item.rationale || "Decision captured.",
      time: formatTimestamp(item.decided_at || item.created_at),
    })) ||
    weeklyReview.map((item, index) => ({
      ...item,
      time: index === 0 ? "Now" : index === 1 ? "Next" : "Later",
    }));
  const scopedDecisions = scopeMappedItemsByWorkContext(
    decisionEntries,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopeNote =
    selectedProject.value === "all"
      ? "Recent calls from every project stay visible together."
      : scopedDecisions.isFallback && scopedReview.isFallback
        ? `${selectedProject.label} is selected, but decision rows still fall back to the shared review lane when project references are implicit.`
        : `${selectedProject.label} decisions are now centered in this view.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Decisions and follow-through</h1>
        <p>
          This page keeps the calls that changed direction visible long enough to act on them. A good
          decision log says what changed, why it changed, and what should move next.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Decision summary metrics">
        <SummaryCard
          title="Recent Decisions"
          value={String(scopedDecisions.items.length)}
          detail="Important calls remain visible after the meeting ends."
          badge="Signal"
        />
        <SummaryCard
          title="Review Prompts"
          value={String(scopedReview.items.length)}
          detail="Weekly prompts keep judgment tied to execution."
          badge="Reset"
          tone="muted"
        />
        <SummaryCard
          title="Direction"
          value="Explicit"
          detail="Every major call should explain what it unlocked."
          badge="Clarity"
          tone="blue"
        />
        <SummaryCard
          title="Follow-through"
          value="Required"
          detail="A decision is only useful if the next move is visible."
          badge="Action"
          tone="warning"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Decision log"
          title="Recent calls"
          description="Keep each entry short enough to scan and concrete enough to reuse later."
        >
          <div className="timeline">
            {scopedDecisions.items.map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone="blue">
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
          kicker="Review"
          title="What the next reset should ask"
          description="Use the review lane to decide whether the work actually changed, not just whether activity happened."
        >
          <ul className="note-list">
            {scopedReview.items.map((item) => (
              <li className="note-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
