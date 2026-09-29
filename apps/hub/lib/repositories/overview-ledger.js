import { resolveAutomationPolicy } from "../automation-policy.js";
import {
  fetchSupabaseRows,
  fetchSupabaseRowsDetailed,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { DEAL_STAGES, LEGACY_DB_STAGE_VALUES, STAGE_ALIASES } from "../deal-stages.js";
import {
  resolveRhythmTimeZone,
  routineLocalDateKey,
  routineSemanticKey,
  shiftDateKey,
  toZonedDateKey,
} from "../rhythm-calendar.js";

// Overview is a projection, not five full ledgers. Keep every read bounded and
// fetch only fields rendered by /dashboard/overview. The previous route called
// five general-purpose repositories (about 37 PostgREST requests, including
// notes, milestones, CRM enrichment, assets and webhooks the page never used).
const LIMITS = {
  brands: 80,
  projects: 80,
  tasks: 160,
  project_updates: 120,
  decisions: 80,
  content_items: 80,
  publish_logs: 80,
  leads: 120,
  deals: 120,
  automations: 40,
  automation_runs: 120,
  integration_connections: 40,
  routine_checks: 240,
};

const PROJECT_STATUSES = ["draft", "active", "blocked", "completed", "archived"];
const TASK_STATUSES = ["inbox", "todo", "doing", "blocked", "done"];
const CONTENT_STATUSES = ["idea", "draft", "review", "scheduled", "published", "archived"];
const AUTOMATION_STATUSES = ["draft", "active", "paused", "disabled"];
const BRAND_GLYPHS = ["◐", "◇", "✦", "◆", "●", "□", "△", "◎", "◌", "✧"];
const ROUTINE_CHECK_TYPES = new Set(["morning", "midday", "evening", "weekly"]);
const RITUAL_FALLBACK_NAMES = {
  morning: "Morning check · 07:00",
  midday: "Midday focus · 14:00",
  evening: "Evening shutdown · 22:00",
  weekly: "Weekly Review",
};

function previewOverview(workspaceId) {
  const configured = false;
  return {
    projects: {
      source: "preview",
      configured,
      workspaceId,
      projects: [],
      todos: [],
      updates: [],
      decisions: [],
      brands: [],
      taskAggregation: null,
      partial: false,
      failedSources: [],
      partialSources: [],
    },
    content: {
      source: "preview",
      configured,
      workspaceId,
      items: [],
      publishLogs: [],
      partial: false,
      failedSources: [],
      partialSources: [],
    },
    revenue: {
      source: "preview",
      configured,
      workspaceId,
      deals: [],
      stages: DEAL_STAGES,
      summary: {},
      partial: false,
      failedSources: [],
      partialSources: [],
    },
    automations: {
      source: "preview",
      configured,
      workspaceId,
      runs: [],
      summary: {},
      partial: false,
      failedSources: [],
      partialSources: [],
    },
    work: {
      source: "preview",
      configured,
      workspaceId,
      rituals: [],
      summary: {},
      rhythm: {
        source: "preview",
        state: "preview",
        partial: false,
        truncatedSources: [],
        error: null,
      },
      partial: false,
      failedSources: [],
      partialSources: [],
    },
  };
}

function visibleRows(rows, source) {
  const limit = LIMITS[source];
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

function truncated(rows, source) {
  return Array.isArray(rows) && rows.length > LIMITS[source];
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeProjectStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "draft") return "Planning";
  if (normalized === "blocked") return "Blocked";
  if (normalized === "completed") return "Done";
  if (normalized === "archived") return "Backlog";
  return "In progress";
}

function kstDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function resolveDueBucket(value) {
  if (!value) return "다음주";
  const targetKey = kstDayKey(value);
  const todayKey = kstDayKey(new Date());
  if (!targetKey || !todayKey) return "다음주";
  const diffDays = Math.round((Date.parse(targetKey) - Date.parse(todayKey)) / 86400000);
  if (diffDays <= 0) return "오늘";
  if (diffDays === 1) return "내일";
  if (diffDays <= 7) return "이번주";
  return "다음주";
}

function mapProjectDomain({ workspaceId, brandRows, projectRows, taskRead, updateRows, decisionRows }) {
  const taskRows = taskRead.rows;
  const coreFailures = [
    ["brands", brandRows],
    ["projects", projectRows],
    ["tasks", taskRows],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([source]) => source);

  if (coreFailures.length > 0) {
    return {
      source: "error",
      configured: true,
      workspaceId,
      error: "project-ledger-core-read-failed",
      retryable: true,
      projects: [],
      todos: [],
      updates: [],
      decisions: [],
      brands: [],
      taskAggregation: null,
      partial: false,
      failedSources: coreFailures,
      partialSources: [],
    };
  }

  const failedSources = [
    ["project_updates", updateRows],
    ["decisions", decisionRows],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([source]) => source);
  const taskCount = taskRead.count;
  const taskStatsPartial = !Number.isFinite(taskCount) || taskCount !== taskRows.length;
  const partialSources = unique([
    ...(taskStatsPartial ? ["tasks"] : []),
    ...(truncated(brandRows, "brands") ? ["brands"] : []),
    ...(truncated(projectRows, "projects") ? ["projects"] : []),
    ...(truncated(updateRows, "project_updates") ? ["project_updates"] : []),
    ...(truncated(decisionRows, "decisions") ? ["decisions"] : []),
  ]);

  const brands = visibleRows(brandRows, "brands").map((row, index) => ({
    id: row.id,
    key: row.slug || row.id,
    name: row.name,
    glyph: row.meta?.glyph || BRAND_GLYPHS[index % BRAND_GLYPHS.length],
    tone: row.meta?.tone || "neutral",
  }));
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const projects = visibleRows(projectRows, "projects").map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand_id ? brandById.get(row.brand_id)?.key || "all" : "all",
    status: normalizeProjectStatus(row.status),
  }));
  const todos = taskRows.map((row) => ({
    id: row.id,
    status: row.status || "inbox",
    done: row.status === "done",
    bucket: resolveDueBucket(row.due_at),
  }));
  const updates = visibleRows(updateRows, "project_updates").map((row) => ({
    id: row.id,
    projectId: row.project_id || "",
    title: row.title || "Project update",
    summary: row.summary || "",
    nextAction: row.next_action || "",
    happenedAt: row.happened_at || row.created_at,
  }));
  const decisions = visibleRows(decisionRows, "decisions").map((row) => ({
    id: row.id,
    projectId: row.project_id || "",
    title: row.title || "Decision",
    summary: row.summary || row.rationale || "",
    decidedAt: row.decided_at || row.created_at,
  }));

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    projects,
    todos,
    updates,
    decisions,
    brands,
    taskAggregation: {
      loaded: taskRows.length,
      total: Number.isFinite(taskCount) ? taskCount : null,
      partial: taskStatsPartial,
    },
    partial: failedSources.length > 0 || partialSources.length > 0,
    failedSources,
    partialSources,
  };
}

