import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

const ledger = await import("./daily-review-ledger.js");
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "41c50d17-85b5-4672-8d05-408fa5a1bf8a";
const originalFetch = globalThis.fetch;
const originalError = console.error;
const envKeys = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "COM_MOON_DEFAULT_WORKSPACE_ID", "DEFAULT_WORKSPACE_ID"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const input = { reviewDate: "2026-09-12", energy: 2, focus: "", progress: null, note: "", expectedRevision: 0, requestId: REQUEST_ID };
const row = (extra = {}) => ({
  id: ID, workspace_id: WORKSPACE, entry_kind: "daily_review", review_date: "2026-09-12",
  review_timezone: "Asia/Seoul", focus_target: "", review_data: { energy: 2, progress: null },
  body: "", review_revision: 1, updated_at: "2026-09-12T01:00:00.000Z", ...extra,
});
let state;

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.SUPABASE_URL = "https://daily-review.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE;
  state = {
    calls: [], workspaces: [{ id: WORKSPACE, timezone: "Asia/Seoul", meta: {} }],
    rows: [], rpc: { status: "saved", review: row() }, failure: null, bypassFilters: false,
  };
  console.error = () => {};
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    const table = url.pathname.split("/").at(-1);
    const body = options.body ? JSON.parse(options.body) : null;
    state.calls.push({ url, options, table, body });
    if (state.failure?.(url, options)) return new Response("private SQL and credentials", { status: 500 });
    if (url.pathname.includes("/rpc/")) return Response.json(state.rpc);
    const rows = table === "workspaces" ? state.workspaces
      : table === "tasks" ? (state.tasks === undefined ? [] : state.tasks)
        : table === "crm_activities" ? (state.activities === undefined ? [] : state.activities)
          : state.rows;
    if (!Array.isArray(rows)) return Response.json(rows);
    if (state.bypassFilters) return Response.json(rows);
    const filtered = rows.filter((value) => [...url.searchParams.entries()].every(([key, filter]) => {
      if (filter.startsWith("eq.")) return String(value[key]) === filter.slice(3);
      if (filter.startsWith("gte.")) return String(value[key]) >= filter.slice(4);
      if (filter.startsWith("lte.")) return String(value[key]) <= filter.slice(4);
      return true;
    })).sort((a, b) => String(b.review_date).localeCompare(String(a.review_date)));
    return Response.json(filtered.slice(0, Number(url.searchParams.get("limit") || 100)));
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("daily review repository exposes read and atomic save operations", () => {
  assert.equal(typeof ledger.getDailyReviewLedger, "function");
  assert.equal(typeof ledger.saveDailyReview, "function");
});

test("missing config or workspace produces preview and never queries an unscoped table", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let result = await ledger.getDailyReviewLedger();
  assert.equal(result.status, "preview");
  assert.equal(result.configured, false);
  assert.equal(result.review, null);
  assert.deepEqual(result.entries, []);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  result = await ledger.getDailyReviewLedger();
  assert.equal(result.status, "preview");
  assert.equal(state.calls.length, 0);
});

test("server timezone resolves today's date across UTC boundary and historical timezone remains unchanged", async () => {
  state.rows = [row({ review_timezone: "America/New_York", body: "보존할 메모" })];
  const result = await ledger.getDailyReviewLedger({ now: new Date("2026-09-11T15:30:00Z"), workspaceId: OTHER, scope: "brand" });
  assert.equal(result.status, "live");
  assert.equal(result.reviewDate, "2026-09-12");
  assert.equal(result.month, "2026-09");
  assert.equal(result.timezone, "Asia/Seoul");
  assert.deepEqual(result.review, {
    id: ID, reviewDate: "2026-09-12", timezone: "America/New_York", energy: 2,
    focus: "", progress: null, note: "보존할 메모", revision: 1, updatedAt: "2026-09-12T01:00:00.000Z",
  });
  for (const call of state.calls.filter((call) => call.table === "journal_entries")) {
    assert.equal(call.url.searchParams.get("workspace_id"), `eq.${WORKSPACE}`);
    assert.equal(call.url.searchParams.get("entry_kind"), "eq.daily_review");
    assert.equal(call.options.cache, "no-store");
  }
});

