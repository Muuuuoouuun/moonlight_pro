// 기록 후보 읽기·정리 왕복. 매출 데이터·활동·캘린더는 모듈 스텁, webhook_events와 고객 meta 쓰기는
// 실제 공용 REST 클라이언트 + fetch 스텁 — "숨겼는데 다시 뜬다"·"읽기 실패가 빈 목록으로 보인다"를
// 저장소 경계에서 잡는다.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, test } from "node:test";

const revenueStub = `export async function getRevenueLedger() { const s = globalThis.__rc; if (s.revenueThrows) throw new Error("down"); return s.revenue; }`;
const activitiesStub = `export async function listRecentActivities() { return globalThis.__rc.activities; }`;
const calendarStub = `export async function readCombinedGoogleCalendarEvents() { return globalThis.__rc.calendar; }`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/repositories/record-candidates.js")) {
      const stub = { "./revenue-ledger.js": revenueStub, "./crm-activities.js": activitiesStub, "../google-calendar.js": calendarStub }[specifier];
      if (stub) return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__rc = {};
const repo = await import("./record-candidates.js");

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const ROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-09-24T08:05:00Z");
const kst = (local) => new Date(`${local}+09:00`).toISOString();
const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "COM_MOON_DEFAULT_WORKSPACE_ID"];
const savedEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

const customer = { kind: "lead", id: LEAD, key: `lead:${LEAD}`, name: "서연영어", org: "서연영어", person: "박서연 실장", companyId: "co-9", leadId: LEAD, accountId: null, contactId: "ct-9" };
const phoneRow = (id, occurredLocal, text) => ({
  id, workspace_id: WORKSPACE, source: "phone-capture", event_type: "phone.kakao", status: "received", received_at: kst(occurredLocal),
  payload: { v: 1, channel: "kakao", direction: "in", occurredAt: kst(occurredLocal), durationSec: null, text, matchedOn: "name", customer },
});

let tables, calls, failTables;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://record-candidates.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE;
  state.revenueThrows = false;
  state.revenue = {
    source: "supabase",
    leads: [{ id: LEAD, name: "서연영어", companyName: "서연영어", companyId: "co-9", owner: "Me", nudgeSuppression: null }],
    deals: [],
    accounts: [],
  };
  state.activities = [];
  state.calendar = {
    ok: true,
    items: [{ id: "evt-1", summary: "서연영어 상담", start: { dateTime: kst("2026-09-23T14:00:00") }, end: { dateTime: kst("2026-09-23T15:00:00") } }],
  };
  failTables = new Set();
  calls = [];
  tables = {
    webhook_events: [
      phoneRow(ROW_A, "2026-09-24T17:05:00", "다음 주 화요일 4시에 체험 수업 가능할까요?"),
      phoneRow(ROW_B, "2026-09-24T09:00:00", "자료 잘 받았습니다"),
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", workspace_id: WORKSPACE, source: "phone-capture", event_type: "phone.discarded",
        status: "processed", provider_event_id: "discarded:2026-09-24", payload: { count: 14 }, received_at: kst("2026-09-24T08:00:00") },
    ],
    leads: [{ id: LEAD, workspace_id: WORKSPACE, meta: { region: "서울", nudges: { snoozedUntil: "2026-09-30" } } }],
  };
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    const table = url.pathname.split("/").pop();
    const method = options.method || "GET";
    calls.push({ table, method, params: [...url.searchParams], body: options.body ? JSON.parse(options.body) : null });
    if (failTables.has(table)) return new Response("unavailable", { status: 503 });
    const rows = tables[table] || [];
    const matches = (row) => [...url.searchParams].every(([key, value]) => {
      if (["select", "limit", "order"].includes(key)) return true;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row[key]));
      if (value.startsWith("gte.")) return String(row[key]) >= value.slice(4);
      return true;
    });
    if (method === "PATCH") {
      const body = JSON.parse(options.body);
      const hit = rows.filter(matches);
      hit.forEach((row) => Object.assign(row, body));
      return Response.json(hit.map((row) => ({ id: row.id, meta: row.meta })));
    }
    return Response.json(rows.filter(matches));
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test("live read merges calendar and phone candidates newest first with today's discard count", async () => {
  const data = await repo.getRecordCandidates({ now: NOW });
  assert.equal(data.status, "live");
  assert.equal(data.discardedToday, 14);
  assert.deepEqual(data.candidates.map((c) => c.id), [`phone:${ROW_A}`, `calendar:lead:${LEAD}:evt-1`]);
  const [kakao, meeting] = data.candidates;
  assert.equal(kakao.count, 2);
  assert.equal(kakao.promiseHint.dueAt, "2026-09-29T16:00:00+09:00");
  assert.equal(meeting.customer.key, `lead:${LEAD}`);
  // 폰 사건 읽기는 이 워크스페이스의 phone-capture received 행만 겨눈다.
  const phoneRead = calls.find((c) => c.table === "webhook_events" && c.params.some(([k, v]) => k === "status" && v === "eq.received"));
  assert.ok(phoneRead.params.some(([k, v]) => k === "workspace_id" && v === `eq.${WORKSPACE}`));
  assert.ok(phoneRead.params.some(([k, v]) => k === "source" && v === "eq.phone-capture"));
});