function mapContentDomain({ workspaceId, itemRead, logRows }) {
  const itemRows = itemRead.rows;
  const failures = [
    ["content_items", itemRows],
    ["publish_logs", logRows],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([source]) => source);
  const allFailed = failures.length === 2;
  const itemCount = itemRead.count;
  const partialSources = unique([
    ...(Array.isArray(itemRows) && (!Number.isFinite(itemCount) || itemCount !== itemRows.length)
      ? ["content_items"]
      : []),
    ...(truncated(logRows, "publish_logs") ? ["publish_logs"] : []),
  ]);
  const items = Array.isArray(itemRows)
    ? itemRows.map((row) => ({ id: row.id, status: row.status, statusKey: row.status }))
    : [];
  const publishLogs = visibleRows(logRows, "publish_logs").map((row) => ({
    id: row.id,
    variantId: row.variant_id,
    channel: row.channel || "Web",
    status: row.status || "queued",
    provider: row.provider || null,
    title: typeof row.payload?.title === "string" ? row.payload.title : "",
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
  }));

  return {
    source: allFailed ? "error" : "supabase",
    ...(allFailed ? { error: "content-overview-read-failed", retryable: true } : {}),
    configured: true,
    workspaceId,
    items,
    publishLogs,
    partial: !allFailed && (failures.length > 0 || partialSources.length > 0),
    failedSources: failures,
    partialSources,
  };
}

function normalizeDealStage(row) {
  const detail = String(row?.meta?.stage_detail || "").toLowerCase();
  if (detail === "lost" || DEAL_STAGES.some((stage) => stage.key === detail)) return detail;
  const raw = String(row?.stage || "").toLowerCase();
  return STAGE_ALIASES[raw] || (DEAL_STAGES.some((stage) => stage.key === raw) ? raw : "potential");
}

