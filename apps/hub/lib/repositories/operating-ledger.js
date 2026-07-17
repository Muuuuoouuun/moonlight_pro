import {
  countSupabaseRows,
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { buildProjectProgress } from "../pms-ui.js";

const BRAND_GLYPHS = ["◐", "◇", "✦", "◆", "●", "□", "△", "◎", "◌", "✧"];

// PMS container category (2026-07-15 spec §4.1): 'sns-channel' | 'ka-deal' |
// 'general'. meta.category overrides; unknown values read as "general" — the
// code never guesses. The canonical list is the operator-confirmed 2026-07-15
// assignment (every existing container is an SNS channel).
const BRAND_CATEGORIES = new Set(["sns-channel", "ka-deal", "general"]);
const CANONICAL_BRAND_CATEGORY = {
  sinabro: "sns-channel",
  gore: "sns-channel",
  holyfuncollector: "sns-channel",
  bridgemaker: "sns-channel",
  moonpm: "sns-channel",
  classmoon: "sns-channel",
  studyseagull: "sns-channel",
  politicofficer: "sns-channel",
  "22nomad": "sns-channel",
};

function resolveBrandCategory(key, meta) {
  const raw = typeof meta?.category === "string" ? meta.category.trim() : "";
  if (BRAND_CATEGORIES.has(raw)) return raw;
  return CANONICAL_BRAND_CATEGORY[key] || "general";
}

// Which brands are ClassIn (company) work vs. personal brands. Defaults to
// "personal" when a brand isn't listed here and has no meta.org_scope.
const CANONICAL_BRAND_ORG_SCOPE = {
  classmoon: "classin",
  studyseagull: "classin",
  classin_side: "classin",
};

function resolveBrandOrgScope(key, meta) {
  if (typeof meta?.org_scope === "string" && meta.org_scope.trim()) return meta.org_scope.trim();
  return CANONICAL_BRAND_ORG_SCOPE[key] || "personal";
}

function normalizeProjectStatus(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "draft") return "Planning";
  if (normalized === "blocked") return "Blocked";
  if (normalized === "completed") return "Done";
  if (normalized === "archived") return "Backlog";

  return "In progress";
}

function normalizeTodoPriority(priority) {
  const normalized = String(priority || "medium").toLowerCase();

  if (normalized === "critical") return "high";
  if (normalized === "medium") return "med";
  if (normalized === "high" || normalized === "low") return normalized;

  return "med";
}

function normalizeBrandKind(kind) {
  const normalized = String(kind || "").toLowerCase();

  if (["client", "agency", "company"].includes(normalized)) return "company";
  if (["personal", "life"].includes(normalized)) return "personal";
  if (["education", "research"].includes(normalized)) return "info";
  if (["community", "content"].includes(normalized)) return "warning";

  return "moon";
}

function formatShortDate(value) {
  if (!value) return "미정";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatActivityTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function resolveDueBucket(value) {
  if (!value) return "다음주";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "다음주";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays <= 0) return "오늘";
  if (diffDays === 1) return "내일";
  if (diffDays <= 7) return "이번주";

  return "다음주";
}

function buildAllBrand(projectCount, openTodoCount, changeCount) {
  return {
    key: "all",
    id: "all",
    name: "전체 브랜드",
    glyph: "◐",
    tone: "moon",
    kind: "index",
    desc: "모든 프로젝트",
    projects: projectCount,
    tasks: openTodoCount,
    open: openTodoCount,
    changes: changeCount,
  };
}

