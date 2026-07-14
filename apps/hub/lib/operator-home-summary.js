// Pure read-model helpers for compact operator-home summaries.

const PROJECT_SERIES = [
  { key: "planning", label: "계획", statuses: new Set(["Planning"]) },
  { key: "active", label: "진행", statuses: new Set(["In progress"]) },
  { key: "review", label: "검토", statuses: new Set(["Review"]) },
  { key: "blocked", label: "막힘", statuses: new Set(["Blocked"]) },
  { key: "done", label: "완료", statuses: new Set(["Done"]) },
  { key: "backlog", label: "보관", statuses: new Set(["Backlog"]) },
];

const CONTENT_SERIES = [
  { key: "idea", label: "아이디어" },
  { key: "draft", label: "제작" },
  { key: "review", label: "검토" },
  { key: "scheduled", label: "대기" },
  { key: "published", label: "발행" },
];

function countBy(values, predicate) {
  return values.reduce((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

function buildPmsSummary(ledger) {
  const projects = Array.isArray(ledger.projects) ? ledger.projects : [];
  const todos = Array.isArray(ledger.todos) ? ledger.todos : [];
  const completedTasks = countBy(todos, (todo) => todo?.done === true);
  const openTasks = todos.length - completedTasks;

  return {
    totalProjects: projects.length,
    activeProjects: countBy(projects, (project) => !["Done", "Backlog"].includes(project?.status)),
    blockedProjects: countBy(projects, (project) => project?.status === "Blocked"),
    openTasks,
    dueTodayTasks: countBy(todos, (todo) => todo?.done !== true && todo?.bucket === "오늘"),
    completedTasks,
    taskCompletionRate: todos.length ? Math.round((completedTasks / todos.length) * 100) : 0,
    projectStatusSeries: PROJECT_SERIES.map(({ key, label, statuses }) => ({
      key,
      label,
      value: countBy(projects, (project) => statuses.has(project?.status)),
    })),
    taskStatusSeries: [
      { key: "open", label: "열림", value: openTasks },
      { key: "done", label: "완료", value: completedTasks },
    ],
  };
}

function buildContentSummary(ledger) {
  const items = Array.isArray(ledger.items) ? ledger.items : [];
  const publishLogs = Array.isArray(ledger.publishLogs) ? ledger.publishLogs : [];
  const statusOf = (item) => item?.statusKey || item?.status;

  return {
    totalItems: items.length,
    ideas: countBy(items, (item) => statusOf(item) === "idea"),
    inProduction: countBy(items, (item) => ["draft", "review"].includes(statusOf(item))),
    scheduled: countBy(items, (item) => statusOf(item) === "scheduled"),
    published: countBy(items, (item) => statusOf(item) === "published"),
    failed: countBy(publishLogs, (log) => log?.status === "failed"),
    pipelineSeries: CONTENT_SERIES.map(({ key, label }) => ({
      key,
      label,
      value: countBy(items, (item) => statusOf(item) === key),
    })),
  };
}

function ledgerState(ledger) {
  if (ledger?.source === "supabase") return "live";
  if (ledger?.source === "error" || ledger?.status === "error") return "error";
  return "preview";
}

function combinedState(states) {
  const liveCount = states.filter((state) => state === "live").length;
  if (liveCount === states.length) return "live";
  if (liveCount > 0) return "partial";
  return states.includes("error") ? "error" : "preview";
}

export function buildOperatorHomeSummary({ projects = {}, content = {} } = {}) {
  const sources = {
    projects: ledgerState(projects),
    content: ledgerState(content),
  };

  return {
    state: combinedState(Object.values(sources)),
    sources,
    pms: sources.projects === "live" ? buildPmsSummary(projects) : null,
    content: sources.content === "live" ? buildContentSummary(content) : null,
  };
}
