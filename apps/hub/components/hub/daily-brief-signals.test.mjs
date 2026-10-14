import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTaskToday } from "../../lib/task-today.js";
import { DAILY_BRIEF_FRESH_MS, fetchDailyBriefSignals, peekDailyBrief, readDailyBrief } from "./daily-brief-signals.js";

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test("screens opened together share one daily-brief request", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async () => { calls += 1; await gate; return reply({ status: "live", signals: [{ id: "s1" }] }); };
  const home = fetchDailyBriefSignals({ fetchImpl });
  const today = readDailyBrief({ fetchImpl });
  release();
  const [signals, read] = await Promise.all([home, today]);
  assert.equal(calls, 1);
  assert.deepEqual(signals.signals, [{ id: "s1" }]);
  assert.equal(read.data.status, "live");
});

test("a later screen paints from the last good read for five minutes, then not at all", async () => {
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "partial", signals: [] }) });
  const cached = peekDailyBrief();
  assert.equal(cached.data.status, "partial");
  assert.equal(peekDailyBrief(cached.at + DAILY_BRIEF_FRESH_MS - 1), cached);
  assert.equal(peekDailyBrief(cached.at + DAILY_BRIEF_FRESH_MS), null);
});

test("a transient failed read preserves the last good first paint", async () => {
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "live", signals: [{ id: "good" }] }) });
  const good = peekDailyBrief();
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "error", signals: [{ id: "stale" }] }) });
  assert.equal(peekDailyBrief(), good);
});

test("a confirmed signed-out read discards the last good first paint", async () => {
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "live", signals: [{ id: "private" }] }) });
  assert.equal((await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "unauthorized" }, 401) })).status, "unauthorized");
  assert.equal(peekDailyBrief(), null);
});

test("one caller leaving does not cancel the read another screen still waits for", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async () => { await gate; return reply({ status: "live", signals: [] }); };
  const leaving = new AbortController();
  const first = fetchDailyBriefSignals({ fetchImpl, signal: leaving.signal });
  const second = fetchDailyBriefSignals({ fetchImpl });
  leaving.abort();
  await assert.rejects(first);
  release();
  assert.equal((await second).status, "live");
});

let moduleId = 0;
const freshBrief = () => import(`./daily-brief-signals.js?regression=${++moduleId}`);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferredReads() {
  const reads = [];
  const fetchImpl = () => new Promise((resolve, reject) => { reads.push({ resolve, reject }); });
  return { reads, fetchImpl };
}

test("a post-mutation read starts a new request and a late older read cannot replace it", async () => {
  const brief = await freshBrief();
  const { reads, fetchImpl } = deferredReads();
  const beforeSave = brief.readDailyBrief({ fetchImpl });
  const afterSave = brief.readDailyBrief({ fetchImpl, force: true });
  const callCount = reads.length;
  if (callCount > 1) reads[1].resolve(reply({ status: "live", signals: [{ id: "after-save" }] }));
  else reads[0].resolve(reply({ status: "live", signals: [{ id: "before-save" }] }));
  const newest = await afterSave;
  reads[0].resolve(reply({ status: "live", signals: [{ id: "before-save" }] }));
  const older = await beforeSave;
  assert.equal(callCount, 2);
  assert.equal(newest.data.signals[0].id, "after-save");
  assert.equal(older, newest, "other active consumers adopt the newer read");
  assert.equal(brief.peekDailyBrief(), newest);
});

test("an older successful read cannot publish while the forced read is still pending", async () => {
  const brief = await freshBrief();
  const { reads, fetchImpl } = deferredReads();
  const older = brief.readDailyBrief({ fetchImpl });
  const newer = brief.readDailyBrief({ fetchImpl, force: true });
  reads[0].resolve(reply({ status: "live", signals: [{ id: "old" }] }));
  await tick();
  const prematureCache = brief.peekDailyBrief();
  if (reads[1]) reads[1].resolve(reply({ status: "error" }));
  const outcomes = await Promise.all([older, newer]);
  assert.equal(prematureCache, null);
  assert.equal(brief.peekDailyBrief(), null);
  assert.ok(outcomes.every((read) => brief.briefEnvelope(read) === "error"));
});

test("a newer transport failure cannot be hidden by an older successful read", async () => {
  const brief = await freshBrief();
  const { reads, fetchImpl } = deferredReads();
  const older = brief.readDailyBrief({ fetchImpl });
  const newer = brief.readDailyBrief({ fetchImpl, force: true });
  const failures = Promise.all([assert.rejects(older, /offline/), assert.rejects(newer, /offline/)]);
  reads[1].reject(new Error("offline"));
  reads[0].resolve(reply({ status: "live", signals: [{ id: "old" }] }));
  await failures;
  assert.equal(brief.peekDailyBrief(), null);
});

