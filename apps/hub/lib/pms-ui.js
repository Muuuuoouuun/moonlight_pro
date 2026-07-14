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

export function buildProjectDraft({ brandId = null, brandKey = "all", initialStatus = "Planning" } = {}) {
  return {
    kind: "project",
    isNew: true,
    title: "새 프로젝트",
    brandId,
    brandKey,
    summary: "",
    status: PROJECT_STATUS_BY_LABEL[initialStatus] || "active",
    priority: "medium",
    progress: 0,
    nextAction: "",
    dueAt: "",
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
