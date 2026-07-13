export const DEFAULT_TASK_TIMEZONE = "Asia/Seoul";
export const TASK_LANES = ["missed", "today", "waiting", "inbox"];

const LANE_ORDER = new Map(TASK_LANES.map((lane, index) => [lane, index]));
const PRIORITY_ORDER = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["med", 2],
  ["low", 3],
]);

export function resolveTaskTimezone(value) {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_TASK_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_TASK_TIMEZONE;
  }
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function localDateKey(value, timeZone) {
  const valueTimestamp = timestamp(value);
  if (valueTimestamp == null) return null;

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(valueTimestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.year) * 10_000 + Number(values.month) * 100 + Number(values.day);
}

function duePrecision(task) {
  const value = task?.duePrecision || task?.meta?.due_precision;
  if (value === "timed" || value === "date" || value === "none") return value;
  return task?.dueAt ? "timed" : "none";
}

export function resolveTaskLane(task, now = new Date(), workspaceTimeZone = DEFAULT_TASK_TIMEZONE) {
  if (!task || task.status === "done") return null;

  const timeZone = resolveTaskTimezone(workspaceTimeZone);
  const nowTimestamp = timestamp(now);
  if (nowTimestamp == null) return null;

  const dueTimestamp = timestamp(task.dueAt);
  const precision = duePrecision(task);
  const todayKey = localDateKey(nowTimestamp, timeZone);
  const dueDateKey = dueTimestamp == null ? null : localDateKey(dueTimestamp, timeZone);
  const isMissed =
    (precision === "timed" && dueTimestamp != null && dueTimestamp < nowTimestamp) ||
    (precision === "date" && dueDateKey != null && todayKey != null && dueDateKey < todayKey);

  if (isMissed) return "missed";
  if (task.status === "blocked" || task.status === "doing") return "waiting";
  if (dueDateKey != null && dueDateKey === todayKey) return "today";
  if (task.status === "inbox") return "inbox";
  return null;
}

function compareNullableTimestamps(left, right) {
  const leftTimestamp = timestamp(left) ?? Number.POSITIVE_INFINITY;
  const rightTimestamp = timestamp(right) ?? Number.POSITIVE_INFINITY;
  return leftTimestamp - rightTimestamp;
}

export function sortTasksForAttention(
  tasks,
  now = new Date(),
  workspaceTimeZone = DEFAULT_TASK_TIMEZONE,
) {
  const timeZone = resolveTaskTimezone(workspaceTimeZone);

  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => ({ task, lane: resolveTaskLane(task, now, timeZone) }))
    .filter((item) => item.lane)
    .sort((left, right) => {
      const leftPriority = left.task.priorityKey || left.task.canonicalPriority || left.task.priority;
      const rightPriority = right.task.priorityKey || right.task.canonicalPriority || right.task.priority;

      return (
        (LANE_ORDER.get(left.lane) ?? 99) - (LANE_ORDER.get(right.lane) ?? 99) ||
        (PRIORITY_ORDER.get(leftPriority) ?? 99) - (PRIORITY_ORDER.get(rightPriority) ?? 99) ||
        compareNullableTimestamps(left.task.dueAt, right.task.dueAt) ||
        compareNullableTimestamps(left.task.createdAt, right.task.createdAt) ||
        String(left.task.id || "").localeCompare(String(right.task.id || ""))
      );
    })
    .map((item) => item.task);
}

export function buildTaskLanes(
  tasks,
  now = new Date(),
  workspaceTimeZone = DEFAULT_TASK_TIMEZONE,
) {
  const lanes = Object.fromEntries(TASK_LANES.map((lane) => [lane, []]));

  for (const task of sortTasksForAttention(tasks, now, workspaceTimeZone)) {
    const lane = resolveTaskLane(task, now, workspaceTimeZone);
    if (lane) lanes[lane].push(task);
  }

  return lanes;
}
