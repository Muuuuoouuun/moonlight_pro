import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { WORK_CONTEXTS, resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getLocalProjectRepositoryData, getProjectsPageData, getWorkPmsPageData } from "@/lib/server-data";

function average(values) {
  const source = values.filter((value) => Number.isFinite(value));

  if (!source.length) {
    return 0;
  }

  return Math.round(source.reduce((total, value) => total + value, 0) / source.length);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function scaleMetric(value, max) {
  if (!value || !max) {
    return 0;
  }

  return Math.max(12, Math.round((value / max) * 100));
}

function scopeStrict(items, contextValue, selector) {
  if (contextValue === "all") {
    return items || [];
  }

  const scoped = scopeMappedItemsByWorkContext(items || [], contextValue, selector);
  return scoped.isFallback ? [] : scoped.items;
}

function projectSelector(item) {
  return [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead];
}

function taskSelector(item) {
  return [item.title, item.detail, item.project];
}

function updateSelector(item) {
  return [item.title, item.detail];
}

function repoSelector(item) {
  return [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead];
}

function alertSelector(item) {
  return [item.title, item.detail];
}

function activitySelector(item) {
  return [item.title, item.detail, item.repository];
}

function bundleSelector(bundle) {
  return [
    bundle.repository,
    bundle.repo?.name,
    bundle.repo?.full_name,
    bundle.repo?.description,
    ...bundle.milestones.map((item) => item.title),
    ...bundle.openPulls.map((item) => item.title),
    ...bundle.issues.map((item) => item.title),
    ...bundle.commits.slice(0, 6).map((item) => item.commit?.message),
  ];
}

function getProjectBlockers(projects) {
  return projects.filter(
    (item) =>
      item.status === "blocked" ||
      item.risk === "Critical" ||
      item.risk?.toLowerCase().includes("blocked"),
  ).length;
}

function getPanelStatus({ blockerCount, openPullCount, recentCommitCount, progress }) {
  if (blockerCount > 0) {
    return {
      statusLabel: "needs attention",
      statusTone: "danger",
    };
  }

  if (openPullCount > 0 || recentCommitCount > 0) {
    return {
      statusLabel: "in motion",
      statusTone: "blue",
    };
  }

  if (progress >= 75) {
    return {
      statusLabel: "steady",
      statusTone: "green",
    };
  }

  return {
    statusLabel: "staging",
    statusTone: "warning",
  };
}

function buildManagementPanels({
  projectPortfolio,
  projectUpdates,
  taskQueue,
  pmsBoard,
  weeklyReview,
  githubRepoCards,
  githubActivityRows,
  githubAlerts,
  githubBundles,
  localRepositories,
}) {
  const localRepositoryByContext = new Map((localRepositories || []).map((item) => [item.contextValue, item]));

  return WORK_CONTEXTS.filter((context) => context.value !== "all").map((context) => {
    const projects = scopeStrict(projectPortfolio, context.value, projectSelector);
    const tasks = scopeStrict(taskQueue, context.value, taskSelector);
    const updates = scopeStrict(projectUpdates, context.value, updateSelector);
    const checks = scopeStrict(pmsBoard, context.value, (item) => [item.title, item.detail, item.rhythm]);
    const reviewItems = scopeStrict(weeklyReview, context.value, updateSelector);
    const repoCards = scopeStrict(githubRepoCards, context.value, repoSelector);
    const activityRows = scopeStrict(githubActivityRows, context.value, activitySelector);
    const alerts = scopeStrict(githubAlerts, context.value, alertSelector);
    const bundles = scopeStrict(githubBundles, context.value, bundleSelector);
    const localRepository = localRepositoryByContext.get(context.value);

    const blockedTaskCount = tasks.filter((item) => item.status === "blocked").length;
    const blockedProjectCount = getProjectBlockers(projects);
    const alertCount = alerts.filter((item) => item.tone === "warning" || item.tone === "danger").length;
    const recentCommitCount = sum(bundles.map((bundle) => bundle.commits.length));
    const openPullCount = sum(bundles.map((bundle) => bundle.openPulls.length));
    const openIssueCount = sum(bundles.map((bundle) => bundle.issues.length));
    const repoCount = bundles.filter((bundle) => bundle.repo).length;
    const connectedRepoCount = localRepository?.repository ? Math.max(repoCount, 1) : repoCount;
    const progress = average([
      ...projects.map((item) => item.progress),
      ...repoCards.map((item) => item.progress),
    ]);
    const blockerCount = blockedTaskCount + blockedProjectCount + alertCount;
    const lastActivity = activityRows[0];
    const lastUpdate = updates[0];
    const nextTask = tasks.find((item) => item.status !== "done");
    const nextRepoMove = repoCards[0]?.nextAction;
    const nextProjectMove = projects[0]?.nextAction;
    const focusText = [
      connectedRepoCount ? `${connectedRepoCount} repos` : null,
      projects.length ? `${projects.length} project lanes` : null,
      checks.length ? `${checks.length} cadence checks` : null,
      reviewItems.length ? `${reviewItems.length} reset prompts` : null,
      localRepository?.branch ? `${localRepository.branch} local branch` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const { statusLabel, statusTone } = getPanelStatus({
      blockerCount,
      openPullCount,
      recentCommitCount,
      progress,
    });

    return {
      context,
      progress,
      projectCount: projects.length,
      taskCount: tasks.length,
      blockedTaskCount,
      blockerCount,
      repoCount: connectedRepoCount,
      openPullCount,
      openIssueCount,
      recentCommitCount,
      cadenceCount: checks.length,
      statusLabel,
      statusTone,
      localRepository,
      nextAction:
        nextTask?.detail ||
        (localRepository?.dirtyCount
          ? `Commit or stash ${localRepository.dirtyCount} local ${localRepository.dirtyCount === 1 ? "change" : "changes"} in ${localRepository.contextLabel}.`
          : null) ||
        (localRepository?.aheadCount
          ? `Push ${localRepository.contextLabel} to origin so GitHub reflects the latest branch state.`
          : null) ||
        (localRepository?.behindCount
          ? `Pull the latest origin changes into ${localRepository.contextLabel} before continuing.`
          : null) ||
        nextProjectMove ||
        nextRepoMove ||
        "Define the next move so this lane does not drift into passive monitoring.",
      lastSignal: lastActivity
        ? `${lastActivity.detail} · ${lastActivity.time}`
        : localRepository?.lastCommitAt
          ? `${localRepository.lastCommitMessage} · ${localRepository.detail}`
        : lastUpdate
          ? `${lastUpdate.detail} · ${lastUpdate.time}`
          : "No recent GitHub or hub motion is mapped to this lane yet.",
      focusText: focusText || "Project, task, and repo mapping still needs richer tagging for this lane.",
      exactSignalCount:
        projects.length +
        tasks.length +
        updates.length +
        repoCards.length +
        activityRows.length +
        alerts.length +
        bundles.length +
        (localRepository?.repository ? 1 : 0),
    };
  });
}

function buildAttentionRows(panels, tasks, alerts, selectedProject) {
  const scopedTasks = scopeStrict(tasks, selectedProject.value, taskSelector);
  const scopedAlerts = scopeStrict(alerts, selectedProject.value, alertSelector);
  const blockedTasks = scopedTasks.filter((item) => item.status === "blocked");

  const rows = [
    ...panels
      .filter((item) => item.blockerCount > 0)
      .map((item) => ({
        title: `${item.context.label} needs intervention`,
        detail: `${item.blockerCount} blocker signals are visible. Start with: ${item.nextAction}`,
        tone: item.statusTone,
      })),
    ...blockedTasks.slice(0, 3).map((item) => ({
      title: item.title,
      detail: item.detail,
      tone: "danger",
    })),
    ...scopedAlerts.map((item) => ({
      title: item.title,
      detail: item.detail,
      tone: item.tone,
    })),
  ].slice(0, 6);

  return rows.length
    ? rows
    : [
        {
          title: "Manager queue is calm",
          detail: "No blockers, failed syncs, or flagged GitHub signals are dominating the current lane.",
          tone: "green",
        },
      ];
}

export default async function WorkManagementPage({ searchParams }) {
  const [{ projectPortfolio, projectUpdates, taskQueue }, pmsData] = await Promise.all([
    getProjectsPageData(),
    getWorkPmsPageData(),
  ]);
  const localRepositoryData = getLocalProjectRepositoryData();
  const {
    pmsBoard,
    weeklyReview,
    githubConnection,
    githubRepoCards,
    githubActivityRows,
    githubAlerts,
    githubTotals,
    githubBundles,
    hasGitHubData,
  } = pmsData;
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);
  const panels = buildManagementPanels({
    projectPortfolio,
    projectUpdates,
    taskQueue,
    pmsBoard,
    weeklyReview,
    githubRepoCards,
    githubActivityRows,
    githubAlerts,
    githubBundles,
    localRepositories: localRepositoryData.projects,
  });
  const visiblePanels =
    selectedProject.value === "all"
      ? panels
      : panels.filter((item) => item.context.value === selectedProject.value);
  const metricMax = {
    tasks: Math.max(...visiblePanels.map((item) => item.taskCount), 1),
    commits: Math.max(...visiblePanels.map((item) => item.recentCommitCount), 1),
    pulls: Math.max(...visiblePanels.map((item) => item.openPullCount), 1),
    blockers: Math.max(...visiblePanels.map((item) => item.blockerCount), 1),
  };
  const decoratedPanels = visiblePanels.map((item) => ({
    ...item,
    signalBars: [
      {
        label: "Tasks",
        value: item.taskCount,
        width: scaleMetric(item.taskCount, metricMax.tasks),
      },
      {
        label: "Commits",
        value: item.recentCommitCount,
        width: scaleMetric(item.recentCommitCount, metricMax.commits),
      },
      {
        label: "PRs",
        value: item.openPullCount,
        width: scaleMetric(item.openPullCount, metricMax.pulls),
      },
      {
        label: "Blockers",
        value: item.blockerCount,
        width: scaleMetric(item.blockerCount, metricMax.blockers),
      },
    ],
  }));
  const strictActivity =
    selectedProject.value === "all"
      ? githubActivityRows
      : scopeStrict(githubActivityRows, selectedProject.value, activitySelector);
  const strictUpdates =
    selectedProject.value === "all"
      ? projectUpdates
      : scopeStrict(projectUpdates, selectedProject.value, updateSelector);
  const attentionRows = buildAttentionRows(decoratedPanels, taskQueue, githubAlerts, selectedProject);
  const averageProgress = average(decoratedPanels.map((item) => item.progress));
  const totalTasks = sum(decoratedPanels.map((item) => item.taskCount));
  const totalCommits = sum(decoratedPanels.map((item) => item.recentCommitCount));
  const totalBlockers = sum(decoratedPanels.map((item) => item.blockerCount));
  const totalLocalRepos = sum(decoratedPanels.map((item) => (item.localRepository?.repository ? 1 : 0)));
  const missingScopedData = selectedProject.value !== "all" && decoratedPanels.every((item) => item.exactSignalCount === 0);
  const scopeNote =
    selectedProject.value === "all"
      ? "Every personal project lane is compared in one management surface."
      : missingScopedData
        ? `${selectedProject.label} is selected, but repo or task naming still needs richer mapping before this lane can isolate every signal perfectly.`
        : `${selectedProject.label} management context is active with scoped project, task, and GitHub signals.`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Project management control view</h1>
        <p>
          This management tab gives each personal project one operating card. Progress, tasks, commits,
          PR pressure, and blockers stay visible together so it is obvious where to steer next.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>{scopeNote}</span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Management summary metrics">
        <SummaryCard
          title="Tracked Projects"
          value={String(decoratedPanels.length)}
          detail="Project lanes currently visible in the management board."
          badge="Portfolio"
          tone="blue"
        />
        <SummaryCard
          title="Average Progress"
          value={`${averageProgress}%`}
          detail="Blended completion signal across project and repository lanes."
          badge="Progress"
          tone="green"
        />
        <SummaryCard
          title="Recent Commits"
          value={String(totalCommits)}
          detail="Recent commit volume currently feeding the visible management lanes."
          badge="GitHub"
          tone={hasGitHubData ? "green" : "muted"}
        />
        <SummaryCard
          title="Local Repos"
          value={String(totalLocalRepos)}
          detail="Mapped local git repositories currently tied to visible project lanes."
          badge="Workspace"
          tone="green"
        />
        <SummaryCard
          title="Open Tasks"
          value={String(totalTasks)}
          detail="Task volume still waiting for movement or closure."
          badge="Execution"
          tone="warning"
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
                <strong>Management source</strong>
                <p>Hub project motion and GitHub delivery signals are blended here into one manager-facing view.</p>
              </div>
              <span className="legend-chip" data-tone={githubConnection.tone}>
                {githubConnection.status}
              </span>
            </div>
            <div className="template-row">
              <div>
                <strong>GitHub totals</strong>
                <p>
                  {githubTotals.repositoryCount} repos · {githubTotals.openPullCount} open PRs ·{" "}
                  {githubTotals.openIssueCount} open issues
                </p>
              </div>
            </div>
            <div className="template-row">
              <div>
                <strong>Local workspace mapping</strong>
                <p>
                  {localRepositoryData.totals.connectedRepositoryCount} mapped repos ·{" "}
                  {localRepositoryData.totals.dirtyRepositoryCount} dirty ·{" "}
                  {localRepositoryData.totals.aheadRepositoryCount} ahead ·{" "}
                  {localRepositoryData.totals.behindRepositoryCount} behind
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          kicker="Attention"
          title="What needs manager action"
          description="This queue stays short on purpose. It should tell you where to intervene next, not become another inbox."
        >
          <ul className="note-list">
            {attentionRows.map((item) => (
              <li className="note-row" key={`${item.title}-${item.detail}`}>
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
        kicker="Portfolio"
        title="Per-project management board"
        description="Each card compresses the state of a personal project into one scan: progress, task pressure, GitHub motion, and the next move."
      >
        <div className="management-grid">
          {decoratedPanels.map((item) => (
            <article className="management-card" key={item.context.value}>
              <div className="management-card-head">
                <div>
                  <p className="section-kicker">{item.context.label}</p>
                  <h3>{item.context.label}</h3>
                  <p>{item.context.description}</p>
                </div>
                <div className="management-progress">
                  <strong>{item.progress}%</strong>
                  <span>delivery health</span>
                </div>
              </div>

              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${item.progress}%` }} />
              </div>

              <div className="management-meter-grid">
                <div className="management-meter">
                  <span>Projects</span>
                  <strong>{item.projectCount}</strong>
                  <p>Linked project lanes</p>
                </div>
                <div className="management-meter">
                  <span>Repos</span>
                  <strong>{item.repoCount}</strong>
                  <p>GitHub sources mapped</p>
                </div>
                <div className="management-meter">
                  <span>Issues</span>
                  <strong>{item.openIssueCount}</strong>
                  <p>Open issue pressure</p>
                </div>
                <div className="management-meter">
                  <span>Status</span>
                  <strong>{item.statusLabel}</strong>
                  <p>{item.blockerCount ? `${item.blockerCount} blockers visible` : "No urgent blockers surfaced"}</p>
                </div>
              </div>

              <div className="metric-bar-list" aria-label={`${item.context.label} signal bars`}>
                {item.signalBars.map((bar) => (
                  <div className="metric-bar-row" key={bar.label}>
                    <div className="metric-bar-head">
                      <span>{bar.label}</span>
                      <strong>{bar.value}</strong>
                    </div>
                    <div className="metric-bar-track" aria-hidden="true">
                      <span
                        data-tone={bar.label === "Blockers" ? "danger" : bar.label === "Commits" ? "blue" : "green"}
                        style={{ width: `${bar.width}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <dl className="detail-stack">
                <div>
                  <dt>Next Action</dt>
                  <dd>{item.nextAction}</dd>
                </div>
                <div>
                  <dt>Latest Signal</dt>
                  <dd>{item.lastSignal}</dd>
                </div>
                <div>
                  <dt>Manager Read</dt>
                  <dd>{item.focusText}</dd>
                </div>
                <div>
                  <dt>Local Repo</dt>
                  <dd>
                    {item.localRepository?.repository
                      ? `${item.localRepository.repository} · ${item.localRepository.detail}`
                      : "No local repository mapping detected for this project context yet."}
                  </dd>
                </div>
              </dl>

              <div className="inline-legend">
                <span className="legend-chip" data-tone={item.statusTone}>
                  {item.statusLabel}
                </span>
                <span className="legend-chip" data-tone="muted">
                  {item.cadenceCount} cadence checks
                </span>
                {item.localRepository?.repository ? (
                  <span className="legend-chip" data-tone={item.localRepository.statusTone}>
                    {item.localRepository.statusLabel}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        kicker="Signals"
        title="Commits and work history"
        description="GitHub activity and hub updates stay close so project progress is grounded in actual shipped motion."
      >
        <div className="split-grid">
          <div className="timeline">
            {(strictActivity.length
              ? strictActivity
              : [
                  {
                    title: "No GitHub activity mapped yet",
                    detail: "Connect repositories or tighten project naming to start seeing commit, PR, and issue history here.",
                    time: "Pending",
                    tone: "warning",
                  },
                ]
            )
              .slice(0, 6)
              .map((item) => (
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

          <div className="timeline">
            {(strictUpdates.length
              ? strictUpdates
              : [
                  {
                    title: "No project updates recorded yet",
                    detail: "Hub-side updates will appear here once progress is logged from the project update form.",
                    time: "Pending",
                    tone: "muted",
                  },
                ]
            )
              .slice(0, 6)
              .map((item) => (
                <div className="timeline-item" key={`${item.title}-${item.time}`}>
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
        </div>
      </SectionCard>

      <SectionCard
        kicker="Matrix"
        title="Portfolio comparison"
        description="This compact matrix helps compare work volume and blocker pressure across your personal project lanes without opening each card."
      >
        <div className="management-matrix">
          {decoratedPanels.map((item) => (
            <div className="management-matrix-row" key={`matrix-${item.context.value}`}>
              <div className="management-matrix-project">
                <strong>{item.context.label}</strong>
                <span>{item.statusLabel}</span>
              </div>
              <div className="management-matrix-bars">
                <div className="management-matrix-bar">
                  <label>Progress</label>
                  <div className="metric-bar-track" aria-hidden="true">
                    <span data-tone="green" style={{ width: `${Math.max(item.progress, 8)}%` }} />
                  </div>
                </div>
                <div className="management-matrix-bar">
                  <label>Commits</label>
                  <div className="metric-bar-track" aria-hidden="true">
                    <span data-tone="blue" style={{ width: `${scaleMetric(item.recentCommitCount, metricMax.commits)}%` }} />
                  </div>
                </div>
                <div className="management-matrix-bar">
                  <label>Tasks</label>
                  <div className="metric-bar-track" aria-hidden="true">
                    <span data-tone="green" style={{ width: `${scaleMetric(item.taskCount, metricMax.tasks)}%` }} />
                  </div>
                </div>
                <div className="management-matrix-bar">
                  <label>Blockers</label>
                  <div className="metric-bar-track" aria-hidden="true">
                    <span data-tone="danger" style={{ width: `${scaleMetric(item.blockerCount, metricMax.blockers)}%` }} />
                  </div>
                </div>
              </div>
              <div className="management-matrix-meta">
                <span>{item.recentCommitCount} commits</span>
                <span>{item.taskCount} tasks</span>
                <span>{item.blockerCount} blockers</span>
              </div>
            </div>
          ))}
        </div>
        <p className="footnote">
          {totalBlockers
            ? `${totalBlockers} blocker signals are visible across the current view.`
            : "No blocker signals are dominating the current management view."}
        </p>
      </SectionCard>
    </div>
  );
}
