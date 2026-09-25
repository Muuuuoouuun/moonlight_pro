import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isValidMonthKey,
  monthKeyOf,
  normalizeRevenueTargets,
  normalizeTargetAmount,
  targetForMonth,
  targetProgress,
} from "./revenue-target.js";

test("monthKeyOf는 0-based month를 YYYY-MM으로 만든다", () => {
  assert.equal(monthKeyOf({ year: 2026, month: 8 }), "2026-09");
  assert.equal(monthKeyOf({ year: 2026, month: 0 }), "2026-01");
  assert.equal(monthKeyOf({}), null);
});

test("isValidMonthKey는 형식만 본다", () => {
  assert.equal(isValidMonthKey("2026-09"), true);
  assert.equal(isValidMonthKey("2026-13"), false);
  assert.equal(isValidMonthKey("2026-9"), false);
  assert.equal(isValidMonthKey("garbage"), false);
  assert.equal(isValidMonthKey(null), false);
});

test("normalizeTargetAmount는 0 이하·NaN을 버린다", () => {
  assert.equal(normalizeTargetAmount("5000000"), 5000000);
  assert.equal(normalizeTargetAmount(0), null);
  assert.equal(normalizeTargetAmount(-1), null);
  assert.equal(normalizeTargetAmount("nope"), null);
});

test("normalizeRevenueTargets는 유효한 월 키·금액만 남긴다", () => {
  const raw = { "2026-09": 5000000, "2026-13": 100, "bad-key": 100, "2026-10": -5, "2026-11": "3000000" };
  assert.deepEqual(normalizeRevenueTargets(raw), { "2026-09": 5000000, "2026-11": 3000000 });
  assert.deepEqual(normalizeRevenueTargets(null), {});
  assert.deepEqual(normalizeRevenueTargets("nope"), {});
});

test("targetForMonth는 targets가 null이면 null(읽지 못함과 미정을 구분)", () => {
  assert.equal(targetForMonth(null, { year: 2026, month: 8 }), null);
  assert.equal(targetForMonth({}, { year: 2026, month: 8 }), null, "빈 맵은 '미정'");
  assert.equal(targetForMonth({ "2026-09": 5000000 }, { year: 2026, month: 8 }), 5000000);
});

test("targetProgress는 확정(paid)만으로 남은 목표를 계산하고 예상이 그걸 채우는지 따로 말한다", () => {
  assert.equal(targetProgress({ target: null, paid: 100, expected: 100 }), null);
  const p = targetProgress({ target: 5_000_000, paid: 1_800_000, expected: 2_000_000 });
  assert.equal(p.remaining, 3_200_000);
  assert.equal(p.reached, false);
  assert.equal(p.coveredByExpected, false);
  const covered = targetProgress({ target: 5_000_000, paid: 1_800_000, expected: 4_000_000 });
  assert.equal(covered.coveredByExpected, true);
  const reached = targetProgress({ target: 5_000_000, paid: 5_200_000, expected: 0 });
  assert.equal(reached.reached, true);
  assert.equal(reached.remaining, 0);
});