test("read failures are named, never shown as an empty list", async () => {
  failTables.add("webhook_events");
  const partial = await repo.getRecordCandidates({ now: NOW });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.failedSources, ["phone"]);
  assert.match(partial.message, /휴대폰 후보/);
  assert.deepEqual(partial.candidates.map((c) => c.source), ["calendar"]);

  state.revenue = { source: "error" };
  const error = await repo.getRecordCandidates({ now: NOW });
  assert.equal(error.status, "error");
  assert.deepEqual(error.candidates, []);

  // 활동을 못 읽으면 "기록이 없다"를 말할 수 없다 — 캘린더 후보를 만들지 않는다.
  failTables.clear();
  state.revenue = { source: "supabase", leads: state.revenue.leads || [], deals: [], accounts: [] };
  state.revenue.leads = [{ id: LEAD, name: "서연영어", companyId: "co-9", owner: "Me" }];
  state.activities = null;
  const noActivities = await repo.getRecordCandidates({ now: NOW });
  assert.equal(noActivities.status, "partial");
  assert.deepEqual(noActivities.failedSources, ["crm_activities"]);
  assert.equal(noActivities.candidates.some((c) => c.source === "calendar"), false);

  // 캘린더 미연결은 실패가 아니다.
  state.activities = [];
  state.calendar = { ok: false, reason: "missing-connection", items: [] };
  assert.equal((await repo.getRecordCandidates({ now: NOW })).status, "live");
  state.calendar = { ok: false, reason: "calendar-read-failed", items: [] };
  assert.deepEqual((await repo.getRecordCandidates({ now: NOW })).failedSources, ["calendar"]);
});

test("without Supabase the read is preview and writes are not persisted", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const data = await repo.getRecordCandidates({ now: NOW });
  assert.equal(data.status, "preview");
  const write = await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "dismiss" }, { now: NOW });
  assert.equal(write.status, "preview");
  assert.equal(write.saved, false);
  assert.equal(calls.length, 0);
});

test("dismissing a phone candidate hides the whole customer burst and restore brings it back", async () => {
  const dismissed = await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "dismiss" }, { now: NOW });
  assert.equal(dismissed.status, "saved");
  assert.equal(dismissed.count, 2);
  const [a, b] = tables.webhook_events;
  assert.equal(a.status, "ignored");
  assert.equal(b.status, "ignored");
  assert.equal(b.payload.resolution.batch, ROW_A);
  assert.equal(a.payload.text, "다음 주 화요일 4시에 체험 수업 가능할까요?", "dismissed text survives for undo until retention");
  assert.equal((await repo.getRecordCandidates({ now: NOW })).candidates.some((c) => c.source === "phone"), false);
  assert.equal((await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "dismiss" }, { now: NOW })).status, "duplicate");

  const restored = await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "restore" }, { now: NOW });
  assert.equal(restored.status, "saved");
  assert.equal(a.status, "received");
  assert.equal(b.status, "received");
  assert.equal(a.payload.resolution, undefined);
  assert.equal((await repo.getRecordCandidates({ now: NOW })).candidates[0].id, `phone:${ROW_A}`);
});

