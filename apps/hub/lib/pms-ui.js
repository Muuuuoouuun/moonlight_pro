const TASK_STATUS_BY_COLUMN = {
  backlog: "inbox",
  today: "todo",
  doing: "doing",
  blocked: "blocked",
  done: "done",
};
const PROJECT_STATUS_BY_LABEL = {
  Planning: "draft",
  "In progress": "active",
  Blocked: "blocked",
  Done: "completed",
  Backlog: "archived",
  draft: "draft",
  active: "active",
  blocked: "blocked",
  completed: "completed",
  archived: "archived",
};
const TASK_STATUSES = new Set(Object.values(TASK_STATUS_BY_COLUMN));
const BOARD_COLUMN_BY_STATUS = Object.fromEntries(
  Object.entries(TASK_STATUS_BY_COLUMN).map(([column, status]) => [status, column]),
);
const TASK_BOARD_COLUMNS = [
  { key: "backlog", label: "수집" },
  { key: "today", label: "계획" },
  { key: "doing", label: "진행" },
  { key: "blocked", label: "대기" },
  { key: "done", label: "완료" },
];
const CONTENT_PIPELINE_STAGES = ["기획", "초안", "검토", "업로드"];

export function taskStatusForBoardColumn(column) {
  return TASK_STATUS_BY_COLUMN[column] || null;
}

export function createClientId({
  cryptoImpl = typeof globalThis !== "undefined" ? globalThis.crypto : null,
  random = Math.random,
} = {}) {
  if (typeof cryptoImpl?.randomUUID === "function") {
    return cryptoImpl.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(random() * 16);
    return (token === "x" ? value : ((value & 3) | 8)).toString(16);
  });
}

export function buildProjectDraft({
  contextBrand = null,
  clientId = createClientId(),
  initialStatus = "Planning",
} = {}) {
  const hasContainerContext = contextBrand?.id && contextBrand.id !== "all";
  return {
    kind: "project",
    isNew: true,
    clientId,
    title: "",
    brandId: hasContainerContext ? contextBrand.id : null,
    brandKey: hasContainerContext ? contextBrand.key : "all",
    summary: "",
    status: PROJECT_STATUS_BY_LABEL[initialStatus] || "draft",
    priority: "medium",
    nextAction: "",
    dueAt: "",
  };
}

export function rotateProjectClientId(draft, {
  clientId = createClientId(),
} = {}) {
  if (!draft) return draft;
  return { ...draft, clientId };
}

export function projectReloadContains(result, durableProjectId) {
  if (!result?.ok || !durableProjectId || !Array.isArray(result.projects)) return false;
  return result.projects.some((project) => project?.id === durableProjectId);
}

function stableHashWord(value, seed) {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function deterministicTaskUuid(value) {
  const seeds = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344];
  const chars = seeds
    .map((seed) => stableHashWord(value, seed).toString(16).padStart(8, "0"))
    .join("")
    .split("");
  chars[12] = "8"; // UUIDv8 custom payload: deterministic, browser-safe task identity.
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildContentPipelineTaskSeeds(projectId) {
  return CONTENT_PIPELINE_STAGES.map((title) => ({
    id: deterministicTaskUuid(`${projectId}:content-pipeline:${title}`),
    title,
  }));
}

export function contentPipelineReloadContains(result, taskIds = []) {
  if (!result?.ok || !Array.isArray(result.todos) || taskIds.length === 0) return false;
  const loadedIds = new Set(result.todos.map((todo) => todo?.id).filter(Boolean));
  return taskIds.every((taskId) => loadedIds.has(taskId));
}

export function shouldOpenGlobalProjectCreate(event = {}, { drawerOpen = false } = {}) {
  if (drawerOpen || event.defaultPrevented || event.isComposing || event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (String(event.key || "").toLowerCase() !== "n") return false;

  const target = event.target;
  const tagName = String(target?.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tagName)) return false;
  return !target?.isContentEditable;
}

export function validateProjectDraft(draft = {}) {
  const errors = {};
  if (!String(draft.title || "").trim()) {
    errors.title = "프로젝트명을 입력하세요.";
  }
  if (!draft.brandId || draft.brandId === "all") {
    errors.brandId = "프로젝트를 둘 위치를 선택하세요.";
  }
  return errors;
}

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

export function buildProjectEditDraft(project = {}) {
  return {
    kind: "project",
    isNew: false,
    id: project.id,
    title: project.name || "",
    brandId: project.brandId || "",
    brandKey: project.brand || "all",
    summary: project.projectSummary ?? "",
    status: project.statusKey || "active",
    priority: project.priority || "medium",
    nextAction: project.projectNextAction ?? "",
    dueAt: dateInputValue(project.dueAt),
    updatedAt: project.updatedAt || null,
  };
}

function currentProjectValue(current, keys, fallback) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(current, key)) return current[key];
  }
  return fallback;
}

