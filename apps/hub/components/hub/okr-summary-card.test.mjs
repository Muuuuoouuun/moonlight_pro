import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const card = await readFile(new URL("./okr-summary-card.jsx", import.meta.url), "utf8");
const overview = await readFile(new URL("./pages/overview.jsx", import.meta.url), "utf8");

test("현황 surfaces the OKR·KPI summary and links into 내 작업 › OKR·KPI", () => {
  assert.match(overview, /import \{ OkrSummaryCard \} from "\.\.\/okr-summary-card"/);
  assert.match(overview, /<OkrSummaryCard \/>/);
  // 링크는 본체 탭(내 작업 하위)으로 간다 — 현황 안의 view=goals가 아니라.
  assert.match(card, /goalHref\(null, "all", \{ base: GOAL_WORK_BASE \}\)/);
});

test("OKR·KPI summary keeps read truth honest: loading → Skeleton, error/preview → TruthBadge, never an empty state", () => {
  assert.match(card, /model\.status === "loading" && <Skeleton/);
  assert.match(card, /model\.status !== "live" && model\.status !== "loading" && <TruthBadge state=\{model\.status\} \/>/);
  // 빈 상태는 읽기가 성공했을 때만(live/partial) — error/preview를 "목표 없음"으로 그리지 않는다.
  assert.match(card, /\{readable && rows\.length === 0 && \(\s*<EmptyState/);
  assert.match(card, /const readable = model\.status === "live" \|\| model\.status === "partial";/);
});
