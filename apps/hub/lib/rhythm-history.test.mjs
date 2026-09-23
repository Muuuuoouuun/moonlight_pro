import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  buildRhythmHistory,
  dayKeysBetween,
  normalizeHistoryOffset,
  normalizeHistoryRange,
  resolveHistoryWindow,
  summarizeByMonth,
} from "./rhythm-history.js";

const TODAY = "2026-09-23"; // 수요일

test("periods are calendar-based: Monday weeks, months, quarters, years", () => {
  assert.deepEqual(
    (({ startKey, endKey, label }) => ({ startKey, endKey, label }))(resolveHistoryWindow({ range: "week", todayKey: TODAY })),
    { startKey: "2026-09-21", endKey: "2026-09-27", label: "이번 주" },
  );
  const lastWeek = resolveHistoryWindow({ range: "week", offset: -1, todayKey: TODAY });
  assert.equal(lastWeek.startKey, "2026-09-14");
  assert.equal(lastWeek.label, "지난주");

  const month = resolveHistoryWindow({ range: "month", offset: -9, todayKey: TODAY });
  assert.deepEqual([month.startKey, month.endKey, month.label], ["2025-12-01", "2025-12-31", "2025년 12월"]);

  const quarter = resolveHistoryWindow({ range: "quarter", todayKey: TODAY });
  assert.deepEqual([quarter.startKey, quarter.endKey], ["2026-07-01", "2026-09-30"]);
  const prevQuarter = resolveHistoryWindow({ range: "quarter", offset: -3, todayKey: TODAY });
  assert.deepEqual([prevQuarter.startKey, prevQuarter.endKey, prevQuarter.label], ["2025-10-01", "2025-12-31", "2025년 4분기"]);

  const year = resolveHistoryWindow({ range: "year", offset: -1, todayKey: TODAY });
  assert.deepEqual([year.startKey, year.endKey, year.elapsedEndKey], ["2025-01-01", "2025-12-31", "2025-12-31"]);
  assert.equal(resolveHistoryWindow({ range: "year", todayKey: TODAY }).elapsedEndKey, TODAY);
});

test("range and offset inputs fold to safe values — no future periods", () => {
  assert.equal(normalizeHistoryRange("MONTH"), "month");
  assert.equal(normalizeHistoryRange("decade"), "week");
  assert.equal(normalizeHistoryOffset("3"), 0);
  assert.equal(normalizeHistoryOffset("-2"), -2);
  assert.equal(normalizeHistoryOffset("x"), 0);
  assert.equal(normalizeHistoryOffset(-9999), -120);
  assert.equal(dayKeysBetween("2024-02-27", "2024-03-01").length, 4); // 윤년
});

test("expected counts only elapsed days since the routine existed, scaled by weekly target", () => {
  const window = resolveHistoryWindow({ range: "month", todayKey: TODAY });
  const history = buildRhythmHistory({
    window,
    todayKey: TODAY,
    rituals: [
      { id: "pray", name: "기도", checkType: "morning", targetPerWeek: 7, activeFrom: "2026-09-21" },
      { id: "gym", name: "운동", checkType: "evening", targetPerWeek: 3 },
    ],
    doneByRitual: new Map([
      ["pray", new Set(["2026-09-21", "2026-09-22", "2026-09-23"])],
      ["gym", ["2026-09-02", "2026-09-10"]],
    ]),
  });
  const pray = history.rituals.find((r) => r.id === "pray");
  assert.equal(pray.expected, 3);
  assert.equal(pray.doneCount, 3);
  assert.equal(pray.rate, 100);
  assert.equal(pray.bestRun, 3);
  const gym = history.rituals.find((r) => r.id === "gym");
  assert.equal(gym.expected, Math.ceil((23 * 3) / 7));
  assert.equal(gym.doneCount, 2);
  assert.equal(history.rituals[0].id, "pray", "sorted by rate");
  assert.equal(history.summary.steadiest.name, "기도");
  assert.equal(history.summary.bestRun.days, 3);
});

test("day levels use daily routines as the denominator and never paint the future", () => {
  const window = resolveHistoryWindow({ range: "week", todayKey: TODAY });
  const history = buildRhythmHistory({
    window,
    todayKey: TODAY,
    rituals: [
      { id: "a", name: "A", targetPerWeek: 7 },
      { id: "b", name: "B", targetPerWeek: 7 },
      { id: "w", name: "주간", checkType: "weekly", targetPerWeek: 1 },
    ],
    doneByRitual: { a: ["2026-09-21", "2026-09-22"], b: ["2026-09-21"], w: ["2026-09-24"] },
  });
  const byKey = Object.fromEntries(history.days.map((d) => [d.dateKey, d]));
  assert.equal(byKey["2026-09-21"].level, 4);
  assert.equal(byKey["2026-09-21"].due, 2);
  assert.equal(byKey["2026-09-22"].level, 2);
  assert.equal(byKey["2026-09-23"].level, 0);
  assert.equal(byKey["2026-09-23"].isToday, true);
  assert.equal(byKey["2026-09-24"].future, true);
  assert.equal(byKey["2026-09-24"].level, 0);
  assert.equal(history.summary.perfectDays, 1);
  // 주간 루틴만 한 날도 빈 칸이 아니다 — 가장 옅은 단계로 남는다.
  const onlyWeekly = buildRhythmHistory({
    window, todayKey: TODAY,
    rituals: [{ id: "a", targetPerWeek: 7 }, { id: "w", checkType: "weekly", targetPerWeek: 1 }],
    doneByRitual: { w: ["2026-09-22"] },
  });
  assert.equal(onlyWeekly.days.find((d) => d.dateKey === "2026-09-22").level, 1);
  assert.equal(history.summary.pastDays, 3);
  assert.equal(history.weeks.length, 1);
  assert.equal(history.weeks[0].every(Boolean), true);
});

test("month grid pads to Monday-start weeks and month totals skip the future", () => {
  const window = resolveHistoryWindow({ range: "quarter", todayKey: TODAY });
  const history = buildRhythmHistory({ window, todayKey: TODAY, rituals: [{ id: "a", name: "A" }], doneByRitual: { a: ["2026-07-01"] } });
  // 2026-07-01은 수요일 — 첫 주의 월·화 칸은 비어 있다.
  assert.equal(history.weeks[0][0], null);
  assert.equal(history.weeks[0][2].dateKey, "2026-07-01");
  const months = summarizeByMonth(history);
  assert.deepEqual(months.map((m) => m.label), ["7월", "8월", "9월"]);
  assert.equal(months[0].done, 1);
  assert.equal(months[0].due, 31);
  assert.equal(months[2].due, 23, "only elapsed days of the current month");
});

test("history surface keeps the hub read envelope and the luminance-only palette", async () => {
  const ui = await readFile(new URL("../components/hub/rhythm-history.jsx", import.meta.url), "utf8");
  assert.match(ui, /data\.status === "error" \|\| data\.source === "error"/);
  assert.match(ui, /status === "loading"[\s\S]*?<Skeleton/);
  assert.match(ui, /aria-label=\{dayTitle\(day\)\}/);
  const css = await readFile(new URL("../components/hub/rhythm-history.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /var\(--(success|warning|info|accent)\b/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const route = await readFile(new URL("../app/api/hub/rhythm-history/route.js", import.meta.url), "utf8");
  assert.match(route, /status: "error"/);
  assert.doesNotMatch(route, /status:\s*5\d\d/);
});
