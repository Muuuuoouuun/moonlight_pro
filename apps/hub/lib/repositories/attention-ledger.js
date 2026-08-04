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

function mapTaskItems(todos, projects, todayKey, weekEndKey) {
  const projectById = new Map(
    (Array.isArray(projects) ? projects : []).map((p) => [p.id, p]),
  );
  return (Array.isArray(todos) ? todos : [])
    .filter((t) => !t.done)
    .map((t) => {
      const project = t.project ? projectById.get(t.project) : null;
      return {
        id: `task-${t.id}`,
        entityId: t.id,
        lane: "task",
        title: t.title || "제목 없음",
        // 내 작업의 할 일 편집 드로어가 설명을 보여주고 고칠 수 있도록 실어 보낸다 —
        // 없으면 드로어 저장이 기존 설명을 확인할 길 없이 진행된다.
        description: t.description || "",
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
        // tasks.project_id → 내 작업의 프로젝트 아코디언 그룹 + 상세 패널의 "프로젝트에서
        // 열기" 딥링크. 프로젝트 row가 ledger에 없으면 id만 남기고 이름은 비운다.
        projectId: t.project || null,
        projectName: project?.name || "",
        done: false,
      };
    });
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
      // Google Calendar's own event page — surfaced by the 내 작업 event popover as an
      // "열기" link. null when absent (ical fallback rows don't carry it).
      calendarLink: e.htmlLink || null,
      status: "scheduled",
      done: false,
    };
  });
}

// Deterministic today-priority, implementing operator-workflow-profile.md §4's 임시 우선순위
// (권장안 — this is the v1 ranking, expected to be tuned with real usage, not a 확정 formula):
//   1. 기한 지난 고객 약속   2. 오늘 확정된 일정/기한   3. 거래 종료에 가까운 고객
//   4. 다음 연락 시점 지난 고객(정체)   5. 일반 프로젝트·콘텐츠
// Items are classified top-down into score bands; inside the deal bands the pipeline stage
// rank and the linked lead's 0–100 follow-up score (momentumScore recompute output) break
// ties — this is where the deal pipeline and lead scoring feed today's ordering.
const STAGE_PRIORITY_RANK = { final: 5, quote: 4, consult: 3, contact: 2, potential: 1 };

function assignPriority(item, leadScoreByDealEntityId) {
  const leadScore = item.lane === "deal" ? leadScoreByDealEntityId.get(item.entityId) || 0 : 0;
  const stageRank = item.lane === "deal" ? STAGE_PRIORITY_RANK[item.status] || 0 : 0;

  // 1. 기한 지난 약속 — older overdue first (larger daysPast → higher).
  if (item.bucket === "overdue") {
    const daysPast = Math.min(90, Math.round((Date.now() - new Date(item.whenAt).getTime()) / DAY_MS) || 0);
    return { priorityScore: 5000 + daysPast * 10 + leadScore, priorityReason: "기한 지남" };
  }
  // 2. 오늘 확정 일정/기한 — earlier in the day first.
  if (item.bucket === "today") {
    const d = new Date(item.whenAt);
    const minutes = Number.isNaN(d.getTime()) ? 0 : d.getHours() * 60 + d.getMinutes();
    return { priorityScore: 4000 + (1440 - minutes), priorityReason: "오늘" };
  }
  // 3. 거래 종료에 가까운 고객 — 견적/최종미팅 딜, 리드 스코어로 동순위 분해.
  if (item.lane === "deal" && stageRank >= 4) {
    return {
      priorityScore: 3000 + stageRank * 100 + leadScore,
      priorityReason: `클로징 임박${leadScore ? ` · 스코어 ${leadScore}` : ""}`,
    };
  }
  // 4. 다음 연락 시점 지난 고객 — 초기 단계인데 정체된 딜.
  if (item.lane === "deal" && item.stalled) {
    return { priorityScore: 2000 + stageRank * 100 + leadScore, priorityReason: "연락 시점 지남" };
  }
  // 5. 일반 — 남은 딜은 단계·스코어 순, 할 일·일정은 그 아래에서 최근 활동순.
  if (item.lane === "deal") {
    return { priorityScore: 1500 + stageRank * 100 + leadScore, priorityReason: "일반 딜" };
  }
  return { priorityScore: 1000, priorityReason: "일반" };
}