function mapRevenueDomain({ workspaceId, leadRows, dealRows }) {
  const failedSources = [
    ["leads", leadRows],
    ["deals", dealRows],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([source]) => source);
  if (failedSources.length > 0) {
    return {
      source: "error",
      configured: true,
      workspaceId,
      error: "revenue-overview-read-failed",
      retryable: true,
      deals: [],
      stages: DEAL_STAGES,
      summary: {},
      partial: false,
      failedSources,
      partialSources: [],
    };
  }

  const deals = visibleRows(dealRows, "deals").map((row) => ({
    id: row.id,
    stage: normalizeDealStage(row),
    value: Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0,
  }));
  const leads = visibleRows(leadRows, "leads");
  const wonMTD = deals
    .filter((deal) => deal.stage === "closing")
    .reduce((sum, deal) => sum + deal.value, 0);
  const pipelineDeals = deals.filter((deal) => deal.stage !== "closing" && deal.stage !== "lost");
  const partialSources = [
    ...(truncated(leadRows, "leads") ? ["leads"] : []),
    ...(truncated(dealRows, "deals") ? ["deals"] : []),
  ];

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    deals,
    stages: DEAL_STAGES,
    summary: {
      mrr: Math.round(wonMTD * 0.12),
      mrrPrev: Math.max(0, Math.round(Math.round(wonMTD * 0.12) * 0.9)),
      pipeline: pipelineDeals.reduce((sum, deal) => sum + deal.value, 0),
      leadsCount: leads.length,
      newThisMonth: leads.filter((lead) => lead.status === "new").length,
      openDeals: pipelineDeals.length,
      wonMTD,
    },
    partial: partialSources.length > 0,
    failedSources: [],
    partialSources,
  };
}

function compactPayloadValue(value) {
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, entry]) => entry != null && entry !== "")
      .slice(0, 4)
      .map(([key, entry]) => `${key}: ${typeof entry === "object" ? Object.keys(entry || {}).length : String(entry)}`)
      .join(" · ");
  }
  return String(value);
}

function mapAutomationDomain({ workspaceId, automationRows, runRows, webhookRead, integrationRows, now }) {
  const coreFailures = [
    ["automations", automationRows],
    ["automation_runs", runRows],
  ].filter(([, rows]) => !Array.isArray(rows)).map(([source]) => source);
  if (coreFailures.length === 2) {
    return {
      source: "error",
      configured: true,
      workspaceId,
      error: "automations-overview-read-failed",
      retryable: true,
      runs: [],
      summary: {},
      partial: false,
      failedSources: coreFailures,
      partialSources: [],
    };
  }

  const webhookRows = webhookRead.rows;
  const optionalFailures = [
    ...(Array.isArray(webhookRows) ? [] : ["webhook_events"]),
    ...(Array.isArray(integrationRows) ? [] : ["integration_connections"]),
  ];
  const failures = [...coreFailures, ...optionalFailures];
  const sourceRows = { automations: automationRows, automation_runs: runRows, integration_connections: integrationRows };
  const partialSources = ["automations", "automation_runs", "integration_connections"]
    .filter((source) => truncated(sourceRows[source], source));
  if (Array.isArray(webhookRows) && !Number.isFinite(webhookRead.count)) {
    partialSources.push("webhook_events");
  }
  const automations = visibleRows(automationRows, "automations");
  const automationById = new Map(automations.map((row) => [row.id, row]));
  const automationByKey = new Map(automations.filter(row => row.meta?.key).map(row => [row.meta.key, row]));
  const runs = visibleRows(runRows, "automation_runs").map((row) => ({
    id: row.id,
    flow: resolveAutomationPolicy(automationById.get(row.automation_id) || automationByKey.get(row.output_payload?.key), null, row.output_payload?.key).name,
    statusKey: row.status || "queued",
    detail: compactPayloadValue(row.error_message || row.output_payload?.summary || row.output_payload?.detail || row.output_payload?.message || "ok"),
    startedAt: row.created_at,
  }));
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const recentRuns = visibleRows(runRows, "automation_runs").filter((row) => {
    const at = new Date(row.created_at).getTime();
    return Number.isFinite(at) && at >= since;
  });

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    runs,
    summary: {
      runsToday: Array.isArray(runRows) ? recentRuns.length : null,
      failuresToday: Array.isArray(runRows)
        ? recentRuns.filter((row) => row.status === "failure").length
        : null,
      activeAutomations: Array.isArray(automationRows)
        ? automations.filter((row) => resolveAutomationPolicy(row).statusKey === "active").length
        : null,
      webhookEventsToday: Number.isFinite(webhookRead.count) ? webhookRead.count : null,
      integrationsConnected: Array.isArray(integrationRows)
        ? visibleRows(integrationRows, "integration_connections").filter((row) => row.status === "connected").length
        : null,
    },
    partial: failures.length > 0 || partialSources.length > 0,
    failedSources: failures,
    partialSources,
  };
}

