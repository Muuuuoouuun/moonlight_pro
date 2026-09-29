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
const {
  buildFollowupItems,
  buildPromiseBook,
  buildWeekStats,
  getFollowups,
  kstWeekStartKey,
  sanitizeTargetQuery,
  searchContactTargets,
} = await import("./followups-ledger.js?crm-activities-source");
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
  state.rows = { leads: [lead()], deals: [], companies, crm_activities: [] };
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
  // getFollowups는 IO 경로라 buildFollowupItems에 now를 넘기지 않는다(실시간 Date.now()).
  // 고정 NOW 기준의 daysAgo()를 쓰면 날짜가 바뀌는 순간 일수가 어긋난다 — 실제로 자정을
  // 넘기며 이 테스트가 깨졌다. 여기서는 실시간 기준으로 만들고 일수는 패턴으로만 본다.
  const realDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  state.activities = [{ id: "a1", kind: "kakao", reaction: null, body: "자료", leadId: null, companyId: "co-1", occurredAt: realDaysAgo(2) }];
  const ok = await getFollowups({ limit: 10 });
  assert.equal(ok.source, "supabase");
  assert.ok(state.calls.some((c) => c.table === "crm_activities"));
  assert.ok(!state.calls.some((c) => c.table === "outreach_outcomes"));
  assert.match(ok.items[0].why, /마지막 카톡 \d+일 전/);
  assert.equal(ok.partial, false);

  state.calls = [];
  state.activities = null;
  const partial = await getFollowups({ limit: 10 });
  assert.equal(partial.partial, true);
  assert.deepEqual(partial.failedSources, ["crm_activities"]);
});

// ── 0b: 행이 실제로 그려지는 데 필요한 필드 ─────────────────────────────────────
// FollowupRow는 bucket·href·companyId·lastNote·lastReaction을 읽는데 저장소 읽기가 만들지 않아
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

test("the cap keeps missed promises in the list, and the header counts what shipped", async () => {
  state.trackingStartedAt = null;
  // 어긴 약속은 방금 연락했고 점수도 0이라 priority가 가장 낮다 — 정렬축(staleness·value)은
  // 약속 날짜와 무관하므로 단순 slice면 상한 밖으로 밀린다.
  state.rows.leads = [
    lead({ id: "missed", company_id: null, score: 0, last_touch_at: daysAgo(1), updated_at: daysAgo(1), meta: { next_action_at: daysAgo(2).slice(0, 10) } }),
    ...Array.from({ length: 5 }, (_, i) => lead({ id: `stale-${i}`, company_id: null, score: 90, last_touch_at: daysAgo(60), updated_at: daysAgo(60) })),
  ];
  state.activities = [];

  const res = await getFollowups({ limit: 3 });

  assert.equal(res.summary.total, 6);
  assert.equal(res.summary.shown, 3);
  assert.ok(res.items.some((item) => item.id.includes("missed")), "어긴 약속이 잘려 나가면 안 된다");
  // 헤더 수치는 화면이 다시 묶는 그 목록에서 나온다.
  assert.equal(res.summary.overdue, groupFollowups(res.items).missed.length);
  assert.equal(res.summary.dueToday, groupFollowups(res.items).today.length);
  assert.equal(res.summary.overdue, 1);
});

// ── 2026-09-24 오늘 연락: 약속 장부 · 이번 주 · 고객 고르기 ─────────────────────────

test("deal rows read the promise from the next_action column the contact RPC writes", async () => {
  const items = buildFollowupItems({
    dealRows: [{ id: "deal-1", title: "한빛 20대", stage: "proposal", amount: 1, next_action: "견적서 보내기", company_id: "co-1", last_activity_at: daysAgo(9), updated_at: daysAgo(9), created_at: daysAgo(20), meta: {} }],
    companies,
    now: NOW,
  });
  assert.equal(items[0].promiseText, "견적서 보내기");
  assert.equal(items[0].nextAction, "견적서 보내기");
  // 읽기도 그 컬럼을 고른다 — select에 없으면 위 매핑이 늘 비어 있다.
  await getFollowups({ limit: 5 });
  const dealRead = state.calls.find((c) => c.table === "deals");
  assert.match(dealRead.options.select, /\bnext_action\b/);
});

test("items carry the raw promise text (null when unset) and the last contact time", () => {
  const items = buildFollowupItems({
    leadRows: [lead()],
    companies,
    activities: [{ id: "a1", kind: "call", reaction: "positive", leadId: "lead-1", companyId: "co-1", occurredAt: daysAgo(2) }],
    now: NOW,
  });
  assert.equal(items[0].promiseText, null);
  assert.equal(items[0].nextAction, "다음 행동 정하기"); // 옛 화면용 채움 문구는 그대로
  assert.equal(items[0].lastContactAt, daysAgo(2));
});

