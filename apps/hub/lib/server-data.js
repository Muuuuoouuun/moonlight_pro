import { execSync } from "node:child_process";
import {
  activityFeed as fallbackActivityFeed,
  automationCards as fallbackAutomationCards,
  automationRuns as fallbackAutomationRuns,
  commandCenterQueue as fallbackCommandCenterQueue,
  contentAttention as fallbackContentAttention,
  contentPipeline as fallbackContentPipeline,
  contentSummary as fallbackContentSummary,
  contentVariants as fallbackContentVariants,
  logItems as fallbackLogItems,
  operationsBoard as fallbackOperationsBoard,
  pmsBoard as fallbackPmsBoard,
  publishQueue as fallbackPublishQueue,
  projectPortfolio as fallbackProjectPortfolio,
  projectUpdates as fallbackProjectUpdates,
  quickCommands as fallbackQuickCommands,
  summaryStats as fallbackSummaryStats,
  systemChecks as fallbackSystemChecks,
  todayFocus as fallbackTodayFocus,
  webhookEndpoints as fallbackWebhookEndpoints,
  weeklyReview as fallbackWeeklyReview,
} from "@/lib/dashboard-data";

function resolveSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !apiKey) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    apiKey,
  };
}

function resolveEngineUrl() {
  const direct = process.env.COM_MOON_ENGINE_URL?.trim();
  if (direct) {
    return direct.replace(/\/$/, "");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return appUrl.replace(/\/$/, "");
  }

  return null;
}

function resolveGitHubApiBase() {
  return (process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com").replace(/\/$/, "");
}

function resolveGitHubToken() {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    ""
  );
}

function makeHeaders(apiKey, withCount = false) {
  return {
    apikey: apiKey,
    authorization: `Bearer ${apiKey}`,
    ...(withCount ? { prefer: "count=exact" } : {}),
  };
}

function buildRestUrl(baseUrl, table, { select = "*", filters = [], limit, order } = {}) {
  const params = new URLSearchParams();
  params.set("select", select);

  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  if (order) {
    params.set("order", order);
  }

  filters.forEach(([key, value]) => {
    params.append(key, value);
  });

  return `${baseUrl}/rest/v1/${table}?${params.toString()}`;
}

export function inFilter(values) {
  return `in.(${values.join(",")})`;
}

export function boolFilter(value) {
  return `eq.${value ? "true" : "false"}`;
}