function mapBrands(rows, projects, todos, updates) {
  const projectCounts = new Map();
  const todoCounts = new Map();
  const changeCounts = new Map();
  const projectById = new Map(projects.map((project) => [project.id, project]));

  projects.forEach((project) => {
    projectCounts.set(project.brand, (projectCounts.get(project.brand) || 0) + 1);
  });

  todos.forEach((todo) => {
    if (!todo.done) {
      todoCounts.set(todo.brand, (todoCounts.get(todo.brand) || 0) + 1);
    }
  });

  updates.forEach((update) => {
    const project = projectById.get(update.projectId);
    if (!project?.brand) return;
    changeCounts.set(project.brand, (changeCounts.get(project.brand) || 0) + 1);
  });

  const brands = rows.map((row, index) => {
    const key = row.slug || row.id;
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};

    return {
      key,
      id: row.id,
      name: row.name,
      glyph: meta.glyph || BRAND_GLYPHS[index % BRAND_GLYPHS.length],
      tone: meta.tone || normalizeBrandKind(row.kind),
      category: resolveBrandCategory(key, meta),
      orgScope: resolveBrandOrgScope(key, meta),
      kind: row.kind || "brand",
      desc: row.description || "운영 브랜드",
      projects: projectCounts.get(key) || 0,
      tasks: todoCounts.get(key) || 0,
      open: todoCounts.get(key) || 0,
      changes: changeCounts.get(key) || 0,
    };
  });

  const openTodoCount = todos.filter((todo) => !todo.done).length;

  return [
    buildAllBrand(projects.length, openTodoCount, updates.length),
    ...brands,
  ];
}

export function mapProjects(
  rows,
  brandById,
  taskStats,
  updateStats,
  { taskStatsPartial = false, updateStatsPartial = false } = {},
) {
  return rows.map((row) => {
    const brand = row.brand_id && brandById.get(row.brand_id);
    const stats = taskStats.get(row.id) || { total: 0, done: 0 };
    const updates = updateStats.get(row.id) || { count: 0, latest: null };
    const latestProgress = Number.isFinite(updates.latest?.progress)
      ? updates.latest.progress
      : null;
    const reportedProgress = latestProgress ?? (Number.isFinite(row.progress) ? row.progress : null);
    const baseDisplayProgress = buildProjectProgress({
      tasks: stats,
      reportedProgress,
      partial: taskStatsPartial,
    });
    const taskEvidenceComplete = stats.total > 0 && !taskStatsPartial;
    const displayProgress = updateStatsPartial
      ? taskEvidenceComplete
        ? { ...baseDisplayProgress, evidencePartial: true }
        : {
            value: null,
            source: baseDisplayProgress?.source || "reported",
            label: "업데이트 진척 읽기 실패",
            done: baseDisplayProgress?.done ?? null,
            total: baseDisplayProgress?.total ?? null,
            partial: true,
            evidencePartial: true,
          }
      : baseDisplayProgress;
    const displaySummary = row.summary || updates.latest?.summary || row.next_action || "";
    const displayNextAction = row.next_action || updates.latest?.nextAction || "";

    return {
      id: row.id,
      brand: brand?.slug || "all",
      brandId: row.brand_id ?? null,
      name: row.name,
      statusKey: row.status ?? null,
      status: normalizeProjectStatus(row.status),
      priority: row.priority ?? null,
      projectSummary: row.summary ?? null,
      projectProgress: row.progress ?? null,
      projectNextAction: row.next_action ?? null,
      displaySummary,
      displayNextAction,
      displayProgress,
      latestUpdate: updates.latest,
      updateEvidencePartial: updateStatsPartial,
      progress: displayProgress?.value ?? null,
      due: formatShortDate(row.due_at),
      startedAt: row.started_at ?? null,
      dueAt: row.due_at ?? null,
      updatedAt: row.updated_at ?? null,
      owner: row.owner_id ? "Me" : "Unassigned",
      tag: row.meta?.tag || null,
      tasks: stats.total,
      done: stats.done,
      tasksPartial: taskStatsPartial,
      changes: updates.count,
      summary: displaySummary,
      nextAction: displayNextAction,
      createdAt: row.created_at,
      createdAtLabel: formatShortDate(row.created_at),
      lastActivityAt: updates.latest?.happenedAt || row.last_activity_at || row.updated_at || row.created_at,
      lastActivityLabel: formatActivityTime(updates.latest?.happenedAt || row.last_activity_at || row.updated_at || row.created_at),
    };
  });
}

