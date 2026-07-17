const DAY_MS = 86_400_000;
const TERMINAL_PROJECT_STATUSES = new Set([
  "done",
  "completed",
  "archived",
  "cancelled",
  "canceled",
]);

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedStatus(project) {
  return String(project?.statusKey || project?.status || "").trim().toLowerCase();
}

export function buildProjectPortfolioMetrics(projects = [], {
  today = new Date(),
  sourceState = "live",
} = {}) {
  if (!["live", "partial"].includes(sourceState)) return null;
  if (!Array.isArray(projects) || projects.length === 0) {
    return { empty: true, active: null, blockedOrOverdue: null, dueSoon: null, unmeasured: null };
  }

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const dueSoonEnd = new Date(todayStart.getTime() + (7 * DAY_MS));
  const now = todayStart.getTime();
  const soon = dueSoonEnd.getTime();

  let active = 0;
  let blockedOrOverdue = 0;
  let dueSoon = 0;
  let unmeasured = 0;

  projects.forEach((project) => {
    const status = normalizedStatus(project);
    const terminal = TERMINAL_PROJECT_STATUSES.has(status);
    const due = validDate(project.dueAt);
    const overdue = !terminal && due && due.getTime() < now;
    const progress = project.displayProgress;

    if (status === "active" || status === "in progress") active += 1;
    if (!terminal && (status === "blocked" || overdue)) blockedOrOverdue += 1;
    if (!terminal && due && due.getTime() >= now && due.getTime() < soon) dueSoon += 1;
    if (!Number.isFinite(progress?.value) || progress?.partial) unmeasured += 1;
  });

  return { empty: false, active, blockedOrOverdue, dueSoon, unmeasured };
}