test("month reads are bounded, exclude adjacent months, and selected detail may be outside the month", async () => {
  state.rows = [row({ review_date: "2024-01-31" }), row({ review_date: "2024-02-29", body: "x".repeat(400) }), row({ review_date: "2024-03-01" })];
  const result = await ledger.getDailyReviewLedger({ date: "2024-03-01", month: "2024-02" });
  assert.equal(result.review.reviewDate, "2024-03-01");
  assert.deepEqual(result.entries.map((entry) => entry.reviewDate), ["2024-02-29"]);
  assert.ok(result.entries[0].excerpt.length <= 180);
  assert.equal(Object.hasOwn(result.entries[0], "note"), false);
  const monthCall = state.calls.find((call) => call.url.searchParams.get("limit") === "31");
  assert.deepEqual(monthCall.url.searchParams.getAll("review_date"), ["gte.2024-02-01", "lte.2024-02-29"]);
  assert.equal(monthCall.url.searchParams.get("order"), "review_date.desc");
});

test("invalid read date and month return error envelopes without queries", async () => {
  for (const options of [{ date: "2026-02-30" }, { month: "2026-13" }, { date: "" }, { month: "2026-9" }]) {
    const result = await ledger.getDailyReviewLedger(options);
    assert.equal(result.status, "error");
    assert.equal(result.review, null);
    assert.deepEqual(result.entries, []);
  }
  assert.equal(state.calls.length, 0);
});

test("unavailable workspace or review reads produce error instead of a live empty day", async () => {
  state.workspaces = [];
  assert.equal((await ledger.getDailyReviewLedger()).status, "error");
  state.workspaces = [{ id: WORKSPACE, timezone: "Asia/Seoul" }];
  for (const target of ["workspaces", "journal_entries"]) {
    state.failure = (url) => url.pathname.endsWith(target);
    const result = await ledger.getDailyReviewLedger();
    assert.equal(result.status, "error");
    assert.equal(result.configured, true);
    assert.equal(JSON.stringify(result).includes("private SQL"), false);
  }
});

test("workspace timezone uses meta only if the column is blank and otherwise the rhythm fallback", async () => {
  state.workspaces = [{ id: WORKSPACE, timezone: "", meta: { timezone: "America/New_York" } }];
  assert.equal((await ledger.getDailyReviewLedger({ now: new Date("2026-09-12T00:30:00Z") })).reviewDate, "2026-09-11");
  state.workspaces[0].timezone = "not/a-zone";
  assert.equal((await ledger.getDailyReviewLedger()).timezone, "Asia/Seoul");
});

test("malformed or foreign rows fail closed rather than disclose another workspace", async () => {
  state.bypassFilters = true;
  for (const invalid of [row({ workspace_id: OTHER }), row({ entry_kind: "note" }), row({ review_data: { energy: "2", progress: null } })]) {
    state.rows = [invalid];
    const result = await ledger.getDailyReviewLedger({ date: "2026-09-12" });
    assert.equal(result.status, "error");
    assert.equal(result.review, null);
    assert.deepEqual(result.entries, []);
  }
  state.rows = [];
  state.workspaces[0].id = OTHER;
  assert.equal((await ledger.getDailyReviewLedger()).status, "error");
});

test("save sends only server scope and accepted full snapshot fields to the atomic RPC", async () => {
  const result = await ledger.saveDailyReview({ ...input, workspaceId: OTHER, timezone: "UTC", scope: "gore", review_revision: 99 });
  assert.equal(result.status, "saved");
  assert.equal(result.review.revision, 1);
  assert.equal(result.review.energy, 2);
  const rpc = state.calls.find((call) => call.options.method === "POST");
  assert.equal(rpc.table, "save_daily_review_v1");
  assert.deepEqual(rpc.body, {
    p_workspace_id: WORKSPACE, p_review_date: input.reviewDate, p_timezone: "Asia/Seoul",
    p_energy: 2, p_focus: "", p_progress: null, p_note: "", p_expected_revision: 0, p_request_id: REQUEST_ID,
  });
});

test("duplicate and conflict responses preserve the latest review returned by the RPC", async () => {
  state.rows = [row({ review_revision: 3, body: "후속 수정" })];
  state.rpc = { status: "duplicate", review: state.rows[0] };
  let result = await ledger.saveDailyReview(input);
  assert.equal(result.status, "duplicate");
  assert.equal(result.review.revision, 3);
  assert.equal(result.review.note, "후속 수정");
  state.rpc = { status: "conflict", error: "stale-revision", review: state.rows[0] };
  result = await ledger.saveDailyReview(input);
  assert.equal(result.status, "conflict");
  assert.equal(result.httpStatus, 409);
  assert.equal(result.review.revision, 3);
  assert.equal(result.review.note, "후속 수정");
  state.rpc = { status: "conflict", error: "revision-without-review", review: null };
  assert.equal((await ledger.saveDailyReview(input)).review, null);
});

test("invalid or unconfigured writes never claim success or call persistence", async () => {
  let result = await ledger.saveDailyReview({ ...input, energy: null });
  assert.equal(result.status, "invalid-input");
  assert.equal(result.httpStatus, 400);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  result = await ledger.saveDailyReview(input);
  assert.equal(result.status, "error");
  assert.equal(result.httpStatus, 503);
  assert.equal(result.review, null);
  assert.equal(state.calls.length, 0);
});

