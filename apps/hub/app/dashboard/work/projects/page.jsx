import Link from "next/link";
import { WorkContextBridge } from "@/components/dashboard/work-context-bridge";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { ProjectUpdateForm } from "@/components/forms/project-update-form";
import { resolveWorkContext, scopeMappedItemsByWorkContext } from "@/lib/dashboard-contexts";
import { getLocalProjectRepositoryData, getProjectsPageData, getWorkPmsPageData } from "@/lib/server-data";
import {
  buildWorkContextHref,
  formatWorkMetric,
  getVisibleWorkContexts,
  scopeStrictWorkItems,
  sumWorkValues,
} from "@/lib/work-context-bridge";

const VIEW_OPTIONS = [
  {
    value: "board",
    label: "Board",
    description: "Linear-style status lanes for fast triage.",
  },
  {
    value: "list",
    label: "List",
    description: "Compact progress rows for quick scanning.",
  },
];

const FOCUS_OPTIONS = [
  {
    value: "all",
    label: "All",
    description: "Every visible project lane.",
  },
  {
    value: "active",
    label: "Active",
    description: "Only work currently moving.",
  },
  {
    value: "shipping",
    label: "Shipping",
    description: "Projects with stronger delivery motion.",
  },
  {
    value: "blocked",
    label: "Blocked",
    description: "Work that needs intervention.",
  },
  {
    value: "done",
    label: "Done",
    description: "Closed loops and recently finished work.",
  },
];

const PROJECT_LANES = [
  {
    key: "draft",
    title: "Backlog",
    note: "Shaped enough to track, but not in active execution yet.",
  },
  {
    key: "active",
    title: "In Progress",
    note: "Projects that are actually moving this week.",
  },
  {
    key: "blocked",
    title: "Blocked",
    note: "Needs a decision, owner, or unblock before it can move.",
  },
  {
    key: "completed",
    title: "Done",
    note: "Completed work that should stay closed.",
  },
];

function getQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return typeof value === "string" ? value : "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[._/()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildProjectsHref(searchParams, overrides = {}) {
  const params = new URLSearchParams();

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => params.append(key, item));
      return;
    }

    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  });

  Object.entries(overrides).forEach(([key, value]) => {
    if (!value) {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  const query = params.toString();
  return query ? `/dashboard/work/projects?${query}` : "/dashboard/work/projects";
}

function resolveView(value) {
  const current = getQueryValue(value);
  return VIEW_OPTIONS.find((item) => item.value === current) || VIEW_OPTIONS[0];
}

function resolveFocus(value) {
  const current = getQueryValue(value);
  return FOCUS_OPTIONS.find((item) => item.value === current) || FOCUS_OPTIONS[0];
}

function isBlockedProject(project) {
  return (
    project.status === "blocked" ||
    project.risk === "Critical" ||
    project.risk.toLowerCase().includes("blocked")
  );
}

function matchesFocus(project, focus) {
  if (focus === "active") {
    return project.status === "active" || project.status === "draft";
  }

  if (focus === "shipping") {
    return project.status === "active" && project.progress >= 45;
  }

  if (focus === "blocked") {
    return isBlockedProject(project);
  }

  if (focus === "done") {
    return project.status === "completed";
  }

  return true;
}

function matchesProjectReference(value, projectTitles) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return false;
  }

  return projectTitles.some((title) => {
    const projectName = normalizeText(title);
    return normalized.includes(projectName) || projectName.includes(normalized);
  });
}

function filterTasksByProjects(tasks, projects) {
  const projectTitles = projects.map((item) => item.title);

  if (!projectTitles.length) {
    return [];
  }

  const matched = tasks.filter((item) => matchesProjectReference(item.project, projectTitles));
  return matched.length ? matched : tasks;
}

function groupProjectsByLane(projects) {
  return PROJECT_LANES.map((lane) => ({
    ...lane,
    items: projects.filter((project) => project.status === lane.key),
  }));
}

function projectSelector(project) {
  return [project.title, project.owner, project.milestone, project.nextAction, project.risk, project.taskLead];
}

