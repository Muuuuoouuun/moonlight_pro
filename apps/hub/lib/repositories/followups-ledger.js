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
import { diffKstDays, dueBucket, kstDayKey, kstDayKeyAfter } from "@/lib/kst-day";
import { groupFollowups } from "@/lib/sales-os/followup-groups";
import { getContactTrackingStartedAt } from "@/lib/sales-os/contact-tracking";
import {
  isExplanationLead,
  isMetaAdsLead,
  isThreadsLead,
  isValidLeadFlag,
} from "@/lib/sales-os/operator-context";
import { isSnoozed } from "@/lib/sales-os/snooze";

// 기약 없음을 다시 보는 간격 — crm-nudges.js의 DORMANT_RECHECK_DAYS(프로필 §7 권장: 한 달 뒤
// 재확인)와 같은 값이다. 그 모듈은 캘린더 매칭까지 끌고 오므로 숫자만 옮겨 둔다.
export const DORMANT_RECHECK_DAYS = 30;

// 오늘 연락 화면의 "기록 1건 평균" — 기록창을 연 채 자리를 비운 기록은 측정이 아니다.
export const RECORD_SECONDS_CAP = 600;

const ACTIVE_LEAD_STATUSES = ["new", "qualified", "nurturing"];
const OPEN_DEAL_STAGES = ["prospect", "proposal", "negotiation", "lead", "qualified", "qual", "neg", "prop"];
const LEAD_SELECT = "id,name,status,score,next_action,company_id,channel,source,last_touch_at,updated_at,created_at,meta";
// deals.next_action은 0001부터 있는 컬럼이고 record_contact_outcome_v1이 거기에 쓴다 — meta만
// 읽으면 방금 기록한 딜의 약속이 "단계 진전 액션 정하기"로 보인다.
const DEAL_SELECT = "id,title,stage,amount,next_action,company_id,last_activity_at,updated_at,created_at,meta";

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
      // 운영자가 적은 약속 원문 — 없으면 null이다(위 nextAction은 옛 화면용 채움 문구를 단다).
      promiseText: lead.next_action || null,
      promisedAt: nextAt,
      bucket: dueBucket(nextAt, todayKey, weekEndKey),
      dormant: lead.meta?.dormant === true,
      dormantSince: lead.meta?.dormant_since || null,
      href: hrefFor("lead", lead.id),
      lastNote: outcome ? excerpt(outcome.body) : null,
      lastReaction: outcome?.reaction || null,
      lastKind: outcome?.kind || null,
      lastContactAt: outcome?.occurredAt || null,
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
      nextAction: deal.next_action || deal.meta?.next_action || "단계 진전 액션 정하기",
      promiseText: deal.next_action || deal.meta?.next_action || null,
      promisedAt: dealNextAt,
      bucket: dueBucket(dealNextAt, todayKey, weekEndKey),
      dormant: deal.meta?.dormant === true,
      dormantSince: deal.meta?.dormant_since || null,
      href: hrefFor("deal", deal.id),
      lastNote: outcome ? excerpt(outcome.body) : null,
      lastReaction: outcome?.reaction || null,
      lastKind: outcome?.kind || null,
      lastContactAt: outcome?.occurredAt || null,
      amount: toNum(deal.amount, 0),
      lastAction: outcome?.action || null,
      momentum: Math.round(boost),
      priority: priorityFor({ sinceDays: since, threshold, valueTerm: toNum(deal.amount, 0) / 1000000, boost }),
    });
  });

  items.sort((a, b) => b.priority - a.priority);
  return items;
}