function ritualCompositeId(projectId, ritualKey) {
  return `ritual:${projectId ? encodeURIComponent(projectId) : "unscoped"}:${encodeURIComponent(ritualKey)}`;
}

function mapRituals(rows, projectRows, { timeZone, now }) {
  const projectNameById = new Map((projectRows || []).map((row) => [row.id, row.name || null]));
  const groups = new Map();

  rows.forEach((row) => {
    const key = routineSemanticKey(row);
    const projectId = row.project_id || null;
    const composite = JSON.stringify([projectId, key]);
    if (!groups.has(composite)) {
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const checkType = ROUTINE_CHECK_TYPES.has(row.check_type) ? row.check_type : "midday";
      groups.set(composite, {
        id: ritualCompositeId(projectId, key),
        projectId,
        projectName: projectId ? projectNameById.get(projectId) || null : null,
        projectHref: projectId ? `/dashboard/work/projects?project=${encodeURIComponent(projectId)}` : null,
        ritualKey: key,
        checkType,
        name: String(meta.name || meta.label || RITUAL_FALLBACK_NAMES[checkType] || "Ritual"),
        doneDateKeys: new Set(),
        lastCheckedAt: null,
      });
    }
    const group = groups.get(composite);
    if (row.status !== "done") return;
    const dateKey = routineLocalDateKey(row, timeZone);
    if (dateKey) group.doneDateKeys.add(dateKey);
    const timestamp = row.checked_at ? new Date(row.checked_at).getTime() : Number.NaN;
    if (Number.isFinite(timestamp) && (!group.lastCheckedAt || timestamp > group.lastCheckedAt)) {
      group.lastCheckedAt = timestamp;
    }
  });

  const todayKey = toZonedDateKey(now, timeZone);
  return Array.from(groups.values()).map((group) => {
    let streak = 0;
    let cursor = todayKey;
    while (group.doneDateKeys.has(cursor)) {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return {
      id: group.id,
      projectId: group.projectId,
      projectName: group.projectName,
      projectHref: group.projectHref,
      ritualKey: group.ritualKey,
      checkType: group.checkType,
      name: group.name,
      streak,
      weeks: Array.from({ length: 7 }, (_, index) =>
        group.doneDateKeys.has(shiftDateKey(todayKey, index - 6)) ? 1 : 0),
      lastCheckedAt: group.lastCheckedAt ? new Date(group.lastCheckedAt).toISOString() : null,
    };
  });
}

function summarizeRituals(rituals) {
  let longestStreak = 0;
  let longestStreakRitual = "";
  rituals.forEach((ritual) => {
    if (ritual.streak > longestStreak) {
      longestStreak = ritual.streak;
      longestStreakRitual = ritual.name;
    }
  });
  return {
    ritualsCompletedThisWeek: rituals.filter((ritual) => ritual.weeks.some((value) => value === 1)).length,
    ritualsTotalThisWeek: rituals.length,
    longestStreak,
    longestStreakRitual,
  };
}

function mapWorkDomain({ workspaceId, routineRows, workspaceRows, projectRows, now }) {
  const workspaceAvailable = Array.isArray(workspaceRows) && workspaceRows.length === 1;
  const rhythmAvailable = Array.isArray(routineRows) && workspaceAvailable;
  const timeZone = resolveRhythmTimeZone(workspaceAvailable ? workspaceRows[0].timezone : null);
  const routinePartial = truncated(routineRows, "routine_checks");
  const rituals = rhythmAvailable
    ? mapRituals(visibleRows(routineRows, "routine_checks"), Array.isArray(projectRows) ? projectRows : [], { timeZone, now })
    : [];
  const failedSources = rhythmAvailable
    ? []
    : [Array.isArray(routineRows) ? "workspaces" : "routine_checks"];
  const partialSources = routinePartial ? ["routine_checks"] : [];

  return {
    source: rhythmAvailable ? "supabase" : "error",
    ...(rhythmAvailable ? {} : { error: "work-overview-read-failed", retryable: true }),
    configured: true,
    workspaceId,
    timeZone,
    rituals,
    summary: summarizeRituals(rituals),
    rhythm: rhythmAvailable
      ? {
          source: "supabase",
          state: routinePartial ? "partial" : rituals.length > 0 ? "live" : "live-empty",
          partial: routinePartial,
          truncatedSources: partialSources,
          error: null,
        }
      : {
          source: "supabase",
          state: "error",
          partial: false,
          truncatedSources: [],
          error: {
            message: Array.isArray(routineRows)
              ? "workspace timezone 기록을 읽지 못했습니다."
              : "routine_checks 기록을 읽지 못했습니다.",
            retryable: true,
          },
        },
    partial: rhythmAvailable && partialSources.length > 0,
    failedSources,
    partialSources,
  };
}

export async function getOverviewLedger({ now = new Date() } = {}) {
  const workspaceId = resolveDefaultWorkspaceId();
  const supabaseConfig = resolveSupabaseConfig();
  if (!workspaceId || !supabaseConfig) return previewOverview(workspaceId || null);

  const [
    brandRows,
    projectRows,
    taskRead,
    updateRows,
    decisionRows,
    itemRead,
    logRows,
    leadRows,
    dealRows,
    automationRows,
    runRows,
    webhookRead,
    integrationRows,
    routineRows,
    workspaceRows,
  ] = await Promise.all([
    fetchSupabaseRows("brands", {
      select: "id,slug,name,kind,description,meta",
      limit: LIMITS.brands + 1,
      order: "name.asc",
      filters: withWorkspaceFilter([["status", "eq.active"]]),
    }),
    fetchSupabaseRows("projects", {
      select: "id,brand_id,name,status",
      limit: LIMITS.projects + 1,
      order: "updated_at.desc",
      filters: withWorkspaceFilter([["status", inFilter(PROJECT_STATUSES)]]),
    }),
    fetchSupabaseRowsDetailed("tasks", {
      select: "id,status,due_at",
      limit: LIMITS.tasks,
      order: "updated_at.desc",
      count: "exact",
      filters: withWorkspaceFilter([["status", inFilter(TASK_STATUSES)]]),
    }),
    fetchSupabaseRows("project_updates", {
      select: "id,project_id,title,summary,next_action,happened_at,created_at",
      limit: LIMITS.project_updates + 1,
      order: "happened_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("decisions", {
      select: "id,project_id,title,summary,rationale,decided_at,created_at",
      limit: LIMITS.decisions + 1,
      order: "decided_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRowsDetailed("content_items", {
      select: "id,status",
      limit: LIMITS.content_items,
      count: "exact",
      filters: withWorkspaceFilter([["status", inFilter(CONTENT_STATUSES)]]),
    }),
    fetchSupabaseRows("publish_logs", {
      select: "id,variant_id,channel,status,provider,payload,published_at,created_at",
      limit: LIMITS.publish_logs + 1,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("leads", {
      select: "id,status",
      limit: LIMITS.leads + 1,
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("deals", {
      select: "id,amount,stage,meta",
      limit: LIMITS.deals + 1,
      filters: withWorkspaceFilter([["stage", inFilter(LEGACY_DB_STAGE_VALUES)]]),
    }),
    fetchSupabaseRows("automations", {
      select: "id,name,status,meta",
      limit: LIMITS.automations + 1,
      filters: withWorkspaceFilter([["status", inFilter(AUTOMATION_STATUSES)]]),
    }),
    fetchSupabaseRows("automation_runs", {
      select: "id,automation_id,status,output_payload,error_message,created_at,finished_at",
      limit: LIMITS.automation_runs + 1,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRowsDetailed("webhook_events", {
      select: "id",
      limit: 1,
      count: "exact",
      filters: withWorkspaceFilter([[
        "received_at",
        `gte.${new Date(`${kstDayKey(now)}T00:00:00+09:00`).toISOString()}`,
      ]]),
    }),
    fetchSupabaseRows("integration_connections", {
      select: "id,status",
      limit: LIMITS.integration_connections + 1,
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("routine_checks", {
      select: "id,project_id,check_type,status,meta,checked_at,created_at",
      limit: LIMITS.routine_checks + 1,
      order: "checked_at.desc.nullslast,created_at.desc.nullslast,id.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("workspaces", {
      select: "id,timezone",
      limit: 1,
      filters: [["id", `eq.${workspaceId}`]],
    }),
  ]);

  return {
    projects: mapProjectDomain({ workspaceId, brandRows, projectRows, taskRead, updateRows, decisionRows }),
    content: mapContentDomain({ workspaceId, itemRead, logRows }),
    revenue: mapRevenueDomain({ workspaceId, leadRows, dealRows }),
    automations: mapAutomationDomain({ workspaceId, automationRows, runRows, webhookRead, integrationRows, now }),
    work: mapWorkDomain({ workspaceId, routineRows, workspaceRows, projectRows, now }),
  };
}
