import {
  eqFilter,
  fetchSupabaseRows,
  fetchSupabaseRowsWithState,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { DEFAULT_TASK_TIMEZONE, resolveTaskTimezone } from "@/lib/task-attention";

const BRAND_GLYPHS = ["◐", "◇", "✦", "◆", "●", "□", "△", "◎", "◌", "✧"];
const CANONICAL_BRAND_ORDER = {
  sinabro: 10,
  gore: 20,
  holyfuncollector: 30,
  bridgemaker: 40,
  moonpm: 50,
  classmoon: 60,
  studyseagull: 70,
  politicofficer: 80,
  "22nomad": 90,
};
const CANONICAL_BRAND_TONES = {
  sinabro: "info",
  gore: "company",
  holyfuncollector: "warning",
  bridgemaker: "moon",
  moonpm: "warning",
  classmoon: "info",
  studyseagull: "danger",
  politicofficer: "info",
  "22nomad": "personal",
};
const CANONICAL_BRAND_GLYPHS = {
  sinabro: "✦",
  gore: "◌",
  holyfuncollector: "✧",
  bridgemaker: "◇",
  moonpm: "◐",
  classmoon: "□",
  studyseagull: "△",
  politicofficer: "◎",
  "22nomad": "◻",
};
// Which brands are ClassIn (company) work vs. personal brands. Defaults to
// "personal" when a brand isn't listed here and has no meta.org_scope.
const CANONICAL_BRAND_ORG_SCOPE = {
  classmoon: "classin",
  studyseagull: "classin",
  classin_side: "classin",
};

function clampProgress(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
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

function resolveBrandOrder(key, meta, index) {
  const parsed = Number.parseInt(String(meta?.order ?? ""), 10);
  if (Number.isFinite(parsed)) return parsed;
  return CANONICAL_BRAND_ORDER[key] ?? 1000 + index;
}

function resolveBrandTone(key, kind, meta) {
  if (typeof meta?.tone === "string" && meta.tone.trim()) return meta.tone.trim();
  return CANONICAL_BRAND_TONES[key] || normalizeBrandKind(kind);
}

function resolveBrandGlyph(key, meta, index) {
  if (typeof meta?.glyph === "string" && meta.glyph.trim()) return meta.glyph.trim();
  return CANONICAL_BRAND_GLYPHS[key] || BRAND_GLYPHS[index % BRAND_GLYPHS.length];
}

function resolveBrandOrgScope(key, meta) {
  if (typeof meta?.org_scope === "string" && meta.org_scope.trim()) return meta.org_scope.trim();
  return CANONICAL_BRAND_ORG_SCOPE[key] || "personal";
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
      glyph: resolveBrandGlyph(key, meta, index),
      tone: resolveBrandTone(key, row.kind, meta),
      kind: row.kind || "brand",
      orgScope: resolveBrandOrgScope(key, meta),
      desc: row.description || "운영 브랜드",
      philosophy: typeof meta.philosophy === "string" ? meta.philosophy : "",
      direction: typeof meta.direction === "string" ? meta.direction : "",
      cadence: typeof meta.cadence === "string" ? meta.cadence : "",
      projects: projectCounts.get(key) || 0,
      tasks: todoCounts.get(key) || 0,
      open: todoCounts.get(key) || 0,
      changes: changeCounts.get(key) || 0,
      sortOrder: resolveBrandOrder(key, meta, index),
    };
  }).sort((a, b) => (
    a.sortOrder - b.sortOrder ||
    a.name.localeCompare(b.name, "ko")
  )).map(({ sortOrder, ...brand }) => brand);

  const openTodoCount = todos.filter((todo) => !todo.done).length;

  return [
    buildAllBrand(projects.length, openTodoCount, updates.length),
    ...brands,
  ];
}

function mapProjects(rows, brandById, taskStats, updateStats) {
  return rows.map((row) => {
    const brand = row.brand_id && brandById.get(row.brand_id);
    const stats = taskStats.get(row.id) || { total: 0, done: 0 };
    const updates = updateStats.get(row.id) || { count: 0, latest: null };
    const latestProgress = Number.isFinite(updates.latest?.progress)
      ? updates.latest.progress
      : null;
    const progress = latestProgress ?? clampProgress(row.progress);

    return {
      id: row.id,
      brand: brand?.slug || "all",
      name: row.name,
      status: normalizeProjectStatus(row.status),
      progress,
      due: formatShortDate(row.due_at),
      owner: row.owner_id ? "Me" : "Unassigned",
      tag: row.meta?.tag || null,
      tasks: stats.total,
      done: stats.done,
      changes: updates.count,
      summary: row.summary || updates.latest?.summary || row.next_action || "",
      nextAction: row.next_action || updates.latest?.nextAction || "",
      createdAt: row.created_at,
      createdAtLabel: formatShortDate(row.created_at),
      lastActivityAt: updates.latest?.happenedAt || row.last_activity_at || row.updated_at || row.created_at,
      lastActivityLabel: formatActivityTime(updates.latest?.happenedAt || row.last_activity_at || row.updated_at || row.created_at),
    };
  });
}

