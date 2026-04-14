import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { RoutineCheckForm } from "@/components/forms/routine-check-form";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getPmsPageData } from "@/lib/server-data";

export default async function WorkRhythmPage({ searchParams }) {
  const { pmsBoard, weeklyReview, taskQueue } = await getPmsPageData();
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const selectedProject = resolveWorkContext(searchParams?.project);
  const scopedChecks = scopeMappedItemsByWorkContext(
    pmsBoard,
    selectedProject.value,
    (item) => [item.title, item.detail, item.rhythm],
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopedTasks = scopeMappedItemsByWorkContext(
    taskQueue,
    selectedProject.value,
    (item) => [item.title, item.detail, item.project],
  );

  const doneChecks = scopedChecks.items.filter((item) => item.status === "done").length;
  const pendingChecks = scopedChecks.items.filter((item) => item.status === "pending").length;
  const blockedChecks = scopedChecks.items.filter((item) => item.status === "blocked").length;
  const scopeNote =
    selectedProject.value === "all"
      ? "Cadence blocks from every project stay visible together."
      : scopedChecks.isFallback && scopedReview.isFallback && scopedTasks.isFallback
        ? `${selectedProject.label} is selected, but rhythm rows are still shared until project-level cadence tagging is richer.`
        : `${selectedProject.label} rhythm is now driving this review lane.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Rhythm blocks and weekly reset</h1>
        <p>
          Rhythm is the cadence layer of the OS. It keeps the operator from drifting into reactive work
          by making checkpoints and review prompts explicit.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Rhythm summary metrics">
        <SummaryCard title="Done" value={String(doneChecks)} detail="Closed cadence blocks." badge="Complete" />
        <SummaryCard
          title="Pending"
          value={String(pendingChecks)}
          detail="Waiting on the next deliberate pass."
          badge="Rhythm"
          tone="warning"
        />
        <SummaryCard
          title="Blocked"
          value={String(blockedChecks)}
          detail="Cadence items that cannot move without intervention."
          badge="Attention"
          tone="danger"
        />
        <SummaryCard
          title="Reset Prompts"
          value={String(scopedReview.items.length)}
          detail="Short prompts for the weekly reset loop."
          badge="Review"
          tone="muted"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="Capture"
          title="Record a rhythm check"
          description="Save a cadence check directly from the OS so the rhythm layer stays real, not theoretical."
        >
          <RoutineCheckForm defaultWorkspaceId={defaultWorkspaceId} />
        </SectionCard>

        <div className="split-grid">
        <SectionCard
          kicker="Cadence"
          title="Today&apos;s checkpoints"
          description="Each block should have a time, a purpose, and a visible status."
        >
          <div className="check-grid">
            {scopedChecks.items.map((item) => (
              <article className="check-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.rhythm}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={item.statusTone}
                  >
                    {item.statusLabel}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Review"
          title="Weekly reset prompts"
          description="A weekly pass keeps project motion and operating judgment aligned."
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

      <SectionCard
        kicker="Tasks"
        title="What this rhythm should move next"
        description="Cadence is useful when it points at the concrete tasks that need motion right now."
      >
        <ul className="task-list">
          {scopedTasks.items.map((item) => (
            <li className="task-item" key={`${item.title}-${item.project}`}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <div className="inline-legend">
                <span className="legend-chip" data-tone="muted">
                  {item.project}
                </span>
                <span className="legend-chip" data-tone={item.statusTone}>
                  {item.statusLabel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
