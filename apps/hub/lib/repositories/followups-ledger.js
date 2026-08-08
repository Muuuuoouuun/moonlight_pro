// Follow-up engine (v1.2) — "오늘 연락할 사람 + 채널 + 왜 + 다음행동".
//
// The operator's #1 chore is remembering who to re-contact and when. This reads
// existing data only (no new migration): active leads + open deals + companies +
// recent outreach_outcomes (0008), and computes an overdue-first follow-up list.
//
// Channels follow the real motion (NO email): early=전화/문자, mid=방문, 고객=카톡.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import {
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
  upsertSupabaseRecords,
} from "@/lib/server-write";

import { momentumScore, outcomeBoost, priorityFor } from "@/lib/sales-os/followup-scoring";
import { getContactTrackingStartedAt } from "@/lib/sales-os/contact-tracking";
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

  const trackingStartedAt = await getContactTrackingStartedAt(workspaceId);
  const entityWindow = trackingStartedAt ? [["created_at", `gte.${trackingStartedAt}`]] : [];
  const outcomeWindow = trackingStartedAt ? [["occurred_at", `gte.${trackingStartedAt}`]] : [];

  const [leadRows, dealRows, companies, outcomes] = await Promise.all([
    fetchSupabaseRows("leads", {
      select: "id,name,status,score,next_action,company_id,channel,source,last_touch_at,updated_at,created_at,meta",
      filters: withWorkspaceFilter([
        ["status", inFilter(["new", "qualified", "nurturing"])],
        ...entityWindow,
      ]),
      order: "last_touch_at.asc.nullsfirst",
      limit: 300,
    }),
    fetchSupabaseRows("deals", {
      select: "id,title,stage,amount,company_id,last_activity_at,updated_at,created_at,meta",
      filters: withWorkspaceFilter([
        ["stage", inFilter(["prospect", "proposal", "negotiation", "lead", "qualified", "qual", "neg", "prop"])],
        ...entityWindow,
      ]),
      order: "updated_at.asc.nullsfirst",
      limit: 300,
    }),
    fetchSupabaseRows("companies", {
      select: "id,name,phone",
      filters: withWorkspaceFilter(),
      limit: 1000,
    }),
    fetchSupabaseRows("outreach_outcomes", {
      select: "lead_id,company_id,action,occurred_at",
      filters: withWorkspaceFilter(outcomeWindow),
      order: "occurred_at.desc",
      limit: 500,
    }),
  ]);

  // read 실패(null)와 빈 결과([])를 구분한다 — 이전에는 한쪽(leads)이 타임아웃돼도
  // 나머지 한쪽만으로 source:"supabase"(live 배지)를 반환해 리드 후속 전체가 소리 없이
  // 사라졌다(2026-08-05 re-audit S1). "후속 누락 0건" 목표에서 최악의 무음 경로.
  if (leadRows === null && dealRows === null) {
    return {
      source: "error",
      configured: true,
      error: "followups-read-failed",
      failedSources: ["leads", "deals"],
      retryable: true,
      items: [],
      summary: { overdue: 0, dueToday: 0, total: 0 },
    };
  }
  const failedSources = [
    ...(leadRows === null ? ["leads"] : []),
    ...(dealRows === null ? ["deals"] : []),
    ...(companies === null ? ["companies"] : []),
    ...(outcomes === null ? ["outreach_outcomes"] : []),
  ];
  const leads = leadRows || [];
  const deals = dealRows || [];

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
    // 한쪽 소스라도 읽기 실패면 partial — live 배지 뒤에 소실된 행을 숨기지 않는다.
    partial: failedSources.length > 0,
    failedSources,
    trackingStartedAt,
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

  const trackingStartedAt = await getContactTrackingStartedAt(workspaceId);
  const leadWindow = trackingStartedAt ? [["created_at", `gte.${trackingStartedAt}`]] : [];
  const outcomeWindow = trackingStartedAt ? [["occurred_at", `gte.${trackingStartedAt}`]] : [];

  const [leads, outcomes] = await Promise.all([
    fetchSupabaseRows("leads", {
      select: "id,company_id,score",
      filters: withWorkspaceFilter([
        ["status", inFilter(["new", "qualified", "nurturing"])],
        ...leadWindow,
      ]),
      limit: 500,
    }),
    fetchSupabaseRows("outreach_outcomes", {
      select: "lead_id,company_id,action,occurred_at",
      filters: withWorkspaceFilter(outcomeWindow),
      order: "occurred_at.desc",
      limit: 1000,
    }),
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

  const changed = [];
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
    changed.push({ id: lead.id, workspace_id: workspaceId, score });
  }

  // One bulk upsert (id conflict → DO UPDATE score) instead of one PATCH per
  // lead — the previous loop issued up to 500 sequential round trips.
  let updated = 0;
  if (changed.length) {
    const res = await upsertSupabaseRecords("leads", changed, { onConflict: "id" });
    if (res.persisted) {
      updated = changed.length;
    } else {
      const singles = await Promise.all(
        changed.map((row) =>
          updateSupabaseRecord(
            "leads",
            [["id", eqFilter(row.id)], ["workspace_id", eqFilter(workspaceId)]],
            { score: row.score },
          ),
        ),
      );
      updated = singles.filter((r) => r.persisted).length;
    }
  }

  // 쓰기가 전부 실패했는데 persisted:true/ok로 보고하면 무언 실패 — 명명한다.
  if (changed.length && updated === 0) {
    return { persisted: false, reason: "score-write-failed", updated: 0, scanned: leads.length };
  }
  return { persisted: true, reason: "ok", updated, scanned: leads.length };
}
