import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { ProjectUpdateForm } from "@/components/forms/project-update-form";
import {
  buildContentStudioHref,
  getProjectStudioConfig,
  inferWorkContextFromProject,
  resolveWorkContext,
  scopeMappedItemsByWorkContext,
} from "@/lib/dashboard-contexts";
import { getProjectsPageData } from "@/lib/server-data";

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

function buildScopedWorkHref(path, projectValue) {
  if (!projectValue || projectValue === "all") {
    return path;
  }

  const params = new URLSearchParams({
    project: projectValue,
  });

  return `${path}?${params.toString()}`;
}

function buildPublishHref(brandValue) {
  if (!brandValue || brandValue === "all") {
    return "/dashboard/content/publish";
  }

  const params = new URLSearchParams({
    brand: brandValue,
  });

  return `/dashboard/content/publish?${params.toString()}`;
}

function getProjectLaneLinks(project) {
  const context = inferWorkContextFromProject(project);
  const studioConfig = getProjectStudioConfig(context.value);

  return {
    context,
    studioConfig,
    studioHref: buildContentStudioHref({
      project: context.value,
      brand: studioConfig.brand,
      template: studioConfig.templateId,
      channel: studioConfig.channel,
    }),
    managementHref: buildScopedWorkHref("/dashboard/work/management", context.value),
    pmsHref: buildScopedWorkHref("/dashboard/work/pms", context.value),
    publishHref: buildPublishHref(studioConfig.brand),
  };
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

export default async function WorkProjectsPage({ searchParams }) {
  const { projectPortfolio, projectUpdates, taskQueue } = await getProjectsPageData();
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const selectedProject = resolveWorkContext(searchParams?.project);
  const selectedView = resolveView(searchParams?.view);
  const selectedFocus = resolveFocus(searchParams?.focus);
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
  const selectedStudioConfig = getProjectStudioConfig(selectedProject.value);
  const selectedStudioHref = buildContentStudioHref({
    project: selectedProject.value,
    brand: selectedStudioConfig.brand,
    template: selectedStudioConfig.templateId,
    channel: selectedStudioConfig.channel,
  });
  const selectedManagementHref = buildScopedWorkHref(
    "/dashboard/work/management",
    selectedProject.value,
  );
  const selectedPmsHref = buildScopedWorkHref("/dashboard/work/pms", selectedProject.value);
  const selectedPublishHref = buildPublishHref(selectedStudioConfig.brand);

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
                    href={buildProjectsHref(searchParams, {
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
                    href={buildProjectsHref(searchParams, {
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
          kicker="Connected"
          title="프로젝트를 다음 레인으로 바로 밀기"
          description="프로젝트 화면 안에서 바로 콘텐츠, 매니지먼트, PMS로 넘어갈 수 있어야 실제 운영이 덜 끊깁니다."
        >
          <div className="project-grid">
            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>Content Studio</h3>
                  <p>{selectedStudioConfig.studioTitle}</p>
                </div>
                <span className="legend-chip" data-tone="blue">
                  Studio
                </span>
              </div>
              <p className="check-detail">{selectedStudioConfig.storyAngle}</p>
              <div className="hero-actions">
                <Link className="button button-secondary" href={selectedStudioHref}>
                  Open studio
                </Link>
              </div>
            </article>

            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>Management</h3>
                  <p>Compare execution, risk, and repo motion</p>
                </div>
                <span className="legend-chip" data-tone="warning">
                  Review
                </span>
              </div>
              <p className="check-detail">
                프로젝트가 실제로 움직였는지, 콘텐츠 작업과 실행 신호가 맞물리는지 바로 확인합니다.
              </p>
              <div className="hero-actions">
                <Link className="button button-secondary" href={selectedManagementHref}>
                  Open management
                </Link>
              </div>
            </article>

            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>PMS</h3>
                  <p>Record the next operating move</p>
                </div>
                <span className="legend-chip" data-tone="muted">
                  Cadence
                </span>
              </div>
              <p className="check-detail">
                카드뉴스나 프로젝트 업데이트가 실제 루틴과 후속 액션으로 이어졌는지 다시 붙입니다.
              </p>
              <div className="hero-actions">
                <Link className="button button-ghost" href={selectedPmsHref}>
                  Open PMS
                </Link>
              </div>
            </article>

            <article className="project-card">
              <div className="project-head">
                <div>
                  <h3>Publish lane</h3>
                  <p>Move ready drafts into distribution</p>
                </div>
                <span className="legend-chip" data-tone="green">
                  Ship
                </span>
              </div>
              <p className="check-detail">{selectedStudioConfig.publishHint}</p>
              <div className="hero-actions">
                <Link className="button button-secondary" href={selectedPublishHref}>
                  Open publish
                </Link>
              </div>
            </article>
          </div>
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
                      lane.items.map((project) => {
                        const projectLinks = getProjectLaneLinks(project);

                        return (
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
                            <div className="lane-item-actions">
                              <Link className="inline-action-button" href={projectLinks.studioHref}>
                                Studio
                              </Link>
                              <Link
                                className="inline-action-button"
                                href={projectLinks.managementHref}
                              >
                                Manage
                              </Link>
                            </div>
                          </div>
                        );
                      })
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
              {displayedProjects.map((project) => {
                const projectLinks = getProjectLaneLinks(project);

                return (
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

                    <div className="portfolio-row-actions">
                      <span className="muted tiny">{projectLinks.studioConfig.studioTitle}</span>
                      <div className="inline-action-row">
                        <Link className="inline-action-button" href={projectLinks.studioHref}>
                          Open studio
                        </Link>
                        <Link className="inline-action-button" href={projectLinks.managementHref}>
                          Open management
                        </Link>
                        <Link className="inline-action-button" href={projectLinks.pmsHref}>
                          Open PMS
                        </Link>
                        <Link className="inline-action-button" href={projectLinks.publishHref}>
                          Open publish
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
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
