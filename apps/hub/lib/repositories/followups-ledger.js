// Follow-up engine (v1.2) — "오늘 연락할 사람 + 채널 + 왜 + 다음행동".
//
// The operator's #1 chore is remembering who to re-contact and when. This reads
// existing data only (no new migration): active leads + open deals + companies +
// recent outreach_outcomes (0008), and computes an overdue-first follow-up list.
//
// Channels follow the real motion (NO email): early=전화/문자, mid=방문, 고객=카톡.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from "@/lib/server-write";

import { momentumScore, outcomeBoost, priorityFor } from "@/lib/sales-os/followup-scoring";
import {
  isExplanationLead,
  isMetaAdsLead,
  isThreadsLead,
  isValidLeadFlag,
} from "@/lib/sales-os/operator-context";
import { isSnoozed } from "@/lib/sales-os/snooze";

// Days since last touch before a stage is "overdue".
const STALE_DAYS = { new: 2, qualified: 3, nurturing: 4, contact: 4, proposal: 3, negotiation: 2 };
const DEFAULT_STALE = 3;

// Stage → suggested channel (real motion, no email).
function channelFor(stage, record = {}) {
  const s = String(stage || "").toLowerCase();
  if (isThreadsLead(record)) return "스레드 DM";
  if (isExplanationLead(record) || isMetaAdsLead(record)) return "문자/전화";
  if (["won", "customer", "closed"].includes(s)) return "카톡";
  if (["proposal", "negotiation", "prop", "neg"].includes(s)) return "방문";
  return "전화/문자";
}

function thresholdForLead(stage, lead) {
  if (isExplanationLead(lead)) return 1;
  if (isThreadsLead(lead)) return 2;
  if (isMetaAdsLead(lead) && stage === "new") return 1;
  return STALE_DAYS[stage] ?? DEFAULT_STALE;
}

function sourceBoost(lead) {
  let boost = 0;
  if (isExplanationLead(lead)) boost += 35;
  if (isThreadsLead(lead)) boost += 25;
  if (isMetaAdsLead(lead)) boost += 15;
  if (isValidLeadFlag(lead)) boost += 20;
  const customerState = String(lead.meta?.customer_state || "").toLowerCase();
  if (/(만료|소진|충전|저활용|못.?쓰|expiry|depletion|recharge|low usage)/.test(customerState)) boost += 20;
  return boost;
}

function sourceReason(lead) {
  const labels = [];
  if (isExplanationLead(lead)) labels.push("설명회 신청");
  if (isThreadsLead(lead)) labels.push("Threads 관심");
  if (isMetaAdsLead(lead)) labels.push("광고 리드");
  if (isValidLeadFlag(lead)) labels.push("유효 표시");
  if (lead.meta?.customer_state) labels.push(`고객상태 ${lead.meta.customer_state}`);
  return labels.length ? `${labels.join(" · ")} · ` : "";
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

export async function getFollowups({ workspaceId = resolveDefaultWorkspaceId(), limit = 25 } = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), items: [], summary: { overdue: 0, dueToday: 0, total: 0 } };
  }

  const [leads, deals, companies, outcomes] = await Promise.all([
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
  ]);

  if (!leads && !deals) {
    return { source: "preview", configured: true, items: [], summary: { overdue: 0, dueToday: 0, total: 0 } };
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
    if (isSnoozed(lead.meta)) return; // operator snoozed this lead until a future date
    const company = lead.company_id ? companyById.get(lead.company_id) : null;
    const stage = String(lead.status || "new").toLowerCase();
    const touch = lead.last_touch_at || lead.updated_at || lead.created_at;
    const since = daysSince(touch);
    const threshold = thresholdForLead(stage, lead);
    const overdue = since == null || since >= threshold;
    if (!overdue) return;

    const outcome = lastOutcomeByLead.get(lead.id) || (lead.company_id && lastOutcomeByCompany.get(lead.company_id));
    const outcomeAge = outcome ? daysSince(outcome.occurred_at) : null;
    const reasonPrefix = sourceReason(lead);
    const why = outcome
      ? `${reasonPrefix}마지막 ${outcome.action} ${outcomeAge ?? "?"}일 전 · ${stage}`
      : `${reasonPrefix}${since == null ? "무접촉" : `${since}일째 무접촉`} · ${stage}`;

    const boost = outcomeBoost({ action: outcome?.action, ageDays: outcomeAge }) + sourceBoost(lead);

    items.push({
      kind: "lead",
      id: lead.id,
      name: lead.name || company?.name || "이름미상",
      company: company?.name || null,
      phone: company?.phone || lead.meta?.phone || null,
      stage,
      channel: channelFor(stage, lead),
      why,
      daysSince: since,
      nextAction: lead.next_action || "다음 행동 정하기",
      score: toNum(lead.score, 0),
      lastAction: outcome?.action || null,
      momentum: Math.round(boost),
      priority: priorityFor({ sinceDays: since, threshold, valueTerm: toNum(lead.score, 0) / 10, boost }),
    });
  });

  // Open deals (stage-based follow-ups)
  (deals || []).forEach((deal) => {
    if (isSnoozed(deal.meta)) return; // operator snoozed this deal until a future date
    const company = deal.company_id ? companyById.get(deal.company_id) : null;
    const stage = String(deal.stage || "prospect").toLowerCase();
    const touch = deal.last_activity_at || deal.updated_at || deal.created_at;
    const since = daysSince(touch);
    const threshold = STALE_DAYS[stage] ?? DEFAULT_STALE;
    if (since != null && since < threshold) return;

    const outcome = deal.company_id && lastOutcomeByCompany.get(deal.company_id);
    const outcomeAge = outcome ? daysSince(outcome.occurred_at) : null;
    const why = outcome
      ? `마지막 ${outcome.action} ${outcomeAge ?? "?"}일 전 · ${stage}`
      : `${since == null ? "활동 없음" : `${since}일째 정체`} · ${stage}`;

    const boost = outcomeBoost({ action: outcome?.action, ageDays: outcomeAge });

    items.push({
      kind: "deal",
      id: deal.id,
      name: deal.title || company?.name || "딜",
      company: company?.name || null,
      phone: company?.phone || null,
      stage,
      channel: channelFor(stage, deal),
      why,
      daysSince: since,
      nextAction: "단계 진전 액션 정하기",
      amount: toNum(deal.amount, 0),
      lastAction: outcome?.action || null,
      momentum: Math.round(boost),
      priority: priorityFor({ sinceDays: since, threshold, valueTerm: toNum(deal.amount, 0) / 1000000, boost }),
    });
  });

  items.sort((a, b) => b.priority - a.priority);
  const capped = items.slice(0, limit);
  const dueToday = items.filter((i) => i.daysSince != null && i.daysSince <= (STALE_DAYS[i.stage] ?? DEFAULT_STALE) + 1).length;

  return {
    source: "supabase",
    configured: true,
    items: capped,
    summary: { overdue: items.length, dueToday, total: items.length, shown: capped.length },
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
