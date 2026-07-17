// Follow-up engine (v1.3) — "오늘 연락할 사람 + 채널 + 왜 + 다음행동", now with upcoming
// schedule alongside overdue. Three sources feed one list:
//   1. Reactive — stale leads/open deals past their staleness threshold (bucket: overdue).
//   2. Proactive — leads/deals the operator gave an explicit meta.next_action_at on their last
//      contact (bucket: today/week, within the next 7 days). A record marked meta.dormant
//      ("기약 없음") is hidden until DORMANT_RESURFACE_DAYS have passed, then resurfaces as
//      an overdue recheck.
//   3. Calendar — the Google Calendar week ahead (already-scheduled meetings), read-only via
//      the same listGoogleCalendarEvents reader attention-ledger.js uses for its own view.
//      No CRM matching attempted — shown as-is (bucket: today/week).
//
// This reads existing data only (no new migration for leads/deals — meta jsonb already
// exists; outreach_outcomes gained a `meta` column in migration 0015 for structured reaction).
//
// Channels follow the real motion (NO email): early=전화/문자, mid=방문, 고객=카톡.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from "@/lib/server-write";
import { listGoogleCalendarEvents } from "@/lib/google-calendar";

import { momentumScore, outcomeBoost, priorityFor, shouldResurfaceDormant } from "@/lib/sales-os/followup-scoring";

const TIME_ZONE = "Asia/Seoul";
const DAY_MS = 86400000;
const WEEK_AHEAD_DAYS = 7;
const BUCKET_RANK = { overdue: 0, today: 1, week: 2 };

// Days since last touch before a stage is "overdue".
const STALE_DAYS = { new: 2, qualified: 3, nurturing: 4, contact: 4, proposal: 3, negotiation: 2 };
const DEFAULT_STALE = 3;

// Stage → suggested channel (real motion, no email).
function channelFor(stage) {
  const s = String(stage || "").toLowerCase();
  if (["won", "customer", "closed"].includes(s)) return "카톡";
  if (["proposal", "negotiation", "prop", "neg"].includes(s)) return "방문";
  return "전화/문자";
}

function daysSince(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function readMeta(row) {
  return row?.meta && typeof row.meta === "object" ? row.meta : {};
}

function dateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Bucket for a future-facing date (scheduled next-action or calendar event) against the
// 7-day window this list covers. Returns null when the date has already passed (not
// "upcoming" anymore — a scheduled item that slipped becomes the operator's overdue problem,
// not this function's) or falls beyond the window (out of scope for this list, for now).
function upcomingBucket(whenAt, todayKey, weekEndKey) {
  const key = dateKey(whenAt);
  if (!key || key < todayKey) return null;
  if (key === todayKey) return "today";
  return key <= weekEndKey ? "week" : null;
}

// Bucket for an operator-set meta.next_action_at — this is the authoritative signal once set,
// so it's checked *before* the generic staleness threshold below (nothing else resets that
// threshold's clock, so without this override a lead the operator just scheduled 3 days out
// would still read as overdue today). A slipped date (already past) becomes genuinely overdue;
// far-future dates fall outside this list's 7-day window and are excluded for now.
function bucketForNextAction(nextActionAt, todayKey, weekEndKey) {
  const key = dateKey(nextActionAt);
  if (!key) return null;
  if (key < todayKey) return "overdue";
  if (key === todayKey) return "today";
  return key <= weekEndKey ? "week" : null;
}

function shortWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TIME_ZONE, month: "numeric", day: "numeric" }).format(date);
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

// Ascending within a bucket: overdue sorts by priority (most urgent first), scheduled/event
// sorts by nearest date first. Mirrors my-work.jsx's BUCKET_RANK convention so the two
// cross-lane surfaces don't drift into different mental models (DESIGN.md §8.1).
function compareItems(a, b) {
  const rankDiff = (BUCKET_RANK[a.bucket] ?? 3) - (BUCKET_RANK[b.bucket] ?? 3);
  if (rankDiff !== 0) return rankDiff;
  if (a.bucket === "overdue") return (b.priority ?? 0) - (a.priority ?? 0);
  return new Date(a.whenAt || 0).getTime() - new Date(b.whenAt || 0).getTime();
}