test("RPC transport errors and invalid success records are safe failure envelopes", async () => {
  state.failure = (url) => url.pathname.includes("/rpc/");
  let result = await ledger.saveDailyReview(input);
  assert.equal(result.status, "error");
  assert.equal(result.httpStatus, 502);
  assert.equal(JSON.stringify(result).includes("private SQL"), false);
  state.failure = null;
  for (const rpc of [null, { status: "saved", review: null }, { status: "saved", review: row({ workspace_id: OTHER }) }, { status: "saved", review: row({ review_date: "2026-09-11" }) }, { status: "invented", detail: "private SQL" }]) {
    state.rpc = rpc;
    result = await ledger.saveDailyReview(input);
    assert.equal(result.status, "error");
    assert.equal(result.httpStatus, 502);
    assert.equal(result.review, null);
    assert.equal(JSON.stringify(result).includes("private SQL"), false);
  }
});

// ---- 저녁 리뷰 읽기 전용 두 줄: 오늘 3개·연락 (2026-09-20 세 축·Action KPI 기획 §6.3) ----

test("live ledger carries today's focus and contact signals from the same sources as the weekly card", async () => {
  state.rows = [row()];
  state.tasks = [
    { id: "t1", workspace_id: WORKSPACE, title: "주요 과제 1", status: "done", completed_at: "2026-09-12T02:00:00.000Z", meta: { focus_dates: ["2026-09-12"] } },
    { id: "t2", workspace_id: WORKSPACE, title: "주요 과제 2", status: "todo", completed_at: null, meta: { focus_dates: ["2026-09-12"] } },
    // 완료 시각이 전날이면(재오픈 흔적) 오늘 완료로 치지 않는다
    { id: "t3", workspace_id: WORKSPACE, title: "주요 과제 3", status: "done", completed_at: "2026-09-11T02:00:00.000Z", meta: { focus_dates: ["2026-09-12"] } },
  ];
  state.activities = [
    { id: "a1", workspace_id: WORKSPACE, kind: "call", occurred_at: "2026-09-12T01:00:00.000Z" },
    { id: "a2", workspace_id: WORKSPACE, kind: "note", occurred_at: "2026-09-12T01:30:00.000Z" },
    // 서울 기준 다음 날 새벽(UTC 12일 16:00 = KST 13일 01:00)은 오늘이 아니다
    { id: "a3", workspace_id: WORKSPACE, kind: "kakao", occurred_at: "2026-09-12T16:00:00.000Z" },
  ];
  state.bypassFilters = true;
  const result = await ledger.getDailyReviewLedger({ date: "2026-09-12" });
  assert.equal(result.status, "live");
  assert.deepEqual(result.today, {
    date: "2026-09-12",
    focusPicked: 3,
    focusDone: 1,
    focusLimit: 3,
    focusTasks: [
      { id: "t1", title: "주요 과제 1", status: "done", done: true },
      { id: "t2", title: "주요 과제 2", status: "todo", done: false },
      { id: "t3", title: "주요 과제 3", status: "done", done: false },
    ],
    focusTitles: ["주요 과제 1", "주요 과제 2", "주요 과제 3"],
    contacts: 1,
  });
  const taskCall = state.calls.find((call) => call.table === "tasks");
  assert.equal(taskCall.url.searchParams.get("meta->focus_dates"), 'cs.["2026-09-12"]');
  assert.match(taskCall.url.searchParams.get("select"), /title/);
});