test("the promise book lists only future promises, soonest first, and skips dormant or snoozed rows", () => {
  const dated = (id, at, meta = {}) => lead({ id, company_id: null, meta: { next_action_at: at, ...meta } });
  const tomorrow = new Date(NOW + 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(NOW + 7 * 86400000).toISOString().slice(0, 10);
  const book = buildPromiseBook({
    datedLeadRows: [
      dated("later", nextWeek),
      dated("soon", tomorrow),
      dated("due", new Date(NOW).toISOString().slice(0, 10)), // 오늘 도래 — items가 담는다
      dated("sleeping", tomorrow, { dormant: true }),
      dated("snoozed", tomorrow, { snooze_until: new Date(NOW + 3 * 86400000).toISOString() }),
    ],
    datedDealRows: [{ id: "deal-1", title: "한빛 20대", stage: "proposal", amount: 1200000, next_action: "계약서", company_id: "co-1", meta: { next_action_at: tomorrow } }],
    companies,
    now: NOW,
  });
  assert.deepEqual(book.upcoming.map((r) => r.id), ["soon", "deal-1", "later"]);
  const deal = book.upcoming.find((r) => r.kind === "deal");
  assert.equal(deal.promiseText, "계약서");
  assert.equal(deal.company, "한빛학원");
  assert.equal(deal.href, "dashboard/revenue/deals?deal=deal-1");
});

test("dormant customers sort oldest first and ask to recheck after 30 days", () => {
  const sleeping = (id, days) => lead({ id, company_id: null, meta: { dormant: true, dormant_since: new Date(NOW - days * 86400000).toISOString() } });
  const book = buildPromiseBook({
    dormantLeadRows: [sleeping("fresh", 3), sleeping("old", 32), lead({ id: "no-date", company_id: null, meta: { dormant: true } })],
    now: NOW,
  });
  assert.deepEqual(book.dormant.map((r) => r.id), ["old", "fresh", "no-date"]);
  assert.equal(book.dormant[0].dormantDays, 32);
  assert.equal(book.dormant[0].recheck, true);
  assert.equal(book.dormant[1].recheck, false);
  assert.equal(book.dormant[2].dormantDays, null);
});

test("the KST week starts on Monday, even late on a Sunday in UTC terms", () => {
  // 2026-09-27(일) 23:30 KST = 14:30 UTC
  assert.equal(kstWeekStartKey(Date.parse("2026-09-27T14:30:00Z")), "2026-09-21");
  // 2026-09-21(월) 00:10 KST = 2026-09-20 15:10 UTC — UTC로는 일요일이지만 KST 월요일이다.
  assert.equal(kstWeekStartKey(Date.parse("2026-09-20T15:10:00Z")), "2026-09-21");
});

test("week stats count conversations, not notes or automatic rows, and never invent timing", () => {
  const at = (iso) => iso; // KST 기준 시각을 UTC로 적는다
  const now = Date.parse("2026-09-24T06:00:00Z"); // 9/24(목) 15:00 KST
  const week = buildWeekStats({
    now,
    activities: [
      { kind: "call", leadId: "l1", occurredAt: at("2026-09-21T01:00:00Z"), meta: {} }, // 월
      { kind: "kakao", leadId: "l1", occurredAt: at("2026-09-22T01:00:00Z"), meta: {} }, // 화, 같은 고객
      { kind: "meeting", dealId: "d1", occurredAt: at("2026-09-24T02:00:00Z"), meta: { capture: { record_seconds: 20 } } }, // 목(오늘)
      { kind: "note", leadId: "l2", occurredAt: at("2026-09-24T03:00:00Z"), meta: { capture: { record_seconds: 40 } } }, // 목, 메모
      { kind: "deal", dealId: "d1", occurredAt: at("2026-09-24T04:00:00Z"), meta: {} }, // 자동 — 세지 않는다
      { kind: "call", leadId: "l3", occurredAt: at("2026-09-24T04:30:00Z"), meta: { capture: { record_seconds: 9000 } } }, // 자리 비움 — 시간에서 뺀다
      { kind: "call", leadId: "l9", occurredAt: at("2026-09-19T01:00:00Z"), meta: {} }, // 지난주
    ],
  });
  assert.equal(week.startKey, "2026-09-21");
  assert.equal(week.contacts, 4);
  assert.equal(week.customers, 3); // l1 · d1 · l3
  assert.equal(week.recordsToday, 3); // 회의 · 메모 · 통화 (자동 행 제외)
  assert.equal(week.customersRecordedToday, 3); // d1 · l2 · l3
  assert.deepEqual(week.recordSeconds, { count: 2, average: 30 });
  assert.deepEqual(week.days.map((d) => [d.label, d.count]), [["월", 1], ["화", 1], ["수", 0], ["목", 2], ["금", 0]]);
  assert.equal(week.days.find((d) => d.label === "목").today, true);
  assert.equal(week.days.find((d) => d.label === "금").future, true);

  const empty = buildWeekStats({ now, activities: [] });
  assert.equal(empty.recordSeconds, null, "측정이 없으면 null — 화면은 '측정 전'을 말한다");
  // 주말은 기록이 있을 때만 막대를 세운다.
  const weekend = buildWeekStats({ now: Date.parse("2026-09-26T03:00:00Z"), activities: [{ kind: "call", leadId: "x", occurredAt: "2026-09-26T02:00:00Z", meta: {} }] });
  assert.deepEqual(weekend.days.map((d) => d.label), ["월", "화", "수", "목", "금", "토"]);
});

test("getFollowups ships the promise book and week, and names an auxiliary read failure as partial", async () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  state.rows.leads = [lead({ id: "promised", company_id: null, last_touch_at: new Date().toISOString(), meta: { next_action_at: future } })];
  state.rows.crm_activities = [{ id: "w1", kind: "call", lead_id: "promised", occurred_at: new Date().toISOString(), meta: {} }];
  const ok = await getFollowups({ limit: 10 });
  assert.equal(ok.partial, false);
  assert.deepEqual(ok.upcoming.map((r) => r.id), ["promised"]);
  assert.equal(ok.summary.upcoming, 1);
  assert.equal(ok.week.contacts, 1);
  // 이번 주 읽기는 KST 월요일 00:00부터다.
  const weekRead = state.calls.find((c) => c.table === "crm_activities" && c.options?.filters);
  assert.ok(weekRead.options.filters.some(([key, value]) => key === "occurred_at" && value === `gte.${new Date(`${kstWeekStartKey()}T00:00:00+09:00`).toISOString()}`));

  state.rows.crm_activities = null;
  const partial = await getFollowups({ limit: 10 });
  assert.equal(partial.week, null, "주간 읽기 실패를 0으로 위장하지 않는다");
  assert.deepEqual(partial.auxiliaryFailedSources, ["week_activities"]);
  // 화면 전용 읽기 실패는 크론이 보는 partial(핵심 소스)을 올리지 않는다 — 자동 초안 크론은
  // partial이면 멈춘다(followup-autopilot).
  assert.equal(partial.partial, false);
  assert.deepEqual(partial.failedSources, []);
});

