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
  brandId = null,
  brandKey = "all",
  clientId = createClientId(),
  initialStatus = "Planning",
} = {}) {
  return {
    kind: "project",
    isNew: true,
    clientId,
    title: "",
    brandId,
    brandKey,
    summary: "",
    status: PROJECT_STATUS_BY_LABEL[initialStatus] || "draft",
    priority: "medium",
    nextAction: "",
    dueAt: "",
  };
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

// Timeline (Gantt-lite) layout for the Projects timeline view. Only projects with a
// due date are placed on the axis — a project's `created_at` isn't an operator-set
// start date, so it's used only as the bar's left edge, never fabricated when missing.
// Projects without `dueAt` are returned separately (`undated`) for a plain list below
// the axis rather than guessing a position for them.
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
    const created = toDayStart(project.createdAt);
    const start = created && created.getTime() <= due.getTime() ? created : due;
    dated.push({ project, start, end: due });
  });

  if (dated.length === 0) {
    return { windowStart: todayStart, windowEnd: todayStart, totalDays: 0, today: todayStart, todayPct: 0, items: [], undated };
  }

  const earliestStart = new Date(Math.min(...dated.map((d) => d.start.getTime())));
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
    .map(({ project, start, end }) => {
      const visStartMs = Math.max(start.getTime(), windowStartMs);
      const visEndMs = Math.min(end.getTime(), windowEndMs);
      const startOffsetDays = (visStartMs - windowStartMs) / MS_PER_DAY;
      const spanDays = Math.max(0.4, (visEndMs - visStartMs) / MS_PER_DAY);
      return {
        project,
        startPct: (startOffsetDays / totalDays) * 100,
        widthPct: (spanDays / totalDays) * 100,
        overdue: end.getTime() < todayStart.getTime(),
        clippedStart: start.getTime() < windowStartMs,
        clippedEnd: end.getTime() > windowEndMs,
      };
    })
    .sort((a, b) => a.startPct - b.startPct);

  const todayPct = Math.max(0, Math.min(100, ((todayStart.getTime() - windowStartMs) / MS_PER_DAY / totalDays) * 100));

  return { windowStart, windowEnd, totalDays, today: todayStart, todayPct, items, undated };
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