// 권장 카드의 목표 문구(focusTitles)는 제목을 다듬고 빈 제목을 뺀다(2026-09-23 지속 루프 설계 §4.4).
// Top 3 실행 결과 목록(focusTasks)은 같은 행을 모두 싣고 빈 제목만 "할 일"로 보여 준다.
test("focus titles are trimmed and exclude blank titles while focus tasks keep every picked row", async () => {
  state.rows = [row()];
  state.tasks = [
    { id: "t1", title: " 제안서 ", workspace_id: WORKSPACE, status: "done", completed_at: "2026-09-12T02:00:00.000Z", meta: { focus_dates: ["2026-09-12"] } },
    { id: "t2", title: "", workspace_id: WORKSPACE, status: "todo", completed_at: null, meta: { focus_dates: ["2026-09-12"] } },
    // 완료 시각이 전날이면(재오픈 흔적) 오늘 완료로 치지 않는다
    { id: "t3", workspace_id: WORKSPACE, status: "done", completed_at: "2026-09-11T02:00:00.000Z", meta: { focus_dates: ["2026-09-12"] } },
  ];
  state.activities = [
    { id: "a1", workspace_id: WORKSPACE, kind: "call", occurred_at: "2026-09-12T01:00:00.000Z" },
    { id: "a2", workspace_id: WORKSPACE, kind: "note", occurred_at: "2026-09-12T01:30:00.000Z" },
    { id: "a3", workspace_id: WORKSPACE, kind: "kakao", occurred_at: "2026-09-12T16:00:00.000Z" },
  ];
  state.bypassFilters = true;
  const result = await ledger.getDailyReviewLedger({ date: "2026-09-12" });
  assert.equal(result.status, "live");
  assert.deepEqual(result.today, {
    date: "2026-09-12",
    focusPicked: 3,
    focusDone: 1,
    focusLimit: 3,
    focusTasks: [
      { id: "t1", title: "제안서", status: "done", done: true },
      { id: "t2", title: "할 일", status: "todo", done: false },
      { id: "t3", title: "할 일", status: "done", done: false },
    ],
    focusTitles: ["제안서"],
    contacts: 1,
  });
  const taskCall = state.calls.find((call) => call.table === "tasks");
  assert.match(taskCall.url.searchParams.get("select"), /title/);
});

// ---- 최근 8일 기록: 오늘·홈 cue와 "이번 주 k/5" (2026-09-23 지속 루프 설계 §4.3·§4.5) ----

test("recent records are read relative to the real today, independent of the selected date", async () => {
  state.rows = [
    row({ review_date: "2026-09-22", review_data: { energy: 4, progress: null } }),
    row({ review_date: "2026-09-16", review_data: { energy: null, progress: null }, body: "메모" }),
    row({ review_date: "2026-09-09" }), // 범위 밖(14일 창)
  ];
  const result = await ledger.getDailyReviewLedger({ date: "2026-08-03", now: new Date("2026-09-23T03:00:00Z") });
  assert.equal(result.status, "live");
  assert.equal(result.todayKey, "2026-09-23");
  assert.deepEqual(result.recent, [{ reviewDate: "2026-09-22", energy: 4 }, { reviewDate: "2026-09-16", energy: null }]);
  const recentCall = state.calls.find((call) => call.table === "journal_entries" && call.url.searchParams.get("select") === "review_date,review_data");
  assert.deepEqual(recentCall.url.searchParams.getAll("review_date"), ["gte.2026-09-10", "lte.2026-09-23"]);
  assert.equal(recentCall.url.searchParams.get("workspace_id"), `eq.${WORKSPACE}`);
  assert.equal(recentCall.url.searchParams.get("entry_kind"), "eq.daily_review");
});

test("a failed recent read leaves recent null without failing the review", async () => {
  state.rows = [row()];
  state.failure = (url) => url.searchParams.get("select") === "review_date,review_data";
  const result = await ledger.getDailyReviewLedger({ date: "2026-09-12" });
  assert.equal(result.status, "live");
  assert.equal(result.recent, null);
  assert.ok(result.review);
});

test("a truncated activity read reports an unknown contact count, not a smaller one", async () => {
  state.rows = [row()];
  state.tasks = [];
  // 상한을 넘기면 읽기가 잘린 것이다 — 남은 행을 못 봤으니 숫자를 말하지 않는다.
  state.activities = Array.from({ length: ledger.ACTIVITY_SCAN_LIMIT + 2 }, (_, i) => ({
    id: `a${i}`, workspace_id: WORKSPACE, kind: "call", occurred_at: "2026-09-12T01:00:00.000Z",
  }));
  state.bypassFilters = true;
  const result = await ledger.getDailyReviewLedger({ date: "2026-09-12" });
  assert.equal(result.status, "live");
  assert.equal(result.today.contacts, null);
  assert.equal(result.today.focusPicked, 0); // 오늘 3개 줄은 그대로 살아 있다
  assert.deepEqual(result.today.focusTasks, []);
  assert.deepEqual(result.today.focusTitles, []);
  const activityCall = state.calls.find((call) => call.table === "crm_activities");
  assert.equal(activityCall.url.searchParams.get("limit"), String(ledger.ACTIVITY_SCAN_LIMIT + 1));
});

test("today signals fall back to null when a source cannot be read, without failing the review", async () => {
  state.rows = [row()];
  // tasks 읽기만 500 — 리뷰 자체는 살아 있고 today만 비운다.
  state.failure = (url) => url.pathname.endsWith("/tasks");
  state.bypassFilters = true;
  const result = await ledger.getDailyReviewLedger({ date: "2026-09-12" });
  assert.equal(result.status, "live");
  assert.equal(result.today, null);
  assert.ok(result.review);
});
