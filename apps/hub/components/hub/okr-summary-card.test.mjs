import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const card = await readFile(new URL("./okr-summary-card.jsx", import.meta.url), "utf8");
const overview = await readFile(new URL("./pages/overview.jsx", import.meta.url), "utf8");

test("OKR·KPI summary card links into 내 작업 › OKR·KPI", () => {
  // 현황의 첫 화면은 10c 목표 렌즈로 바뀌었다(overview-goal-lens.test.mjs). 카드는 다른 표면용으로 남는다.
  assert.match(card, /goalHref\(null, "all", \{ base: GOAL_WORK_BASE \}\)/);
  assert.doesNotMatch(overview, /<OkrSummaryCard/);
});

test("OKR·KPI summary keeps read truth honest: loading → Skeleton, error/preview → TruthBadge, never an empty state", () => {
  assert.match(card, /model\.status === "loading" && <Skeleton/);
  assert.match(card, /model\.status !== "live" && model\.status !== "loading" && <TruthBadge state=\{model\.status\} \/>/);
  // 빈 상태는 읽기가 성공했을 때만(live/partial) — error/preview를 "목표 없음"으로 그리지 않는다.
  assert.match(card, /\{readable && summary\.activeCount === 0 && <EmptyState/);
  assert.match(card, /const readable = model\.status === "live" \|\| model\.status === "partial";/);
});