function extractCount(contentRange) {
  if (!contentRange) {
    return null;
  }

  const [, count] = contentRange.split("/");
  const parsed = Number.parseInt(count || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchRows(table, options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(buildRestUrl(config.url, table, options), {
      headers: makeHeaders(config.apiKey),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function countRows(table, filters = []) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(
      buildRestUrl(config.url, table, {
        select: "id",
        filters,
        limit: 1,
      }),
      {
        headers: {
          ...makeHeaders(config.apiKey, true),
          Range: "0-0",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    return extractCount(response.headers.get("content-range"));
  } catch {
    return null;
  }
}

export async function fetchEngineHealth() {
  const engineUrl = resolveEngineUrl();

  if (!engineUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${engineUrl}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatTimestamp(value) {
  if (!value) {
    return "Unknown";
  }

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function toTone(status) {
  if (!status) {
    return "blue";
  }

  if (["done", "success", "active", "processed", "reported"].includes(status)) {
    return "green";
  }

  if (["blocked", "failure", "failed", "error"].includes(status)) {
    return "danger";
  }

  if (["queued", "pending", "ready"].includes(status)) {
    return "warning";
  }

  return "blue";
}

function maybe(value, fallback) {
  return value == null ? fallback : value;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function normalizeProjectStatus(value) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "active";
  }

  if (["completed", "done"].includes(normalized)) {
    return "completed";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "archived") {
    return "archived";
  }

  if (["draft", "planned", "queued", "ready", "reported"].includes(normalized)) {
    return "draft";
  }

  return "active";
}

function getProjectStatusMeta(value) {
  const status = normalizeProjectStatus(value);

  if (status === "completed") {
    return { value: status, label: "completed", tone: "green" };
  }

  if (status === "blocked") {
    return { value: status, label: "blocked", tone: "danger" };
  }

  if (status === "draft") {
    return { value: status, label: "planned", tone: "warning" };
  }

  if (status === "archived") {
    return { value: status, label: "archived", tone: "muted" };
  }

  return { value: "active", label: "active", tone: "green" };
}

function resolveProjectStatus(projectStatus, updateStatus) {
  if (updateStatus) {
    const normalizedUpdate = normalizeProjectStatus(updateStatus);

    if (normalizedUpdate !== "draft" || !projectStatus) {
      return normalizedUpdate;
    }
  }

  return normalizeProjectStatus(projectStatus);
}

function normalizeRoutineStatus(value) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "done") {
    return "done";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (normalized === "skipped") {
    return "skipped";
  }

  return "pending";
}

function getRoutineStatusMeta(value) {
  const status = normalizeRoutineStatus(value);

  if (status === "done") {
    return { value: status, label: "done", tone: "green" };
  }

  if (status === "blocked") {
    return { value: status, label: "blocked", tone: "danger" };
  }

  if (status === "skipped") {
    return { value: status, label: "skipped", tone: "muted" };
  }

  return { value: "pending", label: "pending", tone: "warning" };
}

function normalizeTaskStatus(value) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "done") {
    return "done";
  }

  if (normalized === "blocked") {
    return "blocked";
  }

  if (["doing", "active", "in_progress"].includes(normalized)) {
    return "doing";
  }

  if (normalized === "inbox") {
    return "inbox";
  }

  return "todo";
}

function getTaskStatusMeta(value) {
  const status = normalizeTaskStatus(value);

  if (status === "done") {
    return { value: status, label: "done", tone: "green" };
  }

  if (status === "blocked") {
    return { value: status, label: "blocked", tone: "danger" };
  }

  if (status === "doing") {
    return { value: status, label: "doing", tone: "blue" };
  }

  if (status === "inbox") {
    return { value: status, label: "inbox", tone: "muted" };
  }

  return { value: "todo", label: "todo", tone: "warning" };
}

function mapProjectRows(projects, updates, tasks = []) {
  const sourceProjects = projects?.length ? projects : fallbackProjectPortfolio;

  if (!sourceProjects.length) {
    return [];
  }

  const latestByProject = new Map();
  (updates || []).forEach((item) => {
    if (item.project_id && !latestByProject.has(item.project_id)) {
      latestByProject.set(item.project_id, item);
    }
  });

  const tasksByProject = new Map();
  tasks.forEach((item) => {
    if (!item.project_id) {
      return;
    }

    const group = tasksByProject.get(item.project_id) || [];
    group.push(item);
    tasksByProject.set(item.project_id, group);
  });

  return sourceProjects.map((project) => {
    const latest = project.id ? latestByProject.get(project.id) : null;
    const linkedTasks = project.id ? tasksByProject.get(project.id) || [] : [];
    const openTasks = linkedTasks.filter((item) => normalizeTaskStatus(item.status) !== "done");
    const blockedTasks = openTasks.filter((item) => normalizeTaskStatus(item.status) === "blocked").length;
    const nextTask = openTasks[0];
    const statusMeta = getProjectStatusMeta(resolveProjectStatus(project.status, latest?.status));

    return {
      title: project.name || project.title || "Untitled project",
      owner: project.priority ? `${project.priority} priority` : project.owner || "Operator lane",
      status: statusMeta.value,
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      progress: maybe(
        latest?.progress ?? project.progress,
        statusMeta.value === "completed" ? 100 : statusMeta.value === "blocked" ? 42 : 58,
      ),
      milestone:
        latest?.milestone ||
        project.milestone ||
        "Next milestone needs clearer instrumentation.",
      nextAction:
        project.next_action ||
        project.nextAction ||
        latest?.next_action ||
        "Define the next action before this lane stalls.",
      risk:
        blockedTasks > 0
          ? `${blockedTasks} blocked ${pluralize(blockedTasks, "task")}`
          : statusMeta.value === "blocked"
            ? "Blocked"
            : project.priority === "critical"
              ? "Critical"
              : project.risk || "Tracking",
      taskSummary: openTasks.length
        ? `${openTasks.length} open ${pluralize(openTasks.length, "task")}${
            blockedTasks ? `, ${blockedTasks} blocked` : ""
          }`
        : project.taskSummary || "No linked tasks yet.",
      taskLead: nextTask
        ? nextTask.next_action
          ? `${nextTask.title}: ${nextTask.next_action}`
          : nextTask.title
        : project.taskLead || "Link the next task to this project so execution stays visible.",
    };
  });
}

function mapProjectUpdates(updates) {
  if (!updates?.length) {
    return fallbackProjectUpdates;
  }

  return updates.map((item) => ({
    title: item.title || "Project update",
    detail: item.summary || item.next_action || "Progress event captured.",
    time: formatTimestamp(item.happened_at || item.created_at),
    tone: toTone(item.status),
  }));
}

function mapRoutineChecks(checks) {
  const sourceChecks = checks?.length ? checks : fallbackPmsBoard;

  return sourceChecks.map((item) => {
    const statusMeta = getRoutineStatusMeta(item.status);

    return {
      title:
        item.check_type
          ? item.check_type[0].toUpperCase() + item.check_type.slice(1)
          : item.title || "Routine",
      status: statusMeta.value,
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      rhythm: item.rhythm || formatTimestamp(item.checked_at || item.created_at),
      detail: item.note || item.detail || "Routine checkpoint captured.",
    };
  });
}

function mapWeeklyReview(decisions, updates) {
  if (!decisions?.length && !updates?.length) {
    return fallbackWeeklyReview;
  }

  const items = [];

  (decisions || []).slice(0, 2).forEach((item) => {
    items.push({
      title: item.title || "Decision review",
      detail: item.summary || "Decision captured.",
    });
  });

  (updates || []).slice(0, 1).forEach((item) => {
    items.push({
      title: item.title || "Progress review",
      detail: item.next_action || item.summary || "Progress review captured.",
    });
  });

  return items.length ? items : fallbackWeeklyReview;
}

function humanizeValue(value) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactText(value, maxLength = 96) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
}

function normalizeGitHubRepoSlug(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function parseGitHubRepoFromRemote(value) {
  const normalized = normalizeGitHubRepoSlug(value);
  return /^[^/]+\/[^/]+$/.test(normalized) ? normalized : "";
}

function readGitHubRepoFromOrigin() {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return parseGitHubRepoFromRemote(remote);
  } catch {
    return "";
  }
}

function resolveGitHubRepositories() {
  const envRepositories =
    process.env.GITHUB_REPOSITORIES?.split(/[,\n]/)
      .map((item) => parseGitHubRepoFromRemote(item))
      .filter(Boolean) || [];

  if (envRepositories.length) {
    return [...new Set(envRepositories)];
  }

  const fallbackRepository = parseGitHubRepoFromRemote(
    process.env.GITHUB_DEFAULT_REPOSITORY?.trim() || readGitHubRepoFromOrigin(),
  );

  return fallbackRepository ? [fallbackRepository] : [];
}

function buildGitHubQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null) {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function makeGitHubHeaders() {
  const token = resolveGitHubToken();

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "com-moon-hub",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchGitHubJson(pathname, params = {}) {
  const repositories = resolveGitHubRepositories();

  if (!repositories.length) {
    return null;
  }

  const url = `${resolveGitHubApiBase()}${pathname}${buildGitHubQuery(params)}`;

  try {
    const response = await fetch(url, {
      headers: makeGitHubHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchGitHubRepoBundle(repository) {
  const encodedRepository = repository
    .split("/")
    .map((item) => encodeURIComponent(item))
    .join("/");

  const [repo, openPulls, closedPulls, issues, commits, milestones] = await Promise.all([
    fetchGitHubJson(`/repos/${encodedRepository}`),
    fetchGitHubJson(`/repos/${encodedRepository}/pulls`, {
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: 12,
    }),
    fetchGitHubJson(`/repos/${encodedRepository}/pulls`, {
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 12,
    }),
    fetchGitHubJson(`/repos/${encodedRepository}/issues`, {
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: 20,
    }),
    fetchGitHubJson(`/repos/${encodedRepository}/commits`, {
      per_page: 12,
    }),
    fetchGitHubJson(`/repos/${encodedRepository}/milestones`, {
      state: "open",
      sort: "due_on",
      direction: "asc",
      per_page: 12,
    }),
  ]);

  return {
    repository,
    repo,
    openPulls: Array.isArray(openPulls) ? openPulls : [],
    mergedPulls: (Array.isArray(closedPulls) ? closedPulls : []).filter((item) => item.merged_at),
    issues: (Array.isArray(issues) ? issues : []).filter((item) => !item.pull_request),
    commits: Array.isArray(commits) ? commits : [],
    milestones: Array.isArray(milestones) ? milestones : [],
  };
}

function getGitHubRepoLabel(repository) {
  return repository.split("/")[1] || repository;
}

function formatShortDate(value) {
  if (!value) {
    return "No date";
  }

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toProgress(total, completed) {
  if (!total) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function getGitHubBundleTone(bundle) {
  if (bundle.openPulls.some((item) => item.draft)) {
    return "warning";
  }

  if (bundle.issues.length > 8) {
    return "danger";
  }

  return "blue";
}

function mapGitHubRepoCards(bundles) {
  const liveBundles = (bundles || []).filter((bundle) => bundle.repo);

  if (!liveBundles.length) {
    return [
      {
        title: "GitHub lane waiting for configuration",
        owner: "Connect at least one repository",
        status: "pending",
        statusLabel: "pending",
        statusTone: "warning",
        progress: 0,
        milestone: "Add GITHUB_TOKEN and GITHUB_REPOSITORIES",
        nextAction: "Once connected, this board will show PR pressure, issue flow, and push timing.",
        risk: "No repository data",
        taskSummary: "No repositories connected yet.",
        taskLead: "Start with the main repo, then add sidecars as separate owner/repo pairs.",
      },
    ];
  }

  return liveBundles.map((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);
    const milestone = bundle.milestones[0];
    const issueTotal = milestone ? milestone.open_issues + milestone.closed_issues : bundle.issues.length;
    const closedTotal = milestone ? milestone.closed_issues : bundle.mergedPulls.length;

    return {
      title: repositoryLabel,
      owner: bundle.repo.owner?.login ? `${bundle.repo.owner.login} / ${bundle.repo.default_branch}` : bundle.repository,
      status: bundle.openPulls.length ? "active" : bundle.issues.length ? "draft" : "completed",
      statusLabel: bundle.openPulls.length ? "shipping" : bundle.issues.length ? "tracking" : "quiet",
      statusTone: getGitHubBundleTone(bundle),
      progress: toProgress(issueTotal || 1, closedTotal),
      milestone: milestone?.title || "No GitHub milestone attached yet.",
      nextAction: bundle.openPulls[0]?.title || bundle.issues[0]?.title || "No urgent GitHub action is visible right now.",
      risk:
        bundle.issues.length > 8
          ? `${bundle.issues.length} open issues`
          : bundle.openPulls.some((item) => item.draft)
            ? "Draft PRs still need finishing"
            : "Controlled",
      taskSummary: `${bundle.openPulls.length} open PRs · ${bundle.issues.length} open issues · ${bundle.commits.length} recent commits`,
      taskLead:
        bundle.repo.pushed_at
          ? `Last push ${formatTimestamp(bundle.repo.pushed_at)}`
          : "No recent push recorded.",
    };
  });
}

function mapGitHubActivityRows(bundles) {
  const activity = [];

  (bundles || []).forEach((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);

    bundle.commits.slice(0, 4).forEach((item) => {
      activity.push({
        title: `${repositoryLabel} commit`,
        detail: compactText(item.commit?.message || "Commit captured."),
        time: formatTimestamp(item.commit?.author?.date),
        tone: "green",
        repository: repositoryLabel,
        occurredAt: item.commit?.author?.date || item.commit?.committer?.date || "",
      });
    });

    bundle.openPulls.slice(0, 4).forEach((item) => {
      activity.push({
        title: `${repositoryLabel} PR #${item.number}`,
        detail: compactText(item.title || "Open pull request"),
        time: formatTimestamp(item.updated_at),
        tone: item.draft ? "warning" : "blue",
        repository: repositoryLabel,
        occurredAt: item.updated_at || "",
      });
    });

    bundle.issues.slice(0, 4).forEach((item) => {
      activity.push({
        title: `${repositoryLabel} issue #${item.number}`,
        detail: compactText(item.title || "Open issue"),
        time: formatTimestamp(item.updated_at),
        tone: item.labels?.length ? "warning" : "muted",
        repository: repositoryLabel,
        occurredAt: item.updated_at || "",
      });
    });
  });

  return activity
    .sort((left, right) => new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0))
    .slice(0, 10)
    .map(({ occurredAt, ...item }) => item);
}

function mapGitHubRoadmapRows(bundles) {
  const roadmapRows = [];

  (bundles || []).forEach((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);

    bundle.milestones.forEach((item) => {
      const total = item.open_issues + item.closed_issues;
      const progress = toProgress(total || 1, item.closed_issues);

      roadmapRows.push({
        title: item.title,
        lane: repositoryLabel,
        source: "GitHub milestone",
        status: item.open_issues ? "active" : "completed",
        statusLabel: item.open_issues ? "active" : "completed",
        statusTone: item.due_on && new Date(item.due_on) < new Date() ? "danger" : item.open_issues ? "blue" : "green",
        progress,
        due: item.due_on ? formatShortDate(item.due_on) : "No due date",
        detail: `${item.closed_issues} closed / ${item.open_issues} open`,
      });
    });
  });

  return roadmapRows;
}

function buildGitHubAlerts(bundles, syncRuns = []) {
  const alerts = [];

  (bundles || []).forEach((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);

    if (!bundle.repo) {
      alerts.push({
        title: `${repositoryLabel} needs repository access`,
        detail: "Check token scope or repository visibility before treating GitHub as a source of truth.",
        tone: "warning",
      });
      return;
    }

    if (bundle.openPulls.some((item) => item.draft)) {
      alerts.push({
        title: `${repositoryLabel} has draft PRs in flight`,
        detail: "Draft work is visible, but still needs review or a merge plan before it counts as shipped motion.",
        tone: "warning",
      });
    }

    if (bundle.issues.length > 8) {
      alerts.push({
        title: `${repositoryLabel} issue pressure is rising`,
        detail: `${bundle.issues.length} open issues are visible. Pull one or two into the roadmap instead of letting the queue blur together.`,
        tone: "danger",
      });
    }
  });

  (syncRuns || [])
    .filter((item) => item.status === "failure")
    .slice(0, 1)
    .forEach((item) => {
      alerts.push({
        title: "GitHub sync run failed",
        detail: item.error_message || "A sync run recorded a failure and still needs inspection.",
        tone: "danger",
      });
    });

  return alerts.length
    ? alerts.slice(0, 6)
    : [
        {
          title: "GitHub lane is calm",
          detail: "No urgent PR, issue, or sync signals are visible right now.",
          tone: "green",
        },
      ];
}

async function getGitHubWorkspaceData() {
  const repositories = resolveGitHubRepositories();
  const token = resolveGitHubToken();

  if (!repositories.length) {
    return {
      repositories: [],
      repoCards: mapGitHubRepoCards([]),
      activityRows: [],
      roadmapRows: [],
      alerts: buildGitHubAlerts([]),
      connection: {
        status: "pending",
        tone: "warning",
        title: "GitHub is not configured",
        detail: "Add GITHUB_REPOSITORIES and optionally GITHUB_TOKEN to read issues, PRs, commits, and milestones.",
      },
      syncRows: [],
      totals: {
        repositoryCount: 0,
        openPullCount: 0,
        openIssueCount: 0,
        recentCommitCount: 0,
        roadmapCount: 0,
        mergedPullCount: 0,
      },
      hasLiveData: false,
    };
  }

  const [bundles, connections] = await Promise.all([
    Promise.all(repositories.map((item) => fetchGitHubRepoBundle(item))),
    fetchRows("integration_connections", {
      limit: 4,
      order: "created_at.desc",
      filters: [["provider", "eq.github"]],
    }),
  ]);

  const connectionIds = (connections || []).map((item) => item.id).filter(Boolean);
  const syncRuns = connectionIds.length
    ? await fetchRows("sync_runs", {
        limit: 8,
        order: "started_at.desc",
        filters: [["connection_id", inFilter(connectionIds)]],
      })
    : null;
  const hasLiveData = bundles.some((bundle) => bundle.repo);
  const recentSync = (syncRuns || [])[0];
  const latestConnection = (connections || [])[0];
  const totals = bundles.reduce(
    (summary, bundle) => ({
      repositoryCount: summary.repositoryCount + (bundle.repo ? 1 : 0),
      openPullCount: summary.openPullCount + bundle.openPulls.length,
      openIssueCount: summary.openIssueCount + bundle.issues.length,
      recentCommitCount: summary.recentCommitCount + bundle.commits.length,
      roadmapCount: summary.roadmapCount + bundle.milestones.length,
      mergedPullCount: summary.mergedPullCount + bundle.mergedPulls.length,
    }),
    {
      repositoryCount: 0,
      openPullCount: 0,
      openIssueCount: 0,
      recentCommitCount: 0,
      roadmapCount: 0,
      mergedPullCount: 0,
    },
  );

  return {
    repositories,
    repoCards: mapGitHubRepoCards(bundles),
    activityRows: mapGitHubActivityRows(bundles),
    roadmapRows: mapGitHubRoadmapRows(bundles),
    alerts: buildGitHubAlerts(bundles, syncRuns || []),
    connection: {
      status:
        latestConnection?.status ||
        (hasLiveData ? "connected" : token ? "pending" : "warning"),
      tone:
        latestConnection?.status === "error"
          ? "danger"
          : hasLiveData
            ? "green"
            : token
              ? "warning"
              : "muted",
      title: hasLiveData
        ? `${repositories.length} GitHub ${pluralize(repositories.length, "repo", "repos")} visible`
        : "GitHub is configured but not readable yet",
      detail: recentSync?.finished_at
        ? `Last sync ${formatTimestamp(recentSync.finished_at)}`
        : hasLiveData
          ? "Live repository reads are working. Add sync automation later to persist ledger history."
          : "Repository discovery is present, but live GitHub reads still need token scope or visibility.",
    },
    syncRows:
      (syncRuns || []).map((item) => ({
        title: item.status || "sync run",
        detail: item.error_message || "GitHub sync run captured.",
        time: formatTimestamp(item.finished_at || item.started_at),
        tone: toTone(item.status),
      })) || [],
    totals,
    hasLiveData,
  };
}

function mapContentPipeline(items) {
  if (!items?.length) {
    return fallbackContentPipeline;
  }

  const stages = [
    {
      title: "Idea",
      note: "Topics that exist, but still need a sharper frame.",
      statuses: ["idea"],
    },
    {
      title: "Draft",
      note: "Core message exists, but phrasing still needs tightening.",
      statuses: ["draft"],
    },
    {
      title: "Review",
      note: "Readable enough, now waiting for approval or cleanup.",
      statuses: ["review"],
    },
    {
      title: "Publish",
      note: "Scheduled output and recently shipped work.",
      statuses: ["scheduled", "published", "archived"],
    },
  ];

  return stages.map((stage) => ({
    title: stage.title,
    note: stage.note,
    items: items
      .filter((item) => stage.statuses.includes(item.status))
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        meta: item.source_type || item.status || "content",
        nextAction: item.next_action || "Define the next action before this item stalls.",
      })),
  }));
}

function mapContentVariants(variants, publishLogs) {
  if (!variants?.length) {
    return fallbackContentVariants;
  }

  const latestPublishByVariant = new Map();
  (publishLogs || []).forEach((item) => {
    if (item.variant_id && !latestPublishByVariant.has(item.variant_id)) {
      latestPublishByVariant.set(item.variant_id, item);
    }
  });

  return variants.slice(0, 6).map((item) => {
    const publish = latestPublishByVariant.get(item.id);

    return {
      title: item.title || `${humanizeValue(item.variant_type)} draft`,
      type: humanizeValue(item.variant_type),
      status: item.status || publish?.status || "draft",
      channel: publish?.channel || "Workspace",
      detail: compactText(item.body) || "Variant ready for operator review.",
    };
  });
}

function mapPublishQueue(logs, variants) {
  if (!logs?.length) {
    return fallbackPublishQueue;
  }

  const variantById = new Map((variants || []).map((item) => [item.id, item]));

  return logs.map((item) => {
    const variant = variantById.get(item.variant_id);

    return {
      title: variant?.title || item.payload?.title || `${item.channel || "Unknown"} publish`,
      channel: item.channel || "Unknown",
      status: item.status || "queued",
      time: formatTimestamp(item.published_at || item.created_at),
      detail:
        item.payload?.summary ||
        (item.external_id
          ? `External reference ${item.external_id} was recorded.`
          : item.status === "failed"
            ? "Publish attempt needs a retry."
            : "Publish event recorded."),
    };
  });
}

function buildContentSummary({ ideaCount, draftCount, publishCount, attentionCount }) {
  if (
    ideaCount == null &&
    draftCount == null &&
    publishCount == null &&
    attentionCount == null
  ) {
    return fallbackContentSummary;
  }

  return [
    {
      title: "Idea Backlog",
      value: String(maybe(ideaCount, Number.parseInt(fallbackContentSummary[0].value, 10))),
      detail: "Raw topics still waiting for a clear angle and a first hook.",
      badge: "Ideas",
      tone: "muted",
    },
    {
      title: "Draft + Review",
      value: String(maybe(draftCount, Number.parseInt(fallbackContentSummary[1].value, 10))),
      detail: "Pieces currently in writing, tightening, or operator review.",
      badge: "In Motion",
      tone: "warning",
    },
    {
      title: "Scheduled / Published",
      value: String(maybe(publishCount, Number.parseInt(fallbackContentSummary[2].value, 10))),
      detail: "Work already queued for distribution or recently pushed live.",
      badge: "Distribution",
      tone: "blue",
    },
    {
      title: "Attention",
      value: String(maybe(attentionCount, Number.parseInt(fallbackContentSummary[3].value, 10))),
      detail: "Runs or publish steps that need intervention before they drift.",
      badge: "Watch",
      tone: "warning",
    },
  ];
}

function buildContentAttention(items, runs, logs) {
  const attention = [];

  (items || [])
    .filter((item) => ["draft", "review"].includes(item.status))
    .slice(0, 2)
    .forEach((item) => {
      attention.push({
        title: item.title,
        detail: item.next_action || "This content item still needs operator judgment.",
        tone: item.status === "review" ? "blue" : "warning",
      });
    });

  (runs || [])
    .filter((item) => item.status && item.status !== "success")
    .slice(0, 1)
    .forEach((item) => {
      attention.push({
        title: item.output_payload?.title || item.status || "Automation attention",
        detail:
          item.error_message ||
          item.input_payload?.command ||
          "The automation lane needs a quick inspection before the next publish pass.",
        tone: item.status === "failure" ? "warning" : "blue",
      });
    });

  (logs || [])
    .filter((item) => item.level === "error" || item.level === "warn")
    .slice(0, 1)
    .forEach((item) => {
      attention.push({
        title: item.context || "Content loop warning",
        detail: item.payload?.error || item.trace || "A recent log event still needs a fix owner.",
        tone: "warning",
      });
    });

  return attention.length ? attention : fallbackContentAttention;
}

function mapAutomationRuns(runs) {
  if (!runs?.length) {
    return fallbackAutomationRuns;
  }

  return runs.map((item) => ({
    title: item.output_payload?.title || item.error_message || item.status || "Automation run",
    status: item.status || "queued",
    time: formatTimestamp(item.finished_at || item.created_at),
    detail:
      item.error_message ||
      item.output_payload?.summary ||
      item.input_payload?.command ||
      "Automation result captured.",
  }));
}

function mapWebhookEndpoints(rows, health) {
  if (!rows?.length && !health?.routes?.length) {
    return fallbackWebhookEndpoints;
  }

  if (rows?.length) {
    return rows.map((item) => ({
      name: item.name,
      method: "POST",
      path: item.route_path,
      status: item.status || "active",
      note: `${item.provider} integration endpoint`,
    }));
  }

  return health.routes.map((route) => ({
    name: route.path.replace("/api/", "").replace(/\//g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    method: route.method,
    path: route.path,
    status: "active",
    note: "Detected from engine health route.",
  }));
}

function mapLogItems(logs) {
  if (!logs?.length) {
    return fallbackLogItems;
  }

  return logs.map((item) => ({
    title: item.context || "System log",
    detail:
      item.payload?.error ||
      item.payload?.summary ||
      item.trace ||
      "Log captured.",
    severity: item.level === "error" ? "warning" : "green",
  }));
}

function mapActivityFeed(updates, runs, logs) {
  const items = [];

  (updates || []).slice(0, 2).forEach((item) => {
    items.push({
      title: item.title || "Project update",
      detail: item.summary || item.next_action || "Progress changed.",
      time: formatTimestamp(item.happened_at || item.created_at),
    });
  });

  (runs || []).slice(0, 1).forEach((item) => {
    items.push({
      title: item.status === "failure" ? "Automation failed" : "Automation run updated",
      detail: item.error_message || item.output_payload?.summary || "Automation lane changed.",
      time: formatTimestamp(item.finished_at || item.created_at),
    });
  });

  (logs || []).slice(0, 1).forEach((item) => {
    items.push({
      title: item.context || "Log event",
      detail: item.payload?.error || item.trace || "Log stream updated.",
      time: formatTimestamp(item.timestamp),
    });
  });

  return items.length ? items : fallbackActivityFeed;
}

function mapTodayFocus(projects, tasks) {
  const items = [];

  (projects || []).slice(0, 2).forEach((project) => {
    items.push({
      title: project.name,
      detail: project.next_action || "Define the next action for this project.",
    });
  });

  (tasks || []).slice(0, 1).forEach((task) => {
    items.push({
      title: task.title,
      detail: task.next_action || "Move the task out of waiting state.",
    });
  });

  return items.length ? items : fallbackTodayFocus;
}

function mapTaskQueue(tasks, projects) {
  if (!tasks?.length) {
    return fallbackTodayFocus.map((item) => ({
      title: item.title,
      detail: item.detail,
      project: "Focus stack",
      status: "todo",
      statusLabel: "focus",
      statusTone: "blue",
    }));
  }

  const projectById = new Map((projects || []).map((item) => [item.id, item.name || item.title]));

  return tasks
    .filter((item) => normalizeTaskStatus(item.status) !== "done")
    .slice(0, 6)
    .map((item) => {
      const statusMeta = getTaskStatusMeta(item.status);

      return {
        title: item.title || "Task",
        detail: item.next_action || "Define the next action before this task stalls.",
        project: projectById.get(item.project_id) || "Unassigned",
        status: statusMeta.value,
        statusLabel: statusMeta.label,
        statusTone: statusMeta.tone,
      };
    });
}

function buildSummaryStats(counts, health) {
  const webhookValue = health?.routes?.length
    ? `${health.routes.length}/${health.routes.length}`
    : fallbackSummaryStats[3].value;

  return [
    {
      title: "Open Projects",
      value: String(maybe(counts.projectCount, Number.parseInt(fallbackSummaryStats[0].value, 10))),
      detail: "Projects with active or blocked motion.",
      badge: "Execution",
    },
    {
      title: "PMS Checks",
      value: String(maybe(counts.pmsCount, Number.parseInt(fallbackSummaryStats[1].value, 10))),
      detail: "Routine checkpoints recorded for the current operating loop.",
      badge: "Cadence",
      tone: "muted",
    },
    {
      title: "Active Leads",
      value: String(maybe(counts.leadCount, Number.parseInt(fallbackSummaryStats[2].value, 10))),
      detail: "Leads still in the working funnel.",
      badge: "Sales",
      tone: "warning",
    },
    {
      title: "Webhook Health",
      value: webhookValue,
      detail: health ? "Read live from the engine health route." : fallbackSummaryStats[3].detail,
      badge: "Engine",
      tone: "blue",
    },
    {
      title: "Error Logs",
      value: String(maybe(counts.errorCount, Number.parseInt(fallbackSummaryStats[4].value, 10))),
      detail: "Outstanding warnings and failures in the loop.",
      badge: "Stable",
      tone: "green",
    },
  ];
}

function buildSystemChecks(health, projectCount, routineCount) {
  if (!health) {
    return fallbackSystemChecks;
  }

  return [
    {
      title: "Hub shell",
      value: "Online",
      detail: "The dashboard is reading live state where environment config is present.",
    },
    {
      title: "Project progress",
      value: projectCount == null ? "Fallback" : `${projectCount} tracked`,
      detail: "Projects are sourced from the unified ledger when available.",
    },
    {
      title: "PMS rhythm",
      value: routineCount == null ? "Fallback" : `${routineCount} checks`,
      detail: "Routine checkpoints are readable from the current workspace.",
    },
    {
      title: "Webhook intake",
      value: `${health.routes.length} routes`,
      detail: "Engine health is reporting active webhook and inspection paths.",
    },
  ];
}

function mapLocalRoadmapRows(milestones, projects, updates) {
  const projectById = new Map((projects || []).map((item) => [item.id, item]));
  const latestByProject = new Map();

  (updates || []).forEach((item) => {
    if (item.project_id && !latestByProject.has(item.project_id)) {
      latestByProject.set(item.project_id, item);
    }
  });

  if (milestones?.length) {
    return milestones.map((item) => {
      const project = item.project_id ? projectById.get(item.project_id) : null;
      const latest = item.project_id ? latestByProject.get(item.project_id) : null;
      const status = item.status || "planned";
      const progress =
        status === "done"
          ? 100
          : status === "active"
            ? maybe(latest?.progress, 64)
            : status === "blocked"
              ? maybe(latest?.progress, 36)
              : 18;

      return {
        title: item.title || "Milestone",
        lane: project?.name || "Unassigned project",
        source: "Hub milestone",
        status,
        statusLabel: humanizeValue(status),
        statusTone:
          status === "done"
            ? "green"
            : status === "blocked"
              ? "danger"
              : status === "active"
                ? "blue"
                : "warning",
        progress,
        due: item.target_date ? formatShortDate(item.target_date) : "No target date",
        detail:
          latest?.next_action ||
          project?.next_action ||
          "Define the next delivery move before this milestone turns into a vague intent.",
      };
    });
  }

  return mapProjectRows(projects, updates, [])
    .slice(0, 6)
    .map((item) => ({
      title: item.milestone,
      lane: item.title,
      source: "Hub project",
      status: item.status,
      statusLabel: item.statusLabel,
      statusTone: item.statusTone,
      progress: item.progress,
      due: "No target date",
      detail: item.nextAction,
    }));
}

export async function getDashboardPageData() {
  const [projectCount, pmsCount, leadCount, errorCount, projects, tasks, updates, runs, logs, health] =
    await Promise.all([
      countRows("projects", [["status", inFilter(["active", "blocked"])]]),
      countRows("routine_checks"),
      countRows("leads", [["status", inFilter(["new", "qualified", "nurturing"])]]),
      countRows("error_logs", [["resolved", boolFilter(false)]]),
      fetchRows("projects", { limit: 3, order: "created_at.desc" }),
      fetchRows("tasks", {
        limit: 3,
        order: "created_at.desc",
        filters: [["status", inFilter(["inbox", "todo", "doing", "blocked"])]],
      }),
      fetchRows("project_updates", { limit: 4, order: "happened_at.desc" }),
      fetchRows("automation_runs", { limit: 3, order: "created_at.desc" }),
      fetchRows("error_logs", { limit: 3, order: "timestamp.desc" }),
      fetchEngineHealth(),
    ]);

  return {
    summaryStats: buildSummaryStats({ projectCount, pmsCount, leadCount, errorCount }, health),
    todayFocus: mapTodayFocus(projects, tasks),
    projectUpdates: mapProjectUpdates(updates),
    systemChecks: buildSystemChecks(health, projectCount, pmsCount),
    webhookEndpoints: mapWebhookEndpoints(null, health),
    activityFeed: mapActivityFeed(updates, runs, logs),
  };
}

export async function getContentPageData() {
  const [
    ideaCount,
    draftCount,
    publishCount,
    attentionCount,
    items,
    variants,
    publishLogs,
    runs,
    logs,
  ] = await Promise.all([
    countRows("content_items", [["status", "eq.idea"]]),
    countRows("content_items", [["status", inFilter(["draft", "review"])]]),
    countRows("content_items", [["status", inFilter(["scheduled", "published"])]]),
    countRows("publish_logs", [["status", "eq.failed"]]),
    fetchRows("content_items", { limit: 12, order: "created_at.desc" }),
    fetchRows("content_variants", { limit: 8, order: "created_at.desc" }),
    fetchRows("publish_logs", { limit: 8, order: "created_at.desc" }),
    fetchRows("automation_runs", { limit: 4, order: "created_at.desc" }),
    fetchRows("error_logs", { limit: 4, order: "timestamp.desc" }),
  ]);

  return {
    contentSummary: buildContentSummary({ ideaCount, draftCount, publishCount, attentionCount }),
    contentPipeline: mapContentPipeline(items),
    contentVariants: mapContentVariants(variants, publishLogs),
    publishQueue: mapPublishQueue(publishLogs, variants),
    contentAttention: buildContentAttention(items, runs, logs),
  };
}

export async function getProjectsPageData() {
  const [projects, updates, tasks] = await Promise.all([
    fetchRows("projects", { limit: 6, order: "created_at.desc" }),
    fetchRows("project_updates", { limit: 8, order: "happened_at.desc" }),
    fetchRows("tasks", {
      limit: 12,
      order: "created_at.desc",
      filters: [["status", inFilter(["inbox", "todo", "doing", "blocked"])]],
    }),
  ]);

  return {
    projectPortfolio: mapProjectRows(projects, updates, tasks || []),
    projectUpdates: mapProjectUpdates(updates),
    taskQueue: mapTaskQueue(tasks, projects),
  };
}

export async function getPmsPageData() {
  const [checks, decisions, updates, tasks, projects] = await Promise.all([
    fetchRows("routine_checks", { limit: 6, order: "created_at.desc" }),
    fetchRows("decisions", { limit: 3, order: "decided_at.desc" }),
    fetchRows("project_updates", { limit: 3, order: "happened_at.desc" }),
    fetchRows("tasks", {
      limit: 6,
      order: "created_at.desc",
      filters: [["status", inFilter(["inbox", "todo", "doing", "blocked"])]],
    }),
    fetchRows("projects", { limit: 12, order: "created_at.desc" }),
  ]);

  return {
    pmsBoard: mapRoutineChecks(checks),
    weeklyReview: mapWeeklyReview(decisions, updates),
    taskQueue: mapTaskQueue(tasks, projects),
  };
}

export async function getWorkPmsPageData() {
  const [pmsData, githubData] = await Promise.all([
    getPmsPageData(),
    getGitHubWorkspaceData(),
  ]);

  return {
    ...pmsData,
    githubConnection: githubData.connection,
    githubRepoCards: githubData.repoCards,
    githubActivityRows: githubData.activityRows,
    githubAlerts: githubData.alerts,
    githubSyncRows: githubData.syncRows,
    githubTotals: githubData.totals,
    hasGitHubData: githubData.hasLiveData,
  };
}

export async function getRoadmapPageData() {
  const [milestones, projects, updates, githubData] = await Promise.all([
    fetchRows("milestones", { limit: 10, order: "created_at.desc" }),
    fetchRows("projects", { limit: 10, order: "created_at.desc" }),
    fetchRows("project_updates", { limit: 10, order: "happened_at.desc" }),
    getGitHubWorkspaceData(),
  ]);

  const localRoadmapRows = mapLocalRoadmapRows(milestones, projects, updates);
  const localShippingRows = mapProjectUpdates(updates).map((item) => ({
    ...item,
    repository: "Hub",
  }));

  return {
    roadmapRows: [...localRoadmapRows, ...githubData.roadmapRows].slice(0, 12),
    shippingRows: [...githubData.activityRows.slice(0, 6), ...localShippingRows.slice(0, 4)].slice(0, 10),
    roadmapAlerts: githubData.alerts,
    githubConnection: githubData.connection,
    githubTotals: githubData.totals,
    hasGitHubData: githubData.hasLiveData,
  };
}

export async function getAutomationsPageData() {
  const [runs, endpoints, health] = await Promise.all([
    fetchRows("automation_runs", { limit: 6, order: "created_at.desc" }),
    fetchRows("webhook_endpoints", { limit: 6, order: "created_at.desc" }),
    fetchEngineHealth(),
  ]);

  const mappedEndpoints = mapWebhookEndpoints(endpoints, health);

  return {
    automationCards: mappedEndpoints.length
      ? mappedEndpoints.map((item) => ({
          title: item.name,
          status: item.status,
          route: item.path,
          detail: item.note,
        }))
      : fallbackAutomationCards,
    automationRuns: mapAutomationRuns(runs),
    webhookEndpoints: mappedEndpoints,
  };
}

export async function getLogsPageData() {
  const logs = await fetchRows("error_logs", { limit: 8, order: "timestamp.desc" });
  return {
    logItems: mapLogItems(logs),
  };
}

export async function getOperationsPageData() {
  const [leadCount, dealCount, caseCount] = await Promise.all([
    countRows("leads", [["status", inFilter(["new", "qualified", "nurturing"])]]),
    countRows("deals", [["stage", inFilter(["prospect", "proposal", "negotiation"])]]),
    countRows("operation_cases", [["status", inFilter(["active", "waiting", "blocked"])]]),
  ]);

  if (leadCount == null && dealCount == null && caseCount == null) {
    return {
      operationsBoard: fallbackOperationsBoard,
    };
  }

  return {
    operationsBoard: [
      {
        title: "Active leads",
        detail: `${maybe(leadCount, 0)} total in the working funnel.`,
      },
      {
        title: "Open deals",
        detail: `${maybe(dealCount, 0)} opportunities still moving toward close.`,
      },
      {
        title: "Operation cases",
        detail: `${maybe(caseCount, 0)} live cases need clear ownership.`,
      },
    ],
  };
}

export async function getCommandCenterPageData() {
  const [runs, updates, checks] = await Promise.all([
    fetchRows("automation_runs", { limit: 3, order: "created_at.desc" }),
    fetchRows("project_updates", { limit: 3, order: "happened_at.desc" }),
    fetchRows("routine_checks", { limit: 3, order: "created_at.desc" }),
  ]);

  const queue = [];

  (updates || []).slice(0, 2).forEach((item) => {
    queue.push({
      title: item.title || "Project follow-up",
      detail: item.next_action || item.summary || "Review this project lane.",
      tone: toTone(item.status),
    });
  });

  (checks || []).slice(0, 1).forEach((item) => {
    queue.push({
      title: `${item.check_type || "Routine"} checkpoint`,
      detail: item.note || "A cadence block is waiting for review.",
      tone: toTone(item.status),
    });
  });

  return {
    quickCommands: fallbackQuickCommands,
    commandCenterQueue: queue.length ? queue : fallbackCommandCenterQueue,
    automationRuns: mapAutomationRuns(runs),
  };
}
