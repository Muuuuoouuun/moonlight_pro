// Cross-lane attention read model — the TODOS.md P1 "Today Actions" contract, assembled
// per request from the existing ledgers (deep-design premise 3: no new universal table).
//
// Three lanes for v1: tasks (operating-ledger todos), deals (revenue-ledger open deals),
// events (Google Calendar next 7 days). Each source reports its own live/preview status —
// callers must not collapse them into one badge (a disconnected calendar must not mark
// live tasks as preview, and vice versa).
//
// Item contract (minimal on purpose — the surface shows 핵심 정보만):
//   { id, lane: 'task'|'deal'|'event', title, bucket: 'overdue'|'today'|'week'|'later',
//     whenAt, whenLabel, recencyAt, meta, href, status, done }
// `href` is a hub deep-link (deals open their native drawer); tasks carry `status` so the
// list can complete them durably through PATCH /api/hub/tasks.

import { getProjectLedger } from "./operating-ledger";
import { getRevenueLedger } from "./revenue-ledger";
import { listGoogleCalendarEvents } from "../google-calendar";

const TIME_ZONE = "Asia/Seoul";
const DAY_MS = 86400000;

function dateKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA gives YYYY-MM-DD
}

function bucketFor(whenAt, todayKey, weekEndKey) {
  const key = dateKey(whenAt);
  if (!key) return "later";
  if (key < todayKey) return "overdue";
  if (key === todayKey) return "today";
  if (key <= weekEndKey) return "week";
  return "later";
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function moneyLabel(amount) {
  const n = Number(amount) || 0;
  if (n >= 1000000) return `₩${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₩${Math.round(n / 1000)}K`;
  return n > 0 ? `₩${n}` : "";
}

function mapTaskItems(todos, todayKey, weekEndKey) {
  return (Array.isArray(todos) ? todos : [])
    .filter((t) => !t.done)
    .map((t) => ({
      id: `task-${t.id}`,
      entityId: t.id,
      lane: "task",
      title: t.title || "제목 없음",
      bucket: bucketFor(t.dueAt, todayKey, weekEndKey),
      whenAt: t.dueAt || "",
      whenLabel: t.dueAt ? shortDate(t.dueAt) : "기한 없음",
      recencyAt: t.updatedAt || "",
      meta: t.priority === "high" ? t.priority : "",
      href: null,
      status: t.status || "todo",
      // priorityRaw (low/medium/high/critical) — the engine's actual enum. Using the lossy
      // display `priority` (med/high/low) here would round-trip badly: a re-save without
      // touching priority would send "med", which fails update_task's PRIORITIES check.
      priority: t.priorityRaw || "medium",
      done: false,
    }));
}

function mapDealItems(deals, stages, todayKey, weekEndKey) {
  const stageLabel = new Map((Array.isArray(stages) ? stages : []).map((s) => [s.key, s.label]));
  return (Array.isArray(deals) ? deals : [])
    .filter((d) => d.stage !== "closing" && d.stage !== "lost")
    .map((d) => {
      const stalled = Number(d.age) >= 14;
      return {
        id: `deal-${d.id}`,
        entityId: d.id,
        lane: "deal",
        title: d.name || "Untitled deal",
        bucket: bucketFor(d.closeAt, todayKey, weekEndKey),
        whenAt: d.closeAt || "",
        whenLabel: d.closeAt ? shortDate(d.closeAt) : "마감 미정",
        recencyAt: d.activityAt || "",
        meta: [stageLabel.get(d.stage) || d.stage, moneyLabel(d.value), stalled ? `${d.age}d 정체` : ""]
          .filter(Boolean)
          .join(" · "),
        stalled,
        href: `dashboard/revenue/deals?deal=${encodeURIComponent(d.id)}`,
        status: d.stage,
        done: false,
      };
    });
}

function mapEventItems(events, todayKey, weekEndKey) {
  return (Array.isArray(events) ? events : []).map((e, i) => {
    const start = e.start?.dateTime || e.start?.date || "";
    const end = e.end?.dateTime || "";
    const allDay = Boolean(e.start?.date && !e.start?.dateTime);
    return {
      id: `event-${e.id || i}`,
      entityId: e.id || String(i),
      lane: "event",
      title: e.summary || "(제목 없는 일정)",
      bucket: bucketFor(start, todayKey, weekEndKey),
      whenAt: start,
      whenLabel: allDay
        ? `${shortDate(start)} 종일`
        : `${shortDate(start)} ${timeLabel(start)}${end ? `–${timeLabel(end)}` : ""}`,
      recencyAt: start,
      meta: e.location || "",
      href: null,
      status: "scheduled",
      done: false,
    };
  });
}

export async function getAttentionLedger() {
  const now = new Date();
  const todayKey = dateKey(now);
  const weekEndKey = dateKey(new Date(now.getTime() + 6 * DAY_MS));
  const startOfTodayIso = new Date(`${todayKey}T00:00:00+09:00`).toISOString();
  const weekEndIso = new Date(now.getTime() + 7 * DAY_MS).toISOString();

  const [projectLedger, revenueLedger, calendar] = await Promise.all([
    getProjectLedger().catch(() => null),
    getRevenueLedger().catch(() => null),
    listGoogleCalendarEvents({ timeMin: startOfTodayIso, timeMax: weekEndIso, maxResults: 50 }).catch(
      () => ({ ok: false, reason: "calendar-read-failed", items: [] }),
    ),
  ]);

  const sources = {
    tasks: projectLedger?.source === "supabase" ? "live" : "preview",
    deals: revenueLedger?.source === "supabase" ? "live" : "preview",
    calendar: calendar?.ok ? "live" : "preview",
  };

  const items = [
    ...mapTaskItems(projectLedger?.todos, todayKey, weekEndKey),
    ...mapDealItems(revenueLedger?.deals, revenueLedger?.stages, todayKey, weekEndKey),
    ...mapEventItems(calendar?.items, todayKey, weekEndKey),
  ];

  return {
    todayKey,
    sources,
    calendarReason: calendar?.ok ? "" : calendar?.reason || "",
    items,
  };
}
