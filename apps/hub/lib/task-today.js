const LANE_RANK = {
  missed: 0,
  today: 1,
  waiting: 2,
  inbox: 3,
};

const LANE_LABEL = {
  missed: "놓침",
  today: "오늘",
  waiting: "대기",
  inbox: "정리 전",
};

const PRIORITY_RANK = {
  critical: 0,
  high: 0,
  medium: 1,
  med: 1,
  low: 2,
};

function dateKey(value, timeZone) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function laneForTask(task, todayKey, timeZone) {
  const status = String(task?.status || "").toLowerCase();
  if (task?.done === true || status === "done") return null;

  const dueKey = dateKey(task?.dueAt, timeZone);
  if (dueKey && dueKey < todayKey) return "missed";
  if (dueKey === todayKey) return "today";
  if (status === "doing") return "today";
  if (status === "blocked") return "waiting";
  if (status === "inbox") return "inbox";
  return null;
}

function descendingTime(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildTaskToday(
  todos = [],
  { now = new Date(), timeZone = "Asia/Seoul", limit = 5 } = {},
) {
  const todayKey = dateKey(now, timeZone);
  const candidates = (Array.isArray(todos) ? todos : [])
    .map((task) => {
      const lane = laneForTask(task, todayKey, timeZone);
      if (!lane) return null;
      return {
        ...task,
        lane,
        laneLabel: LANE_LABEL[lane],
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const laneDelta = LANE_RANK[left.lane] - LANE_RANK[right.lane];
      if (laneDelta) return laneDelta;

      const priorityDelta = (PRIORITY_RANK[left.priority] ?? 1) - (PRIORITY_RANK[right.priority] ?? 1);
      if (priorityDelta) return priorityDelta;

      const dueDelta = dateKey(left.dueAt, timeZone).localeCompare(dateKey(right.dueAt, timeZone));
      if (dueDelta) return dueDelta;

      const updatedDelta = descendingTime(right.updatedAt) - descendingTime(left.updatedAt);
      if (updatedDelta) return updatedDelta;

      return String(left.id).localeCompare(String(right.id));
    });

  const counts = {
    total: candidates.length,
    shown: Math.min(candidates.length, Math.max(0, limit)),
    missed: candidates.filter((task) => task.lane === "missed").length,
    today: candidates.filter((task) => task.lane === "today").length,
    waiting: candidates.filter((task) => task.lane === "waiting").length,
    inbox: candidates.filter((task) => task.lane === "inbox").length,
  };

  return {
    items: candidates.slice(0, counts.shown),
    counts,
    hiddenCount: counts.total - counts.shown,
  };
}

export function isDurableTaskUpdateResult(result) {
  return result?.status === "saved";
}
