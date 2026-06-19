// Follow-up engine (v1.2) — "오늘 연락할 사람 + 채널 + 왜 + 다음행동".
//
// The operator's #1 chore is remembering who to re-contact and when. This reads
// existing data only (no new migration): active leads + open deals + companies +
// recent outreach_outcomes (0008), and computes an overdue-first follow-up list.
//
// Channels follow the real motion (NO email): early=전화/문자, mid=방문, 고객=카톡.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";

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
    const company = lead.company_id ? companyById.get(lead.company_id) : null;
    const stage = String(lead.status || "new").toLowerCase();
    const touch = lead.last_touch_at || lead.updated_at || lead.created_at;
    const since = daysSince(touch);
    const threshold = STALE_DAYS[stage] ?? DEFAULT_STALE;
    const overdue = since == null || since >= threshold;
    if (!overdue) return;

    const outcome = lastOutcomeByLead.get(lead.id) || (lead.company_id && lastOutcomeByCompany.get(lead.company_id));
    const why = outcome
      ? `마지막 ${outcome.action} ${daysSince(outcome.occurred_at) ?? "?"}일 전 · ${stage}`
      : `${since == null ? "무접촉" : `${since}일째 무접촉`} · ${stage}`;

    items.push({
      kind: "lead",
      id: lead.id,
      name: lead.name || company?.name || "이름미상",
      company: company?.name || null,
      phone: company?.phone || lead.meta?.phone || null,
      stage,
      channel: channelFor(stage),
      why,
      daysSince: since,
      nextAction: lead.next_action || "다음 행동 정하기",
      score: toNum(lead.score, 0),
      priority: (since == null ? threshold : since) * 10 + toNum(lead.score, 0) / 10,
    });
  });

  // Open deals (stage-based follow-ups)
  (deals || []).forEach((deal) => {
    const company = deal.company_id ? companyById.get(deal.company_id) : null;
    const stage = String(deal.stage || "prospect").toLowerCase();
    const touch = deal.last_activity_at || deal.updated_at || deal.created_at;
    const since = daysSince(touch);
    const threshold = STALE_DAYS[stage] ?? DEFAULT_STALE;
    if (since != null && since < threshold) return;

    const outcome = deal.company_id && lastOutcomeByCompany.get(deal.company_id);
    const why = outcome
      ? `마지막 ${outcome.action} ${daysSince(outcome.occurred_at) ?? "?"}일 전 · ${stage}`
      : `${since == null ? "활동 없음" : `${since}일째 정체`} · ${stage}`;

    items.push({
      kind: "deal",
      id: deal.id,
      name: deal.title || company?.name || "딜",
      company: company?.name || null,
      phone: company?.phone || null,
      stage,
      channel: channelFor(stage),
      why,
      daysSince: since,
      nextAction: "단계 진전 액션 정하기",
      amount: toNum(deal.amount, 0),
      priority: (since == null ? threshold : since) * 10 + toNum(deal.amount, 0) / 1000000,
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