export function rebaseProjectEditSource(source = {}, current = {}) {
  return {
    ...source,
    id: currentProjectValue(current, ["id"], source.id),
    name: currentProjectValue(current, ["name", "title"], source.name),
    brand: currentProjectValue(current, ["brand"], source.brand),
    brandId: currentProjectValue(current, ["brandId", "brand_id"], source.brandId),
    projectSummary: currentProjectValue(
      current,
      ["projectSummary", "summary"],
      source.projectSummary,
    ),
    statusKey: currentProjectValue(current, ["statusKey", "status"], source.statusKey),
    priority: currentProjectValue(current, ["priority"], source.priority),
    projectNextAction: currentProjectValue(
      current,
      ["projectNextAction", "nextAction", "next_action"],
      source.projectNextAction,
    ),
    dueAt: currentProjectValue(current, ["dueAt", "due_at"], source.dueAt),
    updatedAt: currentProjectValue(current, ["updatedAt", "updated_at"], source.updatedAt),
  };
}

export function buildProjectPatch(source = {}, draft = {}) {
  const original = buildProjectEditDraft(source);
  const patch = { id: source.id };
  if (source.updatedAt) patch.expectedUpdatedAt = source.updatedAt;

  const fields = ["title", "brandId", "summary", "status", "priority", "nextAction", "dueAt"];
  fields.forEach((field) => {
    const next = field === "dueAt" ? dateInputValue(draft[field]) : (draft[field] ?? "");
    if (next !== original[field]) patch[field] = next;
  });
  return patch;
}

export function rebaseProjectEditState(source = {}, draft = {}, current = {}) {
  const originalPatch = buildProjectPatch(source, draft);
  const dirtyKeys = Object.keys(originalPatch).filter(
    (key) => !["id", "expectedUpdatedAt"].includes(key),
  );
  const nextSource = rebaseProjectEditSource(source, current);
  const nextDraft = buildProjectEditDraft(nextSource);

  dirtyKeys.forEach((key) => {
    nextDraft[key] = draft[key];
  });

  return { source: nextSource, draft: nextDraft };
}

export function mergeProjectDetailQuery(current, projectId) {
  const params = new URLSearchParams(
    typeof current === "string" ? current : current?.toString?.() || "",
  );
  params.delete("view");
  params.delete("new");
  params.delete("task");
  params.set("project", projectId);
  return params;
}

export function mergeTimelineProjectQuery(current, projectId) {
  const params = new URLSearchParams(
    typeof current === "string" ? current : current?.toString?.() || "",
  );
  params.delete("new");
  params.delete("task");
  params.set("view", "timeline");
  params.set("project", projectId);
  return params;
}

export function buildProjectProgress({
  tasks = { done: 0, total: 0 },
  reportedProgress = null,
  partial = false,
} = {}) {
  const total = Number.isFinite(tasks?.total) ? Math.max(0, Math.trunc(tasks.total)) : 0;
  const done = Number.isFinite(tasks?.done)
    ? Math.max(0, Math.min(total, Math.trunc(tasks.done)))
    : 0;

  if (partial) {
    return {
      value: null,
      source: "tasks",
      label: "작업 집계 일부",
      done,
      total,
      partial: true,
    };
  }

  if (total > 0) {
    return {
      value: Math.round((done / total) * 100),
      source: "tasks",
      label: "체크리스트 진척",
      done,
      total,
      partial: false,
    };
  }

  if (!Number.isFinite(reportedProgress)) return null;

  return {
    value: Math.max(0, Math.min(100, reportedProgress)),
    source: "reported",
    label: "보고된 진척",
    done: null,
    total: null,
    partial: false,
  };
}

export function buildTaskDraft({ projectId = null, initialStatus = "todo" } = {}) {
  return {
    kind: "task",
    isNew: true,
    title: "새 할 일",
    projectId,
    status: TASK_STATUSES.has(initialStatus) ? initialStatus : "todo",
    priority: "medium",
    dueAt: "",
  };
}

const MS_PER_DAY = 86_400_000;

