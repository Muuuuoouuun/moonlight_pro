import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [revenueSource, personalRevenueSource] = await Promise.all([
  readFile(new URL("./revenue.jsx", import.meta.url), "utf8"),
  readFile(new URL("./personal-revenue.jsx", import.meta.url), "utf8"),
]);

test("RevenueOverview selects the dedicated roadmap only for Personal scope", () => {
  assert.match(revenueSource, /import\s+\{\s*PersonalRevenueRoadmap\s*\}\s+from\s+["']\.\/personal-revenue["']/);
  assert.match(revenueSource, /const\s+scope\s*=\s*searchParams\?\.get\(["']scope["']\)/);
  assert.match(revenueSource, /scope\s*===\s*["']personal["']/);
  assert.match(revenueSource, /<PersonalRevenueRoadmap\s+ledger=\{ledger\}\s+syncState=\{syncState\}/);
});

test("the deal drawer is absent by default and controlled by a clicked timeline button", () => {
  assert.match(personalRevenueSource, /useState\(null\)/);
  assert.match(personalRevenueSource, /<button[\s\S]*className=["']personal-revenue-event["']/);
  assert.match(personalRevenueSource, /onClick=\{\(\)\s*=>\s*selectDeal\(event\.id\)/);
  assert.match(personalRevenueSource, /aria-expanded=\{selectedDealId\s*===\s*event\.id\}/);
  assert.match(personalRevenueSource, /aria-controls=\{selectedDealId\s*===\s*event\.id\s*\?\s*DRAWER_ID\s*:\s*undefined\}/);
  assert.match(personalRevenueSource, /\{selectedDeal\s*\?\s*\(/);
  assert.match(personalRevenueSource, /role=["']dialog["']/);
  assert.match(personalRevenueSource, /id=\{DRAWER_ID\}/);
});

test("the conditional drawer supports Escape, close, focus restoration, and the Personal deal deep link", () => {
  assert.match(personalRevenueSource, /event\.key\s*===\s*["']Escape["']/);
  assert.match(personalRevenueSource, /closeDrawer/);
  assert.match(personalRevenueSource, /triggerRefs\.current\.get\(closingId\)\?\.focus\(\)/);
  assert.match(personalRevenueSource, /dashboard\/revenue\/deals\?scope=personal&deal=\$\{encodeURIComponent\(deal\.id\)\}/);
  assert.match(personalRevenueSource, /aria-label=["']딜 상세 닫기["']/);
});

test("the Personal view exposes honest source and empty states", () => {
  assert.match(personalRevenueSource, /<SyncBadge\s+state=\{syncState\}/);
  assert.match(personalRevenueSource, /syncState\s*===\s*["']loading["']/);
  assert.match(personalRevenueSource, /model\.events\.length\s*===\s*0/);
  assert.match(personalRevenueSource, /예정일이 있는 개인 딜이 없습니다/);
});

test("the Personal Deals deep link keeps its scope after consuming the selected deal", () => {
  assert.match(revenueSource, /const\s+queryScope\s*=\s*searchParams\?\.get\(["']scope["']\)/);
  assert.match(revenueSource, /queryScope\s*===\s*["']personal["']\s*\?\s*["']brand["']/);
  assert.match(revenueSource, /filterDealsByWorkspace\(deals,\s*effectiveWorkspace\)/);
  assert.match(revenueSource, /params\.delete\(["']deal["']\)/);
  assert.match(revenueSource, /router\.replace\(query\s*\?\s*`\$\{pathname\}\?\$\{query\}`\s*:\s*pathname\)/);
});
