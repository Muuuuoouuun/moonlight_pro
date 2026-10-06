import { test } from "node:test";
import assert from "node:assert/strict";
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

test("failed and signed-out reads never become the first paint of another screen", async () => {
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "live", signals: [{ id: "good" }] }) });
  const good = peekDailyBrief();
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "error", signals: [{ id: "stale" }] }) });
  await fetchDailyBriefSignals({ fetchImpl: async () => reply({ status: "unauthorized" }, 401) });
  assert.equal(peekDailyBrief(), good);
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