function toDayStart(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

// Timeline layout for the Projects deadline view. A period exists only when the
// operator supplied a valid startedAt <= dueAt pair. A deadline without that evidence
// is a point, never a period fabricated from createdAt.
export function buildProjectTimeline(projects = [], {
  today = new Date(),
  minWindowDays = 14,
  lookbackDays = 30,
  lookaheadDays = 60,
} = {}) {
  const todayStart = toDayStart(today) || new Date(0);
  const dated = [];
  const undated = [];

  projects.forEach((project) => {
    const due = toDayStart(project.dueAt);
    if (!due) {
      undated.push(project);
      return;
    }
    const started = toDayStart(project.startedAt);
    const hasRange = Boolean(started && started.getTime() <= due.getTime());
    dated.push({
      project,
      kind: hasRange ? "range" : "marker",
      start: hasRange ? started : null,
      end: due,
    });
  });

  if (dated.length === 0) {
    return { windowStart: todayStart, windowEnd: todayStart, totalDays: 0, today: todayStart, todayPct: 0, items: [], undated };
  }

  const earliestStart = new Date(Math.min(
    ...dated.map((item) => (item.start || item.end).getTime()),
  ));
  const latestEnd = new Date(Math.max(...dated.map((d) => d.end.getTime())));

  // Clamp so one very old or very distant due date can't stretch the axis into
  // unreadable territory — bars outside the window are clipped at its edges.
  const clampedStartMs = Math.max(earliestStart.getTime(), todayStart.getTime() - lookbackDays * MS_PER_DAY);
  const clampedEndMs = Math.min(Math.max(latestEnd.getTime(), todayStart.getTime()), todayStart.getTime() + lookaheadDays * MS_PER_DAY);

  let windowStartMs = Math.min(clampedStartMs, todayStart.getTime());
  let windowEndMs = Math.max(clampedEndMs, todayStart.getTime());
  if (windowEndMs - windowStartMs < minWindowDays * MS_PER_DAY) {
    windowEndMs = windowStartMs + minWindowDays * MS_PER_DAY;
  }

  const windowStart = new Date(windowStartMs);
  const windowEnd = new Date(windowEndMs);
  const totalDays = Math.max(1, Math.round((windowEndMs - windowStartMs) / MS_PER_DAY));

  const items = dated
    .map(({ project, kind, start, end }) => {
      const overdue = end.getTime() < todayStart.getTime();
      if (kind === "marker") {
        const markerMs = Math.max(windowStartMs, Math.min(windowEndMs, end.getTime()));
        return {
          project,
          kind,
          markerPct: ((markerMs - windowStartMs) / MS_PER_DAY / totalDays) * 100,
          overdue,
          clippedStart: false,
          clippedEnd: end.getTime() > windowEndMs,
          clippedDeadline: end.getTime() < windowStartMs || end.getTime() > windowEndMs,
        };
      }

      const visStartMs = Math.max(windowStartMs, Math.min(windowEndMs, start.getTime()));
      const visEndMs = Math.max(windowStartMs, Math.min(windowEndMs, end.getTime()));
      const startOffsetDays = (visStartMs - windowStartMs) / MS_PER_DAY;
      const spanDays = Math.max(0, (visEndMs - visStartMs) / MS_PER_DAY);
      const startPct = Math.max(0, Math.min(100, (startOffsetDays / totalDays) * 100));
      const widthPct = Math.max(
        0,
        Math.min(100 - startPct, (spanDays / totalDays) * 100),
      );
      return {
        project,
        kind,
        startPct,
        widthPct,
        overdue,
        clippedStart: start.getTime() < windowStartMs || start.getTime() > windowEndMs,
        clippedEnd: end.getTime() < windowStartMs || end.getTime() > windowEndMs,
      };
    })
    .sort((a, b) => (a.startPct ?? a.markerPct) - (b.startPct ?? b.markerPct));

  const todayPct = Math.max(0, Math.min(100, ((todayStart.getTime() - windowStartMs) / MS_PER_DAY / totalDays) * 100));

  return { windowStart, windowEnd, totalDays, today: todayStart, todayPct, items, undated };
}

const ROADMAP_MONTH_COUNT = 4;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toPlanningDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  const raw = String(value);
  const dateOnly = raw.match(DATE_ONLY_PATTERN);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() !== Number(year)
      || date.getMonth() !== Number(month) - 1
      || date.getDate() !== Number(day)
    ) return null;
    return date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function planningDateLabel(value) {
  const date = toPlanningDate(value);
  if (!date) return "날짜 미정";
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildRoadmapWindow(now) {
  const anchor = toPlanningDate(now) || new Date();
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + ROADMAP_MONTH_COUNT, 1);
  const months = Array.from({ length: ROADMAP_MONTH_COUNT }, (_, index) => {
    const monthStart = new Date(start.getFullYear(), start.getMonth() + index, 1);
    return {
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      start: monthStart,
      end: new Date(start.getFullYear(), start.getMonth() + index + 1, 1),
    };
  });
  return { start, end, months };
}

