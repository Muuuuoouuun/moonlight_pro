import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getRoadmapPageData } from "@/lib/server-data";

export default async function WorkRoadmapPage({ searchParams }) {
  const {
    roadmapRows,
    shippingRows,
    roadmapAlerts,
    githubConnection,
    githubTotals,
    hasGitHubData,
  } = await getRoadmapPageData();
  const selectedProject = resolveWorkContext(searchParams?.project);
  const scopedRoadmap = scopeMappedItemsByWorkContext(
    roadmapRows,
    selectedProject.value,
    (item) => [item.title, item.lane, item.source, item.detail],
  );
  const scopedShipping = scopeMappedItemsByWorkContext(
    shippingRows,
    selectedProject.value,
    (item) => [item.title, item.detail, item.repository],
  );
  const scopedAlerts = scopeMappedItemsByWorkContext(
    roadmapAlerts,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );

  const activeLanes = scopedRoadmap.items.filter((item) => item.status !== "completed" && item.status !== "done").length;
  const riskLanes = scopedRoadmap.items.filter((item) => item.statusTone === "danger").length + scopedAlerts.items.filter((item) => item.tone === "danger").length;
  const scopeNote =
    selectedProject.value === "all"
      ? "Local milestones and GitHub milestones are visible in one roadmap board."
      : scopedRoadmap.isFallback && scopedShipping.isFallback
        ? `${selectedProject.label} is selected, but roadmap rows still use the shared lane where repo or project mapping is not explicit yet.`
        : `${selectedProject.label} roadmap context is active.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Roadmap and release lanes</h1>
        <p>
          The roadmap should make horizon, risk, and delivery pressure visible at the same time. This
          page combines Hub milestones with GitHub milestone motion so work can be steered before it slips.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Roadmap summary">
        <SummaryCard
          title="Roadmap Lanes"
          value={String(scopedRoadmap.items.length)}
          detail="Local and GitHub milestone rows currently visible in the roadmap board."
          badge="Plan"
          tone="blue"
        />
        <SummaryCard
          title="Active Lanes"
          value={String(activeLanes)}
          detail="Milestones still moving and not yet closed."
          badge="In Motion"
          tone="warning"
        />
        <SummaryCard
          title="Merged Recently"
          value={String(githubTotals.mergedPullCount)}
          detail="Recent GitHub merges that show shipping motion, not just planning intent."
          badge="Ship"
          tone={hasGitHubData ? "green" : "muted"}
        />
        <SummaryCard
          title="Risk Signals"
          value={String(riskLanes)}
          detail="Lanes or alerts that look close to slipping or losing clarity."
          badge="Risk"
          tone="danger"
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
                <strong>Roadmap source</strong>
                <p>Hub milestones and GitHub milestones are blended here so release planning keeps one operating language.</p>
              </div>
              <span className="legend-chip" data-tone={githubConnection.tone}>
                {githubConnection.status}
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>GitHub milestone count</strong>
                <p>{githubTotals.roadmapCount} GitHub milestones are currently visible in the live roadmap source.</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          kicker="Risks"
          title="What can slip next"
          description="A roadmap is only useful if it points to the lanes that are about to drift."
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
        kicker="Board"
        title="Milestones and roadmap lanes"
        description="Every lane should show what it is, where it belongs, how far it has moved, and what threatens the delivery date."
      >
        <div className="project-grid">
          {(scopedRoadmap.items.length
            ? scopedRoadmap.items
            : [
                {
                  title: "Roadmap lane waiting for milestone data",
                  lane: "Roadmap",
                  source: "Hub",
                  statusLabel: "pending",
                  statusTone: "warning",
                  progress: 0,
                  due: "No target date",
                  detail: "Create Hub milestones or connect GitHub milestones to turn this board into a live roadmap.",
                },
              ]
          ).map((item) => (
            <article className="project-card" key={`${item.source}-${item.lane}-${item.title}`}>
              <div className="project-head">
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.lane} · {item.source}
                  </p>
                </div>
                <span className="legend-chip" data-tone={item.statusTone}>
                  {item.statusLabel}
                </span>
              </div>

              <div className="progress-row">
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
                <strong>{item.progress}%</strong>
              </div>

              <dl className="detail-stack">
                <div>
                  <dt>Due</dt>
                  <dd>{item.due}</dd>
                </div>
                <div>
                  <dt>Lane</dt>
                  <dd>{item.lane}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{item.source}</dd>
                </div>
                <div>
                  <dt>Next Read</dt>
                  <dd>{item.detail}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        kicker="Shipping feed"
        title="Recent release motion"
        description="Merged PRs, milestone movement, and project updates belong close to the roadmap so planning never drifts from reality."
      >
        <div className="timeline">
          {scopedShipping.items.map((item) => (
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
    </div>
  );
}