function taskSelector(item) {
  return [item.title, item.detail, item.project];
}

function repoSelector(item) {
  return [item.title, item.owner, item.milestone, item.nextAction, item.risk, item.taskLead];
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
  ];
}

function buildProjectBridgeRows({
  selectedContextValue,
  projectPortfolio,
  taskQueue,
  githubRepoCards,
  githubBundles,
  localRepositories,
}) {
  const localRepositoryByContext = new Map(
    (localRepositories || []).map((item) => [item.contextValue, item]),
  );

  return getVisibleWorkContexts(selectedContextValue).map((context) => {
    const projects = scopeStrictWorkItems(projectPortfolio, context.value, projectSelector);
    const tasks = scopeStrictWorkItems(taskQueue, context.value, taskSelector);
    const repoCards = scopeStrictWorkItems(githubRepoCards, context.value, repoSelector);
    const bundles = scopeStrictWorkItems(githubBundles, context.value, bundleSelector);
    const localRepository = localRepositoryByContext.get(context.value);
    const activeProjects = projects.filter((item) => item.status === "active").length;
    const blockedProjects = projects.filter((item) => isBlockedProject(item)).length;
    const openPullCount = sumWorkValues(bundles.map((item) => item.openPulls.length));
    const openIssueCount = sumWorkValues(bundles.map((item) => item.issues.length));

    let statusTone = localRepository?.statusTone || "muted";
    let statusLabel = localRepository?.statusLabel || "queued";

    if (blockedProjects > 0 || localRepository?.statusTone === "danger") {
      statusTone = "danger";
      statusLabel = blockedProjects > 0 ? "blocked" : localRepository?.statusLabel || "attention";
    } else if (openIssueCount > 8 || localRepository?.statusTone === "warning") {
      statusTone = "warning";
      statusLabel = openIssueCount > 8 ? "pressure" : localRepository?.statusLabel || "watch";
    } else if (openPullCount > 0) {
      statusTone = "blue";
      statusLabel = "shipping";
    } else if (activeProjects > 0 || repoCards.length > 0) {
      statusTone = "green";
      statusLabel = "active";
    }

    const headline =
      blockedProjects > 0
        ? `${blockedProjects} blocker signal${blockedProjects === 1 ? "" : "s"} need a clear handoff`
        : openPullCount > 0
          ? `${openPullCount} PR${openPullCount === 1 ? "" : "s"} are feeding this lane`
          : tasks.length > 0
            ? `${tasks.length} queued task${tasks.length === 1 ? "" : "s"} are ready to move`
            : "Connect the next project move before this lane goes quiet";
    const detail = [
      projects[0]?.nextAction || repoCards[0]?.nextAction || "Keep next action, PMS, and roadmap visible from the same lane.",
      localRepository?.repository
        ? `${localRepository.repository} · ${localRepository.detail}`
        : "Local workspace mapping is still missing for this context.",
    ].join(" ");

    return {
      key: context.value,
      label: context.label,
      description: context.description,
      statusTone,
      statusLabel,
      headline,
      detail,
      metrics: [
        { label: "Active", value: formatWorkMetric(activeProjects), tone: activeProjects ? "green" : "muted" },
        { label: "Blocked", value: formatWorkMetric(blockedProjects), tone: blockedProjects ? "danger" : "muted" },
        { label: "Tasks", value: formatWorkMetric(tasks.length), tone: tasks.length ? "blue" : "muted" },
        { label: "PRs", value: formatWorkMetric(openPullCount), tone: openPullCount ? "blue" : "muted" },
      ],
      links: [
        { label: "PMS", href: buildWorkContextHref("/dashboard/work/pms", context.value) },
        { label: "Roadmap", href: buildWorkContextHref("/dashboard/work/roadmap", context.value) },
        { label: "Management", href: buildWorkContextHref("/dashboard/work/management", context.value) },
      ],
    };
  });
}

