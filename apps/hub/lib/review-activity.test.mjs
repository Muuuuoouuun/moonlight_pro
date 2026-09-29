import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVITY_WEEKS, activityDetail, activityLevel, activityThresholds, activityWindow,
  buildActivityWeeks, covers, dayTotal, tallyActivity,
} from "./review-activity.js";

const day = (tasks = 0, contacts = 0, memos = 0, review = false) => ({ tasks, contacts, memos, review });

test("window is 16 Monday-aligned weeks ending today", () => {
  assert.deepEqual(activityWindow("2026-09-23"), { from: "2026-06-08", to: "2026-09-23" });
  assert.equal(activityWindow("bad"), null);
  assert.equal(covers(activityWindow("2026-09-23"), "2026-09-01", "2026-09-23"), true);
  assert.equal(covers(activityWindow("2026-09-23"), "2026-06-01", "2026-06-30"), false);
});

test("tally buckets by operator timezone and keeps unread sources as missing", () => {
  const result = tallyActivity({
    from: "2026-09-21", to: "2026-09-23", timezone: "Asia/Seoul",
    tasks: [{ completed_at: "2026-09-22T16:00:00Z" }, { completed_at: null }, { completed_at: "2026-09-01T00:00:00Z" }],
    contacts: [{ occurred_at: "2026-09-21T01:00:00Z" }],
    memos: null,
    reviews: [{ review_date: "2026-09-21" }],
  });
  assert.deepEqual(result.days["2026-09-23"], day(1));
  assert.deepEqual(result.days["2026-09-21"], day(0, 1, 0, true));
  assert.equal(result.days["2026-09-01"], undefined); // 범위 밖
  assert.deepEqual(result.missing, ["memos"]);
});

test("levels follow quartiles of active days; zero stays empty", () => {
  const activity = { days: { a: day(1), b: day(2), c: day(4), d: day(8), e: day(0) } };
  const thresholds = activityThresholds(activity);
  assert.deepEqual(thresholds, [1, 2, 4]);
  assert.equal(activityLevel(0, thresholds), 0);
  assert.equal(activityLevel(1, thresholds), 1);
  assert.equal(activityLevel(3, thresholds), 3);
  assert.equal(activityLevel(9, thresholds), 4);
  // 값이 고르게 적어도 네 단계가 겹치지 않는다
  assert.deepEqual(activityThresholds({ days: { a: day(1), b: day(1) } }), [1, 2, 3]);
  assert.deepEqual(activityThresholds({ days: {} }), [1, 2, 3]);
});

test("detail text names each source; review counts as one", () => {
  assert.equal(dayTotal(day(2, 1, 0, true)), 4);
  assert.equal(activityDetail(day(2, 1, 0, true)), "할 일 2 · 연락 1 · 리뷰 ✓");
  assert.equal(activityDetail(undefined), "활동 없음");
});

test("week grid has 16 columns of Mon–Sun with month labels and future cells", () => {
  const activity = tallyActivity({ from: "2026-06-08", to: "2026-09-23", timezone: "Asia/Seoul", tasks: [{ completed_at: "2026-09-22T02:00:00Z" }], contacts: [], memos: [], reviews: [] });
  const grid = buildActivityWeeks(activity, "2026-09-23");
  assert.equal(grid.weeks.length, ACTIVITY_WEEKS);
  assert.equal(grid.weeks[0].label, "6월");
  assert.equal(grid.weeks[0].days[0].date, "2026-06-08");
  const last = grid.weeks.at(-1);
  assert.equal(last.days[1].date, "2026-09-22");
  assert.equal(last.days[1].level, 1);
  assert.equal(last.days[3].future, true);
  assert.equal(last.days[3].level, null);
  assert.equal(grid.active, 1);
});

test("summary counts active days this/last month, busiest weekday and last 7 days", async () => {
  const { activitySummary } = await import("./review-activity.js");
  const activity = { from: "2026-06-08", to: "2026-09-23", days: {
    "2026-09-22": day(2, 1), "2026-09-15": day(1), "2026-09-01": day(0, 0, 1),
    "2026-08-18": day(5), "2026-08-04": day(1), "2026-09-24": day(9),
  } };
  const summary = activitySummary(activity, "2026-09-23");
  assert.deepEqual(summary, { thisMonth: 3, lastMonth: 2, busiestWeekday: "화", last7: 3 });
  // 지난달 1일이 창 밖이면 지난달은 모른다
  assert.equal(activitySummary({ ...activity, from: "2026-08-10" }, "2026-09-23").lastMonth, null);
});
