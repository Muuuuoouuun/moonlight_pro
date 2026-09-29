// 기록 후보 읽기·정리 — IO만. 판정은 sales-os/record-candidates.js(순수)가 한다.
//
// 읽기: 매출 데이터(고객) + 최근 활동 + 지난 이틀 캘린더 + webhook_events의 폰 사건.
//   실패한 소스는 숨기지 않고 failedSources로 이름을 댄다 — 읽기 실패를 "후보 없음"으로 위장하면
//   운영자가 조용히 놓친다. 허브 read 계약대로 실패도 HTTP 200 + status:"error"다.
// 쓰기: 폰 후보는 webhook_events.status(received → processed|ignored), 캘린더 후보는 대상 고객의
//   meta.nudges.dismissed[meeting_unrecorded:<일정>](CRM 넛지와 같은 키) + meta.calendar_outcomes[<일정>].
//   새 테이블·마이그레이션 없음.

import { eqFilter, fetchSupabaseRows, inFilter } from "../server-read.js";
import { resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from "../server-write.js";
import { isCanonicalUuid } from "../uuid.js";
import { kstDayKey } from "../kst-day.js";
import { getRevenueLedger } from "./revenue-ledger.js";
import { listRecentActivities } from "./crm-activities.js";
import { readCombinedGoogleCalendarEvents } from "../google-calendar.js";
import { filterOperatorOwnedRevenue } from "../operator-revenue-scope.js";
import { findUnrecordedMeetings } from "../sales-os/calendar-touchpoints.js";
import { persistRevenueRecord } from "../sales-os/revenue-write.js";
import {
  CANDIDATE_MAX_AGE_MS,
  PHONE_EVENT_SOURCE,
  PHONE_EVENT_TYPES,
  buildCalendarCandidates,
  buildPhoneCandidates,
  calendarCustomersFrom,
  meetingTriggerKey,
  mergeCandidates,
  parseCandidateId,
} from "../sales-os/record-candidates.js";

const DAY_MS = 86400000;
// 후보 창(48h)보다 조금 넓게 읽는다 — 경계에 걸친 일정·늦게 도착한 폰 사건.
const READ_WINDOW_MS = 3 * DAY_MS;
const PHONE_READ_LIMIT = 200;
// 캘린더 "미연결"은 실패가 아니다 — 연결한 적이 없는 것과 못 읽은 것을 가른다(crm-nudges-source와 같다).
const CALENDAR_NOT_CONNECTED = new Set(["calendar-not-connected", "missing-connection", "missing-access-token", "missing-config"]);
const SOURCE_LABEL = { revenue: "고객", crm_activities: "연락 기록", calendar: "캘린더", phone: "휴대폰 후보" };
const SUBJECT_TABLES = { lead: "leads", deal: "deals", account: "customer_accounts" };
const ACTIONS = new Set(["resolve", "dismiss", "restore"]);
const CALENDAR_REASONS = new Set(["cancelled", "not-this-customer"]);
const CALENDAR_OUTCOME_LIMIT = 200;

const ws = (workspaceId) => ["workspace_id", eqFilter(workspaceId)];

function nowOf(now) {
  return now instanceof Date ? now.getTime() : Number(now) || Date.now();
}

function workspaceOrNull() {
  const workspaceId = resolveDefaultWorkspaceId();
  return workspaceId && resolveSupabaseConfig() ? workspaceId : null;
}

// 계약 고객은 매출 데이터가 넛지 억제를 싣지 않는다 — 일정과 맞은 계약만 따로 읽는다.
async function readAccountSuppressions(ids, workspaceId) {
  if (!ids.length) return new Map();
  const rows = await fetchSupabaseRows("customer_accounts", {
    select: "id,nudges:meta->nudges",
    filters: [ws(workspaceId), ["id", inFilter(ids)]],
    limit: ids.length,
  });
  if (!Array.isArray(rows)) return null;
  return new Map(rows.map((row) => [row.id, row.nudges && typeof row.nudges === "object" ? row.nudges : null]));
}

function failureMessage(failedSources) {
  const names = failedSources.map((key) => SOURCE_LABEL[key] || key).join(" · ");
  return `읽지 못한 곳: ${names} — 지금 보이는 것보다 후보가 더 있을 수 있어요.`;
}

export async function getRecordCandidates({ now = Date.now() } = {}) {
  const nowMs = nowOf(now);
  const workspaceId = workspaceOrNull();
  if (!workspaceId) {
    return { status: "preview", candidates: [], message: "Supabase 연결 전에는 기록 후보를 보여 줄 수 없어요." };
  }
  const since = new Date(nowMs - READ_WINDOW_MS).toISOString();

  const [revenue, activities, calendar, phoneRows, discardRows] = await Promise.all([
    getRevenueLedger().catch(() => ({ source: "error" })),
    listRecentActivities({ since, limit: 500 }).catch(() => null),
    readCombinedGoogleCalendarEvents({
      timeMin: new Date(nowMs - CANDIDATE_MAX_AGE_MS).toISOString(),
      timeMax: new Date(nowMs).toISOString(),
      maxResults: 60,
    }).catch(() => ({ ok: false, reason: "calendar-read-failed", items: [] })),
    fetchSupabaseRows("webhook_events", {
      select: "id,event_type,status,payload,received_at",
      filters: [
        ws(workspaceId),
        ["source", eqFilter(PHONE_EVENT_SOURCE)],
        ["status", eqFilter("received")],
        ["event_type", inFilter(Object.keys(PHONE_EVENT_TYPES))],
        ["received_at", `gte.${since}`],
      ],
      order: "received_at.desc",
      limit: PHONE_READ_LIMIT,
    }),
    fetchSupabaseRows("webhook_events", {
      select: "payload",
      filters: [ws(workspaceId), ["source", eqFilter(PHONE_EVENT_SOURCE)], ["provider_event_id", eqFilter(`discarded:${kstDayKey(new Date(nowMs))}`)]],
      limit: 1,
    }),
  ]);

  const revenueOk = revenue?.source === "supabase";
  const phoneOk = Array.isArray(phoneRows);
  const activitiesOk = Array.isArray(activities);
  const calendarFailed = !calendar?.ok && !CALENDAR_NOT_CONNECTED.has(calendar?.reason || "");
  if (!revenueOk && !phoneOk) {
    return { status: "error", failedSources: ["revenue", "phone"], candidates: [], message: "기록 후보를 불러오지 못했어요." };
  }

  const failedSources = [
    ...(revenueOk ? [] : ["revenue"]),
    ...(activitiesOk ? [] : ["crm_activities"]),
    ...(calendarFailed ? ["calendar"] : []),
    ...(phoneOk ? [] : ["phone"]),
  ];

  // 캘린더 후보는 "기록이 없다"를 말하므로 활동을 못 읽었으면 만들지 않는다 — 전부 미기록으로 보인다.
  let calendarCandidates = [];
  if (revenueOk && activitiesOk && calendar?.ok) {
    const owned = filterOperatorOwnedRevenue(revenue);
    const customers = calendarCustomersFrom({
      ...owned,
      accounts: (revenue.accounts || []).filter((account) => account?.owner === "Me"),
    });
    const meetings = findUnrecordedMeetings({ events: calendar.items || [], candidates: customers, activities, now: nowMs });
    const accountIds = [...new Set(meetings.filter((m) => m.customer?.kind === "account").map((m) => m.customer.id))];
    const accountSuppressions = await readAccountSuppressions(accountIds, workspaceId);
    if (accountSuppressions === null) failedSources.push("revenue");
    const withSuppression = customers.map((c) => (c.kind === "account" && accountSuppressions?.has(c.id)
      ? { ...c, suppression: accountSuppressions.get(c.id) }
      : c));
    // 계약 억제를 못 읽었으면 계약 일정은 빼고 보여 준다(숨긴 것이 다시 튀지 않게).
    const usable = accountSuppressions === null ? meetings.filter((m) => m.customer?.kind !== "account") : meetings;
    calendarCandidates = buildCalendarCandidates({ meetings: usable, customers: withSuppression, now: nowMs });
  }

  const nameByKey = new Map();
  if (revenueOk) {
    for (const lead of revenue.leads || []) if (lead?.id) nameByKey.set(`lead:${lead.id}`, lead.name);
    for (const account of revenue.accounts || []) if (account?.id) nameByKey.set(`account:${account.id}`, account.name);
  }
  const phoneCandidates = phoneOk
    ? buildPhoneCandidates({ rows: phoneRows, activities: activitiesOk ? activities : [], nameByKey, now: nowMs })
    : [];

  const discarded = Array.isArray(discardRows) ? Number(discardRows[0]?.payload?.count) : NaN;
  const uniqueFailed = [...new Set(failedSources)];
  return {
    status: uniqueFailed.length ? "partial" : "live",
    ...(uniqueFailed.length ? { failedSources: uniqueFailed, message: failureMessage(uniqueFailed) } : {}),
    calendarConnected: Boolean(calendar?.ok),
    candidates: mergeCandidates(calendarCandidates, phoneCandidates),
    ...(Number.isFinite(discarded) && discarded > 0 ? { discardedToday: discarded } : {}),
  };
}

// ── 정리(쓰기) ───────────────────────────────────────────────────────────────

const result = (status, httpStatus, extra = {}) => ({ status, httpStatus, ...extra });

export function validateRecordCandidateAction(input = {}) {
  const parsed = parseCandidateId(input?.id);
  if (!parsed) return { ok: false, reason: "invalid-id" };
  const action = String(input?.action || "");
  if (!ACTIONS.has(action)) return { ok: false, reason: "invalid-action" };
  if (parsed.source === "calendar") {
    if (!isCanonicalUuid(parsed.subjectId)) return { ok: false, reason: "invalid-id" };
    const reason = input?.reason == null ? "cancelled" : String(input.reason);
    if (action === "dismiss" && !CALENDAR_REASONS.has(reason)) return { ok: false, reason: "invalid-reason" };
    return { ok: true, parsed, action, reason };
  }
  return { ok: true, parsed, action, reason: null };
}

function identityOf(payload) {
  const customer = payload?.customer;
  if (!customer || typeof customer !== "object") return null;
  return customer.key || (customer.contactId ? `contact:${customer.contactId}` : null);
}

const TARGET_STATUS = { resolve: "processed", dismiss: "ignored", restore: "received" };

async function applyPhoneAction({ rowId, action }, workspaceId, now) {
  const base = [ws(workspaceId), ["source", eqFilter(PHONE_EVENT_SOURCE)]];
  const found = await fetchSupabaseRows("webhook_events", {
    select: "id,event_type,status,payload,received_at",
    filters: [...base, ["id", eqFilter(rowId)]],
    limit: 1,
  });
  if (!Array.isArray(found)) return result("failed", 502, { message: "후보를 읽지 못했어요. 다시 시도해 주세요." });
  const target = found[0];
  if (!target || !PHONE_EVENT_TYPES[target.event_type]) return result("not-found", 404, { message: "이미 사라진 후보예요." });

  const wanted = TARGET_STATUS[action];
  if (target.status === wanted) return result("duplicate", 200);
  const fromStatus = action === "restore" ? "ignored" : "received";
  if (target.status !== fromStatus) {
    return result("conflict", 409, { message: target.status === "processed" ? "이미 기록한 후보예요." : "다른 곳에서 먼저 정리됐어요." });
  }

  // 같은 고객·채널의 대기 후보는 한 줄로 묶여 보였다 — 함께 정리한다. 목록을 연 뒤 새로 온 것(더 늦은
  // 사건)은 운영자가 보지 못했으니 건드리지 않는다. 되돌리기는 같은 묶음(batch)만 되살린다.
  const identity = identityOf(target.payload);
  const targetAt = new Date(target.payload?.occurredAt || 0).getTime();
  const siblings = await fetchSupabaseRows("webhook_events", {
    select: "id,status,payload",
    filters: [
      ...base,
      ["event_type", eqFilter(target.event_type)],
      ["status", eqFilter(fromStatus)],
      ["received_at", `gte.${new Date(now.getTime() - READ_WINDOW_MS).toISOString()}`],
    ],
    limit: PHONE_READ_LIMIT,
  });
  const group = (Array.isArray(siblings) ? siblings : []).filter((row) => row.id !== target.id && (
    action === "restore"
      ? row.payload?.resolution?.batch === target.id
      : identity && identityOf(row.payload) === identity && new Date(row.payload?.occurredAt || 0).getTime() <= targetAt
  ));

  const at = now.toISOString();
  const nextPayload = (payload) => {
    if (action === "restore") {
      const { resolution, ...rest } = payload || {};
      return rest;
    }
    return {
      ...payload,
      // 기록으로 옮겨 간 내용은 후보에 남기지 않는다. 버린 것은 되돌리기를 위해 보존 기한까지만 둔다.
      ...(action === "resolve" ? { text: null } : {}),
      resolution: { action: action === "resolve" ? "recorded" : "dismissed", at, batch: target.id },
    };
  };
  const write = (row) => updateSupabaseRecord(
    "webhook_events",
    [...base, ["id", eqFilter(row.id)], ["status", eqFilter(fromStatus)]],
    { status: wanted, processed_at: action === "restore" ? null : at, payload: nextPayload(row.payload) },
    { returnRepresentation: true, select: "id" },
  );

  const main = await write(target);
  if (!main.persisted) {
    if (main.reason === "missing-config") return result("preview", 202, { saved: false });
    if (main.reason !== "no-matching-row") return result("failed", 502, { message: "정리하지 못했어요. 다시 시도해 주세요." });
    const again = await fetchSupabaseRows("webhook_events", { select: "id,status", filters: [...base, ["id", eqFilter(rowId)]], limit: 1 });
    return Array.isArray(again) && again[0]?.status === wanted ? result("duplicate", 200) : result("conflict", 409, { message: "다른 곳에서 먼저 정리됐어요." });
  }
  // 묶음의 나머지는 최선 노력 — 실패해도 대표가 정리됐으니 목록에서는 사라진다(다음 읽기에 남은 것은 다시 보인다).
  await Promise.all(group.map((row) => write(row).catch(() => null)));
  return result("saved", 200, { count: 1 + group.length });
}

function trimOutcomes(outcomes) {
  const entries = Object.entries(outcomes);
  if (entries.length <= CALENDAR_OUTCOME_LIMIT) return outcomes;
  return Object.fromEntries(entries
    .sort(([, a], [, b]) => String(b?.at || "").localeCompare(String(a?.at || "")))
    .slice(0, CALENDAR_OUTCOME_LIMIT));
}

async function applyCalendarAction({ subjectType, subjectId, eventKey }, action, reason, workspaceId, now) {
  // 캘린더 후보는 기록이 생기면 읽기에서 저절로 빠진다 — 해소에 쓸 것이 없다.
  if (action === "resolve") return result("accepted", 200, { detail: "기록이 확인되면 캘린더 후보는 저절로 사라져요." });

  const table = SUBJECT_TABLES[subjectType];
  const rows = await fetchSupabaseRows(table, { select: "meta", filters: [["id", eqFilter(subjectId)], ws(workspaceId)], limit: 1 });
  if (!Array.isArray(rows)) return result("failed", 502, { message: "고객 정보를 읽지 못해 저장을 멈췄어요." });
  if (!rows[0]) return result("not-found", 404, { message: "고객을 찾지 못했어요." });
  const meta = rows[0].meta && typeof rows[0].meta === "object" ? rows[0].meta : {};
  const nudges = meta.nudges && typeof meta.nudges === "object" ? meta.nudges : {};
  const dismissed = { ...(nudges.dismissed || {}) };
  const outcomes = { ...(meta.calendar_outcomes && typeof meta.calendar_outcomes === "object" ? meta.calendar_outcomes : {}) };
  const triggerKey = meetingTriggerKey(eventKey);

  if (action === "dismiss") {
    if (dismissed[triggerKey] && outcomes[eventKey]?.outcome === reason) return result("duplicate", 200);
    dismissed[triggerKey] = true;
    outcomes[eventKey] = { outcome: reason, at: now.toISOString() };
  } else {
    if (!dismissed[triggerKey] && !outcomes[eventKey]) return result("duplicate", 200);
    delete dismissed[triggerKey];
    delete outcomes[eventKey];
  }

  const saved = await persistRevenueRecord({
    table,
    op: "update",
    id: subjectId,
    payload: {},
    build: () => ({
      columns: {},
      metaPatch: { nudges: { ...nudges, dismissed, at: now.toISOString() }, calendar_outcomes: trimOutcomes(outcomes) },
    }),
  });
  if (saved.status === "saved") return result("saved", 200);
  if (saved.status === "preview") return result("preview", 202, { saved: false });
  return result("failed", 502, { message: "정리하지 못했어요. 다시 시도해 주세요." });
}

export async function applyRecordCandidateAction(input = {}, { now = new Date() } = {}) {
  const valid = validateRecordCandidateAction(input);
  if (!valid.ok) return result("invalid-input", 400, { reason: valid.reason });
  const workspaceId = workspaceOrNull();
  if (!workspaceId) return result("preview", 202, { saved: false, message: "Supabase 연결 전이라 저장되지 않았어요." });
  const at = now instanceof Date ? now : new Date(now);
  try {
    return valid.parsed.source === "phone"
      ? await applyPhoneAction({ rowId: valid.parsed.rowId, action: valid.action }, workspaceId, at)
      : await applyCalendarAction(valid.parsed, valid.action, valid.reason, workspaceId, at);
  } catch {
    return result("failed", 502, { message: "정리하지 못했어요. 다시 시도해 주세요." });
  }
}
