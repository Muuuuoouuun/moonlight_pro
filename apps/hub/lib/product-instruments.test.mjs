import assert from "node:assert/strict";
import { test } from "node:test";

import { productMode, recentMonths } from "./product-catalog.js";
import {
  barHeights,
  changeLabel,
  focusProducts,
  inquiryDots,
  modeComposition,
  monthlyLabel,
  percentChange,
  portfolioSeries,
  productHealth,
  productLinks,
  productTabCounts,
  profitColumns,
  stageTimeline,
  statusDots,
  trendGeometry,
} from "./product-instruments.js";

const months = recentMonths("2026-10", 6);
const metric = (month, values) => ({ month, activeUsers: null, revenue: null, cost: null, ...values });

test("recent months run oldest → this month across a year boundary", () => {
  assert.deepEqual(months, ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(recentMonths("2026-02", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("mode reads texture vocabulary: 기획 is a dev product still at the idea stage", () => {
  assert.equal(productMode({ opsStatus: "live", stage: "growth" }).label, "운영중");
  assert.equal(productMode({ opsStatus: "dev", stage: "mvp" }).label, "제작중");
  assert.equal(productMode({ opsStatus: "dev", stage: "idea" }).value, "idea");
  assert.equal(productMode({ opsStatus: "paused", stage: "idea" }).label, "중지");
  assert.equal(productMode({}).label, "제작중", "a bare record falls back to the ops default");
});

test("portfolio series sums only what is known per month, never zero-fills a silent month", () => {
  const products = [
    { id: "a", opsStatus: "live", metrics: [metric("2026-09", { activeUsers: 10, revenue: 100, cost: 20 }), metric("2026-10", { activeUsers: 12, revenue: 150, cost: 20 })] },
    { id: "b", opsStatus: "live", metrics: [metric("2026-10", { activeUsers: 3, revenue: 50, cost: null })] },
    { id: "c", opsStatus: "ended", metrics: [metric("2026-10", { activeUsers: 99 })] },
  ];
  const series = portfolioSeries(products, months);
  assert.deepEqual(series[0], { month: "2026-05", activeUsers: null, revenue: null, cost: null, net: null });
  assert.deepEqual(series[4], { month: "2026-09", activeUsers: 10, revenue: 100, cost: 20, net: 80 });
  assert.equal(series[5].activeUsers, 15, "ended products do not count users");
  assert.equal(series[5].net, 130, "b has no cost, so its revenue is not in the net");
});

test("percent change needs both ends and a positive base", () => {
  assert.equal(percentChange([10, null, null, 30], 3), 200);
  assert.equal(percentChange([0, 1, 2, 3], 3), null);
  assert.equal(percentChange([null, 1, 2, 3], 3), null);
  assert.equal(changeLabel(200, "3개월"), "▲ 200% · 3개월");
  assert.equal(changeLabel(-50, "지난달"), "▼ 50% · 지난달");
  assert.equal(changeLabel(null, "3개월"), null);
});

test("chart names read every month, saying 모름 instead of zero", () => {
  assert.equal(monthlyLabel("매출", ["2026-09", "2026-10"], [null, 5], (v) => `${v}원`), "매출 9월 모름, 10월 5원");
});

test("trend geometry skips unknown months, draws nothing for no revenue, and has an end point only when this month is known", () => {
  const empty = trendGeometry([null, 0, 0], { width: 100, height: 30 });
  assert.equal(empty.empty, true);
  const line = trendGeometry([10, null, 20], { width: 106, height: 30, padX: 3, padY: 4 });
  assert.equal(line.points.length, 2);
  assert.deepEqual(line.points, [[3, 15], [103, 4]]);
  assert.deepEqual(line.end, { x: 103, y: 4 });
  assert.match(line.area, /^3,26 3,15 103,4 103,26$/);
  assert.equal(trendGeometry([10, 20, null], { width: 100, height: 30 }).end, null);
});

test("bars and profit columns keep unknown months empty and share one scale", () => {
  assert.deepEqual(barHeights([null, 0, 5, 10]), [null, 2, 50, 100]);
  const cols = profitColumns([{ month: "2026-09", revenue: 100, cost: 50, net: 50 }, { month: "2026-10", revenue: null, cost: 20, net: null }]);
  assert.deepEqual(cols, [{ month: "2026-09", revenue: 100, cost: 50, known: true }, { month: "2026-10", revenue: null, cost: 20, known: false }]);
});

test("composition, focus and head counts come from stage and ops, not from money", () => {
  const products = [
    { id: "a", name: "가", opsStatus: "live", stage: "growth", repositories: [{ id: "r", status: "connected", summary: { ci: { state: "failure" } } }] },
    { id: "b", name: "나", opsStatus: "dev", stage: "mvp", repositories: [] },
    { id: "c", name: "다", opsStatus: "dev", stage: "idea", repositories: [] },
    { id: "d", name: "라", opsStatus: "paused", stage: "maintain", repositories: [{ id: "s", status: "error" }] },
  ];
  const { counts, cells } = modeComposition(products);
  assert.deepEqual(counts, { live: 1, dev: 1, idea: 1, paused: 1, ended: 0 });
  assert.deepEqual(cells.map((cell) => cell.mode), ["live", "dev", "idea", "paused"]);
  assert.deepEqual(focusProducts(products).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(productTabCounts(products), { total: 4, focus: 2, broken: 2 });
});

test("inquiry dots group by product (most first) and keep unassigned last", () => {
  const products = [{ id: "a", name: "가" }, { id: "b", name: "나" }];
  const inquiries = [
    { productId: "a", status: "new" }, { productId: "b", status: "waiting" }, { productId: "b", status: "in_progress" },
    { productId: null, status: "new" }, { productId: "a", status: "closed" },
  ];
  const dots = inquiryDots(inquiries, products);
  assert.deepEqual(dots.rows.map((row) => [row.label, row.dots]), [["나", ["wait", "open"]], ["가", ["new"]], ["미정", ["new"]]]);
  assert.equal(dots.total, 4);
  assert.deepEqual(statusDots(inquiries.filter((q) => q.productId === "b")).map((row) => row.dots.length), [0, 1, 1]);
});

test("health judges only the connected source and says 연결 전 for the rest", () => {
  const none = productHealth({ repositories: [] });
  assert.equal(none.connected, 0);
  assert.deepEqual(none.lines.map((line) => [line.glyph, line.value]), [["○", "저장소 연결 전"], ["○", "연결 전"], ["○", "도구 미정"]]);
  const failing = productHealth({ repositories: [{ id: "r", fullName: "o/app", status: "connected", summary: { ci: { state: "failure", failed: ["lint"] } } }] });
  assert.equal(failing.lines[0].urgent, true);
  assert.equal(failing.lines[0].label, "CI 실패 · lint");
  assert.equal(failing.connected, 1);
  const unsynced = productHealth({ repositories: [{ id: "r", fullName: "o/app", status: "connected", summary: {} }] });
  assert.equal(unsynced.lines[0].value, "동기화 필요");
  assert.equal(unsynced.connected, 0);
});

test("links show connected sources solid, missing ones dashed, and never a non-http href", () => {
  const links = productLinks({
    repositories: [{ id: "r", fullName: "owner/app", status: "connected" }],
    details: { deployUrl: "https://app.example.com/x", links: [{ label: "문서", url: "https://docs.example.com" }, { label: "나쁨", url: "javascript:alert(1)" }] },
  });
  assert.deepEqual(links.map((link) => [link.label, link.value, link.on]), [
    ["GitHub", "app", true], ["배포 주소", "app.example.com/x", true], ["문서", "docs.example.com", true], ["에러 수집", "도구 미정", false], ["가동 체크", "연결 전", false],
  ]);
  assert.equal(productLinks({ repositories: [], details: {} })[0].on, false);
});

test("stage history is newest first, marks the dev → live switch as the one launch, and counts days in the current stage", () => {
  const timeline = stageTimeline({
    stage: "growth",
    stageHistory: [
      { at: "2026-05-02T00:00:00Z", from: null, to: "idea", reason: "제품 등록" },
      { at: "2026-08-01T00:00:00Z", kind: "ops", from: "dev", to: "live" },
      { at: "2026-09-18T00:00:00Z", from: "launch", to: "growth" },
      { at: "bad", to: "x" },
    ],
  }, { today: "2026-10-21" });
  assert.deepEqual(timeline.entries.map((entry) => [entry.text, entry.launch]), [["출시 → 성장", false], ["제작중 → 운영중", true], ["등록 · 아이디어", false]]);
  assert.equal(timeline.currentDays, 33);
  assert.equal(stageTimeline({ stage: "mvp", stageHistory: [] }).currentDays, null);
});
