import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REVIEW_WEEK_TARGET, buildReviewMonth, isWorkday, recentRange, reviewCue, shiftMonth,
  suggestFromFocus, weekProgress, weekStartOf, zonedClock,
} from "./daily-review-rhythm.js";

const r = (reviewDate, energy = 3) => ({ reviewDate, energy });

test("zonedClock reads the workspace timezone, not UTC — KST midnight differs from UTC midnight", () => {
  // 2026-09-22T15:30Z = 2026-09-23 00:30 KST
  assert.deepEqual(zonedClock(new Date("2026-09-22T15:30:00Z"), "Asia/Seoul"), { dateKey: "2026-09-23", hour: 0 });
  assert.deepEqual(zonedClock(new Date("2026-09-22T15:30:00Z"), "UTC"), { dateKey: "2026-09-22", hour: 15 });
  // 18:00 KST = 09:00 UTC
  assert.equal(zonedClock(new Date("2026-09-23T09:00:00Z"), "Asia/Seoul").hour, 18);
});

test("workdays are Mon–Fri and weeks start on Monday", () => {
  assert.equal(isWorkday("2026-09-21"), true); // 월
  assert.equal(isWorkday("2026-09-26"), false); // 토
  assert.equal(weekStartOf("2026-09-23"), "2026-09-21");
  assert.equal(weekStartOf("2026-09-27"), "2026-09-21"); // 일요일은 그 주의 끝
  assert.equal(weekStartOf("2026-10-01"), "2026-09-28"); // 월 경계를 넘는 주
  assert.deepEqual(recentRange("2026-09-23"), { from: "2026-09-16", to: "2026-09-23" });
});

test("cue: evening from 18:00 only when today is not recorded", () => {
  assert.equal(reviewCue({ todayKey: "2026-09-23", hour: 17, recent: [r("2026-09-22")] }), null);
  assert.deepEqual(reviewCue({ todayKey: "2026-09-23", hour: 18, recent: [r("2026-09-22")] }), { kind: "evening", date: "2026-09-23" });
  assert.deepEqual(reviewCue({ todayKey: "2026-09-23", hour: 21, recent: [r("2026-09-23", 4)] }), { kind: "done", date: "2026-09-23", energy: 4 });
});

test("cue: backfill yesterday until noon, only for a missed workday", () => {
  // 수요일 오전, 화요일 비어 있음
  assert.deepEqual(reviewCue({ todayKey: "2026-09-23", hour: 9, recent: [] }), { kind: "backfill", date: "2026-09-22" });
  assert.equal(reviewCue({ todayKey: "2026-09-23", hour: 12, recent: [] }), null);
  // 월요일 오전 — 어제는 일요일이라 메우라고 하지 않는다
  assert.equal(reviewCue({ todayKey: "2026-09-21", hour: 9, recent: [] }), null);
  // 오늘 이미 남겼으면 어제 제안보다 완료 표시가 먼저다
  assert.equal(reviewCue({ todayKey: "2026-09-23", hour: 9, recent: [r("2026-09-23")] }).kind, "done");
});

test("cue stays silent when recent records could not be read", () => {
  assert.equal(reviewCue({ todayKey: "2026-09-23", hour: 20, recent: null }), null);
  assert.equal(reviewCue({ todayKey: "bad", hour: 20, recent: [] }), null);
});

test("week progress counts recorded workdays only and resets every Monday", () => {
  const recent = [r("2026-09-19"), r("2026-09-20"), r("2026-09-21"), r("2026-09-22"), r("2026-09-27")];
  assert.deepEqual(weekProgress("2026-09-23", recent), { start: "2026-09-21", recorded: 2, weekend: 0, target: REVIEW_WEEK_TARGET, workdays: 5 });
  assert.equal(weekProgress("2026-09-27", [...recent, r("2026-09-26")]).weekend, 2);
  assert.equal(weekProgress("2026-09-28", recent).recorded, 0);
  assert.equal(weekProgress("2026-09-23", null), null);
});

test("focus suggestion follows 09-20 §6.2 and never invents a target", () => {
  assert.equal(suggestFromFocus(null), null);
  assert.equal(suggestFromFocus({ focusPicked: 0, focusDone: 0 }), null);
  const all = suggestFromFocus({ focusPicked: 3, focusDone: 3, focusTitles: ["제안서", "견적", "후속 메일"] });
  assert.equal(all.progress, 2);
  assert.equal(all.focus, "오늘 3개: 제안서 · 견적 · 후속 메일");
  assert.equal(all.reason, "오늘 3개 중 3개 완료");
  assert.equal(suggestFromFocus({ focusPicked: 3, focusDone: 1, focusTitles: [] }).progress, 1);
  assert.equal(suggestFromFocus({ focusPicked: 2, focusDone: 0 }).progress, 0);
  assert.equal(suggestFromFocus({ focusPicked: 2, focusDone: 0 }).focus, "");
  const long = suggestFromFocus({ focusPicked: 1, focusDone: 1, focusTitles: ["가".repeat(600)] });
  assert.ok(long.focus.length <= 500);
});

test("month grid marks recorded / missed workday / rest / today / future", () => {
  const month = buildReviewMonth("2026-09", [r("2026-09-01", 2), r("2026-09-05", 5), r("2026-08-31")], "2026-09-23");
  assert.equal(month.leading, 1); // 9월 1일은 화요일
  assert.equal(month.cells.length, 30);
  const state = (day) => month.cells[day - 1].state;
  assert.equal(state(1), "recorded");
  assert.equal(state(2), "missed");
  assert.equal(state(5), "recorded"); // 주말 기록도 보인다
  assert.equal(state(6), "rest");
  assert.equal(state(23), "today");
  assert.equal(state(24), "future");
  assert.equal(month.recordedCount, 2);
  assert.equal(month.energySeries.length, 23);
  assert.deepEqual(month.energySeries.slice(0, 2), [2, null]);
  assert.equal(buildReviewMonth("2026-13", [], "2026-09-23"), null);
});

test("an unread month never renders as missed workdays", () => {
  const month = buildReviewMonth("2026-09", null, "2026-09-23");
  assert.equal(month.known, false);
  assert.equal(month.cells[1].state, "unknown");
  assert.equal(month.cells[23].state, "future");
  assert.equal(month.cells.filter((cell) => cell.state === "missed").length, 0);
});

test("shiftMonth crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("bad", 1), "");
});