test("a late old 401 cannot invalidate a newer successful session read", async () => {
  const brief = await freshBrief();
  const { reads, fetchImpl } = deferredReads();
  const older = brief.readDailyBrief({ fetchImpl });
  const newer = brief.readDailyBrief({ fetchImpl, force: true });
  reads[1].resolve(reply({ status: "live", signals: [{ id: "new-session" }] }));
  const good = await newer;
  reads[0].resolve(reply({ status: "unauthorized" }, 401));
  assert.equal(await older, good);
  assert.equal(brief.peekDailyBrief(), good);
});

test("a caller already aborted does not start a request", async () => {
  const brief = await freshBrief();
  const { reads, fetchImpl } = deferredReads();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(brief.readDailyBrief({ fetchImpl, signal: controller.signal }));
  assert.equal(reads.length, 0);
});

// Execute the repository's actual hook bodies with a small effect scheduler. No DOM,
// server or product API is used; only the fetch fixture below can satisfy a read.
function hookRuntime() {
  let current;
  const React = {
    useState(initial) {
      const index = current.cursor++;
      const bucket = current;
      if (!bucket.slots[index]) bucket.slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [bucket.slots[index].value, (next) => {
        const slot = bucket.slots[index];
        slot.value = typeof next === "function" ? next(slot.value) : next;
      }];
    },
    useRef(value) {
      const index = current.cursor++;
      if (!current.slots[index]) current.slots[index] = { current: value };
      return current.slots[index];
    },
    useEffect(effect, deps) {
      const index = current.cursor++;
      const previous = current.slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const slot = { deps, effect, cleanup: previous?.cleanup };
        current.slots[index] = slot;
        current.effects.push(slot);
      }
    },
    useCallback(callback) { current.cursor++; return callback; },
  };
  return {
    React,
    mount(useHook) {
      const bucket = { slots: [], effects: [], cursor: 0 };
      return {
        render(key = 0) { current = bucket; bucket.cursor = 0; return useHook(key); },
        flushEffects() { for (const slot of bucket.effects.splice(0)) { slot.cleanup?.(); slot.cleanup = slot.effect(); } },
        replayEffects() { for (const slot of bucket.slots) if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); } },
      };
    },
  };
}

async function actualHooks(brief) {
  const runtime = hookRuntime();
  const signalSource = await readFile(new URL("./daily-brief-signals.js", import.meta.url), "utf8");
  const signalBody = signalSource.slice(signalSource.indexOf("function signalsFromRead("))
    .replaceAll("export async function ", "async function ").replaceAll("export function ", "function ");
  const useSignals = new Function("React", "peekDailyBrief", "readDailyBrief", "briefEnvelope", `${signalBody}\nreturn useDailyBriefSignals;`)(runtime.React, brief.peekDailyBrief, brief.readDailyBrief, brief.briefEnvelope);
  const todaySource = await readFile(new URL("./pages/daily-brief.jsx", import.meta.url), "utf8");
  const todayStart = todaySource.indexOf("const EMPTY_DAILY_BRIEF_STATE =");
  const todayEnd = todaySource.indexOf("function MetricCard(", todayStart);
  assert.ok(todayStart >= 0 && todayEnd > todayStart, "DailyBrief ledger hook section must stay findable");
  const todayBody = todaySource.slice(todayStart, todayEnd);
  const useToday = new Function("React", "peekDailyBrief", "readDailyBrief", "briefEnvelope", "getDailyBriefAuthVersion", "invalidateDailyBriefAuth", "buildTaskToday", `${todayBody}\nreturn useDailyBriefLedger;`)(runtime.React, brief.peekDailyBrief, brief.readDailyBrief, brief.briefEnvelope, brief.getDailyBriefAuthVersion, brief.invalidateDailyBriefAuth, buildTaskToday);
  return { ...runtime, useSignals, useToday };
}

for (const hookName of ["useSignals", "useToday"]) {
  test(`${hookName}: initial consumers and Strict Mode replay dedupe, but reload forces a new read`, async (t) => {
    const brief = await freshBrief();
    const hooks = await actualHooks(brief);
    const { reads, fetchImpl } = deferredReads();
    t.mock.method(globalThis, "fetch", fetchImpl);
    const first = hooks.mount(hooks[hookName]);
    const second = hooks.mount(hooks[hookName]);
    first.render(); first.flushEffects();
    second.render(); second.flushEffects();
    first.replayEffects();
    const initialCount = reads.length;
    first.render(1); first.flushEffects();
    const reloadCount = reads.length;
    if (reads[1]) reads[1].resolve(reply({ status: "live", signals: [{ id: "new" }] }));
    reads[0].resolve(reply({ status: "live", signals: [{ id: "old" }] }));
    await tick();
    assert.equal(initialCount, 1);
    assert.equal(reloadCount, 2);
    assert.equal(first.render(1).signals[0].id, "new");
    assert.equal(second.render().signals[0].id, "new");
  });
}

