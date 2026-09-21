// Follow-up engine (v1.2) — "오늘 연락할 사람 + 채널 + 왜 + 다음행동".
//
// The operator's #1 chore is remembering who to re-contact and when. This reads
// existing data only (no new migration): active leads + open deals + companies +
// recent crm_activities (0014/0016), and computes an overdue-first follow-up list.
//
// 2026-09-21 0a: 연락 기록의 단일 원천을 crm_activities로 통일했다. 이전에 읽던
// outreach_outcomes는 UI writer가 0(통합 라우트 전용)이라 앱에서 남긴 기록이 `왜 지금`·boost·
// 재채점에 한 번도 반영되지 않았다. 아이템 계산은 순수 함수 buildFollowupItems로 분리해
// node --test에서 고정한다.
//
// Channels follow the real motion (NO email): early=전화/문자, mid=방문, 고객=카톡.

import { eqFilter, fetchSupabaseRows, inFilter, withWorkspaceFilter } from "@/lib/server-read";
import {
  resolveDefaultWorkspaceId,
  resolveSupabaseConfig,
  updateSupabaseRecord,
  upsertSupabaseRecords,
} from "@/lib/server-write";

import {
  CONTACT_KINDS,
  KIND_LABEL,
  REACTION_LABEL,
  activityToOutcomeAction,
  momentumScore,
  outcomeBoost,
  priorityFor,
} from "@/lib/sales-os/followup-scoring";
import { listRecentActivities } from "@/lib/repositories/crm-activities";
import { dueBucket, kstDayKey, kstDayKeyAfter } from "@/lib/kst-day";
import { groupFollowups } from "@/lib/sales-os/followup-groups";
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

function daysSince(value, nowMs = Date.now()) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / 86400000);
}

// 대화 기록만 "마지막 접점"이다 — 메모·업데이트·딜 이동은 연락이 아니다.
function isContactActivity(activity) {
  return CONTACT_KINDS.has(String(activity?.kind || "").toLowerCase());
}

// 최신순 활동에서 리드·딜·회사별 마지막 접점 1건. outreach 어휘(action)로 접어 boost에 넣는다.
function indexLastContacts(activities) {
  const byLead = new Map();
  const byDeal = new Map();
  const byCompany = new Map();
  (activities || []).forEach((a) => {
    if (!isContactActivity(a)) return;
    const outcome = {
      action: activityToOutcomeAction(a),
      kind: a.kind,
      reaction: a.reaction || null,
      // 목록의 "최근 대화" 한 줄이 이 본문에서 나온다 — 빠뜨리면 그 줄이 통째로 사라진다.
      body: a.body || "",
      occurredAt: a.occurredAt,
    };
    if (a.leadId && !byLead.has(a.leadId)) byLead.set(a.leadId, outcome);
    if (a.dealId && !byDeal.has(a.dealId)) byDeal.set(a.dealId, outcome);
    if (a.companyId && !byCompany.has(a.companyId)) byCompany.set(a.companyId, outcome);
  });
  return { byLead, byDeal, byCompany };
}

function lastContactPhrase(outcome, ageDays) {
  const kind = KIND_LABEL[outcome.kind] || outcome.kind;
  const reaction = outcome.reaction ? ` · ${REACTION_LABEL[outcome.reaction] || outcome.reaction}` : "";
  return `마지막 ${kind} ${ageDays ?? "?"}일 전${reaction}`;
}

// 행이 여는 목적지 — 리드는 고객 360(기록 중심), 딜은 딜 보드 드로어.
function hrefFor(kind, id) {
  if (!id) return null;
  return kind === "deal"
    ? `dashboard/revenue/deals?deal=${encodeURIComponent(id)}`
    : `dashboard/revenue/customers?customer=${encodeURIComponent(`lead:${id}`)}`;
}

