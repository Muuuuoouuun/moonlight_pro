import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { ProjectUpdateForm } from "@/components/forms/project-update-form";
import { getProjectsPageData } from "@/lib/server-data";

export default async function WorkProjectsPage() {
  const { projectPortfolio, projectUpdates, taskQueue } = await getProjectsPageData();
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";

  const activeProjects = projectPortfolio.filter((project) => project.status === "active").length;
  const plannedProjects = projectPortfolio.filter((project) => project.status === "draft").length;
  const blockedProjects = projectPortfolio.filter(
    (project) =>
      project.status === "blocked" ||
      project.risk === "Critical" ||
      project.risk.toLowerCase().includes("blocked"),
  ).length;
  const completedProjects = projectPortfolio.filter((project) => project.status === "completed").length;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Project portfolio and blockers</h1>
        <p>
          Each project should show what moved, what is blocked, and what the next action actually is.
          The lane stays useful when progress is easier to spot than busyness.
        </p>
      </section>

      <section className="summary-grid" aria-label="Project portfolio summary">
        <SummaryCard title="Active" value={String(activeProjects)} detail="Currently moving." badge="Execution" />
        <SummaryCard
          title="Planned"
          value={String(plannedProjects)}
          detail="Shaped enough to track, but not moving yet."
          badge="Momentum"
          tone="warning"
        />
        <SummaryCard
          title="Blocked"
          value={String(blockedProjects)}
          detail="Needs clear ownership before it can move."
          badge="Attention"
          tone="warning"
        />
        <SummaryCard
          title="Completed"
          value={String(completedProjects)}
          detail="Closed loops that should not quietly reopen."
          badge="Finish"
          tone="green"
        />
      </section>

      <div className="stack">
        <SectionCard
          kicker="Capture"
          title="Quick project update"
          description="Log movement from inside the hub so the project board becomes a live operating record."
        >
          <ProjectUpdateForm defaultWorkspaceId={defaultWorkspaceId} />
        </SectionCard>

        <SectionCard
          kicker="Portfolio"
          title="Live project board"
          description="Keep each card short enough that the next action is obvious without opening a doc."
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
                  <div>
                    <dt>Task Focus</dt>
                    <dd>{project.taskLead}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Tasks"
          title="Linked execution queue"
          description="A project board is healthier when the next task is visible without opening another tool."
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
          kicker="Updates"
          title="What changed recently"
          description="The project lane should answer whether progress happened, not just whether time passed."
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