// ── 약속 장부 (2026-09-24 오늘 연락) ────────────────────────────────────────────
// 위 buildFollowupItems는 "지금 손댈 것"만 담는다(정체 또는 약속 도래). 오늘 연락 화면의 접힌
// 줄 "다가오는 약속 N · 기약 없음 N"은 그 밖의 약속 — 아직 날짜가 안 된 약속과 운영자가 고른
// 기약 없음 — 을 따로 센다. items와 섞지 않는 이유: 자동 초안 크론·비서실장 크론이 items를
// 그대로 읽으므로 거기 미래 약속이 끼면 밤마다 초안이 생긴다.
function promiseRow(kind, record, ctx) {
  const company = record.company_id ? ctx.companyById.get(record.company_id) : null;
  const outcome = (kind === "deal" ? ctx.byDeal.get(record.id) : ctx.byLead.get(record.id))
    || (record.company_id && ctx.byCompany.get(record.company_id))
    || null;
  const nextAt = record.meta?.next_action_at || null;
  const dormant = record.meta?.dormant === true;
  const dormantSince = record.meta?.dormant_since || null;
  const sinceKey = kstDayKey(dormantSince);
  const dormantDays = dormant && sinceKey ? diffKstDays(sinceKey, ctx.todayKey) : null;
  return {
    kind,
    id: record.id,
    companyId: record.company_id || null,
    name: kind === "deal"
      ? record.title || company?.name || "거래"
      : record.name || company?.name || "이름미상",
    company: company?.name || null,
    stage: kind === "deal"
      ? String(record.stage || "prospect").toLowerCase()
      : String(record.status || "new").toLowerCase(),
    promiseText: (kind === "deal" ? record.next_action || record.meta?.next_action : record.next_action) || null,
    promisedAt: nextAt,
    bucket: dueBucket(nextAt, ctx.todayKey, ctx.weekEndKey),
    dormant,
    dormantSince,
    dormantDays,
    // 기약 없음 30일 — "다시 볼까요?" 한 줄만 붙인다(crm-nudges dormant_recheck와 같은 기준).
    recheck: dormantDays != null && dormantDays >= DORMANT_RECHECK_DAYS,
    href: hrefFor(kind, record.id),
    lastKind: outcome?.kind || null,
    lastReaction: outcome?.reaction || null,
    lastContactAt: outcome?.occurredAt || null,
    ...(kind === "deal" ? { amount: toNum(record.amount, 0) } : {}),
  };
}

