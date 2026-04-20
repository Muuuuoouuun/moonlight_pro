import {
  eqFilter,
  fetchSupabaseRows,
  inFilter,
  withWorkspaceFilter,
} from "@/lib/server-read";
import { resolveDefaultWorkspaceId } from "@/lib/server-write";

const BRAND_GLYPHS = ["◐", "◇", "✦", "◆", "●", "□", "△", "◎", "◌", "✧"];

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

function formatShortDate(value) {
  if (!value) return "미정";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
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

function mapBrands(rows, projects, todos) {
  const projectCounts = new Map();
  const todoCounts = new Map();

  projects.forEach((project) => {
    projectCounts.set(project.brand, (projectCounts.get(project.brand) || 0) + 1);
  });

  todos.forEach((todo) => {
    if (!todo.done) {
      todoCounts.set(todo.brand, (todoCounts.get(todo.brand) || 0) + 1);
    }
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
      kind: row.kind || "brand",
      desc: row.description || "운영 브랜드",
      projects: projectCounts.get(key) || 0,
      tasks: todoCounts.get(key) || 0,
      open: todoCounts.get(key) || 0,
      changes: 0,
    };
  });

  const openTodoCount = todos.filter((todo) => !todo.done).length;

  return [
    buildAllBrand(projects.length, openTodoCount, 0),
    ...brands,
  ];
}

function mapProjects(rows, brandById, taskStats) {
  return rows.map((row) => {
    const brand = row.brand_id && brandById.get(row.brand_id);
    const stats = taskStats.get(row.id) || { total: 0, done: 0 };

    return {
      id: row.id,
      brand: brand?.slug || "all",
      name: row.name,
      status: normalizeProjectStatus(row.status),
      progress: clampProgress(row.progress),
      due: formatShortDate(row.due_at),
      owner: row.owner_id ? "Me" : "Unassigned",
      tag: row.meta?.tag || null,
      tasks: stats.total,
      done: stats.done,
      summary: row.summary || row.next_action || "",
      nextAction: row.next_action || "",
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at || row.updated_at || row.created_at,
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
      due: formatShortDate(row.due_at),
      bucket: resolveDueBucket(row.due_at),
      done: row.status === "done",
      priority: normalizeTodoPriority(row.priority),
      assignee: row.owner_id ? "Me" : "Unassigned",
    };
  });
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
      todos: [],
      columns: [],
    };
  }

  const [brandRows, projectRows, taskRows] = await Promise.all([
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
  ]);

  if (!brandRows || !projectRows || !taskRows) {
    return {
      source: "preview",
      configured: true,
      workspaceId,
      brands: [],
      projects: [],
      todos: [],
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

  const todos = mapTodos(taskRows, projectById, brandById);
  const projects = mapProjects(projectRows, brandById, taskStats);
  const brands = mapBrands(brandRows, projects, todos);

  return {
    source: "supabase",
    configured: true,
    workspaceId,
    brands,
    projects,
    todos,
    columns: buildBoardColumns(projects, todos),
  };
}
