import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  applyTodayOverride,
  buildRhythmUncheckPayload,
  buildTodayRhythm,
  currentTimeBlock,
  recentDayLabels,
  resolveRhythmUncheckResult,
  RHYTHM_QUICK_PRESETS,
  summarizeRecentWeek,
  toTodayItem,
} from "./rhythm-today.js";
import { RITUAL_CATEGORIES } from "./rhythm-ui.js";

// 2026-09-23 12:00 KST = 03:00Z (낮)
const NOON_KST = new Date("2026-09-23T03:00:00.000Z");

function ritual(overrides = {}) {
  return {
    id: "r-1",
    ritualKey: "pray",
    name: "기도",
    checkType: "morning",
    category: "spirit",
    targetPerWeek: 7,
    weeks: [0, 0, 0, 0, 0, 0, 0],
    streak: 0,
    pendingStreak: 0,
    ...overrides,
  };
}

test("time block follows the workspace clock, not the device clock", () => {
  assert.equal(currentTimeBlock(new Date("2026-09-22T23:00:00.000Z")), "morning"); // 08:00 KST
  assert.equal(currentTimeBlock(NOON_KST), "midday");
  assert.equal(currentTimeBlock(new Date("2026-09-23T11:00:00.000Z")), "evening"); // 20:00 KST
});

test("a streak alive through yesterday is at stake today, and checking continues it", () => {
  const r = ritual({ weeks: [0, 0, 0, 0, 1, 1, 0], streak: 0, pendingStreak: 2 });
  const item = toTodayItem(r);
  assert.equal(item.doneToday, false);
  assert.equal(item.streakAtStake, true);

  const checked = toTodayItem(applyTodayOverride(r, true));
  assert.equal(checked.doneToday, true);
  assert.equal(checked.streak, 3);
  assert.equal(checked.streakAtStake, false);
});

test("undoing today's check restores the pre-check streak", () => {
  const r = ritual({ weeks: [0, 0, 0, 0, 1, 1, 1], streak: 3, pendingStreak: 2 });
  const undone = toTodayItem(applyTodayOverride(r, false));
  assert.equal(undone.doneToday, false);
  assert.equal(undone.streak, 0);
  assert.equal(undone.pendingStreak, 2);
  assert.equal(undone.streakAtStake, true);
});

test("an override equal to the server value is a no-op", () => {
  const r = ritual({ weeks: [0, 0, 0, 0, 0, 1, 1], streak: 2, pendingStreak: 1 });
  assert.deepEqual(applyTodayOverride(r, true).weeks, [0, 0, 0, 0, 0, 1, 1]);
  assert.equal(applyTodayOverride(r, true).streak, 2);
});

test("a few-times-a-week routine that already met its target rests without counting as due", () => {
  const r = ritual({ id: "clean", checkType: "evening", targetPerWeek: 2, weeks: [1, 0, 0, 1, 0, 0, 0] });
  const item = toTodayItem(r);
  assert.equal(item.resting, true);
  assert.equal(item.streakAtStake, false);

  const today = buildTodayRhythm([r, ritual()], { now: NOON_KST });
  assert.equal(today.due, 1);
  assert.equal(today.resting, 1);
  assert.equal(today.remaining, 1);
});

test("today groups by time of day, current block first, undone before done before resting", () => {
  const rows = [
    ritual({ id: "a", checkType: "morning", weeks: [0, 0, 0, 0, 0, 0, 1] }),
    ritual({ id: "b", checkType: "morning" }),
    ritual({ id: "c", checkType: "midday" }),
    ritual({ id: "d", checkType: "weekly", targetPerWeek: 1, weeks: [0, 0, 1, 0, 0, 0, 0] }),
  ];
  const today = buildTodayRhythm(rows, { now: NOON_KST });
  assert.deepEqual(today.groups.map((g) => g.key), ["midday", "morning", "weekly"]);
  assert.equal(today.groups[0].isNow, true);
  assert.deepEqual(today.groups[1].items.map((i) => i.id), ["b", "a"]);
  assert.equal(today.done, 1);
  assert.equal(today.due, 3);
  assert.equal(today.allDone, false);
});

test("the day closes only when every due routine is checked (optimistic overrides included)", () => {
  const rows = [ritual({ id: "a" }), ritual({ id: "b", checkType: "evening" })];
  assert.equal(buildTodayRhythm(rows, { now: NOON_KST, overrides: { a: true } }).allDone, false);
  const closed = buildTodayRhythm(rows, { now: NOON_KST, overrides: { a: true, b: true } });
  assert.equal(closed.allDone, true);
  assert.equal(closed.percent, 100);
  assert.equal(buildTodayRhythm([], { now: NOON_KST }).allDone, false);
});

test("recent week rate caps each routine at its weekly target", () => {
  const rows = [
    ritual({ targetPerWeek: 2, weeks: [1, 1, 1, 1, 0, 0, 0] }),
    ritual({ targetPerWeek: 7, weeks: [1, 0, 0, 0, 0, 0, 0] }),
  ];
  assert.deepEqual(summarizeRecentWeek(rows), { done: 3, target: 9, percent: 33 });
});

test("recent day labels end with today in the workspace timezone", () => {
  const labels = recentDayLabels(NOON_KST);
  assert.equal(labels.length, 7);
  assert.equal(labels[6].dateKey, "2026-09-23");
  assert.equal(labels[6].label, "오늘");
  assert.equal(labels[5].label, "화");
});

test("undo payload carries only identity and the result envelope stays honest", () => {
  assert.deepEqual(buildRhythmUncheckPayload(ritual({ projectId: " ", checkType: "MORNING" })), {
    projectId: null,
    ritualKey: "pray",
    checkType: "morning",
  });
  assert.equal(resolveRhythmUncheckResult({ responseOk: true, data: { status: "saved" } }).durable, true);
  const gone = resolveRhythmUncheckResult({ responseOk: false, httpStatus: 404, data: { status: "not-found" } });
  assert.equal(gone.durable, true);
  assert.equal(gone.shouldRefetch, true);
  assert.equal(resolveRhythmUncheckResult({ responseOk: true, data: { status: "preview" } }).durable, false);
  const failed = resolveRhythmUncheckResult({ responseOk: false, httpStatus: 502, data: { status: "error" } });
  assert.equal(failed.kind, "error");
  assert.match(failed.message, /502/);
});

test("quick presets only use categories the write route accepts", () => {
  for (const preset of RHYTHM_QUICK_PRESETS) {
    assert.ok(RITUAL_CATEGORIES.has(preset.category), preset.label);
    assert.ok(["morning", "midday", "evening", "weekly"].includes(preset.checkType), preset.label);
  }
  assert.ok(RITUAL_CATEGORIES.has("spirit"));
  assert.ok(RITUAL_CATEGORIES.has("home"));
});

test("the rhythm surface stays inside the palette and motion grammar", async () => {
  const css = await readFile(new URL("../components/hub/rhythm-today.css", import.meta.url), "utf8");
  // 완료는 초록이 아니라 포그라운드 명도(§5.3) — semantic success/warning/info 금지.
  assert.doesNotMatch(css, /var\(--(success|warning|info)\b/);
  // 축하 연출은 1회성 — 무한 반복 금지(§9).
  assert.doesNotMatch(css, /infinite/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const tokens = await readFile(new URL("../components/hub/hub-tokens.css", import.meta.url), "utf8");
  assert.match(tokens, /--dur-celebrate:\s*420ms;/);
});