export function buildPromiseBook({
  datedLeadRows = [],
  datedDealRows = [],
  dormantLeadRows = [],
  dormantDealRows = [],
  companies = [],
  activities = [],
  now = Date.now(),
  cap = 40,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const { byLead, byDeal, byCompany } = indexLastContacts(activities);
  const ctx = {
    companyById: new Map((companies || []).map((c) => [c.id, c])),
    byLead,
    byDeal,
    byCompany,
    todayKey: kstDayKey(new Date(nowMs)),
    weekEndKey: kstDayKeyAfter(6, nowMs),
  };
  const rows = (kind, list) => (list || [])
    .filter((r) => r && r.id && !isSnoozed(r.meta, nowMs))
    .map((r) => promiseRow(kind, r, ctx));

  const seen = new Set();
  const once = (row) => {
    const key = `${row.kind}:${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  // 날짜가 아직 안 된 약속만 — 도래한 약속은 items(놓친·오늘)가 이미 담는다.
  const upcoming = [...rows("lead", datedLeadRows), ...rows("deal", datedDealRows)]
    .filter((r) => !r.dormant && r.promisedAt && kstDayKey(r.promisedAt) > ctx.todayKey)
    .sort((a, b) => kstDayKey(a.promisedAt).localeCompare(kstDayKey(b.promisedAt)))
    .filter(once)
    .slice(0, cap);

  // 기약 없음 — 오래 둔 것부터(30일 지난 것이 "다시 볼까요?"로 위에 선다). 시작일 모름은 맨 뒤.
  const dormant = [...rows("lead", dormantLeadRows), ...rows("deal", dormantDealRows)]
    .filter((r) => r.dormant)
    .sort((a, b) => (b.dormantDays ?? -1) - (a.dormantDays ?? -1))
    .filter(once)
    .slice(0, cap);

  return { upcoming, dormant };
}

// ── 이번 주 (오른쪽 레일) ────────────────────────────────────────────────────────
// 매출이 아니라 습관 지표다(스펙 §0.5 5일 실험: 놓친 약속 0 · 기록 = 연락 · 기록 1건 30초).
// 숫자는 전부 crm_activities(결정 A, Q144)에서 센다 — 만든 숫자를 두지 않는다.
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
// 운영자의 손이 닿지 않은 자동 기록(딜 단계 이동·AI·업데이트) — crm-nudges의 AUTO_ACTIVITY_KINDS와 같다.
const AUTO_ACTIVITY_KINDS = new Set(["deal", "ai", "update"]);

function shiftDayKey(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// KST 달력 기준 이번 주 월요일의 day-key.
export function kstWeekStartKey(now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const todayKey = kstDayKey(new Date(nowMs));
  const offset = (new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0 … 일=6
  return shiftDayKey(todayKey, -offset);
}

function customerKeyOf(activity) {
  if (activity.leadId) return `lead:${activity.leadId}`;
  if (activity.dealId) return `deal:${activity.dealId}`;
  if (activity.accountId) return `account:${activity.accountId}`;
  if (activity.companyId) return `company:${activity.companyId}`;
  return null;
}

export function buildWeekStats({ activities = [], now = Date.now(), truncated = false } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const todayKey = kstDayKey(new Date(nowMs));
  const startKey = kstWeekStartKey(nowMs);
  const dayKeys = Array.from({ length: 7 }, (_, i) => shiftDayKey(startKey, i));
  const counts = new Map(dayKeys.map((key) => [key, 0]));
  const customers = new Set();
  const customersToday = new Set();
  const seconds = [];
  let contacts = 0;
  let recordsToday = 0;

  for (const activity of activities || []) {
    const kind = String(activity?.kind || "").toLowerCase();
    if (!kind || AUTO_ACTIVITY_KINDS.has(kind)) continue;
    const key = kstDayKey(activity.occurredAt);
    if (!counts.has(key)) continue;
    const who = customerKeyOf(activity);
    if (key === todayKey) {
      recordsToday += 1;
      if (who) customersToday.add(who);
    }
    const recorded = Number(activity.meta?.capture?.record_seconds);
    if (Number.isFinite(recorded) && recorded > 0 && recorded <= RECORD_SECONDS_CAP) seconds.push(recorded);
    // 메모는 기록이지만 연락은 아니다 — "연락 N"과 막대는 대화 채널만 센다.
    if (!CONTACT_KINDS.has(kind)) continue;
    contacts += 1;
    counts.set(key, counts.get(key) + 1);
    if (who) customers.add(who);
  }

  const days = dayKeys
    .map((key, index) => ({
      key,
      label: WEEKDAY_LABELS[index],
      count: counts.get(key),
      today: key === todayKey,
      future: key > todayKey,
      weekend: index >= 5,
    }))
    // 주말은 연락이 있었거나 오늘일 때만 막대를 세운다 — 비어 있는 주말 두 칸은 소음이다.
    .filter((day) => !day.weekend || day.count > 0 || day.today);

  return {
    startKey,
    todayKey,
    contacts,
    customers: customers.size,
    days,
    recordsToday,
    customersRecordedToday: customersToday.size,
    recordSeconds: seconds.length
      ? { count: seconds.length, average: Math.round(seconds.reduce((sum, s) => sum + s, 0) / seconds.length) }
      : null,
    truncated: Boolean(truncated),
  };
}

function mapWeekActivity(row) {
  return {
    id: row.id,
    kind: String(row.kind || "").toLowerCase(),
    leadId: row.lead_id || null,
    dealId: row.deal_id || null,
    accountId: row.account_id || null,
    companyId: row.company_id || null,
    occurredAt: row.occurred_at || row.created_at || null,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
  };
}

const WEEK_ACTIVITY_LIMIT = 500;

export async function getFollowups({ workspaceId = resolveDefaultWorkspaceId(), limit = 25 } = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) {
    return {
      source: "preview",
      configured: Boolean(config),
      items: [],
      upcoming: [],
      dormant: [],
      week: null,
      summary: { overdue: 0, dueToday: 0, total: 0, upcoming: 0, dormant: 0 },
    };
  }

  const trackingStartedAt = await getContactTrackingStartedAt(workspaceId);
  const entityWindow = trackingStartedAt ? [["created_at", `gte.${trackingStartedAt}`]] : [];
  const nowMs = Date.now();
  const weekStartIso = new Date(`${kstWeekStartKey(nowMs)}T00:00:00+09:00`).toISOString();

  const [leadRows, dealRows, companies, activities, datedLeadRows, datedDealRows, dormantLeadRows, dormantDealRows, weekRows] = await Promise.all([
    fetchSupabaseRows("leads", {
      select: LEAD_SELECT,
      filters: withWorkspaceFilter([
        ["status", inFilter(ACTIVE_LEAD_STATUSES)],
        ...entityWindow,
      ]),
      order: "last_touch_at.asc.nullsfirst",
      limit: 300,
    }),
    fetchSupabaseRows("deals", {
      select: DEAL_SELECT,
      filters: withWorkspaceFilter([
        ["stage", inFilter(OPEN_DEAL_STAGES)],
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
    // 다음 연락일을 기록한 엔티티 — 두 곳에 쓴다. ① Q117 tier-2(2026-08-18): 트래킹 윈도 밖
    // (트래킹 시작 전 생성)이어도 도래일에 유입한다 — 날짜 기록 자체가 "연락 가치 있음"이라는
    // 운영자 신호다. ② 오늘 연락의 "다가오는 약속" 줄. ①은 윈도가 있을 때만 넘긴다(아래).
    fetchSupabaseRows("leads", {
      select: LEAD_SELECT,
      filters: withWorkspaceFilter([
        ["status", inFilter(ACTIVE_LEAD_STATUSES)],
        ["meta->>next_action_at", "not.is.null"],
      ]),
      limit: 150,
    }),
    fetchSupabaseRows("deals", {
      select: DEAL_SELECT,
      filters: withWorkspaceFilter([
        ["stage", inFilter(OPEN_DEAL_STAGES)],
        ["meta->>next_action_at", "not.is.null"],
      ]),
      limit: 150,
    }),
    // 기약 없음 — 운영자가 "다음 약속 없음"을 고른 고객. 윈도와 무관하게 센다.
    fetchSupabaseRows("leads", {
      select: LEAD_SELECT,
      filters: withWorkspaceFilter([
        ["status", inFilter(ACTIVE_LEAD_STATUSES)],
        ["meta->>dormant", "eq.true"],
      ]),
      limit: 100,
    }),
    fetchSupabaseRows("deals", {
      select: DEAL_SELECT,
      filters: withWorkspaceFilter([
        ["stage", inFilter(OPEN_DEAL_STAGES)],
        ["meta->>dormant", "eq.true"],
      ]),
      limit: 100,
    }),
    // 이번 주(KST 월요일부터) 기록 — 레일의 연락 수·요일 막대·기록 시간. meta는 기록창이 남긴
    // capture(record_seconds 등)를 읽기 위해서다.
    fetchSupabaseRows("crm_activities", {
      select: "id,kind,lead_id,deal_id,account_id,company_id,occurred_at,created_at,meta",
      filters: [
        ["workspace_id", eqFilter(workspaceId)],
        ["occurred_at", `gte.${weekStartIso}`],
      ],
      order: "occurred_at.desc",
      limit: WEEK_ACTIVITY_LIMIT,
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
      upcoming: [],
      dormant: [],
      week: null,
      summary: { overdue: 0, dueToday: 0, total: 0, upcoming: 0, dormant: 0 },
    };
  }
  const failedSources = [
    ...(leadRows === null ? ["leads"] : []),
    ...(dealRows === null ? ["deals"] : []),
    ...(companies === null ? ["companies"] : []),
    ...(activities === null ? ["crm_activities"] : []),
  ];
  // 오늘 연락 화면만 쓰는 보조 읽기(약속 장부·이번 주). 배열이 아니면 실패로 본다 — 0건으로
  // 뭉개지 않는다. items와 따로 명명하는 이유: 자동 초안 크론은 partial이면 멈추는데, 이 두
  // 읽기는 크론이 쓰는 items와 무관하다.
  const promisesFailed = ![datedLeadRows, datedDealRows, dormantLeadRows, dormantDealRows].every(Array.isArray);
  const auxiliaryFailedSources = [
    ...(promisesFailed ? ["promises"] : []),
    ...(!Array.isArray(weekRows) ? ["week_activities"] : []),
  ];
  const items = buildFollowupItems({
    leadRows,
    dealRows,
    companies,
    activities,
    // tier-2는 윈도가 있을 때만 — 윈도가 없으면 본 조회가 이미 전부 담는다(종전 동작 그대로).
    datedLeadRows: trackingStartedAt ? datedLeadRows : [],
    datedDealRows: trackingStartedAt ? datedDealRows : [],
    now: nowMs,
  });
  const book = buildPromiseBook({
    datedLeadRows,
    datedDealRows,
    dormantLeadRows,
    dormantDealRows,
    companies,
    activities,
    now: nowMs,
  });
  // 주간 읽기 실패는 0으로 위장하지 않는다 — null이면 레일이 읽기 실패를 말한다.
  const week = Array.isArray(weekRows)
    ? buildWeekStats({
        activities: weekRows.map(mapWeekActivity),
        now: nowMs,
        truncated: weekRows.length >= WEEK_ACTIVITY_LIMIT,
      })
    : null;
  // 자르기는 묶음 인식으로 한다. items의 정렬축은 priority 하나뿐이고 약속 날짜(bucket)와
  // 무관하므로, 단순 slice면 어긴 약속이 상한 밖으로 밀려 헤더의 "N overdue"와 "먼저 정리할 것"
  // 섹션이 어긋난다. 묶음 안 순서는 이미 priority 내림차순이라 추가 정렬이 필요 없다.
  const grouped = groupFollowups(items);
  const capped = [...grouped.missed, ...grouped.today, ...grouped.rest].slice(0, limit);
  // overdue는 "내가 어긴 약속" 수다 — 이전에는 items.length(=전체)라 헤더의 "N overdue"가
  // 목록 길이를 빨갛게 되풀이했다. total이 그 옛 의미를 그대로 들고 간다. 수치는 실제로 실린
  // 목록(capped)에서 뽑는다 — 화면이 같은 배열을 다시 묶어 섹션을 그리기 때문이다.
  const shownGroups = groupFollowups(capped);
  const dueToday = shownGroups.today.length;

  return {
    source: "supabase",
    configured: true,
    // 한쪽 소스라도 읽기 실패면 partial — live 배지 뒤에 소실된 행을 숨기지 않는다.
    partial: failedSources.length > 0,
    failedSources,
    auxiliaryFailedSources,
    trackingStartedAt,
    items: capped,
    upcoming: book.upcoming,
    dormant: book.dormant,
    week,
    summary: {
      overdue: shownGroups.missed.length,
      dueToday,
      total: items.length,
      shown: capped.length,
      upcoming: book.upcoming.length,
      dormant: book.dormant.length,
    },
  };
}

// ── 기록창 고객 고르기 (2026-09-24) ────────────────────────────────────────────
// 오늘 연락의 "＋ 연락 기록"은 대상 없이 열린다 — 이름·학원으로 고객을 찾는 좁은 읽기.
// 행 수를 늘 작게(종류당 limit) 묶고, PostgREST 문법 문자(쉼표·괄호·*·%)는 입력에서 걷는다.
export function sanitizeTargetQuery(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s.\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export async function searchContactTargets({ q = "", workspaceId = resolveDefaultWorkspaceId(), limit = 8 } = {}) {
  const config = resolveSupabaseConfig();
  if (!config || !workspaceId) return { source: "preview", targets: [] };
  const term = sanitizeTargetQuery(q);
  if (!term) return { source: "supabase", targets: [] };
  const pattern = `ilike.*${term}*`;
  const size = Math.max(1, Math.min(20, Number(limit) || 8));

  const [leads, companies, accounts, deals] = await Promise.all([
    fetchSupabaseRows("leads", {
      select: "id,name,status,company_id",
      filters: withWorkspaceFilter([["name", pattern], ["status", inFilter([...ACTIVE_LEAD_STATUSES, "won"])]]),
      order: "last_touch_at.desc.nullslast",
      limit: size,
    }),
    fetchSupabaseRows("companies", {
      select: "id,name",
      filters: withWorkspaceFilter([["name", pattern]]),
      limit: size,
    }),
    fetchSupabaseRows("customer_accounts", {
      select: "id,name,company_id,status",
      filters: withWorkspaceFilter([["name", pattern], ["status", inFilter(["active", "paused"])]]),
      limit: size,
    }),
    fetchSupabaseRows("deals", {
      select: "id,title,stage,company_id",
      filters: withWorkspaceFilter([["title", pattern], ["stage", inFilter(OPEN_DEAL_STAGES)]]),
      order: "updated_at.desc.nullslast",
      limit: size,
    }),
  ]);

  if (leads === null && companies === null && accounts === null && deals === null) {
    return { source: "error", error: "contact-target-search-failed", targets: [] };
  }

  // 학원 이름으로 찾았으면 그 학원의 리드를 붙인다 — 운영자는 사람보다 학원 이름을 먼저 떠올린다.
  const companyIds = (companies || []).map((c) => c.id).filter(Boolean);
  const companyLeads = companyIds.length
    ? await fetchSupabaseRows("leads", {
        select: "id,name,status,company_id",
        filters: withWorkspaceFilter([["company_id", inFilter(companyIds)], ["status", inFilter([...ACTIVE_LEAD_STATUSES, "won"])]]),
        order: "last_touch_at.desc.nullslast",
        limit: size,
      })
    : [];
  const companyName = new Map((companies || []).map((c) => [c.id, c.name]));
  const orgOf = (companyId) => (companyId && companyName.get(companyId)) || null;

  const targets = [];
  const seen = new Set();
  const push = (target) => {
    const key = `${target.kind}:${target.id}`;
    if (!target.id || seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  };
  for (const lead of [...(leads || []), ...(companyLeads || [])]) {
    push({ kind: "lead", id: lead.id, companyId: lead.company_id || null, name: lead.name || orgOf(lead.company_id) || "이름미상", org: orgOf(lead.company_id), stage: lead.status || null });
  }
  for (const account of accounts || []) {
    push({ kind: "account", id: account.id, companyId: account.company_id || null, name: account.name || "계약 고객", org: orgOf(account.company_id), stage: "account" });
  }
  for (const deal of deals || []) {
    push({ kind: "deal", id: deal.id, companyId: deal.company_id || null, name: deal.title || "거래", org: orgOf(deal.company_id), stage: deal.stage || null });
  }

  const failed = [
    ...(leads === null ? ["leads"] : []),
    ...(companies === null ? ["companies"] : []),
    ...(accounts === null ? ["customer_accounts"] : []),
    ...(deals === null ? ["deals"] : []),
    ...(companyLeads === null ? ["company_leads"] : []),
  ];
  return {
    source: "supabase",
    partial: failed.length > 0,
    failedSources: failed,
    targets: targets.slice(0, size * 2),
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