test("contact target search strips PostgREST syntax and names a total read failure", async () => {
  assert.equal(sanitizeTargetQuery("  한빛*(학원),%  "), "한빛 학원");
  assert.equal(sanitizeTargetQuery("a".repeat(80)).length, 40);

  state.rows.leads = [{ id: "lead-1", name: "김원장", status: "nurturing", company_id: "co-1" }];
  state.rows.companies = [{ id: "co-1", name: "한빛학원" }];
  state.rows.customer_accounts = [{ id: "acc-1", name: "한빛학원", company_id: "co-1", status: "active" }];
  state.rows.deals = [{ id: "deal-1", title: "한빛 20대", stage: "proposal", company_id: "co-1" }];
  const res = await searchContactTargets({ q: "한빛" });
  assert.equal(res.source, "supabase");
  // 이름으로 찾은 리드와 학원으로 찾은 리드가 같으면 한 번만.
  assert.deepEqual(res.targets.map((t) => `${t.kind}:${t.id}`), ["lead:lead-1", "account:acc-1", "deal:deal-1"]);
  assert.equal(res.targets[0].org, "한빛학원");
  const leadSearch = state.calls.find((c) => c.table === "leads" && c.options.filters.some(([k]) => k === "name"));
  assert.ok(leadSearch.options.filters.some(([k, v]) => k === "name" && v === "ilike.*한빛*"));

  const empty = await searchContactTargets({ q: "**" });
  assert.deepEqual(empty, { source: "supabase", targets: [] });

  state.rows = { leads: null, companies: null, customer_accounts: null, deals: null };
  const failed = await searchContactTargets({ q: "한빛" });
  assert.equal(failed.source, "error");
});
