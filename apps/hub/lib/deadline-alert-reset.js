const TIME_ZONE = "Asia/Seoul";
const KINDS = new Set(["task", "deal", "project"]);

export function deadlineDayKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function weekStartDayKey(now = new Date()) {
  const today = deadlineDayKey(now);
  if (!today) return "";
  const midnight = new Date(`${today}T00:00:00Z`);
  const daysSinceMonday = (midnight.getUTCDay() + 6) % 7;
  midnight.setUTCDate(midnight.getUTCDate() - daysSinceMonday);
  return midnight.toISOString().slice(0, 10);
}

export function readDeadlineAlertReset(meta) {
  const value = meta?.deadline_alert_reset;
  if (!value || typeof value !== "object" || !Array.isArray(value.items)) return null;
  return {
    resetAt: typeof value.resetAt === "string" ? value.resetAt : "",
    beforeDay: typeof value.beforeDay === "string" ? value.beforeDay : "",
    items: value.items.filter((item) =>
      item && KINDS.has(item.kind) && typeof item.id === "string" && typeof item.dueAt === "string"),
  };
}

export function isDeadlineAlertSuppressed(reset, kind, id, dueAt) {
  if (!dueAt || !id || !KINDS.has(kind) || !reset?.items) return false;
  return reset.items.some((item) =>
    item.kind === kind && item.id === id && item.dueAt === dueAt);
}

export function collectLegacyDeadlines({ tasks = [], deals = [], projects = [] }, beforeDay) {
  const items = [];
  const add = (kind, row, field) => {
    const dueAt = row?.[field];
    const day = deadlineDayKey(dueAt);
    if (row?.id && typeof dueAt === "string" && day && day < beforeDay) {
      items.push({ kind, id: row.id, dueAt });
    }
  };
  tasks.filter((row) => !["done", "completed", "archived"].includes(String(row.status || "").toLowerCase()))
    .forEach((row) => add("task", row, "due_at"));
  deals.filter((row) => ![row?.stage, row?.meta?.stage_detail]
    .some((stage) => ["won", "lost", "closing"].includes(String(stage || "").toLowerCase())))
    .forEach((row) => add("deal", row, "expected_close_at"));
  projects.filter((row) => !["completed", "archived"].includes(String(row.status || "").toLowerCase()))
    .forEach((row) => add("project", row, "due_at"));
  return items;
}