export async function getFollowups({ workspaceId = resolveDefaultWorkspaceId(), limit = 25 } = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), items: [], summary: { overdue: 0, dueToday: 0, scheduled: 0, events: 0, total: 0 } };
  }

  const now = new Date();
  const todayKey = dateKey(now);
  const weekEndKey = dateKey(new Date(now.getTime() + WEEK_AHEAD_DAYS * DAY_MS));
  const weekEndIso = new Date(now.getTime() + WEEK_AHEAD_DAYS * DAY_MS).toISOString();

  const [leads, deals, companies, outcomes, calendar] = await Promise.all([
    fetchSupabaseRows("leads", {
      filters: withWorkspaceFilter([["status", inFilter(["new", "qualified", "nurturing"])]]),
      order: "last_touch_at.asc.nullsfirst",
      limit: 300,
    }),
    fetchSupabaseRows("deals", {
      filters: withWorkspaceFilter([["stage", inFilter(["prospect", "proposal", "negotiation", "lead", "qualified", "qual", "neg", "prop"])]]),
      order: "updated_at.asc.nullsfirst",
      limit: 300,
    }),
    fetchSupabaseRows("companies", { filters: withWorkspaceFilter(), limit: 1000 }),
    fetchSupabaseRows("outreach_outcomes", { filters: withWorkspaceFilter(), order: "occurred_at.desc", limit: 500 }),
    listGoogleCalendarEvents({ workspaceId, timeMin: now.toISOString(), timeMax: weekEndIso, maxResults: 30 }).catch(
      () => ({ ok: false, reason: "calendar-read-failed", items: [] }),
    ),
  ]);

  if (!leads && !deals) {
    return { source: "preview", configured: true, items: [], summary: { overdue: 0, dueToday: 0, scheduled: 0, events: 0, total: 0 } };
  }

  const companyById = new Map((companies || []).map((c) => [c.id, c]));
  // last outcome per lead and per company
  const lastOutcomeByLead = new Map();
  const lastOutcomeByCompany = new Map();
  (outcomes || []).forEach((o) => {
    if (o.lead_id && !lastOutcomeByLead.has(o.lead_id)) lastOutcomeByLead.set(o.lead_id, o);
    if (o.company_id && !lastOutcomeByCompany.has(o.company_id)) lastOutcomeByCompany.set(o.company_id, o);
  });

  const items = [];

  // Leads (funnel entry follow-ups)
  (leads || []).forEach((lead) => {
    const company = lead.company_id ? companyById.get(lead.company_id) : null;
    const stage = String(lead.status || "new").toLowerCase();
    const touch = lead.last_touch_at || lead.updated_at || lead.created_at;
    const since = daysSince(touch);
    const threshold = STALE_DAYS[stage] ?? DEFAULT_STALE;
    const stale = since == null || since >= threshold;

    const meta = readMeta(lead);
    const dormant = meta.dormant === true;
    const dormantSinceDays = dormant ? daysSince(meta.dormant_since) : null;
    const resurfaced = dormant && shouldResurfaceDormant(dormantSinceDays);

    let bucket = null;
    let dormantWhy = "";
    let slipped = false; // an explicit next_action_at that already passed
    if (dormant && !resurfaced) return; // 기약 없음, not due for recheck yet — hidden on purpose
    if (dormant && resurfaced) {
      bucket = "overdue";
      dormantWhy = `기약 없음 · ${dormantSinceDays}일째 재확인 대상`;
    } else if (meta.next_action_at) {
      // Authoritative once set — overrides the generic staleness threshold below (nothing
      // else resets that clock, so a lead scheduled 3 days out must not still read overdue).
      bucket = bucketForNextAction(meta.next_action_at, todayKey, weekEndKey);
      if (!bucket) return; // scheduled outside the 7-day window this list covers
      slipped = bucket === "overdue";
    } else if (stale) {
      bucket = "overdue";
    } else {
      return; // neither stale nor scheduled — nothing to do yet
    }

    const outcome = lastOutcomeByLead.get(lead.id) || (lead.company_id && lastOutcomeByCompany.get(lead.company_id));
    const outcomeAge = outcome ? daysSince(outcome.occurred_at) : null;
    const why = dormantWhy || (slipped
      ? `${shortWhen(meta.next_action_at)} 연락 예정이었음 · 지남`
      : bucket === "overdue"
        ? (outcome ? `마지막 ${outcome.action} ${outcomeAge ?? "?"}일 전 · ${stage}` : `${since == null ? "무접촉" : `${since}일째 무접촉`} · ${stage}`)
        : `${shortWhen(meta.next_action_at)} 연락 예정 · ${stage}`);

    const boost = outcomeBoost({ action: outcome?.action, ageDays: outcomeAge });

    items.push({
      kind: "lead",
      id: lead.id,
      name: lead.name || company?.name || "이름미상",
      company: company?.name || null,
      // The activity panel joins history on this, NOT on the lead/deal id: crm_activities
      // carries company_id on 109 of its 110 live rows but lead_id on 1 and deal_id on 0 —
      // the history was written against the company/account, so it's the only usable key.
      companyId: lead.company_id || null,
      phone: company?.phone || meta.phone || null,
      stage,
      channel: channelFor(stage),
      why,
      bucket,
      whenAt: bucket === "overdue" ? null : meta.next_action_at,
      daysSince: since,
      nextAction: lead.next_action || "다음 행동 정하기",
      score: toNum(lead.score, 0),
      lastAction: outcome?.action || null,
      lastNote: outcome?.note || null,
      lastReaction: outcome?.meta?.reaction || null,
      momentum: Math.round(boost),
      priority: priorityFor({ sinceDays: since, threshold, valueTerm: toNum(lead.score, 0) / 10, boost }),
      href: `dashboard/revenue/leads?lead=${encodeURIComponent(lead.id)}`,
    });
  });

  // Open deals (stage-based follow-ups)
  (deals || []).forEach((deal) => {
    const company = deal.company_id ? companyById.get(deal.company_id) : null;
    const stage = String(deal.stage || "prospect").toLowerCase();
    const touch = deal.last_activity_at || deal.updated_at || deal.created_at;
    const since = daysSince(touch);
    const threshold = STALE_DAYS[stage] ?? DEFAULT_STALE;
    const stale = since != null && since >= threshold ? true : since == null;

    const meta = readMeta(deal);
    const dormant = meta.dormant === true;
    const dormantSinceDays = dormant ? daysSince(meta.dormant_since) : null;
    const resurfaced = dormant && shouldResurfaceDormant(dormantSinceDays);

    let bucket = null;
    let dormantWhy = "";
    let slipped = false;
    if (dormant && !resurfaced) return;
    if (dormant && resurfaced) {
      bucket = "overdue";
      dormantWhy = `기약 없음 · ${dormantSinceDays}일째 재확인 대상`;
    } else if (meta.next_action_at) {
      bucket = bucketForNextAction(meta.next_action_at, todayKey, weekEndKey);
      if (!bucket) return;
      slipped = bucket === "overdue";
    } else if (stale) {
      bucket = "overdue";
    } else {
      return;
    }

    const outcome = deal.company_id && lastOutcomeByCompany.get(deal.company_id);
    const outcomeAge = outcome ? daysSince(outcome.occurred_at) : null;
    const why = dormantWhy || (slipped
      ? `${shortWhen(meta.next_action_at)} 연락 예정이었음 · 지남`
      : bucket === "overdue"
        ? (outcome ? `마지막 ${outcome.action} ${outcomeAge ?? "?"}일 전 · ${stage}` : `${since == null ? "활동 없음" : `${since}일째 정체`} · ${stage}`)
        : `${shortWhen(meta.next_action_at)} 연락 예정 · ${stage}`);

    const boost = outcomeBoost({ action: outcome?.action, ageDays: outcomeAge });

    items.push({
      kind: "deal",
      id: deal.id,
      name: deal.title || company?.name || "딜",
      company: company?.name || null,
      companyId: deal.company_id || null,
      phone: company?.phone || null,
      stage,
      channel: channelFor(stage),
      why,
      bucket,
      whenAt: bucket === "overdue" ? null : meta.next_action_at,
      daysSince: since,
      nextAction: "단계 진전 액션 정하기",
      amount: toNum(deal.amount, 0),
      lastAction: outcome?.action || null,
      lastNote: outcome?.note || null,
      lastReaction: outcome?.meta?.reaction || null,
      momentum: Math.round(boost),
      priority: priorityFor({ sinceDays: since, threshold, valueTerm: toNum(deal.amount, 0) / 1000000, boost }),
      href: `dashboard/revenue/deals?deal=${encodeURIComponent(deal.id)}`,
    });
  });

  // Calendar — the week ahead, as-is (no CRM matching attempted).
  if (calendar?.ok) {
    (calendar.items || []).forEach((e, i) => {
      const start = e.start?.dateTime || e.start?.date || "";
      const bucket = upcomingBucket(start, todayKey, weekEndKey);
      if (!bucket) return;
      const allDay = Boolean(e.start?.date && !e.start?.dateTime);
      items.push({
        kind: "event",
        id: `event-${e.id || i}`,
        name: e.summary || "(제목 없는 일정)",
        company: null,
        phone: null,
        stage: null,
        channel: "일정",
        why: e.location || "캘린더 일정",
        bucket,
        whenAt: start,
        whenLabel: allDay ? `${shortWhen(start)} 종일` : `${shortWhen(start)} ${timeLabel(start)}`,
        daysSince: null,
        nextAction: "",
        lastAction: null,
        lastNote: null,
        momentum: 0,
        priority: 0,
        href: null,
      });
    });
  }

  items.sort(compareItems);
  // Cap only the overdue backlog (unbounded — can grow to hundreds) and always keep every
  // upcoming item (calendar events + scheduled next-actions, inherently bounded to the next 7
  // days). Capping the merged list flat would let a large overdue backlog silently push every
  // upcoming meeting/scheduled contact out of the response — exactly the "what's coming up"
  // signal this list exists to surface.
  const overdueAll = items.filter((i) => i.bucket === "overdue");
  const upcomingAll = items.filter((i) => i.bucket !== "overdue");
  const capped = [...overdueAll.slice(0, limit), ...upcomingAll];

  const overdueItems = items.filter((i) => i.bucket === "overdue" && i.kind !== "event");
  const summary = {
    overdue: overdueItems.length,
    dueToday: overdueItems.length,
    scheduled: items.filter((i) => i.kind !== "event" && i.bucket !== "overdue").length,
    events: items.filter((i) => i.kind === "event").length,
    total: items.length,
    shown: capped.length,
  };

  return {
    source: "supabase",
    configured: true,
    items: capped,
    summary,
    calendarReason: calendar?.ok ? "" : calendar?.reason || "",
  };
}

