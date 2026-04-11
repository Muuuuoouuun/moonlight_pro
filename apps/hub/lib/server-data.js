import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  activityFeed as fallbackActivityFeed,
  aiAgents as fallbackAiAgents,
  aiChatComposerSuggestions as fallbackAiChatSuggestions,
  aiChatMessages as fallbackAiChatMessages,
  aiChatThreads as fallbackAiChatThreads,
  aiCouncilSessions as fallbackAiCouncilSessions,
  aiOpenOrders as fallbackAiOpenOrders,
  aiOrderTemplates as fallbackAiOrderTemplates,
  aiOsPulse as fallbackAiOsPulse,
  automationCards as fallbackAutomationCards,
  automationRuns as fallbackAutomationRuns,
  commandCenterQueue as fallbackCommandCenterQueue,
  contentAttention as fallbackContentAttention,
  contentPipeline as fallbackContentPipeline,
  contentQueueRoster as fallbackContentQueueRoster,
  contentSummary as fallbackContentSummary,
  contentVariants as fallbackContentVariants,
  emailBlocks as fallbackEmailBlocks,
  emailChannels as fallbackEmailChannels,
  emailQueue as fallbackEmailQueue,
  emailRules as fallbackEmailRules,
  emailSegments as fallbackEmailSegments,
  emailSends as fallbackEmailSends,
  emailTemplates as fallbackEmailTemplates,
  emailVariables as fallbackEmailVariables,
  logItems as fallbackLogItems,
  operationsBoard as fallbackOperationsBoard,
  planDriftItems as fallbackPlanDriftItems,
  planMilestones as fallbackPlanMilestones,
  planPhases as fallbackPlanPhases,
  planProjects as fallbackPlanProjects,
  planSnapshot as fallbackPlanSnapshot,
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
import {
  WORK_CONTEXTS,
} from "@/lib/dashboard-contexts";
import {
  fetchLatestGoogleCalendarConnection,
  listGoogleCalendarEvents,
} from "@/lib/google-calendar";

const CALENDAR_TIMEZONE = "Asia/Seoul";
const DEFAULT_PROJECTS_ROOT = "/Users/bigmac_moon/Desktop/Projects";
const LOCAL_WORK_PROJECT_BINDINGS = [
  {
    contextValue: "com_moon",
    directory: "moonlight_pro",
    repository: "Muuuuoouuun/moonlight_pro",
  },
  {
    contextValue: "classinkr-web",
    directory: "classinkr-web",
    repository: "classinkr-main/classinkr-web",
  },
  {
    contextValue: "sales_branding_dash",
    directory: "sales_dash",
    repository: "Muuuuoouuun/sales_branding_dash",
  },
  {
    contextValue: "ai-command-pot",
    directory: "ai-command-pot",
    repository: "Muuuuoouuun/ai-command-pot",
  },
];

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

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCalendarDateKey(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: CALENDAR_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
  } catch {
    return parsed.toISOString().slice(0, 10);
  }
}

function formatDateOnly(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "Unknown";
  }

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: CALENDAR_TIMEZONE,
      month: "short",
      day: "numeric",
    }).format(parsed);
  } catch {
    return value;
  }
}

function isPastDateValue(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return false;
  }

  return parsed.getTime() < Date.now();
}

