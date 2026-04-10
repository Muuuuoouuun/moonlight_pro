import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { getPmsPageData, getProjectsPageData } from "@/lib/server-data";

function countProjects(projectPortfolio, predicate) {
  return projectPortfolio.filter(predicate).length;
}

export default async function WorkOverviewPage() {
  const [{ projectPortfolio, projectUpdates, taskQueue }, { pmsBoard, weeklyReview }] = await Promise.all([
    getProjectsPageData(),
    getPmsPageData(),
  ]);

  const activeProjects = countProjects(projectPortfolio, (project) => project.status === "active");
  const blockedProjects = countProjects(
    projectPortfolio,
    (project) =>
      project.status === "blocked" ||
      project.risk === "Critical" ||
      project.risk.toLowerCase().includes("blocked"),
  );
  const cadenceBlocks = pmsBoard.length;
  const resetPrompts = weeklyReview.length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Projects, rhythm, and decisions</h1>
        <p>
          The work lane keeps active projects, recurring reviews, and decision follow-through visible
          enough to act on without turning the hub into a status museum.
        </p>
      </section>

      <section className="summary-grid" aria-label="Work OS summary metrics">
        <SummaryCard
          title="Active Projects"
          value={String(activeProjects)}
          detail="Work is concentrated enough to keep the current portfolio believable."
          badge="Execution"
        />
        <SummaryCard
          title="Cadence Blocks"
          value={String(cadenceBlocks)}
          detail="Routine checkpoints are explicit instead of hidden in the day."
          badge="Rhythm"
          tone="muted"
        />
        <SummaryCard
          title="Reset Prompts"
          value={String(resetPrompts)}
          detail="Weekly review cues keep the work lane from drifting."
          badge="Review"
          tone="blue"
        />
        <SummaryCard
          title="At-Risk Lanes"
          value={String(blockedProjects)}
          detail="Blocked or critical work should surface before it becomes noise."
          badge="Focus"
          tone="warning"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="Projects"
          title="Portfolio movement"
          description="The live project board keeps milestones, next actions, and risk visible in one scan."
        >
          <div className="project-grid">
            {projectPortfolio.map((project) => (
              <article className="project-card" key={project.title}>
                <div className="project-head">
                  <div>
                    <h3>{project.title}</h3>
                    <p>{project.owner}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={project.statusTone}
                  >
                    {project.statusLabel}
                  </span>
                </div>

                <div className="progress-row">
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: `${project.progress}%` }} />
                  </div>
                  <strong>{project.progress}%</strong>
                </div>

                <dl className="detail-stack">
                  <div>
                    <dt>Milestone</dt>
                    <dd>{project.milestone}</dd>
                  </div>
                  <div>
                    <dt>Next Action</dt>
                    <dd>{project.nextAction}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{project.risk}</dd>
                  </div>
                  <div>
                    <dt>Task Lane</dt>
                    <dd>{project.taskSummary}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Tasks"
          title="Execution queue"
          description="Tasks keep the rhythm lane tied to concrete next moves instead of abstract intent."
        >
          <ul className="task-list">
            {taskQueue.map((item) => (
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

        <SectionCard
          kicker="Recent motion"
          title="What changed recently"
          description="Progress matters when the update carries a next move instead of just a timestamp."
        >
          <div className="timeline">
            {projectUpdates.map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.time}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