// Periodic leads.score recompute (the learning sink writes back). Operator/cron-triggered —
// NOT run on read, since it mutates production leads. Aggregates each active lead's outreach
// history into a 0-100 momentum score and persists it only when it moved (avoids churn writes).
export async function recomputeLeadScores({ workspaceId = resolveDefaultWorkspaceId(), minDelta = 3 } = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { persisted: false, reason: config ? "missing-workspace" : "missing-config", updated: 0, scanned: 0 };
  }

  const [leads, outcomes] = await Promise.all([
    fetchSupabaseRows("leads", {
      filters: withWorkspaceFilter([["status", inFilter(["new", "qualified", "nurturing"])]]),
      limit: 500,
    }),
    fetchSupabaseRows("outreach_outcomes", { filters: withWorkspaceFilter(), order: "occurred_at.desc", limit: 1000 }),
  ]);

  if (!leads) {
    return { persisted: false, reason: "leads-unavailable", updated: 0, scanned: 0 };
  }

  // Aggregate outcomes per lead (lead_id, falling back to company_id).
  const byLead = new Map();
  const byCompany = new Map();
  const pushTo = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  (outcomes || []).forEach((o) => {
    if (o.lead_id) pushTo(byLead, o.lead_id, o);
    else if (o.company_id) pushTo(byCompany, o.company_id, o);
  });

  let updated = 0;
  for (const lead of leads) {
    const history = [
      ...(byLead.get(lead.id) || []),
      ...(lead.company_id ? byCompany.get(lead.company_id) || [] : []),
    ];
    const last = history[0]; // outcomes already occurred_at desc
    const count = (action) => history.filter((o) => String(o.action || "").toLowerCase() === action).length;
    const score = momentumScore({
      lastAction: last?.action || null,
      ageDays: last ? daysSince(last.occurred_at) : null,
      replies: count("replied"),
      meetings: count("meeting"),
      noResponses: count("no_response"),
    });

    if (Math.abs(score - toNum(lead.score, 0)) < minDelta) continue;

    const res = await updateSupabaseRecord(
      "leads",
      [["id", eqFilter(lead.id)], ["workspace_id", eqFilter(workspaceId)]],
      { score },
    );
    if (res.persisted) updated += 1;
  }

  return { persisted: true, reason: "ok", updated, scanned: leads.length };
}
