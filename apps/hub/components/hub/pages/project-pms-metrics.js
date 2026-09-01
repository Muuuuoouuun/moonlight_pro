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

// 요약 4칸과 클릭 필터가 같은 술어를 쓰기 위한 공유 분류기 (2026-08-19 PMS 디벨롭).
// 숫자와 필터된 행 수가 어긋나면 요약을 믿을 수 없게 되므로 반드시 이 함수 하나만 쓴다.
export function portfolioWindow(today = new Date()) {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const now = todayStart.getTime();
  return { now, soon: now + (7 * DAY_MS) };
}

export function classifyProjectPortfolio(project, { now, soon }) {
  const status = normalizedStatus(project);
  const terminal = TERMINAL_PROJECT_STATUSES.has(status);
  const due = validDate(project?.dueAt);
  const overdue = !terminal && due && due.getTime() < now;
  const progress = project?.displayProgress;
  return {
    active: status === "active" || status === "in progress",
    blockedOrOverdue: Boolean(!terminal && (status === "blocked" || overdue)),
    dueSoon: Boolean(!terminal && due && due.getTime() >= now && due.getTime() < soon),
    unmeasured: Boolean(!Number.isFinite(progress?.value) || progress?.partial),
  };
}

export function buildProjectPortfolioMetrics(projects = [], {
  today = new Date(),
  sourceState = "live",
  projectCorePartial = false,
} = {}) {
  if (!["live", "partial"].includes(sourceState)) return null;
  if (!Array.isArray(projects) || projects.length === 0) {
    if (projectCorePartial) {
      return {
        empty: false,
        active: 0,
        blockedOrOverdue: 0,
        dueSoon: 0,
        unmeasured: 0,
        lowerBound: true,
      };
    }
    return { empty: true, active: null, blockedOrOverdue: null, dueSoon: null, unmeasured: null };
  }

  const window = portfolioWindow(today);

  let active = 0;
  let blockedOrOverdue = 0;
  let dueSoon = 0;
  let unmeasured = 0;

  projects.forEach((project) => {
    const flags = classifyProjectPortfolio(project, window);
    if (flags.active) active += 1;
    if (flags.blockedOrOverdue) blockedOrOverdue += 1;
    if (flags.dueSoon) dueSoon += 1;
    if (flags.unmeasured) unmeasured += 1;
  });

  return {
    empty: false,
    active,
    blockedOrOverdue,
    dueSoon,
    unmeasured,
    ...(projectCorePartial ? { lowerBound: true } : {}),
  };
}