export default async function WorkProjectsPage({ searchParams }) {
  const [{ projectPortfolio, projectUpdates, taskQueue }, { githubRepoCards, githubBundles }] = await Promise.all([
    getProjectsPageData(),
    getWorkPmsPageData(),
  ]);
  const localRepositoryData = getLocalProjectRepositoryData();
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const params = (await searchParams) ?? {};
  const selectedProject = resolveWorkContext(params?.project);
  const selectedView = resolveView(params?.view);
  const selectedFocus = resolveFocus(params?.focus);
  const scopedProjects = scopeMappedItemsByWorkContext(
    projectPortfolio,
    selectedProject.value,
    (project) => [project.title, project.owner, project.milestone, project.nextAction, project.risk, project.taskLead],
  );
  const scopedTasks = scopeMappedItemsByWorkContext(
    taskQueue,
    selectedProject.value,
    (item) => [item.title, item.detail, item.project],
  );
  const scopedUpdates = scopeMappedItemsByWorkContext(
    projectUpdates,
    selectedProject.value,
    (item) => [item.title, item.detail],
  );

  const focusedProjects = scopedProjects.items.filter((project) => matchesFocus(project, selectedFocus.value));
  const displayedProjects = focusedProjects.length ? focusedProjects : scopedProjects.items;
  const activeProjects = displayedProjects.filter((project) => project.status === "active").length;
  const plannedProjects = displayedProjects.filter((project) => project.status === "draft").length;
  const blockedProjects = displayedProjects.filter((project) => isBlockedProject(project)).length;
  const completedProjects = displayedProjects.filter((project) => project.status === "completed").length;
  const laneGroups = groupProjectsByLane(displayedProjects);
  const bridgeRows = buildProjectBridgeRows({
    selectedContextValue: selectedProject.value,
    projectPortfolio,
    taskQueue,
    githubRepoCards,
    githubBundles,
    localRepositories: localRepositoryData.projects,
  });
  const visibleTasks =
    selectedFocus.value === "all" ? scopedTasks.items : filterTasksByProjects(scopedTasks.items, displayedProjects);
  const scopeNote =
    selectedProject.value === "all"
      ? "All project lanes are visible together."
      : scopedProjects.isFallback && scopedTasks.isFallback && scopedUpdates.isFallback
        ? `${selectedProject.label} is selected, but exact project tags are not wired in every row yet. The shared lane stays visible until that mapping lands.`
        : `${selectedProject.label} is now driving the portfolio view.`;
  const focusNote =
    selectedFocus.value === "all"
      ? "The full project portfolio is visible."
      : `${selectedFocus.label} view is active. ${selectedFocus.description}`;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">Work OS</p>
        <h1>Projects with fast progress reads</h1>
        <p>
          This screen now leans toward a Linear-style project surface. Keep the active lane fast,
          keep status changes obvious, and let the richer portfolio comparison live in Management.
        </p>
        <p className="page-context">
          <strong>{selectedProject.label}</strong>
          <span>
            {scopeNote} {focusNote}
          </span>
        </p>
      </section>

      <section className="summary-grid" aria-label="Project portfolio summary">
        <SummaryCard title="Active" value={String(activeProjects)} detail="Currently moving." badge="Execution" />
        <SummaryCard
          title="Backlog"
          value={String(plannedProjects)}
          detail="Shaped enough to track, but not moving yet."
          badge="Queue"
          tone="warning"
        />
        <SummaryCard
          title="Blocked"
          value={String(blockedProjects)}
          detail="Needs clear ownership before it can move."
          badge="Attention"
          tone="danger"
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
          kicker="Connections"
          title="Projects -> PMS -> Roadmap handoff"
          description="Each work lane now keeps project motion, queue pressure, and repository state on one bridge so the next screen still shares the same context."
        >
          <WorkContextBridge rows={bridgeRows} />
        </SectionCard>

        <SectionCard
          kicker="Views"
          title="Choose the project operating view"
          description="Use board view for quick triage and list view for compact progress scanning. Focus chips act like saved views for the current context."
        >
          <div className="view-switcher-grid">
            <div className="view-switcher-group">
              <span className="section-kicker">View</span>
              <div className="context-switcher">
                {VIEW_OPTIONS.map((item) => (
                  <Link
                    className="context-link"
                    data-active={item.value === selectedView.value ? "true" : "false"}
                    href={buildProjectsHref(params, {
                      view: item.value === VIEW_OPTIONS[0].value ? "" : item.value,
                    })}
                    key={item.value}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <p className="context-footnote">{selectedView.description}</p>
            </div>

            <div className="view-switcher-group">
              <span className="section-kicker">Focus</span>
              <div className="context-switcher">
                {FOCUS_OPTIONS.map((item) => (
                  <Link
                    className="context-link"
                    data-active={item.value === selectedFocus.value ? "true" : "false"}
                    href={buildProjectsHref(params, {
                      focus: item.value === FOCUS_OPTIONS[0].value ? "" : item.value,
                    })}
                    key={item.value}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <p className="context-footnote">{selectedFocus.description}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          kicker="Capture"
          title="Quick project update"
          description="Log movement from inside the hub so the project board becomes a live operating record."
        >
          <ProjectUpdateForm defaultWorkspaceId={defaultWorkspaceId} />
        </SectionCard>

        <SectionCard
          kicker="Portfolio"
          title={selectedView.value === "board" ? "Status lanes" : "Progress list"}
          description={
            selectedView.value === "board"
              ? "This board borrows the best part of Linear: you should know what is active, blocked, or done in one sweep."
              : "This list keeps project progress, next action, and risk visible in a compact manager-friendly scan."
          }
        >
          {selectedView.value === "board" ? (
            <div className="lane-grid">
              {laneGroups.map((lane) => (
                <article className="lane-column" key={lane.key}>
                  <div className="lane-head">
                    <div>
                      <strong>{lane.title}</strong>
                      <p>{lane.note}</p>
                    </div>
                    <span className="lane-count">{lane.items.length}</span>
                  </div>

                  <div className="lane-list">
                    {lane.items.length ? (
                      lane.items.map((project) => (
                        <div className="lane-item lane-item-project" key={project.title}>
                          <div className="lane-item-head">
                            <strong>{project.title}</strong>
                            <span className="legend-chip" data-tone={project.statusTone}>
                              {project.progress}%
                            </span>
                          </div>
                          <span>{project.owner}</span>
                          <p>{project.nextAction}</p>
                          <p className="tiny muted">
                            {project.milestone} · {project.risk}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="lane-item lane-item-empty">
                        <strong>No projects here</strong>
                        <p>This lane is clear for the current context and focus.</p>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="portfolio-list">
              {displayedProjects.map((project) => (
                <article className="portfolio-row" key={project.title}>
                  <div className="portfolio-row-main">
                    <div className="project-head">
                      <div>
                        <h3>{project.title}</h3>
                        <p>{project.owner}</p>
                      </div>
                      <div className="inline-legend">
                        <span className="legend-chip" data-tone={project.statusTone}>
                          {project.statusLabel}
                        </span>
                        <span className="legend-chip" data-tone="muted">
                          {project.progress}%
                        </span>
                      </div>
                    </div>

                    <div className="progress-row">
                      <div className="progress-track" aria-hidden="true">
                        <span style={{ width: `${project.progress}%` }} />
                      </div>
                      <strong>{project.progress}%</strong>
                    </div>
                  </div>

                  <div className="portfolio-row-meta">
                    <div className="portfolio-row-block">
                      <span>Milestone</span>
                      <strong>{project.milestone}</strong>
                    </div>
                    <div className="portfolio-row-block">
                      <span>Next Action</span>
                      <strong>{project.nextAction}</strong>
                    </div>
                    <div className="portfolio-row-block">
                      <span>Task Lane</span>
                      <strong>{project.taskSummary}</strong>
                    </div>
                    <div className="portfolio-row-block">
                      <span>Risk</span>
                      <strong>{project.risk}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="Tasks"
            title="Linked execution queue"
            description="A project surface is healthier when the next task is visible without opening another tool."
          >
            <ul className="task-list">
              {visibleTasks.map((item) => (
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
            kicker="Progress"
            title="Recent movement"
            description="Recent updates keep the board honest by showing whether anything actually moved."
          >
            <div className="timeline">
              {scopedUpdates.items.map((item) => (
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
    </div>
  );
}
