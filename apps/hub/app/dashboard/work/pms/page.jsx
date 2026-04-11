import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getWorkPmsPageData } from "@/lib/server-data";

export default async function WorkPmsPage({ searchParams }) {
  const {
    pmsBoard,
    weeklyReview,
    taskQueue,
    githubConnection,
    githubRepoCards,
    githubActivityRows,
    githubAlerts,
    githubSyncRows,
    githubTotals,
    hasGitHubData,
  } = await getWorkPmsPageData();
  const selectedProject = resolveWorkContext(searchParams?.project);
  const scopedRepoCards = scopeMappedItemsByWorkContext(
    githubRepoCards,
    selectedProject.value,
    (item) => [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead],
  );
  const scopedActivity = scopeMappedItemsByWorkContext(
    githubActivityRows,
    selectedProject.value,
    (item) => [item.title, item.detail, item.repository],
  );
  const scopedAlerts = scopeMappedItemsByWorkContext(
    githubAlerts,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );
  const scopedChecks = scopeMappedItemsByWorkContext(
    pmsBoard,
    selectedProject.value,
    (item) => [item.title, item.detail, item.rhythm],
  );
  const scopedTasks = scopeMappedItemsByWorkContext(
    taskQueue,
    selectedProject.value,
    (item) => [item.title, item.detail, item.project],
  );
  const scopedReview = scopeMappedItemsByWorkContext(
    weeklyReview,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );

  const scopeNote =
    selectedProject.value === "all"
      ? "All project contexts are visible in one delivery control surface."
      : scopedRepoCards.isFallback && scopedActivity.isFallback
        ? `${selectedProject.label} is selected, but GitHub repo-to-project mapping is still falling back to the shared lane where exact repo matches are missing.`
        : `${selectedProject.label} delivery context is active.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>PMS delivery control tower</h1>
        <p>
          This PMS view turns GitHub work history, PR pressure, issue flow, and cadence checks into one
          operator surface. The point is not more status. The point is a smaller, sharper control loop.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="PMS delivery summary">
        <SummaryCard
          title="Tracked Repos"
          value={String(githubTotals.repositoryCount)}
          detail="Repositories currently visible inside the PMS lane."
          badge="GitHub"
          tone={hasGitHubData ? "green" : "warning"}
        />
        <SummaryCard
          title="Open PRs"
          value={String(githubTotals.openPullCount)}
          detail="Review and merge pressure that still needs operator judgment."
          badge="Review"
          tone="blue"
        />
        <SummaryCard
          title="Open Issues"
          value={String(githubTotals.openIssueCount)}
          detail="Work still unresolved enough to threaten delivery clarity."
          badge="Backlog"
          tone="warning"
        />
        <SummaryCard
          title="Cadence Checks"
          value={String(scopedChecks.items.length)}
          detail="Rhythm blocks that keep the delivery lane from drifting."
          badge="Cadence"
          tone="muted"
        />
      </section>

      <div className="split-grid">
        <SectionCard
          kicker="Connection"
          title={githubConnection.title}
          description={githubConnection.detail}
        >
          <div className="template-grid">
            <div className="template-row">
              <div>
                <strong>Status</strong>
                <p>GitHub is feeding the PMS lane as a read-only source for work history and progress.</p>
              </div>
              <span className="legend-chip" data-tone={githubConnection.tone}>
                {githubConnection.status}
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>Recent syncs</strong>
                <p>Connection ledger stays here so delivery issues do not hide behind silent integrations.</p>
              </div>
            </div>
          </div>
          <div className="timeline">
            {(githubSyncRows.length
              ? githubSyncRows
              : [
                  {
                    title: "No sync runs recorded yet",
                    detail: "Live GitHub reads can still work before sync automation is added to the ledger.",
                    time: "Pending",
                    tone: "warning",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone || "muted"}>
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
          kicker="Alerts"
          title="What needs intervention"
          description="The PMS lane should surface review pressure, blocked work, and sync failures before they spread."
        >
          <ul className="note-list">
            {scopedAlerts.items.map((item) => (
              <li className="note-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className="legend-chip" data-tone={item.tone}>
                  {item.tone}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Delivery board"
        title="Repository shipping pulse"
        description="Each repo should show whether work is moving, what is blocking it, and what the next operator action is."
      >
        <div className="project-grid">
          {scopedRepoCards.items.map((project) => (
            <article className="project-card" key={project.title}>
              <div className="project-head">
                <div>
                  <h3>{project.title}</h3>
                  <p>{project.owner}</p>
                </div>
                <span className="legend-chip" data-tone={project.statusTone}>
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
                  <dt>Delivery Pulse</dt>
                  <dd>{project.taskSummary}</dd>
                </div>
                <div>
                  <dt>Latest Signal</dt>
                  <dd>{project.taskLead}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          kicker="Shipping feed"
          title="Recent GitHub motion"
          description="Commits, PR movement, and issue churn are only useful when they stay close to the delivery conversation."
        >
          <div className="timeline">
            {(scopedActivity.items.length
              ? scopedActivity.items
              : [
                  {
                    title: "No GitHub activity visible yet",
                    detail: "Once repositories are reachable, commits, PRs, and issue changes will land here.",
                    time: "Pending",
                    tone: "muted",
                    repository: "GitHub",
                  },
                ]
            ).map((item) => (
              <div className="timeline-item" key={`${item.title}-${item.time}`}>
                <div className="inline-legend">
                  <span className="legend-chip" data-tone={item.tone}>
                    {item.repository || item.time}
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
          kicker="Cadence"
          title="Checks and follow-through"
          description="GitHub should sharpen the review ritual, not replace it."
        >
          <div className="check-grid">
            {scopedChecks.items.map((item) => (
              <article className="check-card" key={item.title}>
                <div className="project-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.rhythm}</p>
                  </div>
                  <span className="legend-chip" data-tone={item.statusTone}>
                    {item.statusLabel}
                  </span>
                </div>
                <p className="check-detail">{item.detail}</p>
              </article>
            ))}
          </div>
          <ul className="task-list">
            {scopedTasks.items.slice(0, 4).map((item) => (
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

      <SectionCard
        kicker="Review"
        title="Weekly prompts"
        description="Use the weekly pass to connect delivery movement back to deliberate decisions."
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
  );
}