test("resolving after a record marks the events processed and drops their text", async () => {
  const resolved = await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "resolve" }, { now: NOW });
  assert.equal(resolved.status, "saved");
  const [a] = tables.webhook_events;
  assert.equal(a.status, "processed");
  assert.equal(a.payload.text, null);
  assert.equal(a.payload.resolution.action, "recorded");
  assert.equal((await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "resolve" }, { now: NOW })).status, "duplicate");
  // 기록한 것을 "버림"으로 바꿀 수는 없다.
  const conflict = await repo.applyRecordCandidateAction({ id: `phone:${ROW_A}`, action: "dismiss" }, { now: NOW });
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.httpStatus, 409);
  assert.equal((await repo.applyRecordCandidateAction({ id: "phone:dddddddd-dddd-4ddd-8ddd-dddddddddddd", action: "resolve" }, { now: NOW })).status, "not-found");
});

test("calendar escapes write the shared nudge key and the outcome fact without wiping sibling meta", async () => {
  const id = `calendar:lead:${LEAD}:evt-1`;
  const saved = await repo.applyRecordCandidateAction({ id, action: "dismiss", reason: "not-this-customer" }, { now: NOW });
  assert.equal(saved.status, "saved");
  const meta = tables.leads[0].meta;
  assert.equal(meta.region, "서울");
  assert.equal(meta.nudges.snoozedUntil, "2026-09-30", "an unrelated snooze survives");
  assert.equal(meta.nudges.dismissed["meeting_unrecorded:evt-1"], true);
  assert.equal(meta.calendar_outcomes["evt-1"].outcome, "not-this-customer");

  // 다음 읽기에서 그 일정은 사라진다.
  state.revenue.leads = [{ id: LEAD, name: "서연영어", companyId: "co-9", owner: "Me", nudgeSuppression: meta.nudges }];
  assert.equal((await repo.getRecordCandidates({ now: NOW })).candidates.some((c) => c.id === id), false);

  const restored = await repo.applyRecordCandidateAction({ id, action: "restore" }, { now: NOW });
  assert.equal(restored.status, "saved");
  assert.equal(tables.leads[0].meta.nudges.dismissed["meeting_unrecorded:evt-1"], undefined);
  assert.equal(tables.leads[0].meta.calendar_outcomes["evt-1"], undefined);
  assert.equal(tables.leads[0].meta.nudges.snoozedUntil, "2026-09-30");

  // 캘린더 해소는 쓸 것이 없다 — 기록이 생기면 읽기에서 빠진다.
  const accepted = await repo.applyRecordCandidateAction({ id, action: "resolve" }, { now: NOW });
  assert.equal(accepted.status, "accepted");
});

test("invalid input never reaches persistence", async () => {
  for (const input of [
    { id: "phone:not-a-uuid", action: "dismiss" },
    { id: `phone:${ROW_A}`, action: "delete" },
    { id: "calendar:lead:not-a-uuid:evt-1", action: "dismiss" },
    { id: `calendar:lead:${LEAD}:evt-1`, action: "dismiss", reason: "spam" },
    {},
  ]) {
    const result = await repo.applyRecordCandidateAction(input, { now: NOW });
    assert.equal(result.status, "invalid-input", JSON.stringify(input));
    assert.equal(result.httpStatus, 400);
  }
  assert.equal(calls.length, 0);
});
