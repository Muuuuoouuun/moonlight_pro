import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

// followups-ledger는 IO(server-read/write·컷오버·활동 읽기)를 얇게 감싼다. 순수 코어
// buildFollowupItems는 스텁 없이 고정하고, getFollowups는 소스 스텁으로 봉투를 고정한다.
const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(filters = []) { return [["workspace_id", "eq.ws-1"], ...filters]; }
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__followupsState.calls.push({ table, options });
  return globalThis.__followupsState.rows[table];
}
`;
const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "ws-1"; }
export function resolveSupabaseConfig() { return { url: "https://example.test", key: "k" }; }
export async function updateSupabaseRecord() { return { persisted: true }; }
export async function upsertSupabaseRecords() { return { persisted: true }; }
`;
const trackingStub = `
export async function getContactTrackingStartedAt() { return globalThis.__followupsState.trackingStartedAt; }
`;
const activitiesStub = `
export async function listRecentActivities(options) {
  globalThis.__followupsState.calls.push({ table: "crm_activities", options });
  return globalThis.__followupsState.activities;
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/server-read": serverReadStub,
      "@/lib/server-write": serverWriteStub,
      "@/lib/sales-os/contact-tracking": trackingStub,
      "@/lib/repositories/crm-activities": activitiesStub,
    };
    if (stubs[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__followupsState = { calls: [], rows: {}, activities: [], trackingStartedAt: null };
const { buildFollowupItems, getFollowups } = await import("./followups-ledger.js?crm-activities-source");
const { groupFollowups } = await import("../sales-os/followup-groups.js");

const NOW = Date.parse("2026-09-21T03:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const lead = (overrides = {}) => ({
  id: "lead-1", name: "한빛학원", status: "nurturing", score: 50, next_action: null, company_id: "co-1",
  channel: null, source: "manual", last_touch_at: daysAgo(10), updated_at: daysAgo(10), created_at: daysAgo(30), meta: {},
  ...overrides,
});
const companies = [{ id: "co-1", name: "한빛학원", phone: "010-0000-0000" }];

beforeEach(() => {
  state.calls = [];
  state.trackingStartedAt = null;
  state.activities = [];
  state.rows = { leads: [lead()], deals: [], companies };
});

test("last contact reaction shows up in `왜 지금`, joined through company_id like live rows", () => {
  const items = buildFollowupItems({
    leadRows: [lead()],
    companies,
    activities: [
      { id: "a1", kind: "call", reaction: "concern", body: "단가 문의", leadId: null, companyId: "co-1", occurredAt: daysAgo(3) },
    ],
    now: NOW,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].why, "마지막 통화 3일 전 · 우려 · nurturing");
  assert.equal(items[0].lastAction, "replied");
});

test("no_response ranks below a positive reply at equal staleness", () => {
  const leads = [lead({ id: "lead-pos", company_id: "co-pos" }), lead({ id: "lead-nr", company_id: "co-nr" })];
  const items = buildFollowupItems({
    leadRows: leads,
    companies: [{ id: "co-pos", name: "A" }, { id: "co-nr", name: "B" }],
    activities: [
      { id: "a1", kind: "call", reaction: "positive", leadId: "lead-pos", companyId: "co-pos", occurredAt: daysAgo(1) },
      { id: "a2", kind: "call", reaction: "no_response", leadId: "lead-nr", companyId: "co-nr", occurredAt: daysAgo(1) },
    ],
    now: NOW,
  });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.ok(byId["lead-pos"].priority > byId["lead-nr"].priority);
  assert.equal(byId["lead-nr"].lastAction, "no_response");
});

test("notes are not contacts — they never become the last touch", () => {
  const items = buildFollowupItems({
    leadRows: [lead()],
    companies,
    activities: [{ id: "n1", kind: "note", reaction: null, body: "메모", leadId: "lead-1", companyId: "co-1", occurredAt: daysAgo(1) }],
    now: NOW,
  });
  assert.equal(items[0].why, "10일째 무접촉 · nurturing");
  assert.equal(items[0].lastAction, null);
});

test("meeting kinds fold into the meeting action for the deal lane too", () => {
  const items = buildFollowupItems({
    dealRows: [{ id: "deal-1", title: "한빛 20대", stage: "proposal", amount: 12000000, company_id: "co-1", last_activity_at: daysAgo(6), updated_at: daysAgo(6), created_at: daysAgo(20), meta: {} }],
    companies,
    activities: [{ id: "m1", kind: "demo", reaction: "neutral", dealId: "deal-1", companyId: "co-1", occurredAt: daysAgo(2) }],
    now: NOW,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "deal");
  assert.equal(items[0].why, "마지막 데모 2일 전 · 중립 · proposal");
  assert.equal(items[0].lastAction, "meeting");
});

test("Q117 tier-2 rows outside the tracking window only enter on their due date", () => {
  // 최근 접촉(정체 아님)이라 날짜 도래만으로 유입되는 경로를 정확히 친다.
  const fresh = { last_touch_at: daysAgo(1), updated_at: daysAgo(1) };
  const future = lead({ id: "lead-future", company_id: null, meta: { next_action_at: daysAgo(-3).slice(0, 10) }, ...fresh });
  const due = lead({ id: "lead-due", company_id: null, meta: { next_action_at: daysAgo(1).slice(0, 10) }, ...fresh });
  const items = buildFollowupItems({ leadRows: [], datedLeadRows: [future, due], companies: [], activities: [], now: NOW });
  assert.deepEqual(items.map((i) => i.id), ["lead-due"]);
  assert.match(items[0].why, /예약한 연락일 도래/);
});

test("getFollowups reads crm_activities (not outreach_outcomes) and names its read failure", async () => {
  state.activities = [{ id: "a1", kind: "kakao", reaction: null, body: "자료", leadId: null, companyId: "co-1", occurredAt: daysAgo(2) }];
  const ok = await getFollowups({ limit: 10 });
  assert.equal(ok.source, "supabase");
  assert.ok(state.calls.some((c) => c.table === "crm_activities"));
  assert.ok(!state.calls.some((c) => c.table === "outreach_outcomes"));
  assert.match(ok.items[0].why, /마지막 카톡 2일 전/);
  assert.equal(ok.partial, false);

  state.calls = [];
  state.activities = null;
  const partial = await getFollowups({ limit: 10 });
  assert.equal(partial.partial, true);
  assert.deepEqual(partial.failedSources, ["crm_activities"]);
});

// ── 0b: 행이 실제로 그려지는 데 필요한 필드 ─────────────────────────────────────
// FollowupRow는 bucket·href·companyId·lastNote·lastReaction을 읽는데 원장이 만들지 않아
// 버킷 필터(항상 0)·지남 레일·행 클릭·최근 대화 줄이 전부 죽어 있었다.

test("rows carry companyId so the activity panel joins the way live records are linked", () => {
  const items = buildFollowupItems({ leadRows: [lead()], companies, activities: [], now: NOW });
  assert.equal(items[0].companyId, "co-1");
});

test("bucket comes from the promised date, not from staleness", () => {
  const promised = (at, id) => lead({
    id, company_id: null, last_touch_at: daysAgo(1), updated_at: daysAgo(1), meta: { next_action_at: at },
  });
  const items = buildFollowupItems({
    leadRows: [],
    datedLeadRows: [
      promised(daysAgo(2).slice(0, 10), "missed"),
      promised(new Date(NOW).toISOString().slice(0, 10), "today"),
    ],
    companies: [],
    activities: [],
    now: NOW,
  });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.missed.bucket, "overdue");
  assert.equal(byId.today.bucket, "today");
  // 정체로만 올라온 행은 약속 날짜가 없다 — 오늘 화면의 빨강을 차지하지 않는다.
  const stale = buildFollowupItems({ leadRows: [lead()], companies, activities: [], now: NOW });
  assert.equal(stale[0].bucket, "later");
  assert.deepEqual(groupFollowups(stale).missed, []);
});

test("rows carry an href for both lanes", () => {
  const items = buildFollowupItems({
    leadRows: [lead()],
    dealRows: [{ id: "deal-1", title: "한빛 20대", stage: "proposal", amount: 1, company_id: "co-1", last_activity_at: daysAgo(9), updated_at: daysAgo(9), created_at: daysAgo(20), meta: {} }],
    companies,
    activities: [],
    now: NOW,
  });
  const byKind = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(byKind.lead.href, "dashboard/revenue/customers?customer=lead%3Alead-1");
  assert.equal(byKind.deal.href, "dashboard/revenue/deals?deal=deal-1");
});

test("the last conversation line carries its excerpt, kind and reaction", () => {
  const long = "가".repeat(120);
  const items = buildFollowupItems({
    leadRows: [lead()],
    companies,
    activities: [{ id: "a1", kind: "call", reaction: "concern", body: long, leadId: "lead-1", companyId: "co-1", occurredAt: daysAgo(2) }],
    now: NOW,
  });
  assert.equal(items[0].lastReaction, "concern");
  assert.equal(items[0].lastKind, "call");
  assert.equal(items[0].lastNote.length, 81); // 80자 + 줄임표
  assert.ok(items[0].lastNote.endsWith("…"));
  // 기록이 없으면 빈 문자열이 아니라 null — 화면이 "최근 대화" 줄 자체를 그리지 않는다.
  const none = buildFollowupItems({ leadRows: [lead()], companies, activities: [], now: NOW });
  assert.equal(none[0].lastNote, null);
  assert.equal(none[0].lastReaction, null);
});

test("summary.overdue counts missed promises, not the whole list", async () => {
  state.trackingStartedAt = null;
  state.rows.leads = [
    lead({ id: "missed", company_id: null, last_touch_at: daysAgo(1), updated_at: daysAgo(1), meta: { next_action_at: daysAgo(2).slice(0, 10) } }),
    lead({ id: "stale", company_id: null }),
  ];
  state.activities = [];

  const res = await getFollowups({ limit: 10 });

  assert.equal(res.summary.total, 2);
  assert.equal(res.summary.overdue, 1);
  assert.equal(res.summary.dueToday, 0);
});