// 목록 한 줄용 발췌 — 원문은 자르지 않고 표시만 줄인다.
function excerpt(text, max = 80) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// ── 순수 코어 (0a) ─────────────────────────────────────────────────────────────
// IO 없이 리드·딜·회사·활동(최신순)에서 후속 목록을 만든다. datedLeadRows/datedDealRows는
// Q117 tier-2(윈도 밖 날짜 기록건). now는 테스트 고정용.
export function buildFollowupItems({
  leadRows = [],
  dealRows = [],
  companies = [],
  activities = [],
  datedLeadRows = [],
  datedDealRows = [],
  now = Date.now(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  // 버킷은 "내가 약속한 날짜"(meta.next_action_at) 기준이다 — 정체 일수가 아니라 약속이
  // 지났는지가 §8.1의 상단 영역을 정한다. KST day-key 비교(kst-day.js).
  const todayKey = kstDayKey(new Date(nowMs));
  const weekEndKey = kstDayKeyAfter(6, nowMs);
  // tier-2 병합 — 본 조회와 겹치는 id는 한 번만(연락일 기록건이 윈도 안에도 있을 수 있다).
  const mergeById = (base, extra) => {
    const seen = new Set(base.map((r) => r.id));
    // 윈도 밖 tier-2 행은 태그한다 — 날짜 도래 전에는 정체 사유로도 유입시키지 않기 위해
    // (Q117: 무접촉 자동 유입은 최하위, 날짜 기록건은 그 날짜에만).
    return [...base, ...(extra || []).filter((r) => r && !seen.has(r.id)).map((r) => ({ ...r, __tier2: true }))];
  };
  const leads = mergeById(leadRows || [], datedLeadRows);
  const deals = mergeById(dealRows || [], datedDealRows);

  const companyById = new Map((companies || []).map((c) => [c.id, c]));
  // 리드·딜·회사별 마지막 접점 — 라이브 기록은 대부분 회사 기준으로 연결돼 있어 회사 폴백이 필수다.
  const { byLead: lastOutcomeByLead, byDeal: lastOutcomeByDeal, byCompany: lastOutcomeByCompany } = indexLastContacts(activities);

  const items = [];

  // Leads (funnel entry follow-ups)
  (leads || []).forEach((lead) => {
    if (isSnoozed(lead.meta)) return; // operator snoozed this lead until a future date
    const company = lead.company_id ? companyById.get(lead.company_id) : null;
    const stage = String(lead.status || "new").toLowerCase();
    const touch = lead.last_touch_at || lead.updated_at || lead.created_at;
    const since = daysSince(touch, nowMs);
    const threshold = thresholdForLead(stage, lead);
    const overdue = since == null || since >= threshold;
    // Q117 tier-2: 기록한 다음 연락일이 도래(오늘 포함)하면 정체 임계와 무관하게 유입.
    const nextAt = lead.meta?.next_action_at || null;
    const nextDue = nextAt ? (daysSince(nextAt, nowMs) ?? -1) >= 0 : false;
    if (lead.__tier2 && !nextDue) return; // 윈도 밖 기록건은 도래일에만
    if (!overdue && !nextDue) return;

    const outcome = lastOutcomeByLead.get(lead.id) || (lead.company_id && lastOutcomeByCompany.get(lead.company_id)) || null;
    const outcomeAge = outcome ? daysSince(outcome.occurredAt, nowMs) : null;
    const reasonPrefix = sourceReason(lead);
    const why = nextDue && !overdue
      ? `${reasonPrefix}예약한 연락일 도래 · ${stage}`
      : outcome
      ? `${reasonPrefix}${lastContactPhrase(outcome, outcomeAge)} · ${stage}`
      : `${reasonPrefix}${since == null ? "무접촉" : `${since}일째 무접촉`} · ${stage}`;

    const boost = outcomeBoost({ action: outcome?.action, ageDays: outcomeAge }) + sourceBoost(lead);

    items.push({
      kind: "lead",
      id: lead.id,
      // 활동 조회는 회사 기준이 정본이다(라이브 기록 110행 중 company_id 109 · lead_id 1) —
      // 행이 companyId를 들고 가지 않으면 활동 패널이 사실상 항상 "기록 없음"이 된다.
      companyId: lead.company_id || null,
      name: lead.name || company?.name || "이름미상",
      company: company?.name || null,
      phone: company?.phone || lead.meta?.phone || null,
      stage,
      channel: channelFor(stage, lead),
      why,
      daysSince: since,
      nextAction: lead.next_action || "다음 행동 정하기",
      promisedAt: nextAt,
      bucket: dueBucket(nextAt, todayKey, weekEndKey),
      href: hrefFor("lead", lead.id),
      lastNote: outcome ? excerpt(outcome.body) : null,
      lastReaction: outcome?.reaction || null,
      lastKind: outcome?.kind || null,
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
    const since = daysSince(touch, nowMs);
    const threshold = STALE_DAYS[stage] ?? DEFAULT_STALE;
    const dealNextAt = deal.meta?.next_action_at || null;
    const dealNextDue = dealNextAt ? (daysSince(dealNextAt, nowMs) ?? -1) >= 0 : false;
    const dealStale = !(since != null && since < threshold);
    if (deal.__tier2 && !dealNextDue) return; // 윈도 밖 기록건은 도래일에만
    if (!dealStale && !dealNextDue) return;

    const outcome = lastOutcomeByDeal.get(deal.id) || (deal.company_id && lastOutcomeByCompany.get(deal.company_id)) || null;
    const outcomeAge = outcome ? daysSince(outcome.occurredAt, nowMs) : null;
    const why = dealNextDue && !dealStale
      ? `예약한 연락일 도래 · ${stage}`
      : outcome
      ? `${lastContactPhrase(outcome, outcomeAge)} · ${stage}`
      : `${since == null ? "활동 없음" : `${since}일째 정체`} · ${stage}`;

    const boost = outcomeBoost({ action: outcome?.action, ageDays: outcomeAge });

    items.push({
      kind: "deal",
      id: deal.id,
      companyId: deal.company_id || null,
      name: deal.title || company?.name || "딜",
      company: company?.name || null,
      phone: company?.phone || null,
      stage,
      channel: channelFor(stage, deal),
      why,
      daysSince: since,
      nextAction: deal.meta?.next_action || "단계 진전 액션 정하기",
      promisedAt: dealNextAt,
      bucket: dueBucket(dealNextAt, todayKey, weekEndKey),
      href: hrefFor("deal", deal.id),
      lastNote: outcome ? excerpt(outcome.body) : null,
      lastReaction: outcome?.reaction || null,
      lastKind: outcome?.kind || null,
      amount: toNum(deal.amount, 0),
      lastAction: outcome?.action || null,
      momentum: Math.round(boost),
      priority: priorityFor({ sinceDays: since, threshold, valueTerm: toNum(deal.amount, 0) / 1000000, boost }),
    });
  });

  items.sort((a, b) => b.priority - a.priority);
  return items;
}

export async function getFollowups({ workspaceId = resolveDefaultWorkspaceId(), limit = 25 } = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return { source: "preview", configured: Boolean(config), items: [], summary: { overdue: 0, dueToday: 0, total: 0 } };
  }

  const trackingStartedAt = await getContactTrackingStartedAt(workspaceId);
  const entityWindow = trackingStartedAt ? [["created_at", `gte.${trackingStartedAt}`]] : [];

  const [leadRows, dealRows, companies, activities, datedLeadRows, datedDealRows] = await Promise.all([
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
    listRecentActivities({ workspaceId, since: trackingStartedAt, limit: 500 }),
    // Q117 tier-2(2026-08-18): 다음 연락일을 기록한 엔티티는 트래킹 윈도 밖(트래킹 시작 전
    // 생성)이어도 유입한다 — 날짜 기록 자체가 "연락 가치 있음"이라는 운영자 신호다.
    // 윈도가 없으면 본 조회가 전부 담으므로 추가 조회를 생략한다.
    trackingStartedAt
      ? fetchSupabaseRows("leads", {
          select: "id,name,status,score,next_action,company_id,channel,source,last_touch_at,updated_at,created_at,meta",
          filters: withWorkspaceFilter([
            ["status", inFilter(["new", "qualified", "nurturing"])],
            ["meta->>next_action_at", "not.is.null"],
          ]),
          limit: 100,
        })
      : Promise.resolve([]),
    trackingStartedAt
      ? fetchSupabaseRows("deals", {
          select: "id,title,stage,amount,company_id,last_activity_at,updated_at,created_at,meta",
          filters: withWorkspaceFilter([
            ["stage", inFilter(["prospect", "proposal", "negotiation", "lead", "qualified", "qual", "neg", "prop"])],
            ["meta->>next_action_at", "not.is.null"],
          ]),
          limit: 100,
        })
      : Promise.resolve([]),
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
    ...(activities === null ? ["crm_activities"] : []),
  ];
  const items = buildFollowupItems({ leadRows, dealRows, companies, activities, datedLeadRows, datedDealRows });
  const capped = items.slice(0, limit);
  // overdue는 "내가 어긴 약속" 수다 — 이전에는 items.length(=전체)라 헤더의 "N overdue"가
  // 목록 길이를 빨갛게 되풀이했다. total이 그 옛 의미를 그대로 들고 간다.
  const grouped = groupFollowups(items);
  const dueToday = grouped.today.length;

  return {
    source: "supabase",
    configured: true,
    // 한쪽 소스라도 읽기 실패면 partial — live 배지 뒤에 소실된 행을 숨기지 않는다.
    partial: failedSources.length > 0,
    failedSources,
    trackingStartedAt,
    items: capped,
    summary: {
      overdue: grouped.missed.length,
      dueToday,
      total: items.length,
      shown: capped.length,
    },
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

  const [leads, activities] = await Promise.all([
    fetchSupabaseRows("leads", {
      select: "id,company_id,score",
      filters: withWorkspaceFilter([
        ["status", inFilter(["new", "qualified", "nurturing"])],
        ...leadWindow,
      ]),
      limit: 500,
    }),
    listRecentActivities({ workspaceId, since: trackingStartedAt, limit: 1000 }),
  ]);

  if (!leads) {
    return { persisted: false, reason: "leads-unavailable", updated: 0, scanned: 0 };
  }

  // Aggregate contact activities per lead (leadId, falling back to companyId) in outreach vocabulary.
  const byLead = new Map();
  const byCompany = new Map();
  const pushTo = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  (activities || []).forEach((a) => {
    if (!isContactActivity(a)) return;
    const o = { action: activityToOutcomeAction(a), occurred_at: a.occurredAt };
    if (a.leadId) pushTo(byLead, a.leadId, o);
    else if (a.companyId) pushTo(byCompany, a.companyId, o);
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
