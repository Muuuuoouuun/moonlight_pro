import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  activityFeed as fallbackActivityFeed,
  aiAgents as fallbackAiAgents,
  aiChatComposerSuggestions as fallbackAiChatSuggestions,
  aiChatMessages as fallbackAiChatMessages,
  aiChatThreads as fallbackAiChatThreads,
  aiCouncilSessions as fallbackAiCouncilSessions,
  aiOpenOrders as fallbackAiOpenOrders,
  aiOrderTemplates as fallbackAiOrderTemplates,
  automationCards as fallbackAutomationCards,
  automationRuns as fallbackAutomationRuns,
  automationTriage as fallbackAutomationTriage,
  commandCenterQueue as fallbackCommandCenterQueue,
  contentCampaigns as fallbackContentCampaigns,
  contentAttention as fallbackContentAttention,
  contentAssets as fallbackContentAssets,
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
  buildCampaignPreview,
  getCampaignRunTone,
  getCampaignStatusTone,
} from "@/lib/content-campaigns";
import {
  formatAiClock,
  getAiAuthorLabel,
  getAiCouncilStatusLabel,
  getAiOrderStatusLabel,
  getAiOrderTone,
  getAiTargetLabel,
  normalizeAiTarget,
  normalizeAiCouncilMembers,
} from "@/lib/ai-console";
import {
  fetchLatestGoogleCalendarConnection,
  listGoogleCalendarEvents,
} from "@/lib/google-calendar";

const CALENDAR_TIMEZONE = "Asia/Seoul";
const OPERATING_PULSE_HOURS = 24;
const DEFAULT_PROJECTS_ROOT = "/Users/bigmac_moon/Desktop/Projects";
const SERVER_QUERY_CACHE_TTL_MS = 15_000;
const ENGINE_HEALTH_CACHE_TTL_MS = 10_000;
const LOCAL_REPOSITORY_CACHE_TTL_MS = 30_000;
const GITHUB_WORKSPACE_CACHE_TTL_MS = 30_000;

let localProjectRepositoryCache = {
  expiresAt: 0,
  value: null,
};

let gitHubWorkspaceCache = {
  key: "",
  expiresAt: 0,
  value: null,
  promise: null,
};

const serverQueryCache = new Map();
const CACHE_MISS = Symbol("cache-miss");

let engineHealthCache = {
  expiresAt: 0,
  value: undefined,
  promise: null,
};

const LOCAL_WORK_PROJECT_BINDINGS = [
  {
    contextValue: "com_moon",
    directory: "com_moon",
    repository: "Muuuuoouuun/moonlight_pro",
  },
  {
    contextValue: "classinkr-web",
    directory: "classin_home",
    repository: "classinkr-main/classinkr-web",
  },
  {
    contextValue: "sales_branding_dash",
    directory: "sales_branding_dash",
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

function resolveDefaultWorkspaceId() {
  return (
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    ""
  );
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

function getTimedCache(cacheKey) {
  const cached = serverQueryCache.get(cacheKey);

  if (!cached) {
    return CACHE_MISS;
  }

  if (cached.promise) {
    return cached.promise;
  }

  if (Date.now() < cached.expiresAt) {
    return cached.value;
  }

  serverQueryCache.delete(cacheKey);
  return CACHE_MISS;
}

function setTimedCacheValue(cacheKey, value, ttl = SERVER_QUERY_CACHE_TTL_MS) {
  serverQueryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

function setTimedCachePromise(cacheKey, promise) {
  serverQueryCache.set(cacheKey, {
    promise,
  });
}

export async function fetchRows(table, options = {}) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  const cacheKey = JSON.stringify(["rows", config.url, table, options]);
  const cached = getTimedCache(cacheKey);
  if (cached !== CACHE_MISS) {
    return cached;
  }

  const request = (async () => {
    try {
      const response = await fetch(buildRestUrl(config.url, table, options), {
        headers: makeHeaders(config.apiKey),
        cache: "no-store",
      });

      if (!response.ok) {
        setTimedCacheValue(cacheKey, null);
        return null;
      }

      const data = await response.json();
      setTimedCacheValue(cacheKey, data);
      return data;
    } catch {
      setTimedCacheValue(cacheKey, null);
      return null;
    }
  })();

  setTimedCachePromise(cacheKey, request);
  return request;
}

export async function countRows(table, filters = []) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  const cacheKey = JSON.stringify(["count", config.url, table, filters]);
  const cached = getTimedCache(cacheKey);
  if (cached !== CACHE_MISS) {
    return cached;
  }

  const request = (async () => {
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
        setTimedCacheValue(cacheKey, null);
        return null;
      }

      const count = extractCount(response.headers.get("content-range"));
      setTimedCacheValue(cacheKey, count);
      return count;
    } catch {
      setTimedCacheValue(cacheKey, null);
      return null;
    }
  })();

  setTimedCachePromise(cacheKey, request);
  return request;
}