export function mapCanonicalTodoForProjects(task, projectById, brandById) {
  const project = task.projectId && projectById.get(task.projectId);
  const brand = project?.brand_id && brandById.get(project.brand_id);
  const priorityKey = task.priority || "medium";

  return {
    ...task,
    brand: brand?.slug || "all",
    project: task.projectId || "",
    projectName: task.projectName || project?.name || null,
    due: formatShortDate(task.dueAt),
    bucket: resolveDueBucket(task.dueAt),
    done: task.status === "done",
    priority: normalizeTodoPriority(priorityKey),
    priorityKey,
    assignee: task.ownerId ? "Me" : "Unassigned",
  };
}

function mapTodos(tasks, projectById, brandById) {
  return tasks.map((task) => mapCanonicalTodoForProjects(task, projectById, brandById));
}

const CANONICAL_TASK_SELECT = [
  "id",
  "workspace_id",
  "project_id",
  "owner_id",
  "title",
  "status",
  "priority",
  "due_at",
  "next_action",
  "meta",
  "created_at",
  "updated_at",
  "started_at",
  "completed_at",
  "project:projects(id,name)",
].join(",");

function mapCanonicalTask(row) {
  const meta = row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? row.meta
    : {};
  const project = Array.isArray(row?.project) ? row.project[0] : row?.project;
  const metaPrecision = meta.due_precision;
  const duePrecision = ["timed", "date", "none"].includes(metaPrecision)
    ? metaPrecision
    : row?.due_at
      ? "timed"
      : "none";

  return {
    id: row?.id || null,
    title: row?.title || "",
    status: row?.status || "inbox",
    priority: row?.priority || "medium",
    dueAt: row?.due_at || null,
    duePrecision,
    updatedAt: row?.updated_at || null,
    createdAt: row?.created_at || null,
    startedAt: row?.started_at || null,
    completedAt: row?.completed_at || null,
    nextAction: row?.next_action || null,
    meta,
    projectId: row?.project_id || project?.id || null,
    projectName: project?.name || null,
    ownerId: row?.owner_id || null,
    workspaceId: row?.workspace_id || null,
  };
}

export async function getCanonicalTaskRead({
  workspaceId = resolveDefaultWorkspaceId(),
  readRows = fetchSupabaseRowsWithState,
} = {}) {
  if (!workspaceId) {
    return { source: "preview", timezone: DEFAULT_TASK_TIMEZONE, tasks: [] };
  }

  const [taskResult, workspaceResult] = await Promise.all([
    readRows("tasks", {
      select: CANONICAL_TASK_SELECT,
      limit: 200,
      order: "updated_at.desc",
      filters: [
        ["workspace_id", eqFilter(workspaceId)],
        ["status", "neq.done"],
      ],
    }),
    readRows("workspaces", {
      select: "timezone",
      limit: 1,
      filters: [["id", eqFilter(workspaceId)]],
    }),
  ]);
  const timezone = resolveTaskTimezone(workspaceResult.rows?.[0]?.timezone);

  if (taskResult.state === "preview") {
    return { source: "preview", timezone, tasks: [] };
  }

  if (taskResult.state === "error") {
    return {
      source: "error",
      timezone,
      tasks: [],
      errorCode: taskResult.errorCode || "read-failed",
    };
  }

  const tasks = taskResult.rows
    .filter((row) => row?.status !== "done")
    .map(mapCanonicalTask);

  return {
    source: tasks.length ? "live" : "empty",
    timezone,
    tasks,
  };
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

  if (!workspaceId) {
    return {
      source: "preview",
      configured: false,
      workspaceId: null,
      brands: [],
      projects: [],
      tasks: [],
      todos: [],
      taskSource: "preview",
      taskTimezone: DEFAULT_TASK_TIMEZONE,
      updates: [],
      decisions: [],
      notes: [],
      checks: [],
      columns: [],
    };
  }

  const [
    brandRows,
    projectRows,
    taskRows,
    canonicalTaskRead,
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
      filters: withWorkspaceFilter([
        ["status", inFilter(["inbox", "todo", "doing", "blocked", "done"])],
      ]),
    }),
    getCanonicalTaskRead({ workspaceId }),
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

  if (!brandRows || !projectRows || !taskRows) {
    return {
      source: "preview",
      configured: true,
      workspaceId,
      brands: [],
      projects: [],
      tasks: [],
      todos: [],
      taskSource: canonicalTaskRead.source,
      taskTimezone: canonicalTaskRead.timezone,
      taskErrorCode: canonicalTaskRead.errorCode || null,
      updates: [],
      decisions: [],
      notes: [],
      checks: [],
      columns: [],
    };
  }

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

  const updates = mapProjectUpdates(updateRows || []);
  const updateStats = buildUpdateStats(updates);
  const tasks = canonicalTaskRead.tasks;
  const todos = mapTodos(tasks, projectById, brandById);
  const projects = mapProjects(projectRows, brandById, taskStats, updateStats);
  const brands = mapBrands(brandRows, projects, todos, updates);

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    brands,
    projects,
    tasks,
    todos,
    taskSource: canonicalTaskRead.source,
    taskTimezone: canonicalTaskRead.timezone,
    taskErrorCode: canonicalTaskRead.errorCode || null,
    updates,
    decisions: mapDecisions(decisionRows || []),
    notes: mapNotes(noteRows || []),
    checks: mapRoutineChecks(routineRows || []),
    columns: buildBoardColumns(projects, todos),
  };
}