export async function getAttentionLedger() {
  const now = new Date();
  const todayKey = dateKey(now);
  const weekEndKey = dateKey(new Date(now.getTime() + 6 * DAY_MS));
  const startOfTodayIso = new Date(`${todayKey}T00:00:00+09:00`).toISOString();
  const weekEndIso = new Date(now.getTime() + 7 * DAY_MS).toISOString();

  const [projectLedger, revenueLedger, calendar] = await Promise.all([
    getProjectLedger().catch(() => ({
      source: "error",
      error: "project-ledger-request-failed",
      failedSources: ["tasks"],
      todos: [],
    })),
    getRevenueLedger().catch(() => null),
    listGoogleCalendarEvents({ timeMin: startOfTodayIso, timeMax: weekEndIso, maxResults: 50 }).catch(
      () => ({ ok: false, reason: "calendar-read-failed", items: [] }),
    ),
  ]);

  const taskAggregationPartial = projectLedger?.source === "supabase"
    && projectLedger?.taskAggregation?.partial === true;
  const taskSourceState = projectLedger?.source === "error"
    ? "error"
    : projectLedger?.source === "supabase"
      ? taskAggregationPartial ? "partial" : "live"
      : "preview";
  const taskLedgerReadable = projectLedger?.source === "supabase";
  const taskFailedSources = projectLedger?.source === "error"
    ? Array.isArray(projectLedger?.failedSources) ? projectLedger.failedSources : ["tasks"]
    : taskAggregationPartial
      ? ["tasks"]
      : [];
  const sourceFailures = ["error", "partial"].includes(taskSourceState)
    ? [{
        source: "tasks",
        error: projectLedger?.source === "error"
          ? projectLedger.error || "project-ledger-core-read-failed"
          : "task-ledger-partial-read",
        failedSources: taskFailedSources,
      }]
    : [];
  const sources = {
    tasks: taskSourceState,
    deals: revenueLedger?.source === "supabase" ? "live" : "preview",
    calendar: calendar?.ok ? "live" : "preview",
  };

  // Deal entityId → linked lead's follow-up score (0–100). Deals carry lead_id; leads carry
  // the recomputed momentum score — this join is the pipeline↔lead-score bridge.
  const leadScoreById = new Map(
    (revenueLedger?.leads || [])
      .filter((l) => Number.isFinite(l.score))
      .map((l) => [l.id, Math.round(l.score)]),
  );
  const leadScoreByDealEntityId = new Map(
    (revenueLedger?.deals || [])
      .filter((d) => d.leadId && leadScoreById.has(d.leadId))
      .map((d) => [d.id, leadScoreById.get(d.leadId)]),
  );

  const items = [
    ...mapTaskItems(
      taskLedgerReadable ? projectLedger?.todos : [],
      projectLedger?.projects,
      todayKey,
      weekEndKey,
    ),
    ...mapDealItems(revenueLedger?.deals, revenueLedger?.stages, todayKey, weekEndKey),
    ...mapEventItems(calendar?.items, todayKey, weekEndKey),
  ].map((item) => ({ ...item, ...assignPriority(item, leadScoreByDealEntityId) }));

  return {
    todayKey,
    sources,
    failedSources: sourceFailures.map((failure) => failure.source),
    sourceFailures,
    calendarReason: calendar?.ok ? "" : calendar?.reason || "",
    items,
    // My Work의 할 일 편집 드로어가 프로젝트 재배정 select를 채우는 용도 — id/name만
    // 필요하니 프로젝트 원장 전체를 다시 내려보내지 않는다.
    projects: taskLedgerReadable
      ? (Array.isArray(projectLedger?.projects) ? projectLedger.projects.map((p) => ({ id: p.id, name: p.name })) : [])
      : [],
  };
}