function roadmapPosition(date, window) {
  if (date <= window.start) return 0;
  if (date >= window.end) return 100;

  const monthIndex = (
    (date.getFullYear() - window.start.getFullYear()) * 12
    + date.getMonth()
    - window.start.getMonth()
  );
  const month = window.months[monthIndex];
  if (!month) return monthIndex < 0 ? 0 : 100;
  const monthFraction = (
    (date.getTime() - month.start.getTime())
    / (month.end.getTime() - month.start.getTime())
  );
  return ((monthIndex + monthFraction) / ROADMAP_MONTH_COUNT) * 100;
}

export function buildRoadmapProjection(roadmap = {}, {
  now = new Date(),
  selectedProjectId = null,
} = {}) {
  const window = buildRoadmapWindow(now);
  const projects = Array.isArray(roadmap.projects) ? roadmap.projects : [];
  const milestones = Array.isArray(roadmap.milestones) ? roadmap.milestones : [];
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const projectItems = projects.flatMap((project) => {
    if (selectedProjectId && project.id !== selectedProjectId) return [];
    const due = toPlanningDate(project.dueAt);
    if (!due) return [];
    const started = toPlanningDate(project.startedAt);
    const hasRange = Boolean(started && started.getTime() <= due.getTime());

    if (!hasRange) {
      if (due < window.start || due >= window.end) return [];
      return [{
        id: `project:${project.id}`,
        projectId: project.id,
        name: project.name,
        meta: "프로젝트 마감",
        kind: "marker",
        dueAt: project.dueAt,
        markerPct: roadmapPosition(due, window),
      }];
    }

    if (due < window.start || started >= window.end) return [];
    const startPct = roadmapPosition(started, window);
    const endPct = roadmapPosition(due, window);
    return [{
      id: `project:${project.id}`,
      projectId: project.id,
      name: project.name,
      meta: "프로젝트 기간",
      kind: "range",
      startedAt: project.startedAt,
      dueAt: project.dueAt,
      startPct,
      widthPct: Math.max(0, Math.min(100 - startPct, endPct - startPct)),
      clippedStart: started < window.start || started > window.end,
      clippedEnd: due < window.start || due > window.end,
    }];
  });

  const milestoneItems = milestones.flatMap((milestone) => {
    if (selectedProjectId && milestone.projectId !== selectedProjectId) return [];
    const target = toPlanningDate(milestone.targetAt);
    if (!target || target < window.start || target >= window.end) return [];
    const project = projectById.get(milestone.projectId);
    return [{
      id: `milestone:${milestone.id}`,
      projectId: milestone.projectId,
      projectName: project?.name || null,
      name: milestone.title,
      meta: project?.name ? `${project.name} · 마일스톤` : "마일스톤",
      kind: "milestone",
      targetAt: milestone.targetAt,
      markerPct: roadmapPosition(target, window),
    }];
  });

  return {
    ...window,
    items: [...projectItems, ...milestoneItems].sort(
      (a, b) => (a.startPct ?? a.markerPct) - (b.startPct ?? b.markerPct),
    ),
  };
}

export function buildTimelineItemAriaLabel(item = {}) {
  const project = item.project || {};
  if (item.kind === "range") {
    return `${project.name || "프로젝트"} · 계획 기간 · ${planningDateLabel(project.startedAt)}부터 ${planningDateLabel(project.dueAt)}까지`;
  }
  return `${project.name || "프로젝트"} · 마감일 지점 · ${planningDateLabel(project.dueAt)}`;
}

export function buildRoadmapItemAriaLabel(item = {}) {
  if (item.kind === "range") {
    return `${item.name || "프로젝트"} · 프로젝트 기간 · ${planningDateLabel(item.startedAt)}부터 ${planningDateLabel(item.dueAt)}까지`;
  }
  if (item.kind === "milestone") {
    const projectLabel = item.projectName ? ` · ${item.projectName}` : "";
    return `${item.name || "마일스톤"}${projectLabel} · 마일스톤 목표일 · ${planningDateLabel(item.targetAt)}`;
  }
  return `${item.name || "프로젝트"} · 프로젝트 마감 · ${planningDateLabel(item.dueAt)}`;
}

export function buildTaskBoardColumns(todos = [], projects = []) {
  const columns = TASK_BOARD_COLUMNS.map((column) => ({ ...column, cards: [] }));
  const columnByKey = new Map(columns.map((column) => [column.key, column]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  todos.forEach((todo) => {
    const column = columnByKey.get(BOARD_COLUMN_BY_STATUS[todo.status]);
    if (!column) return;

    const project = projectById.get(todo.project);
    column.cards.push({
      id: todo.id,
      title: todo.title,
      tag: project?.tag || null,
      priority: todo.priority,
      project: project?.name || "미지정",
      due: todo.due,
    });
  });

  return columns;
}
