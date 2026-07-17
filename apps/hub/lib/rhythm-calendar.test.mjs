import assert from "node:assert/strict";
import { test } from "node:test";

const calendar = await import("./rhythm-calendar.js").catch(() => ({}));

test("workspace calendar date keys are independent from the Node runtime timezone", () => {
  assert.equal(typeof calendar.toZonedDateKey, "function");
  const boundary = "2026-07-16T15:30:00.000Z";

  assert.equal(calendar.toZonedDateKey(boundary, "UTC"), "2026-07-16");
  assert.equal(calendar.toZonedDateKey(boundary, "Asia/Seoul"), "2026-07-17");
});

test("invalid or missing workspace timezones fall back to Asia/Seoul", () => {
  assert.equal(typeof calendar.resolveRhythmTimeZone, "function");

  assert.equal(calendar.resolveRhythmTimeZone("America/New_York"), "America/New_York");
  assert.equal(calendar.resolveRhythmTimeZone("Not/A_Timezone"), "Asia/Seoul");
  assert.equal(calendar.resolveRhythmTimeZone(null), "Asia/Seoul");
});

test("legacy routine semantics match the ledger fallback key and workspace-local date", () => {
  assert.equal(typeof calendar.routineSemanticKey, "function");
  assert.equal(typeof calendar.routineLocalDateKey, "function");
  const seedRow = {
    check_type: "morning",
    checked_at: "2026-07-16T15:05:00.000Z",
    meta: {},
  };

  assert.equal(calendar.routineSemanticKey(seedRow), "morning");
  assert.equal(calendar.routineLocalDateKey(seedRow, "Asia/Seoul"), "2026-07-17");
  assert.equal(
    calendar.routineLocalDateKey({
      checked_at: "2026-07-16T15:05:00.000Z",
      meta: { local_date: "2026-07-16" },
    }, "Asia/Seoul"),
    "2026-07-16",
  );
  assert.equal(
    calendar.routineSemanticKey({ check_type: "morning", meta: { key: "focus" } }),
    "focus",
  );
});

test("date-only calendar shifts stay consecutive across a DST transition", () => {
  assert.equal(typeof calendar.shiftDateKey, "function");
  const dates = Array.from({ length: 7 }, (_, index) => (
    calendar.shiftDateKey("2026-03-05", index)
  ));

  assert.deepEqual(dates, [
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
    "2026-03-10",
    "2026-03-11",
  ]);
});

test("legacy candidate windows safely cover every timezone around a local date", () => {
  assert.equal(typeof calendar.legacyCandidateWindow, "function");
  assert.deepEqual(calendar.legacyCandidateWindow("2026-07-17"), {
    start: "2026-07-16T00:00:00.000Z",
    end: "2026-07-19T00:00:00.000Z",
  });
});