test("Today clears local private data after 401, including its next mount", async (t) => {
  const brief = await freshBrief();
  const hooks = await actualHooks(brief);
  let status = "live";
  t.mock.method(globalThis, "fetch", async () => reply(status === "live" ? {
    status, inquiries: { status: "live", rows: [{ id: "private" }], unreadCount: 1 },
    signals: [{ id: "private" }], dailyFocus: { id: "private" },
    taskToday: { state: "live", items: [{ id: "private" }], counts: { total: 1 }, hiddenCount: 0 },
  } : { status }, status === "unauthorized" ? 401 : 200));
  const today = hooks.mount(hooks.useToday);
  today.render(); today.flushEffects(); await tick();
  assert.equal(today.render().inquiries.rows.length, 1);
  status = "unauthorized";
  today.render(1); today.flushEffects(); await tick();
  const signedOut = today.render(1);
  assert.equal(signedOut.syncState, "error");
  assert.deepEqual(signedOut.inquiries.rows, []);
  assert.deepEqual(signedOut.taskToday.items, []);
  assert.equal(signedOut.dailyFocus, null);
  assert.equal(brief.peekDailyBrief(), null);
  assert.deepEqual(hooks.mount(hooks.useToday).render().inquiries.rows, []);
});

test("a 401 observed by another consumer invalidates Today's local first-paint cache", async (t) => {
  const brief = await freshBrief();
  const hooks = await actualHooks(brief);
  t.mock.method(globalThis, "fetch", async () => reply({ status: "live", inquiries: { status: "live", rows: [{ id: "private" }] } }));
  const today = hooks.mount(hooks.useToday);
  today.render(); today.flushEffects(); await tick();
  await brief.readDailyBrief({ fetchImpl: async () => reply({ status: "unauthorized" }, 401) });
  assert.deepEqual(hooks.mount(hooks.useToday).render().inquiries.rows, []);
});

test("Today interprets HTTP 200 read-error truth rather than caching a preview", async (t) => {
  const brief = await freshBrief();
  const hooks = await actualHooks(brief);
  t.mock.method(globalThis, "fetch", async () => reply({ status: "error", source: "error" }));
  const today = hooks.mount(hooks.useToday);
  today.render(); today.flushEffects(); await tick();
  assert.equal(today.render().syncState, "error");
  assert.equal(brief.peekDailyBrief(), null);
  assert.equal(hooks.mount(hooks.useToday).render().syncState, "syncing");
});

test("a narrow task 401 clears both caches and supersedes a pending full brief", async (t) => {
  const brief = await freshBrief();
  const hooks = await actualHooks(brief);
  let release;
  let fullReads = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === "/api/hub/tasks") return reply({ status: "unauthorized" }, 401);
    fullReads++;
    if (fullReads === 1) return reply({ status: "live", signals: [{ id: "private" }] });
    return new Promise((resolve) => { release = resolve; });
  });
  const today = hooks.mount(hooks.useToday);
  today.render(); today.flushEffects(); await tick();
  today.render(1); today.flushEffects();
  assert.equal(await today.render(1).refreshTasks(), false);
  release(reply({ status: "live", signals: [{ id: "late-private" }] }));
  await tick();
  assert.equal(today.render(1).authRequired, true);
  assert.deepEqual(today.render(1).signals, []);
  assert.equal(brief.peekDailyBrief(), null);
  assert.deepEqual(hooks.mount(hooks.useToday).render().signals, []);
});

test("a task read started before a full-brief 401 cannot restore the task slice", async (t) => {
  const brief = await freshBrief();
  const hooks = await actualHooks(brief);
  let releaseTasks;
  t.mock.method(globalThis, "fetch", async (url) => url === "/api/hub/tasks"
    ? new Promise((resolve) => { releaseTasks = resolve; })
    : reply({ status: "live" }));
  const today = hooks.mount(hooks.useToday);
  today.render(); today.flushEffects(); await tick();
  const tasks = today.render().refreshTasks();
  await brief.readDailyBrief({ fetchImpl: async () => reply({ status: "unauthorized" }, 401) });
  releaseTasks(reply({ status: "live", tasks: [{ id: "late", title: "fixture", status: "todo" }] }));
  assert.equal(await tasks, false);
  assert.notEqual(today.render().taskToday.state, "live");
  assert.equal(brief.peekDailyBrief(), null);
});