export async function fetchEngineHealth() {
  const engineUrl = resolveEngineUrl();

  if (!engineUrl) {
    return null;
  }

  if (engineHealthCache.value !== undefined && Date.now() < engineHealthCache.expiresAt) {
    return engineHealthCache.value;
  }

  if (engineHealthCache.promise) {
    return engineHealthCache.promise;
  }

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    try {
      const response = await fetch(`${engineUrl}/api/health`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        engineHealthCache = {
          value: null,
          expiresAt: Date.now() + ENGINE_HEALTH_CACHE_TTL_MS,
          promise: null,
        };
        return null;
      }

      const data = await response.json();
      engineHealthCache = {
        value: data,
        expiresAt: Date.now() + ENGINE_HEALTH_CACHE_TTL_MS,
        promise: null,
      };
      return data;
    } catch {
      engineHealthCache = {
        value: null,
        expiresAt: Date.now() + ENGINE_HEALTH_CACHE_TTL_MS,
        promise: null,
      };
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  engineHealthCache = {
    value: engineHealthCache.value,
    expiresAt: engineHealthCache.expiresAt,
    promise: request,
  };

  return request;
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

function formatCalendarHour(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: CALENDAR_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(parsed);
    const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value || "", 10);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return parsed.getHours();
  }
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatMinutesLabel(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  return `${minutes}m`;
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
  const configuredRoot = process.env.COM_MOON_PROJECTS_ROOT?.trim();

  if (configuredRoot) {
    return configuredRoot.replace(/\/$/, "");
  }

  const inferredRoot = inferProjectsRootFromCwd();
  return (inferredRoot || DEFAULT_PROJECTS_ROOT).replace(/\/$/, "");
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

function countBoundDirectories(root) {
  return LOCAL_WORK_PROJECT_BINDINGS.filter((item) => existsSync(join(root, item.directory))).length;
}

function inferProjectsRootFromCwd() {
  let current = process.cwd();
  let bestRoot = "";
  let bestScore = 0;

  for (let step = 0; current && step < 8; step += 1) {
    const score = countBoundDirectories(current);

    if (score > bestScore) {
      bestRoot = current;
      bestScore = score;
    }

    const parent = dirname(current);
    if (!parent || parent === current) {
      break;
    }

    current = parent;
  }

  return bestRoot;
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
  const now = Date.now();
  if (localProjectRepositoryCache.value && now < localProjectRepositoryCache.expiresAt) {
    return localProjectRepositoryCache.value;
  }

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

  const result = {
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

  localProjectRepositoryCache = {
    value: result,
    expiresAt: now + LOCAL_REPOSITORY_CACHE_TTL_MS,
  };

  return result;
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

function normalizeContentBrandToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveContentBrandToken(item) {
  return normalizeContentBrandToken(
    item?.brand_key ||
      item?.brand ||
      item?.payload?.brand_key ||
      item?.payload?.brand ||
      item?.meta?.brand_key ||
      "",
  );
}

function scopeContentRowsByBrand(rows, selectedBrand) {
  if (!rows?.length || !selectedBrand || selectedBrand === "all") {
    return rows;
  }

  const normalizedSelected = normalizeContentBrandToken(selectedBrand);
  const hasExplicitBrand = rows.some((item) => resolveContentBrandToken(item));

  if (!hasExplicitBrand) {
    return rows;
  }

  return rows.filter((item) => {
    const token = resolveContentBrandToken(item);
    return !token || token === normalizedSelected;
  });
}

function scopeContentPipelineByBrand(stages, selectedBrand) {
  if (!stages?.length || !selectedBrand || selectedBrand === "all") {
    return stages;
  }

  const hasExplicitBrand = stages.some((stage) =>
    (stage.items || []).some((item) => resolveContentBrandToken(item)),
  );

  if (!hasExplicitBrand) {
    return stages;
  }

  const normalizedSelected = normalizeContentBrandToken(selectedBrand);

  return stages.map((stage) => ({
    ...stage,
    items: (stage.items || []).filter((item) => {
      const token = resolveContentBrandToken(item);
      return !token || token === normalizedSelected;
    }),
  }));
}

function buildScopedContentSummary(summary, pipeline, attention, selectedBrand) {
  if (!summary?.length || !selectedBrand || selectedBrand === "all") {
    return summary;
  }

  const hasExplicitBrand = (pipeline || []).some((stage) =>
    (stage.items || []).some((item) => resolveContentBrandToken(item)),
  );

  if (!hasExplicitBrand) {
    return summary;
  }

  const stageCounts = (pipeline || []).reduce(
    (acc, stage) => {
      acc[stage.title] = (stage.items || []).length;
      return acc;
    },
    {},
  );

  return summary.map((item) => {
    if (item.title === "Idea Backlog") {
      return {
        ...item,
        value: String(stageCounts.Idea || 0),
        detail: "This selected brand's raw topics still waiting for a sharper angle and first hook.",
      };
    }

    if (item.title === "Draft + Review") {
      return {
        ...item,
        value: String((stageCounts.Draft || 0) + (stageCounts.Review || 0)),
        detail: "Pieces in writing or operator review for the current brand lane.",
      };
    }

    if (item.title === "Scheduled / Published") {
      return {
        ...item,
        value: String(stageCounts.Publish || 0),
        detail: "Brand-scoped work already queued or recently shipped.",
      };
    }

    if (item.title === "Attention") {
      return {
        ...item,
        value: String((attention || []).length),
        detail: "Judgment calls or machine warnings still visible inside this brand lane.",
      };
    }

    return item;
  });
}

async function buildGitHubWorkspaceData(repositories) {
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

async function getGitHubWorkspaceData() {
  const repositories = resolveGitHubRepositories();
  const cacheKey = JSON.stringify({
    repositories,
    apiBase: resolveGitHubApiBase(),
    hasToken: Boolean(resolveGitHubToken()),
  });
  const now = Date.now();

  if (
    gitHubWorkspaceCache.value &&
    gitHubWorkspaceCache.key === cacheKey &&
    now < gitHubWorkspaceCache.expiresAt
  ) {
    return gitHubWorkspaceCache.value;
  }

  if (gitHubWorkspaceCache.promise && gitHubWorkspaceCache.key === cacheKey) {
    return gitHubWorkspaceCache.promise;
  }

  const promise = buildGitHubWorkspaceData(repositories)
    .then((result) => {
      gitHubWorkspaceCache = {
        key: cacheKey,
        value: result,
        expiresAt: Date.now() + GITHUB_WORKSPACE_CACHE_TTL_MS,
        promise: null,
      };

      return result;
    })
    .catch((error) => {
      if (gitHubWorkspaceCache.key === cacheKey) {
        gitHubWorkspaceCache = {
          key: cacheKey,
          value: null,
          expiresAt: 0,
          promise: null,
        };
      }

      throw error;
    });

  gitHubWorkspaceCache = {
    key: cacheKey,
    value: gitHubWorkspaceCache.key === cacheKey ? gitHubWorkspaceCache.value : null,
    expiresAt: gitHubWorkspaceCache.key === cacheKey ? gitHubWorkspaceCache.expiresAt : 0,
    promise,
  };

  return promise;
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
        brand: resolveContentBrandToken(item) || null,
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
      brand: resolveContentBrandToken(item) || resolveContentBrandToken(publish) || null,
      type: humanizeValue(item.variant_type),
      status: item.status || publish?.status || "draft",
      channel: publish?.channel || "Workspace",
      detail: compactText(item.body) || "Variant ready for operator review.",
    };
  });
}

function resolveContentAssetStatus(asset, variant) {
  const explicitStatus =
    asset?.meta?.status ||
    asset?.meta?.lifecycle ||
    asset?.payload?.status ||
    String(asset?.status || "")
      .trim()
      .toLowerCase();

  if (explicitStatus) {
    return String(explicitStatus);
  }

  if (variant?.status === "archived") {
    return "archived";
  }

  if (variant?.status === "draft") {
    return "draft";
  }

  return "ready";
}

function mapContentAssets(assets, variants) {
  if (!assets?.length) {
    return fallbackContentAssets;
  }

  const variantById = new Map((variants || []).map((item) => [item.id, item]));

  return assets.slice(0, 10).map((asset) => {
    const variant = variantById.get(asset.variant_id);
    const status = resolveContentAssetStatus(asset, variant);
    const detail =
      asset.meta?.summary ||
      asset.meta?.note ||
      (asset.storage_path ? `Stored at ${asset.storage_path}` : "Asset stored for the next publish pass.");

    return {
      title: asset.meta?.title || asset.storage_path?.split("/").pop() || humanizeValue(asset.asset_type),
      brand: resolveContentBrandToken(asset) || resolveContentBrandToken(variant) || null,
      kind: humanizeValue(asset.asset_type),
      source: variant?.title || humanizeValue(variant?.variant_type) || "Content asset",
      detail,
      status,
      createdAt: asset.created_at || null,
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
      brand: resolveContentBrandToken(item) || resolveContentBrandToken(variant) || null,
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
        brand: resolveContentBrandToken(item) || null,
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

function buildContentAssetsSummary(assetRows, variants) {
  const assets = assetRows || [];
  const variantRows = variants || [];

  return {
    capturedCount: assets.filter((item) => item.status !== "archived").length,
    draftCount: assets.filter((item) => item.status === "draft").length,
    archivedCount: assets.filter((item) => item.status === "archived").length,
    variantCount: variantRows.length,
  };
}

function buildContentPublishSummary(queue) {
  const rows = queue || [];

  return {
    queuedCount: rows.filter((item) => item.status === "queued").length,
    publishedCount: rows.filter((item) => item.status === "published").length,
    failedCount: rows.filter((item) => item.status === "failed").length,
    channelCount: new Set(rows.map((item) => item.channel).filter(Boolean)).size,
  };
}

function mapContentCampaigns(campaigns, runs) {
  const latestRunByCampaign = new Map();
  (runs || []).forEach((item) => {
    if (item.campaign_id && !latestRunByCampaign.has(item.campaign_id)) {
      latestRunByCampaign.set(item.campaign_id, item);
    }
  });

  const sourceCampaigns =
    campaigns?.length
      ? campaigns.slice(0, 6)
      : fallbackContentCampaigns.map((item) => ({
          id: item.id,
          name: item.title,
          brand_key: item.brand,
          channel: item.channel,
          status: item.status,
          goal: item.goal,
          next_action: item.nextAction,
          handoff: item.handoff,
        }));

  return sourceCampaigns.map((item) => {
    const run = latestRunByCampaign.get(item.id);

    return buildCampaignPreview({
      id: item.id,
      name: item.name,
      brand_key: resolveContentBrandToken(item) || resolveContentBrandToken(run) || null,
      channel: item.channel || run?.payload?.channel || "Content",
      status: item.status || "draft",
      goal: item.goal || run?.payload?.goal || "Campaign brief is ready for alignment.",
      next_action:
        item.next_action ||
        run?.result_summary ||
        "Lock the next content move and the follow-up lane together.",
      handoff:
        item.handoff || run?.payload?.handoff || "Content -> Publish -> Follow-up",
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      run_status: run?.status || "",
      run_summary: run?.result_summary || "",
    });
  });
}

function mapCampaignRuns(runs, campaigns) {
  const campaignCards = campaigns?.length ? campaigns : mapContentCampaigns([], []);
  const campaignById = new Map(campaignCards.map((item) => [item.id, item]));

  if (!runs?.length) {
    return campaignCards.slice(0, 4).map((item) => ({
      id: `${item.id}-fallback-run`,
      campaignId: item.id,
      title: item.title,
      brand: item.brand || null,
      brandLabel: item.brandLabel,
      status: item.status === "active" ? "running" : item.status === "completed" ? "success" : "queued",
      tone: item.status === "active" ? "blue" : item.status === "completed" ? "green" : "warning",
      detail: item.nextAction,
      handoff: item.handoff,
      time: item.window,
    }));
  }

  return runs.slice(0, 10).map((item, index) => {
    const campaign = campaignById.get(item.campaign_id);
    const brand = resolveContentBrandToken(item) || campaign?.brand || null;
    const status = item.status || "queued";

    return {
      id: item.id || `campaign-run-${index}`,
      campaignId: item.campaign_id || campaign?.id || `campaign-${index}`,
      title: campaign?.title || item.payload?.campaign_title || "Campaign handoff",
      brand,
      brandLabel: brand ? campaign?.brandLabel || brand : campaign?.brandLabel || "Shared lane",
      status,
      tone: getCampaignRunTone(status),
      detail:
        item.result_summary ||
        item.payload?.goal ||
        campaign?.nextAction ||
        "Campaign handoff captured.",
      handoff: item.payload?.handoff || campaign?.handoff || "Content -> Publish -> Follow-up",
      time: formatTimestamp(item.created_at),
    };
  });
}

function buildCampaignCoverage(campaigns, items, variants, publishLogs) {
  const contentPool = items?.length
    ? mapContentPipeline(items).flatMap((stage) => stage.items || [])
    : fallbackContentPipeline.flatMap((stage) => stage.items || []);
  const variantPool = variants?.length
    ? mapContentVariants(variants, publishLogs || [])
    : fallbackContentVariants;
  const publishPool = publishLogs?.length
    ? mapPublishQueue(publishLogs, variants || [])
    : fallbackPublishQueue;

  return (campaigns || []).map((campaign) => {
    const brand = resolveContentBrandToken(campaign);
    const sameBrand = (row) => {
      const token = resolveContentBrandToken(row);
      return !brand || !token || token === brand;
    };
    const relatedContent = contentPool.filter(sameBrand).slice(0, 3);
    const relatedVariants = variantPool.filter(sameBrand).slice(0, 3);
    const relatedPublish = publishPool.filter(sameBrand).slice(0, 3);

    return {
      ...campaign,
      contentCount: relatedContent.length,
      variantCount: relatedVariants.length,
      publishCount: relatedPublish.length,
      relatedContent: relatedContent.map((item) => ({
        title: item.title,
        detail: item.nextAction || item.meta || item.detail || "Follow-up pending.",
        status: item.stage || item.status || "content",
      })),
      relatedOutputs: [...relatedVariants, ...relatedPublish].slice(0, 4).map((item) => ({
        title: item.title,
        detail: item.detail || item.meta || "Output ready.",
        status: item.status || item.channel || "ready",
      })),
    };
  });
}

function buildCampaignSummary(campaigns, runs) {
  const sourceCampaigns = campaigns || [];
  const sourceRuns = runs || [];
  const liveCount = sourceCampaigns.filter((item) => item.status === "active").length;
  const queuedCount = sourceRuns.filter((item) => item.status === "queued" || item.status === "running").length;
  const completedCount = sourceCampaigns.filter((item) => item.status === "completed").length;
  const brandCount = new Set(sourceCampaigns.map((item) => item.brand).filter(Boolean)).size;

  return [
    {
      title: "Live campaigns",
      value: String(liveCount).padStart(2, "0"),
      detail: liveCount ? "지금 움직이는 캠페인입니다." : "활성 캠페인이 아직 없습니다.",
      badge: "Live",
      tone: liveCount ? "green" : "muted",
    },
    {
      title: "Queued handoffs",
      value: String(queuedCount).padStart(2, "0"),
      detail: queuedCount ? "콘텐츠 -> 이메일/퍼블리시 handoff가 대기 중입니다." : "대기 중인 handoff가 없습니다.",
      badge: "Handoff",
      tone: queuedCount ? "warning" : "blue",
    },
    {
      title: "Covered brands",
      value: String(brandCount).padStart(2, "0"),
      detail: brandCount ? "브랜드별 운영 레인이 campaign surface에 반영됩니다." : "아직 brand scope가 비어 있습니다.",
      badge: "Scope",
      tone: "blue",
    },
    {
      title: "Completed loops",
      value: String(completedCount).padStart(2, "0"),
      detail: completedCount ? "종료된 캠페인도 기록으로 남겨 다음 루프에 재사용합니다." : "완료된 캠페인이 아직 없습니다.",
      badge: "Closed",
      tone: completedCount ? "green" : "muted",
    },
  ];
}

function buildEmailCampaignHandoffs(campaigns, runs) {
  const latestRunByCampaign = new Map();

  (runs || []).forEach((item) => {
    if (item.campaign_id && !latestRunByCampaign.has(item.campaign_id)) {
      latestRunByCampaign.set(item.campaign_id, item);
    }
  });

  return (campaigns || []).map((campaign) => {
    const run = latestRunByCampaign.get(campaign.id);
    return {
      ...campaign.emailHandoff,
      id: campaign.id,
      title: campaign.title,
      brand: campaign.brand,
      brandLabel: campaign.brandLabel,
      channel: campaign.channel,
      status: campaign.status,
      statusTone: getCampaignStatusTone(campaign.status),
      goal: campaign.goal,
      nextAction: campaign.nextAction,
      handoff: campaign.handoff,
      runStatus: run?.status || campaign.runStatus || "",
      runTone: getCampaignRunTone(run?.status || campaign.runStatus || "queued"),
      runSummary: run?.result_summary || campaign.runSummary || campaign.nextAction,
    };
  });
}

function mapContentQueueRoster(items) {
  if (!items?.length) {
    return fallbackContentQueueRoster;
  }

  return items
    .filter((item) => ["idea", "draft", "review"].includes(item.status))
    .slice(0, 10)
    .map((item, index) => ({
      id: item.id || `content-queue-${index}`,
      title: item.title,
      stage: item.status,
      brand: resolveContentBrandToken(item) || null,
      owner: item.owner_id ? "Workspace owner" : "Content lane",
      due:
        item.status === "review"
          ? "오늘"
          : item.status === "draft"
            ? "오늘 오후"
            : "이번 주",
      nextAction:
        item.next_action ||
        (item.status === "idea"
          ? "첫 메시지와 훅부터 고정."
          : item.status === "draft"
            ? "문장 리듬과 proof block 정리."
            : "리뷰 피드백 반영 후 publish handoff."),
      note: item.source_type || "content",
    }));
}

function mapAiAgents(rows) {
  if (!rows?.length) {
    return fallbackAiAgents;
  }

  const sourceRows = rows.filter(
    (item) => ["Claude", "Codex", "Engine"].includes(item.name) || item.status !== "idle",
  );

  return (sourceRows.length ? sourceRows : rows).slice(0, 6).map((item) => ({
    id: item.id,
    name: item.name,
    role:
      item.config?.role ||
      `${humanizeValue(item.agent_type)} agent`,
    status: item.status || "idle",
    latency: item.config?.latency || "—",
    load: item.config?.load || "—",
    focus: item.config?.focus || "No live focus set yet.",
    tone: item.config?.tone || toTone(item.status),
  }));
}

function mapAiThreads(rows, messages) {
  if (!rows?.length) {
    return fallbackAiChatThreads;
  }

  const latestMessageByThread = new Map();
  (messages || []).forEach((item) => {
    if (item.thread_id && !latestMessageByThread.has(item.thread_id)) {
      latestMessageByThread.set(item.thread_id, item);
    }
  });

  return rows.slice(0, 8).map((item) => {
    const latestMessage = latestMessageByThread.get(item.id);

    return {
      id: item.id,
      title: item.title || "AI thread",
      target: getAiTargetLabel(item.target),
      updated: formatTimestamp(item.updated_at || item.created_at),
      preview: item.preview || compactText(latestMessage?.body || "Awaiting first message."),
      unread: Number.isFinite(item.unread) ? item.unread : 0,
      status: item.status || "active",
    };
  });
}

function mapAiMessages(rows, activeThreadId) {
  if (!rows?.length) {
    return fallbackAiChatMessages;
  }

  const sourceRows = activeThreadId
    ? rows.filter((item) => item.thread_id === activeThreadId)
    : rows;

  if (!sourceRows.length) {
    return fallbackAiChatMessages;
  }

  return [...sourceRows]
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at))
    .slice(-24)
    .map((item) => ({
    id: item.id,
    author: item.author,
    authorLabel: item.author_label || getAiAuthorLabel(item.author),
    time: formatAiClock(item.created_at),
    body: item.body,
    }));
}

function mapAiCouncilSessions(rows, turns) {
  if (!rows?.length) {
    return fallbackAiCouncilSessions;
  }

  const turnsBySession = new Map();
  (turns || []).forEach((item) => {
    const group = turnsBySession.get(item.session_id) || [];
    group.push({
      author: item.author,
      stance: item.stance,
      createdAt: item.created_at,
      time: formatAiClock(item.created_at),
      body: item.body,
    });
    turnsBySession.set(item.session_id, group);
  });

  return rows.slice(0, 8).map((item) => ({
    id: item.id,
    topic: item.topic,
    members: normalizeAiCouncilMembers(item.members),
    status: getAiCouncilStatusLabel(item.status),
    tone: item.tone || "blue",
    turns:
      (turnsBySession.get(item.id) || [])
        .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
        .map(({ createdAt, ...turn }) => turn),
  }));
}

function mapAiOrders(rows) {
  if (!rows?.length) {
    return fallbackAiOpenOrders;
  }

  return rows.slice(0, 10).map((item) => ({
    id: item.id,
    title: item.title,
    target: getAiTargetLabel(item.target),
    status: getAiOrderStatusLabel(item.status),
    tone: item.tone || getAiOrderTone(item.status),
    priority: item.priority || "P1",
    lane: item.lane || "Work OS",
    due: item.due_label || "오늘",
    note: item.note || "No order note yet.",
  }));
}

function isCalendarDate(value, dateKey) {
  return formatCalendarDateKey(value) === dateKey;
}

function calculateDurationMinutes(startValue, endValue = null) {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue || new Date().toISOString());

  if (!start || !end) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function buildOperatingPulseMachine({
  hasEngineUrl,
  health,
  runningCount,
  queuedCount,
  failureCount,
  attentionCount,
  totalToday,
  liveRoutes,
}) {
  if (hasEngineUrl && !health) {
    return {
      status: "down",
      statusLabel: "Health Down",
      statusTone: "danger",
      summary: "Engine health route is not responding.",
      detail: "Engine URL is configured, but the health endpoint did not answer in time.",
    };
  }

  if (failureCount > 0 || attentionCount > 2) {
    return {
      status: "attention",
      statusLabel: "Needs Review",
      statusTone: attentionCount > 4 ? "danger" : "warning",
      summary: `${failureCount} failure ${failureCount === 1 ? "signal" : "signals"} visible today.`,
      detail: `${runningCount} running · ${queuedCount} queued · ${liveRoutes} visible routes.`,
    };
  }

  if (runningCount > 0) {
    return {
      status: "running",
      statusLabel: "Running",
      statusTone: "blue",
      summary: `${runningCount} live ${runningCount === 1 ? "run" : "runs"} in motion right now.`,
      detail: queuedCount
        ? `${queuedCount} more waiting behind the current execution lane.`
        : `${liveRoutes} routes are visible and the machine is moving cleanly.`,
    };
  }

  if (queuedCount > 0) {
    return {
      status: "queued",
      statusLabel: "Queued",
      statusTone: "warning",
      summary: `${queuedCount} queued ${queuedCount === 1 ? "run" : "runs"} waiting for dispatch.`,
      detail: "The system is awake, but nothing is actively executing right now.",
    };
  }

  if (totalToday > 0) {
    return {
      status: "steady",
      statusLabel: "Steady",
      statusTone: "green",
      summary: `${totalToday} runs already completed today.`,
      detail: `${liveRoutes} routes visible and no urgent machine signal is open.`,
    };
  }

  return {
    status: "quiet",
    statusLabel: "Quiet",
    statusTone: "muted",
    summary: "No meaningful machine activity has landed today yet.",
    detail: hasEngineUrl
      ? `${liveRoutes} routes are visible, but the system is currently resting.`
      : "Engine URL is not configured, so live route posture still falls back to stored rows.",
  };
}

function buildOperatingRunRows(automationRuns, syncRuns) {
  const automationRows = (automationRuns || []).map((item) => {
    const status = item.status || "queued";
    const startedAt = item.created_at || item.finished_at || null;
    const durationMinutes =
      status === "queued" ? 0 : calculateDurationMinutes(startedAt, item.finished_at || null);

    return {
      id: item.id || `automation-${startedAt || item.created_at || "unknown"}`,
      title:
        item.output_payload?.title ||
        item.input_payload?.command ||
        item.error_message ||
        "Automation run",
      lane: "Automation",
      source: humanizeValue(item.input_payload?.source || item.input_payload?.command || "engine"),
      status,
      statusTone: toTone(status),
      detail:
        item.error_message ||
        item.output_payload?.summary ||
        item.input_payload?.text ||
        "Automation result captured.",
      time: formatTimestamp(item.finished_at || startedAt),
      durationLabel: durationMinutes ? formatMinutesLabel(durationMinutes) : "Pending",
      isLive: status === "running" || status === "queued",
      sortAt: item.finished_at || startedAt || item.created_at || null,
    };
  });

  const syncRows = (syncRuns || []).map((item) => {
    const status = item.status || "queued";
    const startedAt = item.started_at || item.finished_at || null;
    const durationMinutes =
      status === "queued" ? 0 : calculateDurationMinutes(startedAt, item.finished_at || null);

    return {
      id: item.id || `sync-${startedAt || item.finished_at || "unknown"}`,
      title: humanizeValue(item.payload?.kind || "sync run"),
      lane: "Sync",
      source: humanizeValue(item.payload?.provider || item.payload?.kind || "integration"),
      status,
      statusTone: toTone(status),
      detail:
        item.error_message ||
        item.payload?.summary ||
        "Synchronization event captured.",
      time: formatTimestamp(item.finished_at || startedAt),
      durationLabel: durationMinutes ? formatMinutesLabel(durationMinutes) : "Pending",
      isLive: status === "running" || status === "queued",
      sortAt: item.finished_at || startedAt || null,
    };
  });

  const merged = [...automationRows, ...syncRows].sort(
    (left, right) => new Date(right.sortAt || 0).getTime() - new Date(left.sortAt || 0).getTime(),
  );

  return merged.length ? merged : [];
}

function buildOperatingSourceRows({
  automationToday,
  syncToday,
  webhookToday,
  unresolvedErrors,
  connections,
}) {
  const connectionErrors = (connections || []).filter((item) => item.status === "error").length;
  const automationFailures = automationToday.filter((item) => item.status === "failure").length;
  const syncFailures = syncToday.filter((item) => item.status === "failure").length;
  const webhookFailures = webhookToday.filter((item) => item.status === "failed").length;

  return [
    {
      id: "automation",
      title: "Automation lane",
      value: `${automationToday.length} today`,
      detail:
        automationToday.filter((item) => item.status === "running").length > 0
          ? "Active execution is visible in the main automation lane."
          : automationFailures > 0
            ? `${automationFailures} run failures need a retry or review.`
            : "No automation failure signal is open right now.",
      meta: `${automationToday.filter((item) => item.status === "running").length} running · ${automationToday.filter((item) => item.status === "queued").length} queued`,
      tone: automationFailures > 0 ? "danger" : automationToday.length ? "blue" : "muted",
    },
    {
      id: "sync",
      title: "Sync lane",
      value: `${syncToday.length} today`,
      detail:
        syncFailures > 0
          ? `${syncFailures} sync failures were recorded.`
          : "Integration syncs are quiet or healthy.",
      meta: `${syncToday.filter((item) => item.status === "running").length} running · ${syncToday.filter((item) => item.status === "queued").length} queued`,
      tone: syncFailures > 0 ? "danger" : syncToday.length ? "green" : "muted",
    },
    {
      id: "webhooks",
      title: "Webhook intake",
      value: `${webhookToday.length} events`,
      detail:
        webhookFailures > 0
          ? `${webhookFailures} webhook events failed during processing.`
          : "Webhook intake is landing without visible processing failures.",
      meta: `${webhookToday.filter((item) => item.status === "processed").length} processed today`,
      tone: webhookFailures > 0 ? "danger" : webhookToday.length ? "blue" : "muted",
    },
    {
      id: "errors",
      title: "Error loop",
      value: `${(unresolvedErrors || []).length} open`,
      detail:
        (unresolvedErrors || []).length > 0
          ? `${connectionErrors} integration connections and ${(unresolvedErrors || []).length} unresolved logs still need operator attention.`
          : "No unresolved machine errors are visible.",
      meta: `${connectionErrors} connection errors`,
      tone: (unresolvedErrors || []).length > 0 || connectionErrors > 0 ? "warning" : "green",
    },
  ];
}

function buildOperatingAttentionItems({
  hasEngineUrl,
  health,
  automationRuns,
  syncRuns,
  unresolvedErrors,
  connections,
}) {
  const items = [];

  if (hasEngineUrl && !health) {
    items.push({
      id: "engine-health",
      title: "Engine health check is failing",
      detail: "The shell cannot confirm route posture, so live machine status may be stale.",
      tone: "danger",
      meta: "Check COM_MOON_ENGINE_URL and the engine process first.",
    });
  }

  const latestAutomationFailure = (automationRuns || []).find((item) => item.status === "failure");
  if (latestAutomationFailure) {
    items.push({
      id: "automation-failure",
      title: latestAutomationFailure.output_payload?.title || "Automation failure captured",
      detail:
        latestAutomationFailure.error_message ||
        latestAutomationFailure.output_payload?.summary ||
        "An automation run failed and still needs triage.",
      tone: "danger",
      meta: formatTimestamp(latestAutomationFailure.finished_at || latestAutomationFailure.created_at),
    });
  }

  const latestSyncFailure = (syncRuns || []).find((item) => item.status === "failure");
  if (latestSyncFailure) {
    items.push({
      id: "sync-failure",
      title: humanizeValue(latestSyncFailure.payload?.kind || "sync failure"),
      detail: latestSyncFailure.error_message || "A synchronization run failed.",
      tone: "warning",
      meta: formatTimestamp(latestSyncFailure.finished_at || latestSyncFailure.started_at),
    });
  }

  if ((unresolvedErrors || []).length > 0) {
    items.push({
      id: "open-errors",
      title: `${unresolvedErrors.length} unresolved machine ${unresolvedErrors.length === 1 ? "error" : "errors"}`,
      detail:
        unresolvedErrors[0]?.payload?.error ||
        unresolvedErrors[0]?.trace ||
        "The error loop still has visible work to clear.",
      tone: "warning",
      meta: "Review Evolution logs before adding more automation surface area.",
    });
  }

  const erroredConnections = (connections || []).filter((item) => item.status === "error");
  if (erroredConnections.length > 0) {
    items.push({
      id: "integration-errors",
      title: `${erroredConnections.length} integration ${erroredConnections.length === 1 ? "connection" : "connections"} in error`,
      detail:
        erroredConnections[0]?.last_synced_at
          ? `Last failing sync ${formatTimestamp(erroredConnections[0].last_synced_at)}`
          : "At least one provider is configured but not healthy.",
      tone: "warning",
      meta: "Open Automations → Integrations for provider-level context.",
    });
  }

  return items.slice(0, 4);
}

function buildOperatingOsPulse({ pulse, agentCount = null }) {
  return [
    {
      label: "System",
      value: pulse.machine.statusLabel,
      detail: pulse.machine.summary,
      tone: pulse.machine.statusTone,
    },
    {
      label: "Automations",
      value: `${pulse.metrics.runningCount} live`,
      detail: `${pulse.metrics.totalToday} runs today · ${pulse.metrics.successRateLabel} success.`,
      tone: pulse.metrics.failureCount > 0 ? "warning" : pulse.metrics.runningCount > 0 ? "blue" : "green",
    },
    {
      label: "Intake",
      value: `${pulse.metrics.webhookEventsToday} events`,
      detail: `${pulse.metrics.liveRoutes} routes visible · ${pulse.metrics.connectedIntegrations} integrations connected.`,
      tone: pulse.metrics.liveRoutes > 0 ? "blue" : "muted",
    },
    {
      label: "Agents",
      value: agentCount == null ? "Live" : `${agentCount} tracked`,
      detail: `${pulse.metrics.activeMinutesLabel} active time today · ${pulse.metrics.attentionCount} attention signals.`,
      tone: agentCount ? "green" : "muted",
    },
  ];
}

export async function getOperatingPulseData() {
  const workspaceId = resolveDefaultWorkspaceId();
  const workspaceFilters = workspaceId ? [["workspace_id", `eq.${workspaceId}`]] : [];
  const hasEngineUrl = Boolean(resolveEngineUrl());
  const todayKey = formatCalendarDateKey(new Date());

  const [health, automationRuns, syncRuns, webhookEvents, unresolvedErrors, connections, endpoints] =
    await Promise.all([
      fetchEngineHealth(),
      fetchRows("automation_runs", {
        limit: 48,
        order: "created_at.desc",
        filters: workspaceFilters,
      }),
      fetchRows("sync_runs", {
        limit: 48,
        order: "started_at.desc",
        filters: workspaceFilters,
      }),
      fetchRows("webhook_events", {
        limit: 96,
        order: "received_at.desc",
        filters: workspaceFilters,
      }),
      fetchRows("error_logs", {
        limit: 24,
        order: "timestamp.desc",
        filters: [...workspaceFilters, ["resolved", boolFilter(false)]],
      }),
      fetchRows("integration_connections", {
        limit: 12,
        order: "created_at.desc",
        filters: workspaceFilters,
      }),
      fetchRows("webhook_endpoints", {
        limit: 16,
        order: "created_at.desc",
        filters: workspaceFilters,
      }),
    ]);

  const automationToday = (automationRuns || []).filter((item) => isCalendarDate(item.created_at, todayKey));
  const syncToday = (syncRuns || []).filter((item) => isCalendarDate(item.started_at || item.finished_at, todayKey));
  const webhookToday = (webhookEvents || []).filter((item) =>
    isCalendarDate(item.received_at || item.processed_at, todayKey),
  );

  const dayBuckets = Array.from({ length: OPERATING_PULSE_HOURS }, (_, hour) => ({
    hour,
    hourLabel: formatHourLabel(hour),
    count: 0,
    successCount: 0,
    failureCount: 0,
    runningCount: 0,
    webhookCount: 0,
    tone: "muted",
  }));

  const addBucketEvent = (value, status, countKey = "count") => {
    const hour = formatCalendarHour(value);
    if (hour == null || !dayBuckets[hour]) {
      return;
    }

    dayBuckets[hour][countKey] += 1;

    if (status === "failure" || status === "failed") {
      dayBuckets[hour].failureCount += 1;
    } else if (status === "running") {
      dayBuckets[hour].runningCount += 1;
    } else if (status === "success" || status === "processed") {
      dayBuckets[hour].successCount += 1;
    }
  };

  automationToday.forEach((item) => addBucketEvent(item.created_at || item.finished_at, item.status || "queued"));
  syncToday.forEach((item) => addBucketEvent(item.started_at || item.finished_at, item.status || "queued"));
  webhookToday.forEach((item) => addBucketEvent(item.received_at || item.processed_at, item.status || "processed", "webhookCount"));

  dayBuckets.forEach((bucket) => {
    bucket.count += bucket.webhookCount;
    if (bucket.failureCount > 0) {
      bucket.tone = "danger";
    } else if (bucket.runningCount > 0) {
      bucket.tone = "blue";
    } else if (bucket.count > 0) {
      bucket.tone = "green";
    }
  });

  const liveRuns = buildOperatingRunRows(automationRuns, syncRuns);
  const visibleRuns = (liveRuns.filter((item) => item.isLive).length
    ? liveRuns.filter((item) => item.isLive)
    : liveRuns
  ).slice(0, 6);

  const runningCount = liveRuns.filter((item) => item.status === "running").length;
  const queuedCount = liveRuns.filter((item) => item.status === "queued").length;
  const failureCount =
    automationToday.filter((item) => item.status === "failure").length +
    syncToday.filter((item) => item.status === "failure").length;
  const successCount =
    automationToday.filter((item) => item.status === "success").length +
    syncToday.filter((item) => item.status === "success").length;
  const totalToday = automationToday.length + syncToday.length;
  const activeMinutes =
    automationToday.reduce((sum, item) => {
      if (item.status === "queued") {
        return sum;
      }
      return sum + calculateDurationMinutes(item.created_at, item.finished_at || null);
    }, 0) +
    syncToday.reduce((sum, item) => {
      if (item.status === "queued") {
        return sum;
      }
      return sum + calculateDurationMinutes(item.started_at, item.finished_at || null);
    }, 0);
  const successRate =
    successCount + failureCount > 0 ? Math.round((successCount / (successCount + failureCount)) * 100) : null;
  const mappedRoutes =
    (endpoints || []).length || health?.routes?.length ? mapWebhookEndpoints(endpoints, health) : [];
  const liveRoutes = mappedRoutes.length;
  const connectedIntegrations = (connections || []).filter((item) => item.status === "connected").length;
  const connectionErrorCount = (connections || []).filter((item) => item.status === "error").length;
  const attentionCount = failureCount + (unresolvedErrors || []).length + connectionErrorCount + (hasEngineUrl && !health ? 1 : 0);
  const machine = buildOperatingPulseMachine({
    hasEngineUrl,
    health,
    runningCount,
    queuedCount,
    failureCount,
    attentionCount,
    totalToday,
    liveRoutes,
  });

  const pulse = {
    snapshotAt: health?.timestamp || new Date().toISOString(),
    machine,
    metrics: {
      runningCount,
      queuedCount,
      failureCount,
      successCount,
      totalToday,
      activeMinutes,
      activeMinutesLabel: formatMinutesLabel(activeMinutes),
      successRate,
      successRateLabel: successRate == null ? "No sample" : `${successRate}%`,
      liveRoutes,
      webhookEventsToday: webhookToday.length,
      connectedIntegrations,
      attentionCount,
    },
    routes: mappedRoutes,
    heatmap: dayBuckets.map((bucket) => ({
      ...bucket,
      totalLabel: `${bucket.count} events`,
    })),
    liveRuns: visibleRuns,
    sourceRows: buildOperatingSourceRows({
      automationToday,
      syncToday,
      webhookToday,
      unresolvedErrors,
      connections,
    }),
    attentionItems: buildOperatingAttentionItems({
      hasEngineUrl,
      health,
      automationRuns,
      syncRuns,
      unresolvedErrors,
      connections,
    }),
  };

  pulse.osPulse = buildOperatingOsPulse({ pulse });
  return pulse;
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

export async function getContentPageData(selectedBrand = "all") {
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
    campaigns,
    campaignRuns,
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
    fetchRows("campaigns", { limit: 6, order: "created_at.desc" }),
    fetchRows("campaign_runs", { limit: 8, order: "created_at.desc" }),
  ]);

  const mappedPipeline = scopeContentPipelineByBrand(mapContentPipeline(items), selectedBrand);
  const mappedVariants = scopeContentRowsByBrand(
    mapContentVariants(variants, publishLogs),
    selectedBrand,
  );
  const mappedPublishQueue = scopeContentRowsByBrand(
    mapPublishQueue(publishLogs, variants),
    selectedBrand,
  );
  const mappedAttention = scopeContentRowsByBrand(
    buildContentAttention(items, runs, logs),
    selectedBrand,
  );
  const mappedCampaigns = scopeContentRowsByBrand(
    mapContentCampaigns(campaigns, campaignRuns),
    selectedBrand,
  );
  const summary = buildContentSummary({ ideaCount, draftCount, publishCount, attentionCount });

  return {
    contentSummary: buildScopedContentSummary(
      summary,
      mappedPipeline,
      mappedAttention,
      selectedBrand,
    ),
    contentPipeline: mappedPipeline,
    contentVariants: mappedVariants,
    publishQueue: mappedPublishQueue,
    contentAttention: mappedAttention,
    contentCampaigns: mappedCampaigns,
  };
}

export async function getContentCampaignsPageData(selectedBrand = "all") {
  const [campaigns, campaignRuns, items, variants, publishLogs] = await Promise.all([
    fetchRows("campaigns", { limit: 8, order: "created_at.desc" }),
    fetchRows("campaign_runs", { limit: 12, order: "created_at.desc" }),
    fetchRows("content_items", { limit: 16, order: "created_at.desc" }),
    fetchRows("content_variants", { limit: 12, order: "created_at.desc" }),
    fetchRows("publish_logs", { limit: 12, order: "created_at.desc" }),
  ]);

  const mappedCampaigns = scopeContentRowsByBrand(
    buildCampaignCoverage(mapContentCampaigns(campaigns, campaignRuns), items, variants, publishLogs),
    selectedBrand,
  );
  const mappedRuns = scopeContentRowsByBrand(
    mapCampaignRuns(campaignRuns, mappedCampaigns),
    selectedBrand,
  );

  return {
    campaignSummary: buildCampaignSummary(mappedCampaigns, mappedRuns),
    campaignCards: mappedCampaigns,
    campaignRuns: mappedRuns,
  };
}

export async function getContentAssetsPageData(selectedBrand = "all") {
  const [assets, variants] = await Promise.all([
    fetchRows("content_assets", { limit: 10, order: "created_at.desc" }),
    fetchRows("content_variants", { limit: 10, order: "created_at.desc" }),
  ]);

  const mappedAssets = scopeContentRowsByBrand(mapContentAssets(assets, variants), selectedBrand);
  const mappedVariants = scopeContentRowsByBrand(mapContentVariants(variants, []), selectedBrand);

  return {
    contentAssets: mappedAssets,
    assetSummary: buildContentAssetsSummary(mappedAssets, mappedVariants),
  };
}

export async function getContentPublishPageData(selectedBrand = "all") {
  const [publishLogs, variants] = await Promise.all([
    fetchRows("publish_logs", { limit: 10, order: "created_at.desc" }),
    fetchRows("content_variants", { limit: 10, order: "created_at.desc" }),
  ]);

  const publishQueue = scopeContentRowsByBrand(mapPublishQueue(publishLogs, variants), selectedBrand);

  return {
    publishQueue,
    publishSummary: buildContentPublishSummary(publishQueue),
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
    automationTriage: fallbackAutomationTriage,
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

function buildGmailConnectHref(workspaceId = "") {
  const params = new URLSearchParams({
    returnPath: "/dashboard/automations/email",
  });

  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }

  return `/api/email/gmail/connect?${params.toString()}`;
}

function buildLiveEmailChannels(channels, gmailConnection, defaultWorkspaceId = "") {
  const hasResendConfig = Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM_ADDRESS?.trim(),
  );
  const hasGoogleOAuthConfig = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  const gmailAddress = gmailConnection?.config?.email || "";

  return channels.map((channel) => {
    if (channel.id === "resend") {
      return hasResendConfig
        ? {
            ...channel,
            status: "primary",
            tone: "green",
            detail: `Resend ready. Sending from ${process.env.EMAIL_FROM_ADDRESS?.trim()}.`,
            nextAction: "Run one dry-run from the email lane before live send.",
          }
        : {
            ...channel,
            status: "planned",
            tone: "warning",
            detail: "Resend env is missing. Add RESEND_API_KEY and EMAIL_FROM_ADDRESS.",
            nextAction: "Fill the engine env, then return for a dry-run.",
          };
    }

    if (channel.id === "gmail") {
      if (gmailConnection?.status === "connected") {
        return {
          ...channel,
          status: "ready",
          tone: "blue",
          detail: gmailAddress
            ? `Gmail OAuth connected for ${gmailAddress}. Personal-name sends can go live.`
            : "Gmail OAuth connected. Personal-name sends can go live.",
          nextAction: "Run one control-inbox dry-run before the first live warm send.",
          connectHref: buildGmailConnectHref(defaultWorkspaceId),
        };
      }

      return hasGoogleOAuthConfig
        ? {
            ...channel,
            status: "planned",
            tone: "warning",
            detail: "Google OAuth client is ready, but Gmail is not connected yet.",
            nextAction: "Connect Gmail and grant gmail.send scope.",
            connectHref: buildGmailConnectHref(defaultWorkspaceId),
          }
        : {
            ...channel,
            status: "planned",
            tone: "warning",
            detail: "Google OAuth env is missing. Fill GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.",
            nextAction: "Add Google OAuth env, then connect Gmail.",
          };
    }

    return channel;
  });
}

function mapEmailRunStatus(value, action = "send") {
  if (value === "failure") {
    return "failed";
  }

  if (action !== "send") {
    return "draft";
  }

  if (value === "success") {
    return "delivered";
  }

  return value || "draft";
}

function mapEmailRunsToSends(runs) {
  if (!runs?.length) {
    return [];
  }

  return runs
    .filter((item) => item.payload?.kind === "email_send")
    .map((item) => {
      const payload = item.payload || {};
      const subject = payload.subject || payload.templateName || "Email send";
      const action = payload.action || "send";
      const recipient = payload.recipient || "recipient";

      return {
        id: item.id || `${payload.provider || "email"}-${item.finished_at || item.started_at}`,
        title: action === "send" ? subject : `Dry-run — ${subject}`,
        channel: payload.provider || "resend",
        status: mapEmailRunStatus(item.status, action),
        time: formatTimestamp(item.finished_at || item.started_at),
        detail:
          item.error_message ||
          (action === "send"
            ? `To ${recipient}`
            : `Previewed for ${recipient} before live send.`),
      };
    })
    .slice(0, 8);
}

export async function getEmailAutomationPageData(selectedCampaignId = "") {
  const defaultWorkspaceId =
    process.env.COM_MOON_DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    "";
  const gmailFilters = [["provider", "eq.google_gmail"]];

  if (defaultWorkspaceId) {
    gmailFilters.push(["workspace_id", `eq.${defaultWorkspaceId}`]);
  }

  const [gmailConnections, syncRuns, campaigns, campaignRuns] = await Promise.all([
    fetchRows("integration_connections", {
      filters: gmailFilters,
      order: "created_at.desc",
      limit: 1,
    }),
    fetchRows("sync_runs", {
      order: "started_at.desc",
      limit: 24,
    }),
    fetchRows("campaigns", { limit: 8, order: "created_at.desc" }),
    fetchRows("campaign_runs", { limit: 12, order: "created_at.desc" }),
  ]);

  const gmailConnection = gmailConnections?.[0] || null;
  const channels = buildLiveEmailChannels(
    fallbackEmailChannels,
    gmailConnection,
    defaultWorkspaceId,
  );
  const templates = fallbackEmailTemplates;
  const queue = fallbackEmailQueue;
  const liveSends = mapEmailRunsToSends(syncRuns);
  const sends = liveSends.length
    ? [...liveSends, ...fallbackEmailSends].slice(0, Math.max(liveSends.length, 4))
    : fallbackEmailSends;
  const rules = fallbackEmailRules;
  const segments = fallbackEmailSegments;
  const variables = fallbackEmailVariables;
  const blocks = fallbackEmailBlocks;
  const emailCampaignHandoffs = buildEmailCampaignHandoffs(
    mapContentCampaigns(campaigns, campaignRuns),
    campaignRuns,
  );
  const selectedCampaignHandoff =
    emailCampaignHandoffs.find((item) => item.id === selectedCampaignId) || null;

  return {
    defaultWorkspaceId,
    gmailConnection,
    emailSummary: buildEmailSummary({ channels, templates, queue, sends }),
    emailChannels: channels,
    emailTemplates: templates,
    emailQueue: queue,
    emailSends: sends,
    emailRules: rules,
    emailSegments: segments,
    emailVariables: variables,
    emailBlocks: blocks,
    emailCampaignHandoffs,
    selectedCampaignHandoff,
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

export async function getContentQueuePageData(selectedBrand = "all") {
  const [base, items] = await Promise.all([
    getContentPageData(selectedBrand),
    fetchRows("content_items", { limit: 12, order: "created_at.desc" }),
  ]);

  return {
    ...base,
    contentQueueRoster: scopeContentRowsByBrand(
      mapContentQueueRoster(items),
      selectedBrand,
    ),
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
  const [
    agents,
    threads,
    messages,
    councilSessions,
    councilTurns,
    orders,
    operatingPulse,
  ] = await Promise.all([
    fetchRows("agents", { limit: 8, order: "created_at.asc" }),
    fetchRows("ai_threads", { limit: 8, order: "updated_at.desc" }),
    fetchRows("ai_messages", { limit: 40, order: "created_at.desc" }),
    fetchRows("ai_council_sessions", { limit: 8, order: "updated_at.desc" }),
    fetchRows("ai_council_turns", { limit: 40, order: "created_at.desc" }),
    fetchRows("ai_orders", { limit: 10, order: "updated_at.desc" }),
    getOperatingPulseData(),
  ]);

  const mappedThreads = mapAiThreads(threads, messages);
  const activeThreadId = mappedThreads[0]?.id || null;
  const mappedAgents = mapAiAgents(agents);

  return {
    agents: mappedAgents,
    chatThreads: mappedThreads,
    chatMessages: mapAiMessages(messages, activeThreadId),
    chatSuggestions: fallbackAiChatSuggestions,
    councilSessions: mapAiCouncilSessions(councilSessions, councilTurns),
    openOrders: mapAiOrders(orders),
    orderTemplates: fallbackAiOrderTemplates,
    osPulse: buildOperatingOsPulse({ pulse: operatingPulse, agentCount: mappedAgents.length }),
    operatingPulse,
  };
}

function matchesAiOfficeTarget(targetLabel, agentName) {
  const normalizedTarget = normalizeAiTarget(targetLabel);
  const normalizedAgent = normalizeAiTarget(agentName);

  if (normalizedAgent === "engine") {
    return normalizedTarget === "engine";
  }

  if (normalizedTarget === "both") {
    return normalizedAgent === "claude" || normalizedAgent === "codex";
  }

  return normalizedTarget === normalizedAgent;
}

function buildAiOfficeCommandStrip({ agents, openOrders, operatingPulse, activityTicker }) {
  const activeAgentCount = agents.filter((agent) =>
    ["ready", "live", "working"].includes(agent.status),
  ).length;
  const runningOrders = openOrders.filter((item) => item.status === "실행 중").length;
  const reviewOrders = openOrders.filter((item) => item.status === "리뷰 대기").length;
  const attentionCount = activityTicker.filter((item) => item.tone === "danger" || item.tone === "warning").length;

  return [
    {
      title: "활성 에이전트",
      value: `${activeAgentCount} / ${agents.length}`,
      detail: activeAgentCount
        ? "현재 응답 가능한 레인 수입니다. 포커스와 부하를 함께 보세요."
        : "가용한 에이전트 레인이 아직 보이지 않습니다.",
      badge: "Agents",
      tone: activeAgentCount ? "green" : "muted",
    },
    {
      title: "실행 중 오더",
      value: String(runningOrders),
      detail: runningOrders
        ? "지금 실제로 움직이는 작업 단위입니다."
        : "오더는 있으나 현재 붙어 있는 실행 레인은 없습니다.",
      badge: "Orders",
      tone: runningOrders ? "blue" : "muted",
    },
    {
      title: "리뷰 대기",
      value: String(reviewOrders),
      detail: reviewOrders
        ? "결과는 나왔고 사람 확인이 필요한 오더입니다."
        : "리뷰 대기 오더는 현재 없습니다.",
      badge: "Review",
      tone: reviewOrders ? "warning" : "green",
    },
    {
      title: "Machine pulse",
      value: operatingPulse.machine.statusLabel,
      detail: attentionCount
        ? `${attentionCount}개 activity signal 이 attention 레인에 걸려 있습니다.`
        : operatingPulse.machine.summary,
      badge: "Engine",
      tone: operatingPulse.machine.statusTone,
    },
  ];
}

function buildAiOfficeOrderRail(openOrders) {
  return [
    {
      id: "queued",
      label: "큐 대기",
      description: "아직 배정되지 않았거나 선행 흐름을 기다리는 오더",
      tone: "muted",
      items: openOrders.filter((item) => item.status === "큐 대기"),
    },
    {
      id: "running",
      label: "실행 중",
      description: "에이전트가 지금 붙어 있는 라이브 오더",
      tone: "blue",
      items: openOrders.filter((item) => item.status === "실행 중"),
    },
    {
      id: "review",
      label: "리뷰 대기",
      description: "결과가 나왔고 사람 승인이나 확인을 기다리는 오더",
      tone: "warning",
      items: openOrders.filter((item) => item.status === "리뷰 대기"),
    },
    {
      id: "done",
      label: "오늘 완료",
      description: "최근 완료된 오더와 닫힌 흐름",
      tone: "green",
      items: openOrders.filter((item) => item.status === "완료"),
    },
  ];
}

function buildAiOfficeActivityTicker({
  messages,
  councilTurns,
  orders,
  automationRuns,
  projectUpdates,
  errorLogs,
}) {
  const items = [];

  (messages || []).slice(0, 5).forEach((item) => {
    items.push({
      id: `message-${item.id}`,
      title: `${getAiAuthorLabel(item.author)}가 새 메시지를 남김`,
      detail: compactText(item.body || "메시지가 기록되었습니다.", 96),
      time: formatTimestamp(item.created_at),
      tone:
        item.author === "operator"
          ? "warning"
          : item.author === "codex"
            ? "green"
            : item.author === "engine"
              ? "muted"
              : "blue",
      href: "/dashboard/ai/chat",
      sortAt: item.created_at,
    });
  });

  (councilTurns || []).slice(0, 4).forEach((item) => {
    items.push({
      id: `council-${item.id}`,
      title: `${item.author || "Agent"}가 카운슬에 ${item.stance || "검토"} 턴을 남김`,
      detail: compactText(item.body || "카운슬 턴이 기록되었습니다.", 96),
      time: formatTimestamp(item.created_at),
      tone: item.stance === "결정" ? "green" : item.stance === "보류" ? "warning" : "blue",
      href: "/dashboard/ai/council",
      sortAt: item.created_at,
    });
  });

  (orders || []).slice(0, 4).forEach((item) => {
    items.push({
      id: `order-${item.id}`,
      title: `${item.title || "Order"} · ${getAiOrderStatusLabel(item.status)}`,
      detail: item.note || "오더 상태가 갱신되었습니다.",
      time: formatTimestamp(item.updated_at || item.created_at),
      tone: toTone(item.status),
      href: "/dashboard/ai/orders",
      sortAt: item.updated_at || item.created_at,
    });
  });

  (automationRuns || []).slice(0, 4).forEach((item) => {
    items.push({
      id: `automation-${item.id}`,
      title:
        item.status === "failure"
          ? "Engine run failure"
          : item.status === "running"
            ? "Engine run in motion"
            : "Automation run updated",
      detail:
        item.error_message ||
        item.output_payload?.summary ||
        item.input_payload?.text ||
        "자동화 레인에서 새 실행이 기록되었습니다.",
      time: formatTimestamp(item.finished_at || item.created_at),
      tone: toTone(item.status),
      href: "/dashboard/automations/runs",
      sortAt: item.finished_at || item.created_at,
    });
  });

  (projectUpdates || []).slice(0, 3).forEach((item) => {
    items.push({
      id: `update-${item.id}`,
      title: item.title || "프로젝트 업데이트",
      detail: item.next_action || item.summary || "업데이트가 기록되었습니다.",
      time: formatTimestamp(item.happened_at || item.created_at),
      tone: toTone(item.status),
      href: "/dashboard/work/management",
      sortAt: item.happened_at || item.created_at,
    });
  });

  (errorLogs || []).slice(0, 3).forEach((item) => {
    items.push({
      id: `log-${item.id}`,
      title: item.context || "운영 로그",
      detail: item.payload?.error || item.trace || "로그 이벤트가 기록되었습니다.",
      time: formatTimestamp(item.timestamp || item.created_at),
      tone: item.level === "error" ? "danger" : "warning",
      href: "/dashboard/evolution/logs",
      sortAt: item.timestamp || item.created_at,
    });
  });

  return items
    .sort((left, right) => new Date(right.sortAt || 0).getTime() - new Date(left.sortAt || 0).getTime())
    .slice(0, 12)
    .map(({ sortAt, ...item }) => item);
}

function buildAiOfficeMemoryLane({ memos, errorLogs, decisions }) {
  const items = [];

  (memos || []).slice(0, 3).forEach((item) => {
    items.push({
      id: `memo-${item.id}`,
      title: item.title || item.topic || "운영 메모",
      detail: compactText(item.body || item.summary || item.note || "메모가 저장되었습니다.", 120),
      meta: formatTimestamp(item.created_at),
      tone: "blue",
      href: "/dashboard/evolution",
      sortAt: item.created_at,
    });
  });

  (decisions || []).slice(0, 2).forEach((item) => {
    items.push({
      id: `decision-${item.id}`,
      title: item.title || "최근 결정",
      detail: compactText(item.summary || item.rationale || "결정이 기록되었습니다.", 120),
      meta: formatTimestamp(item.decided_at || item.created_at),
      tone: "green",
      href: "/dashboard/work/decisions",
      sortAt: item.decided_at || item.created_at,
    });
  });

  (errorLogs || []).slice(0, 2).forEach((item) => {
    items.push({
      id: `open-log-${item.id}`,
      title: item.context || "미해결 로그",
      detail: compactText(item.payload?.error || item.trace || "해결이 필요한 로그가 있습니다.", 120),
      meta: item.resolved ? "resolved" : "open",
      tone: item.level === "error" ? "danger" : "warning",
      href: "/dashboard/evolution/logs",
      sortAt: item.timestamp || item.created_at,
    });
  });

  return items
    .sort((left, right) => new Date(right.sortAt || 0).getTime() - new Date(left.sortAt || 0).getTime())
    .slice(0, 6)
    .map(({ sortAt, ...item }) => item);
}

function buildAiOfficeAgents({
  agents,
  openOrders,
  chatThreads,
  councilSessions,
  activityTicker,
  operatingPulse,
}) {
  return agents.map((agent) => {
    const relatedOrders = openOrders.filter((item) => matchesAiOfficeTarget(item.target, agent.name));
    const relatedThreads = chatThreads.filter((item) => matchesAiOfficeTarget(item.target, agent.name));
    const relatedSessions = councilSessions.filter((item) => item.members.includes(agent.name));
    const recentActivity = activityTicker.find((item) => {
      if (agent.name === "Engine") {
        return item.href === "/dashboard/automations/runs";
      }

      return item.title.includes(agent.name);
    });
    const liveRun =
      agent.name === "Engine"
        ? operatingPulse.liveRuns.find((item) => item.lane === "Automation" || item.source === "Engine")
        : null;

    return {
      ...agent,
      activeOrder: relatedOrders[0] || null,
      assignedCount: relatedOrders.length,
      threadCount: relatedThreads.length,
      councilCount: relatedSessions.length,
      recentAction: recentActivity?.time || liveRun?.time || relatedThreads[0]?.updated || "대기 중",
    };
  });
}

export async function getAiOfficePageData() {
  const [
    aiData,
    messages,
    councilTurns,
    orders,
    automationRuns,
    projectUpdates,
    memos,
    errorLogs,
    decisions,
  ] = await Promise.all([
    getAiConsolePageData(),
    fetchRows("ai_messages", { limit: 12, order: "created_at.desc" }),
    fetchRows("ai_council_turns", { limit: 12, order: "created_at.desc" }),
    fetchRows("ai_orders", { limit: 12, order: "updated_at.desc" }),
    fetchRows("automation_runs", { limit: 8, order: "created_at.desc" }),
    fetchRows("project_updates", { limit: 6, order: "happened_at.desc" }),
    fetchRows("memos", { limit: 4, order: "created_at.desc" }),
    fetchRows("error_logs", {
      limit: 4,
      order: "timestamp.desc",
      filters: [["resolved", "eq.false"]],
    }),
    fetchRows("decisions", { limit: 4, order: "decided_at.desc" }),
  ]);

  const activityTicker = buildAiOfficeActivityTicker({
    messages,
    councilTurns,
    orders,
    automationRuns,
    projectUpdates,
    errorLogs,
  });
  const orderRail = buildAiOfficeOrderRail(aiData.openOrders);
  const agents = buildAiOfficeAgents({
    agents: aiData.agents,
    openOrders: aiData.openOrders,
    chatThreads: aiData.chatThreads,
    councilSessions: aiData.councilSessions,
    activityTicker,
    operatingPulse: aiData.operatingPulse,
  });

  return {
    commandStrip: buildAiOfficeCommandStrip({
      agents,
      openOrders: aiData.openOrders,
      operatingPulse: aiData.operatingPulse,
      activityTicker,
    }),
    agents,
    orderRail,
    activityTicker,
    memoryLane: buildAiOfficeMemoryLane({ memos, errorLogs, decisions }),
    chatThreads: aiData.chatThreads,
    councilSessions: aiData.councilSessions,
    operatingPulse: aiData.operatingPulse,
  };
}