function mapTodos(rows, projectById, brandById) {
  return rows.map((row) => {
    const project = row.project_id && projectById.get(row.project_id);
    const brand = project?.brand_id && brandById.get(project.brand_id);

    return {
      id: row.id,
      brand: brand?.slug || "all",
      project: row.project_id || "",
      title: row.title,
      status: row.status || "inbox",
      due: formatShortDate(row.due_at),
      dueAt: row.due_at || "",
      bucket: resolveDueBucket(row.due_at),
      done: row.status === "done",
      priority: normalizeTodoPriority(row.priority),
      // Unlossy priority (low/medium/high/critical, matching the engine's PRIORITIES enum) —
      // `priority` above collapses critical->high and medium->med for the compact board dot,
      // which round-trips badly through an edit-and-save (attention-ledger.js needs this raw
      // form so a re-save doesn't silently downgrade critical or send an invalid "med").
      priorityRaw: String(row.priority || "medium").toLowerCase(),
      assignee: row.owner_id ? "Me" : "Unassigned",
      updatedAt: row.updated_at || row.created_at || "",
    };
  });
}

function mapProjectUpdates(rows) {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id || "",
    source: row.source || "manual",
    eventType: row.event_type || "project.progress",
    status: row.status || "reported",
    title: row.title || "Project update",
    summary: row.summary || "",
    progress: Number.isFinite(row.progress) ? row.progress : null,
    milestone: row.milestone || "",
    nextAction: row.next_action || "",
    correlationId: row.correlation_id || null,
    providerEventId: row.provider_event_id || null,
    happenedAt: row.happened_at || row.created_at,
    happenedAtLabel: formatActivityTime(row.happened_at || row.created_at),
  }));
}

function buildUpdateStats(updates) {
  const stats = new Map();

  updates.forEach((update) => {
    if (!update.projectId) return;

    const current = stats.get(update.projectId) || { count: 0, latest: null };
    current.count += 1;

    if (
      !current.latest ||
      new Date(update.happenedAt).getTime() > new Date(current.latest.happenedAt).getTime()
    ) {
      current.latest = update;
    }

    stats.set(update.projectId, current);
  });

  return stats;
}

function mapDecisions(rows) {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id || "",
    title: row.title || "Decision",
    summary: row.summary || row.rationale || "",
    decidedAt: row.decided_at || row.created_at,
    decidedAtLabel: formatActivityTime(row.decided_at || row.created_at),
  }));
}

function mapNotes(rows) {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id || "",
    title: row.title || "Note",
    body: row.body || "",
    createdAt: row.created_at,
    createdAtLabel: formatActivityTime(row.created_at),
  }));
}

function mapRoutineChecks(rows) {
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id || "",
    checkType: row.check_type || "check",
    status: row.status || "pending",
    note: row.note || "",
    checkedAt: row.checked_at || row.created_at,
    checkedAtLabel: formatActivityTime(row.checked_at || row.created_at),
  }));
}