function buildCalendarEvent({
  date,
  title,
  detail,
  kind,
  source,
  project,
  tone,
  isAllDay = false,
  isOverdue = false,
}) {
  const parsed = parseDateValue(date);

  if (!parsed) {
    return null;
  }

  return {
    date: parsed.toISOString(),
    dateKey: formatCalendarDateKey(parsed),
    time: isAllDay ? formatDateOnly(parsed) : formatTimestamp(parsed),
    title,
    detail,
    kind,
    source,
    project,
    tone,
    isOverdue,
  };
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

function resolveProjectsRoot() {
  return (process.env.COM_MOON_PROJECTS_ROOT?.trim() || DEFAULT_PROJECTS_ROOT).replace(/\/$/, "");
}

function getWorkContextMeta(contextValue) {
  return (
    WORK_CONTEXTS.find((item) => item.value === contextValue) || {
      value: contextValue,
      label: humanizeValue(contextValue),
      description: "Project context",
    }
  );
}

function resolveLocalWorkProjectBindings() {
  const root = resolveProjectsRoot();

  return LOCAL_WORK_PROJECT_BINDINGS.map((item) => ({
    ...item,
    path: join(root, item.directory),
    context: getWorkContextMeta(item.contextValue),
  }));
}

function readGitValue(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function readAheadBehindCounts(cwd) {
  const counts = readGitValue(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);

  if (!counts) {
    return {
      aheadCount: 0,
      behindCount: 0,
      hasUpstream: false,
    };
  }

  const [aheadValue, behindValue] = counts.split(/\s+/).map((item) => Number.parseInt(item, 10));

  return {
    aheadCount: Number.isFinite(aheadValue) ? aheadValue : 0,
    behindCount: Number.isFinite(behindValue) ? behindValue : 0,
    hasUpstream: true,
  };
}

function buildLocalRepositoryStatus({ exists, isGitRepo, remoteRepository, dirtyCount, aheadCount, behindCount }) {
  if (!exists) {
    return {
      statusLabel: "missing path",
      statusTone: "danger",
    };
  }

  if (!isGitRepo) {
    return {
      statusLabel: "no repo",
      statusTone: "danger",
    };
  }

  if (!remoteRepository) {
    return {
      statusLabel: "local only",
      statusTone: "warning",
    };
  }

  if (dirtyCount > 0) {
    return {
      statusLabel: "dirty",
      statusTone: "warning",
    };
  }

  if (aheadCount > 0 && behindCount > 0) {
    return {
      statusLabel: "diverged",
      statusTone: "danger",
    };
  }

  if (behindCount > 0) {
    return {
      statusLabel: "behind",
      statusTone: "warning",
    };
  }

  if (aheadCount > 0) {
    return {
      statusLabel: "ahead",
      statusTone: "blue",
    };
  }

  return {
    statusLabel: "synced",
    statusTone: "green",
  };
}

function buildLocalRepositoryDetail({ dirtyCount, aheadCount, behindCount, hasUpstream, branch }) {
  const parts = [branch || "unknown branch"];

  if (dirtyCount > 0) {
    parts.push(`${dirtyCount} local changes`);
  }

  if (aheadCount > 0) {
    parts.push(`${aheadCount} ahead`);
  }

  if (behindCount > 0) {
    parts.push(`${behindCount} behind`);
  }

  if (!hasUpstream) {
    parts.push("no upstream");
  }

  return parts.join(" · ");
}

export function getLocalProjectRepositoryData() {
  const projects = resolveLocalWorkProjectBindings().map((binding) => {
    const exists = existsSync(binding.path);
    const isGitRepo = exists && readGitValue(binding.path, ["rev-parse", "--is-inside-work-tree"]) === "true";
    const branch = isGitRepo ? readGitValue(binding.path, ["rev-parse", "--abbrev-ref", "HEAD"]) : "";
    const remoteUrl = isGitRepo ? readGitValue(binding.path, ["remote", "get-url", "origin"]) : "";
    const remoteRepository = parseGitHubRepoFromRemote(remoteUrl);
    const porcelain = isGitRepo ? readGitValue(binding.path, ["status", "--porcelain"]) : "";
    const dirtyCount = porcelain ? porcelain.split("\n").filter(Boolean).length : 0;
    const { aheadCount, behindCount, hasUpstream } = isGitRepo
      ? readAheadBehindCounts(binding.path)
      : { aheadCount: 0, behindCount: 0, hasUpstream: false };
    const lastCommitAt = isGitRepo ? readGitValue(binding.path, ["log", "-1", "--format=%cI"]) : "";
    const lastCommitMessage = isGitRepo ? readGitValue(binding.path, ["log", "-1", "--format=%s"]) : "";
    const { statusLabel, statusTone } = buildLocalRepositoryStatus({
      exists,
      isGitRepo,
      remoteRepository,
      dirtyCount,
      aheadCount,
      behindCount,
    });

    return {
      contextValue: binding.contextValue,
      contextLabel: binding.context.label,
      contextDescription: binding.context.description,
      directory: binding.directory,
      path: binding.path,
      repository: remoteRepository || binding.repository,
      remoteRepository,
      branch,
      dirtyCount,
      aheadCount,
      behindCount,
      hasUpstream,
      exists,
      isGitRepo,
      lastCommitAt,
      lastCommitMessage: compactText(lastCommitMessage || "No local commit detected yet."),
      statusLabel,
      statusTone,
      detail: buildLocalRepositoryDetail({
        dirtyCount,
        aheadCount,
        behindCount,
        hasUpstream,
        branch,
      }),
    };
  });

  return {
    projects,
    totals: {
      trackedProjectCount: projects.length,
      connectedRepositoryCount: projects.filter((item) => item.isGitRepo && item.repository).length,
      dirtyRepositoryCount: projects.filter((item) => item.dirtyCount > 0).length,
      aheadRepositoryCount: projects.filter((item) => item.aheadCount > 0).length,
      behindRepositoryCount: projects.filter((item) => item.behindCount > 0).length,
      missingRepositoryCount: projects.filter((item) => !item.exists || !item.isGitRepo).length,
    },
  };
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
  const localRepositories = getLocalProjectRepositoryData()
    .projects.map((item) => parseGitHubRepoFromRemote(item.repository))
    .filter(Boolean);

  if (envRepositories.length || localRepositories.length) {
    return [...new Set([...envRepositories, ...localRepositories])];
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

  const [repo, openPulls, closedPulls, issues, commits, milestones, releases] = await Promise.all([
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
    // Release log (Slice 3). Returns [] when no releases have been cut,
    // in which case the release log page will fall back to grouped
    // merged PR rows as an auto-changelog.
    fetchGitHubJson(`/repos/${encodedRepository}/releases`, {
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
    releases: Array.isArray(releases) ? releases : [],
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
        // Formatted for display; `dueAt` below is the raw ISO value used by
        // client horizon bucketing (Now / Next / Later).
        due: item.due_on ? formatShortDate(item.due_on) : "No due date",
        dueAt: item.due_on || null,
        detail: `${item.closed_issues} closed / ${item.open_issues} open`,
      });
    });
  });

  return roadmapRows;
}

/**
 * Conventional-commit / keyword-based release type classifier.
 *
 * Given a release title or commit message, pick the best `type` tag
 * (`feat` | `fix` | `refactor` | `chore` | `breaking`) so the patch-note
 * UI can color each bullet consistently.
 */
function classifyReleaseEntry(text) {
  if (!text) return "chore";
  const lower = text.toLowerCase();
  if (lower.includes("breaking") || lower.startsWith("!")) return "breaking";
  if (/^(feat|feature)[:(]/i.test(text) || lower.includes("feat")) return "feat";
  if (/^fix[:(]/i.test(text) || lower.includes("fix") || lower.includes("patch")) return "fix";
  if (/^(refactor|perf)[:(]/i.test(text) || lower.includes("refactor") || lower.includes("perf"))
    return "refactor";
  return "chore";
}

/**
 * Convert a GitHub release markdown body (or a list of merged PR titles)
 * into a compact list of bullet rows for the release log UI. Each bullet
 * has `{ kind, text }` where `kind` is the type chip tone.
 */
function extractReleaseBullets(body, fallbackTitles = []) {
  const lines = (body || "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s?/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .slice(0, 6);

  const source = lines.length ? lines : fallbackTitles.slice(0, 6);
  return source.map((text) => ({
    kind: classifyReleaseEntry(text),
    text: text.replace(/^\[(feat|fix|chore|refactor|perf|breaking)\]\s*/i, ""),
  }));
}

function mapGitHubReleaseRows(bundles) {
  const rows = [];

  (bundles || []).forEach((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);
    const releases = Array.isArray(bundle.releases) ? bundle.releases : [];

    if (releases.length) {
      releases.forEach((release) => {
        if (release.draft) return;
        rows.push({
          id: `${repositoryLabel}-${release.id || release.tag_name}`,
          repository: repositoryLabel,
          tagName: release.tag_name || release.name || "unreleased",
          title: release.name || release.tag_name || "Untitled release",
          publishedAt: release.published_at || release.created_at || null,
          htmlUrl: release.html_url || null,
          prerelease: Boolean(release.prerelease),
          author: release.author
            ? {
                login: release.author.login || "",
                avatarUrl: release.author.avatar_url || "",
              }
            : null,
          bullets: extractReleaseBullets(release.body),
          source: "release",
        });
      });
      return;
    }

    // Auto-changelog fallback: group merged PRs by day, synthesize
    // a release row per day so repos without tagged releases still
    // produce something meaningful on the patch-note rail.
    const byDay = new Map();
    (bundle.mergedPulls || []).forEach((pull) => {
      if (!pull.merged_at) return;
      const dayKey = pull.merged_at.slice(0, 10);
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(pull);
    });

    Array.from(byDay.entries())
      .sort(([left], [right]) => (right > left ? 1 : -1))
      .slice(0, 4)
      .forEach(([day, pulls]) => {
        rows.push({
          id: `${repositoryLabel}-auto-${day}`,
          repository: repositoryLabel,
          tagName: `auto · ${day}`,
          title: `Merged ${pulls.length} PR${pulls.length > 1 ? "s" : ""}`,
          publishedAt: pulls[0].merged_at,
          htmlUrl: pulls[0].html_url || null,
          prerelease: false,
          author: pulls[0].user
            ? {
                login: pulls[0].user.login || "",
                avatarUrl: pulls[0].user.avatar_url || "",
              }
            : null,
          bullets: extractReleaseBullets(
            "",
            pulls.map((pull) => pull.title || `PR #${pull.number}`),
          ),
          source: "auto-changelog",
        });
      });
  });

  return rows
    .sort(
      (left, right) =>
        new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime(),
    )
    .slice(0, 18);
}

/**
 * Group release rows by calendar week for the patch-note rail UI.
 * Each returned group has a `key` ("2026-W15"), a human `title`, and
 * an ordered list of rows.
 */
function groupReleaseRowsByWeek(rows, locale = "ko-KR") {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const now = new Date();
  const isoWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  };

  const groups = new Map();
  rows.forEach((row) => {
    const published = row.publishedAt ? new Date(row.publishedAt) : null;
    if (!published || Number.isNaN(published.getTime())) {
      const key = "undated";
      if (!groups.has(key)) {
        groups.set(key, { key, title: "Undated", sortAt: 0, rows: [] });
      }
      groups.get(key).rows.push(row);
      return;
    }
    const { year, week } = isoWeek(published);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!groups.has(key)) {
      // Title: compute a human label per relative distance from now.
      const { year: nowY, week: nowW } = isoWeek(now);
      const delta = (nowY - year) * 52 + (nowW - week);
      const title =
        delta <= 0
          ? "이번 주"
          : delta === 1
            ? "지난 주"
            : delta <= 4
              ? `${delta}주 전`
              : new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(published);
      groups.set(key, { key, title, sortAt: published.getTime(), rows: [] });
    }
    groups.get(key).rows.push(row);
  });

  return Array.from(groups.values()).sort((left, right) => right.sortAt - left.sortAt);
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

function resolveGoogleEventDateRange(event) {
  const startValue = event.start?.dateTime || event.start?.date;
  const endValue = event.end?.dateTime || event.end?.date || startValue;

  return {
    startValue,
    endValue,
    isAllDay: !event.start?.dateTime,
  };
}

function buildWorkCalendarSchedule({
  projects,
  tasks,
  milestones,
  publishLogs,
  githubBundles,
  googleEvents,
}) {
  const now = Date.now();
  const projectNameById = new Map(
    (projects || []).map((item) => [item.id, item.name || item.title || "Untitled project"]),
  );
  const scheduleEvents = [];

  (projects || []).forEach((item) => {
    if (!item.due_at) {
      return;
    }

    scheduleEvents.push(
      buildCalendarEvent({
        date: item.due_at,
        title: item.name || "Untitled project",
        detail: item.next_action || "Project due date is approaching.",
        kind: "Project due",
        source: "Hub",
        project: item.name || "Project",
        tone:
          item.status === "blocked"
            ? "danger"
            : item.status === "completed"
              ? "green"
              : "blue",
        isOverdue: item.status !== "completed" && new Date(item.due_at).getTime() < now,
      }),
    );
  });

  (tasks || []).forEach((item) => {
    if (!item.due_at || normalizeTaskStatus(item.status) === "done") {
      return;
    }

    const statusMeta = getTaskStatusMeta(item.status);

    scheduleEvents.push(
      buildCalendarEvent({
        date: item.due_at,
        title: item.title || "Task",
        detail: item.next_action || "Task due date is approaching.",
        kind: "Task due",
        source: "Tasks",
        project: projectNameById.get(item.project_id) || "Unassigned",
        tone: statusMeta.tone,
        isOverdue: statusMeta.value !== "done" && new Date(item.due_at).getTime() < now,
      }),
    );
  });

  (milestones || []).forEach((item) => {
    if (!item.target_date) {
      return;
    }

    const projectName = projectNameById.get(item.project_id) || "Unassigned project";
    const tone =
      item.status === "done"
        ? "green"
        : item.status === "blocked"
          ? "danger"
          : item.status === "active"
            ? "blue"
            : "warning";

    scheduleEvents.push(
      buildCalendarEvent({
        date: item.target_date,
        title: item.title || "Milestone",
        detail: `${projectName} milestone target date.`,
        kind: "Milestone",
        source: "Hub",
        project: projectName,
        tone,
        isAllDay: true,
        isOverdue: item.status !== "done" && isPastDateValue(item.target_date),
      }),
    );
  });

  (publishLogs || []).forEach((item) => {
    const eventDate = item.published_at || item.created_at;

    if (!eventDate) {
      return;
    }

    scheduleEvents.push(
      buildCalendarEvent({
        date: eventDate,
        title: item.payload?.title || `${item.channel || "Channel"} publish`,
        detail:
          item.status === "queued"
            ? "Queued publish is waiting to go out."
            : item.status === "failed"
              ? "Publish attempt needs intervention."
              : "Publish event was recorded.",
        kind: item.status === "queued" ? "Publish queue" : "Publish",
        source: item.channel || "Content",
        project: "Content",
        tone: item.status === "failed" ? "danger" : item.status === "queued" ? "warning" : "green",
        isOverdue: item.status === "queued" && new Date(eventDate).getTime() < now,
      }),
    );
  });

  (githubBundles || []).forEach((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);

    bundle.milestones.forEach((item) => {
      if (!item.due_on) {
        return;
      }

      scheduleEvents.push(
        buildCalendarEvent({
          date: item.due_on,
          title: item.title,
          detail: `${repositoryLabel} · ${item.closed_issues} closed / ${item.open_issues} open`,
          kind: "GitHub milestone",
          source: repositoryLabel,
          project: repositoryLabel,
          tone: item.open_issues ? (isPastDateValue(item.due_on) ? "danger" : "blue") : "green",
          isAllDay: true,
          isOverdue: item.open_issues > 0 && isPastDateValue(item.due_on),
        }),
      );
    });
  });

  (googleEvents || []).forEach((item) => {
    const range = resolveGoogleEventDateRange(item);

    if (!range.startValue) {
      return;
    }

    scheduleEvents.push(
      buildCalendarEvent({
        date: range.startValue,
        title: item.summary || "Google Calendar event",
        detail: item.description || item.location || "Synced from Google Calendar.",
        kind: "External event",
        source: "Google Calendar",
        project: "Shared calendar",
        tone: item.status === "cancelled" ? "muted" : "blue",
        isAllDay: range.isAllDay,
        isOverdue:
          item.status !== "cancelled" &&
          parseDateValue(range.endValue || range.startValue)?.getTime() < now,
      }),
    );
  });

  return scheduleEvents
    .filter(Boolean)
    .sort((left, right) => new Date(left.date) - new Date(right.date))
    .slice(0, 40);
}

function buildWorkCalendarProgress({ updates, decisions, publishLogs, githubBundles, projects }) {
  const projectNameById = new Map(
    (projects || []).map((item) => [item.id, item.name || item.title || "Untitled project"]),
  );
  const progressEvents = [];

  (updates || []).forEach((item) => {
    progressEvents.push(
      buildCalendarEvent({
        date: item.happened_at || item.created_at,
        title: item.title || "Project update",
        detail: item.summary || item.next_action || "Progress event captured.",
        kind: "Progress",
        source: "Hub",
        project: projectNameById.get(item.project_id) || "Shared lane",
        tone: toTone(item.status),
      }),
    );
  });

  (decisions || []).forEach((item) => {
    progressEvents.push(
      buildCalendarEvent({
        date: item.decided_at || item.created_at,
        title: item.title || "Decision",
        detail: item.summary || item.rationale || "Decision captured.",
        kind: "Decision",
        source: "Review",
        project: projectNameById.get(item.project_id) || "Shared lane",
        tone: "blue",
      }),
    );
  });

  (publishLogs || []).forEach((item) => {
    progressEvents.push(
      buildCalendarEvent({
        date: item.published_at || item.created_at,
        title: item.payload?.title || `${item.channel || "Channel"} publish`,
        detail:
          item.status === "failed"
            ? "Publish attempt failed and needs a retry."
            : item.status === "queued"
              ? "Publish was queued."
              : "Publish completed.",
        kind: "Publish",
        source: item.channel || "Content",
        project: "Content",
        tone: item.status === "failed" ? "danger" : item.status === "queued" ? "warning" : "green",
      }),
    );
  });

  (githubBundles || []).forEach((bundle) => {
    const repositoryLabel = getGitHubRepoLabel(bundle.repository);

    bundle.commits.slice(0, 4).forEach((item) => {
      progressEvents.push(
        buildCalendarEvent({
          date: item.commit?.author?.date || item.commit?.committer?.date,
          title: `${repositoryLabel} commit`,
          detail: compactText(item.commit?.message || "Commit captured."),
          kind: "Commit",
          source: repositoryLabel,
          project: repositoryLabel,
          tone: "green",
        }),
      );
    });

    bundle.mergedPulls.slice(0, 3).forEach((item) => {
      progressEvents.push(
        buildCalendarEvent({
          date: item.merged_at || item.updated_at,
          title: `${repositoryLabel} PR #${item.number}`,
          detail: compactText(item.title || "Merged pull request"),
          kind: "Merged PR",
          source: repositoryLabel,
          project: repositoryLabel,
          tone: "blue",
        }),
      );
    });
  });

  return progressEvents
    .filter(Boolean)
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 16);
}

function buildWorkCalendarSourceStats(scheduleEvents) {
  return {
    projectDueCount: scheduleEvents.filter((item) => item.kind === "Project due").length,
    taskDueCount: scheduleEvents.filter((item) => item.kind === "Task due").length,
    milestoneCount: scheduleEvents.filter(
      (item) => item.kind === "Milestone" || item.kind === "GitHub milestone",
    ).length,
    publishCount: scheduleEvents.filter(
      (item) => item.kind === "Publish" || item.kind === "Publish queue",
    ).length,
    externalEventCount: scheduleEvents.filter((item) => item.kind === "External event").length,
  };
}

async function getGitHubWorkspaceData() {
  const repositories = resolveGitHubRepositories();
  const token = resolveGitHubToken();

  if (!repositories.length) {
    return {
      bundles: [],
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
    bundles,
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
    // Raw ISO timestamp of the most recent sync run, exposed so the
    // client-side <HubSyncBadge /> can tick a relative time label.
    lastSyncAt: recentSync?.finished_at || recentSync?.started_at || null,
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

  const merged = new Map();

  (rows || []).forEach((item) => {
    const method = "POST";
    const key = `${method}:${item.route_path}`;
    merged.set(key, {
      name: item.name,
      method,
      path: item.route_path,
      status: item.status || "active",
      note: `${item.provider} integration endpoint`,
    });
  });

  (health?.routes || []).forEach((route) => {
    const key = `${route.method}:${route.path}`;
    const existing = merged.get(key);

    merged.set(key, {
      name:
        existing?.name ||
        route.path.replace("/api/", "").replace(/\//g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      method: route.method,
      path: route.path,
      status: existing?.status || "active",
      note: existing?.note || "Detected from engine health route.",
    });
  });

  return Array.from(merged.values());
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
        dueAt: item.target_date || null,
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
      dueAt: null,
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
    githubBundles: githubData.bundles,
    githubRepoCards: githubData.repoCards,
    githubActivityRows: githubData.activityRows,
    githubAlerts: githubData.alerts,
    githubSyncRows: githubData.syncRows,
    githubTotals: githubData.totals,
    githubLastSyncAt: githubData.lastSyncAt,
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
    githubLastSyncAt: githubData.lastSyncAt,
    hasGitHubData: githubData.hasLiveData,
  };
}

/**
 * Release log page data for `/dashboard/work/releases`.
 *
 * Pulls the same GitHub bundles as PMS/Roadmap (they share the
 * workspace cache inside a single request), converts them into
 * release rows (or auto-changelog rows), then groups by week.
 */
export async function getReleaseLogPageData() {
  const githubData = await getGitHubWorkspaceData();
  const releaseRows = mapGitHubReleaseRows(githubData.bundles);
  const weekGroups = groupReleaseRowsByWeek(releaseRows);

  const releasedCount = releaseRows.filter((row) => row.source === "release").length;
  const autoCount = releaseRows.filter((row) => row.source === "auto-changelog").length;
  const thisWeek = weekGroups.find((group) => group.title === "이번 주")?.rows.length || 0;

  return {
    releaseRows,
    weekGroups,
    releasedCount,
    autoCount,
    thisWeek,
    githubConnection: githubData.connection,
    githubTotals: githubData.totals,
    githubLastSyncAt: githubData.lastSyncAt,
    hasGitHubData: githubData.hasLiveData,
  };
}

export async function getWorkCalendarPageData() {
  const [
    projects,
    tasks,
    milestones,
    updates,
    checks,
    decisions,
    publishLogs,
    githubData,
    googleCalendarConnection,
  ] =
    await Promise.all([
      fetchRows("projects", {
        limit: 16,
        order: "due_at.asc.nullslast",
        filters: [["status", inFilter(["draft", "active", "blocked"])]],
      }),
      fetchRows("tasks", {
        limit: 20,
        order: "due_at.asc.nullslast",
        filters: [["status", inFilter(["inbox", "todo", "doing", "blocked"])]],
      }),
      fetchRows("milestones", { limit: 16, order: "target_date.asc.nullslast" }),
      fetchRows("project_updates", { limit: 10, order: "happened_at.desc" }),
      fetchRows("routine_checks", { limit: 8, order: "created_at.desc" }),
      fetchRows("decisions", { limit: 8, order: "decided_at.desc" }),
      fetchRows("publish_logs", { limit: 10, order: "created_at.desc" }),
      getGitHubWorkspaceData(),
      fetchLatestGoogleCalendarConnection(),
    ]);

  const googleEventsResult = googleCalendarConnection?.status === "connected"
    ? await listGoogleCalendarEvents({
        calendarId: googleCalendarConnection.config?.calendarId || process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
        timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        timeMax: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        maxResults: 24,
      })
    : { ok: false, items: [] };

  const scheduleEvents = buildWorkCalendarSchedule({
    projects,
    tasks,
    milestones,
    publishLogs,
    githubBundles: githubData.bundles,
    googleEvents: googleEventsResult.items,
  });

  return {
    scheduleEvents,
    progressEvents: buildWorkCalendarProgress({
      updates,
      decisions,
      publishLogs,
      githubBundles: githubData.bundles,
      projects,
    }),
    cadenceRows: mapRoutineChecks(checks),
    sourceStats: buildWorkCalendarSourceStats(scheduleEvents),
    githubConnection: githubData.connection,
    githubTotals: githubData.totals,
    hasGitHubData: githubData.hasLiveData,
    googleCalendarConnection: googleCalendarConnection
      ? {
          status: googleCalendarConnection.status || "pending",
          tone:
            googleCalendarConnection.status === "connected"
              ? "green"
              : googleCalendarConnection.status === "error"
                ? "danger"
                : "warning",
          title:
            googleCalendarConnection.status === "connected"
              ? "Google Calendar connected"
              : "Google Calendar needs attention",
          detail: googleCalendarConnection.last_synced_at
            ? `Last synced ${formatTimestamp(googleCalendarConnection.last_synced_at)}`
            : "Connection exists, but no successful sync has been recorded yet.",
          calendarId:
            googleCalendarConnection.config?.calendarId ||
            process.env.GOOGLE_CALENDAR_ID?.trim() ||
            "primary",
        }
      : {
          status: "planned",
          tone: "warning",
          title: "Google Calendar not connected",
          detail: "Connect Google Calendar to sync external schedules and create or update shared events.",
          calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
        },
    hasGoogleCalendarData: Boolean(googleEventsResult.ok && googleEventsResult.items.length),
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

function mapEmailChannelStatus(channels) {
  return channels.reduce(
    (acc, channel) => {
      acc.total += 1;
      if (channel.status === "primary" || channel.status === "ready") {
        acc.live += 1;
      }
      return acc;
    },
    { live: 0, total: 0 },
  );
}

function buildEmailSummary({ channels, templates, queue, sends }) {
  const channelMeta = mapEmailChannelStatus(channels);
  const scheduled = queue.filter((item) => item.status === "scheduled").length;
  const blocked = queue.filter((item) => item.status === "blocked" || item.status === "draft").length;
  const failed = sends.filter((item) => item.status === "failed").length;
  const delivered = sends.filter((item) => item.status === "delivered").length;

  return [
    {
      title: "Channels live",
      value: `${channelMeta.live}/${channelMeta.total}`,
      detail: "Resend, n8n, and Gmail can each carry a different kind of email.",
      badge: "Routing",
      tone: "blue",
    },
    {
      title: "Templates",
      value: String(templates.length).padStart(2, "0"),
      detail: "Each template declares its delivery channel and audience scope.",
      badge: "Library",
    },
    {
      title: "Queued sends",
      value: String(scheduled).padStart(2, "0"),
      detail: blocked
        ? `${blocked} more waiting on review or trigger before they can move.`
        : "Everything queued has a clear next move.",
      badge: "Pending",
      tone: "warning",
    },
    {
      title: "Recent delivered",
      value: String(delivered).padStart(2, "0"),
      detail: failed ? `${failed} send needs operator attention.` : "Last batch landed cleanly.",
      badge: "Output",
      tone: failed ? "danger" : "green",
    },
  ];
}

export async function getEmailAutomationPageData() {
  // Live wiring will read from email_templates / email_queue / email_sends
  // tables once provider work begins. Until then we serve seed data so the
  // UI represents the operating model already.
  const channels = fallbackEmailChannels;
  const templates = fallbackEmailTemplates;
  const queue = fallbackEmailQueue;
  const sends = fallbackEmailSends;
  const rules = fallbackEmailRules;
  const segments = fallbackEmailSegments;
  const variables = fallbackEmailVariables;
  const blocks = fallbackEmailBlocks;

  return {
    emailSummary: buildEmailSummary({ channels, templates, queue, sends }),
    emailChannels: channels,
    emailTemplates: templates,
    emailQueue: queue,
    emailSends: sends,
    emailRules: rules,
    emailSegments: segments,
    emailVariables: variables,
    emailBlocks: blocks,
  };
}

function buildPlanSummary({ phases, projects, milestones }) {
  const onTrack = phases.filter(
    (item) => item.status === "ahead" || item.varianceDays <= 3,
  ).length;
  const behind = phases.filter((item) => item.status === "behind").length;
  const watch = phases.filter((item) => item.status === "watch").length;
  const driftingProjects = projects.filter((item) => item.varianceDays > 3);
  const avgDrift =
    projects.length === 0
      ? 0
      : Math.round(
          projects.reduce((sum, item) => sum + item.varianceDays, 0) / projects.length,
        );
  const criticalCount = milestones.filter(
    (item) => item.status === "behind" && item.varianceDays >= 14,
  ).length;

  return [
    {
      title: "Phases on track",
      value: `${onTrack}/${phases.length}`,
      detail:
        behind > 0
          ? `${behind} phase 가 명확히 지연 중, ${watch} phase 는 감시 필요.`
          : "모든 페이즈가 계획선 안에서 움직이는 중.",
      badge: "Plan",
      tone: behind > 0 ? "warning" : "green",
    },
    {
      title: "Projects drifting",
      value: String(driftingProjects.length).padStart(2, "0"),
      detail: driftingProjects.length
        ? "계획 대비 4일 이상 지연된 프로젝트 수."
        : "모든 프로젝트가 계획선 ±3일 안.",
      badge: "Drift",
      tone: driftingProjects.length ? "warning" : "green",
    },
    {
      title: "Avg drift (days)",
      value: avgDrift > 0 ? `+${avgDrift}` : String(avgDrift),
      detail: "프로젝트 평균 일정 편차. 음수면 계획보다 빠른 상태.",
      badge: "Variance",
      tone: avgDrift > 7 ? "danger" : avgDrift > 3 ? "warning" : "blue",
    },
    {
      title: "Critical risks",
      value: String(criticalCount).padStart(2, "0"),
      detail: criticalCount
        ? "14일 이상 지연된 마일스톤 — 즉시 조정 필요."
        : "치명적 지연 없음.",
      badge: "Risk",
      tone: criticalCount ? "danger" : "green",
    },
  ];
}

export async function getPlanTrackerPageData() {
  // Live wiring will read from a `plan_baselines` view that joins planned
  // milestones with actual project state. Until then we serve seed data so the
  // operator can see the variance shape immediately.
  const phases = fallbackPlanPhases;
  const projects = fallbackPlanProjects;
  const milestones = fallbackPlanMilestones;
  const drift = fallbackPlanDriftItems;
  const snapshot = fallbackPlanSnapshot;

  return {
    planSnapshot: snapshot,
    planSummary: buildPlanSummary({ phases, projects, milestones }),
    planPhases: phases,
    planProjects: projects,
    planMilestones: [...milestones].sort((left, right) => right.varianceDays - left.varianceDays),
    planDriftItems: drift,
  };
}

export async function getContentQueuePageData() {
  const base = await getContentPageData();
  return {
    ...base,
    contentQueueRoster: fallbackContentQueueRoster,
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

/**
 * AI Console page data. The AI tab renders four surfaces (overview, chat,
 * council, orders) that all share the same upstream signals: agents, threads,
 * council sessions, open orders, and an OS pulse. Today the repo ships static
 * fallbacks — when a real AI orchestrator lands, swap the implementation here
 * and every sub-page will inherit it automatically.
 */
export async function getAiConsolePageData() {
  return {
    agents: fallbackAiAgents,
    chatThreads: fallbackAiChatThreads,
    chatMessages: fallbackAiChatMessages,
    chatSuggestions: fallbackAiChatSuggestions,
    councilSessions: fallbackAiCouncilSessions,
    openOrders: fallbackAiOpenOrders,
    orderTemplates: fallbackAiOrderTemplates,
    osPulse: fallbackAiOsPulse,
  };
}
