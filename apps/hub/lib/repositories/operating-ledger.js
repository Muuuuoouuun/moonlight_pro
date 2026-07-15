import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";
import { buildTaskBoardColumns } from "@/lib/pms-ui";

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

// PMS container category (2026-07-15 spec §4.1): 'sns-channel' | 'ka-deal' |
// 'general'. meta.category overrides; unknown values read as "general" — the
// code never guesses. The canonical list below is the operator-confirmed
// 2026-07-15 assignment (every existing container is an SNS channel), same
// idiom as CANONICAL_BRAND_ORG_SCOPE above.
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
      category: resolveBrandCategory(key, meta),
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
      brandId: row.brand_id || null,
      brand: brand?.slug || "all",
      name: row.name,
      status: normalizeProjectStatus(row.status),
      statusKey: row.status || "active",
      priority: row.priority || "medium",
      progress,
      due: formatShortDate(row.due_at),
      dueAt: row.due_at || "",
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

export async function getProjectLedger() {
  const workspaceId = resolveDefaultWorkspaceId();

  if (!workspaceId) {
    return {
      source: "preview",
      configured: false,
      workspaceId: null,
      brands: [],
      projects: [],
      todos: [],
      updates: [],
      decisions: [],
      notes: [],
      checks: [],
      columns: [],
    };
  }

  const [brandRows, projectRows, taskRows, updateRows, decisionRows, noteRows, routineRows] = await Promise.all([
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
      todos: [],
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
  const todos = mapTodos(taskRows, projectById, brandById);
  const projects = mapProjects(projectRows, brandById, taskStats, updateStats);
  const brands = mapBrands(brandRows, projects, todos, updates);

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    brands,
    projects,
    todos,
    updates,
    decisions: mapDecisions(decisionRows || []),
    notes: mapNotes(noteRows || []),
    checks: mapRoutineChecks(routineRows || []),
    columns: buildTaskBoardColumns(todos, projects),
  };
}