function buildBoardColumns(projects, todos) {
  const columns = [
    { key: "backlog", label: "Backlog", cards: [] },
    { key: "today", label: "Today", cards: [] },
    { key: "doing", label: "In Progress", cards: [] },
    { key: "review", label: "Review", cards: [] },
    { key: "done", label: "Done", cards: [] },
  ];

  const byKey = new Map(columns.map((column) => [column.key, column]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  todos
    .filter((todo) => !todo.done)
    .slice(0, 24)
    .forEach((todo) => {
      const project = projectById.get(todo.project);
      const key = todo.bucket === "오늘" ? "today" : "backlog";
      const column = byKey.get(key) || columns[0];

      column.cards.push({
        id: todo.id,
        title: todo.title,
        tag: project?.tag || null,
        priority: todo.priority,
        project: project?.name || "Unassigned",
        due: todo.due,
      });
    });

  projects
    .filter((project) => project.status === "In progress" || project.status === "Review")
    .slice(0, 12)
    .forEach((project) => {
      const key = project.status === "Review" ? "review" : "doing";
      const column = byKey.get(key);

      column.cards.push({
        id: `project-${project.id}`,
        title: project.nextAction || project.name,
        tag: project.tag,
        priority: "med",
        project: project.name,
        due: project.due,
      });
    });

  return columns;
}

export async function getProjectLedger() {
  const workspaceId = resolveDefaultWorkspaceId();
  const supabaseConfig = resolveSupabaseConfig();

  if (!workspaceId || !supabaseConfig) {
    return {
      source: "preview",
      configured: false,
      workspaceId: workspaceId || null,
      brands: [],
      projects: [],
      todos: [],
      updates: [],
      decisions: [],
      notes: [],
      checks: [],
      columns: [],
      taskAggregation: null,
      partial: false,
      failedSources: [],
      partialSources: [],
    };
  }

  const taskFilters = withWorkspaceFilter([
    ["status", inFilter(["inbox", "todo", "doing", "blocked", "done"])],
  ]);
  const [
    brandRows,
    projectRows,
    taskRows,
    taskRowCount,
    updateRows,
    decisionRows,
    noteRows,
    routineRows,
  ] = await Promise.all([
    fetchSupabaseRows("brands", {
      order: "name.asc",
      filters: withWorkspaceFilter([["status", eqFilter("active")]]),
    }),
    fetchSupabaseRows("projects", {
      limit: 80,
      order: "updated_at.desc",
      filters: withWorkspaceFilter([
        ["status", inFilter(["draft", "active", "blocked", "completed", "archived"])],
      ]),
    }),
    fetchSupabaseRows("tasks", {
      limit: 160,
      order: "updated_at.desc",
      filters: taskFilters,
    }),
    countSupabaseRows("tasks", taskFilters),
    fetchSupabaseRows("project_updates", {
      limit: 120,
      order: "happened_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("decisions", {
      limit: 80,
      order: "decided_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("notes", {
      limit: 80,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
    fetchSupabaseRows("routine_checks", {
      limit: 80,
      order: "created_at.desc",
      filters: withWorkspaceFilter(),
    }),
  ]);

  const failedSources = [
    ["brands", brandRows],
    ["projects", projectRows],
    ["tasks", taskRows],
  ]
    .filter(([, rows]) => !Array.isArray(rows))
    .map(([source]) => source);

  if (failedSources.length > 0) {
    return {
      source: "error",
      configured: true,
      workspaceId,
      error: "project-ledger-core-read-failed",
      failedSources,
      retryable: true,
      brands: [],
      projects: [],
      todos: [],
      updates: [],
      decisions: [],
      notes: [],
      checks: [],
      columns: [],
      taskAggregation: null,
      partial: false,
      partialSources: [],
    };
  }

  const optionalSources = [
    ["project_updates", updateRows],
    ["decisions", decisionRows],
    ["notes", noteRows],
    ["routine_checks", routineRows],
  ];
  const optionalFailedSources = optionalSources
    .filter(([, rows]) => !Array.isArray(rows))
    .map(([source]) => source);
  const taskStatsPartial = !Number.isFinite(taskRowCount) || taskRowCount !== taskRows.length;
  const partialSources = taskStatsPartial ? ["tasks"] : [];
  const updateStatsPartial = !Array.isArray(updateRows);

  const brandById = new Map(brandRows.map((brand) => [brand.id, brand]));
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  const taskStats = new Map();

  taskRows.forEach((task) => {
    if (!task.project_id) return;
    const stats = taskStats.get(task.project_id) || { total: 0, done: 0 };
    stats.total += 1;
    if (task.status === "done") stats.done += 1;
    taskStats.set(task.project_id, stats);
  });

  const updates = mapProjectUpdates(Array.isArray(updateRows) ? updateRows : []);
  const updateStats = buildUpdateStats(updates);
  const todos = mapTodos(taskRows, projectById, brandById);
  const projects = mapProjects(projectRows, brandById, taskStats, updateStats, {
    taskStatsPartial,
    updateStatsPartial,
  });
  const brands = mapBrands(brandRows, projects, todos, updates);

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    brands,
    projects,
    todos,
    updates,
    decisions: mapDecisions(Array.isArray(decisionRows) ? decisionRows : []),
    notes: mapNotes(Array.isArray(noteRows) ? noteRows : []),
    checks: mapRoutineChecks(Array.isArray(routineRows) ? routineRows : []),
    columns: buildBoardColumns(projects, todos),
    taskAggregation: {
      loaded: taskRows.length,
      total: Number.isFinite(taskRowCount) ? taskRowCount : null,
      partial: taskStatsPartial,
    },
    partial: optionalFailedSources.length > 0 || taskStatsPartial,
    failedSources: optionalFailedSources,
    partialSources,
  };
}
