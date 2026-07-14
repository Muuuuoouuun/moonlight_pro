import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(
  new URL("../components/hub/hub-tokens.css", import.meta.url),
  "utf8",
);
const revenueSource = await readFile(
  new URL("../components/hub/pages/revenue.jsx", import.meta.url),
  "utf8",
);
const dailyBriefSource = await readFile(
  new URL("../components/hub/pages/daily-brief.jsx", import.meta.url),
  "utf8",
);

test("mobile workspace sidebar hiding does not hide edit drawers", () => {
  assert.match(css, /\.hub-workspace-shell\s*>\s*aside:not\(\.hub-drawer\)/);
  assert.doesNotMatch(css, /\.hub-workspace-shell\s*>\s*aside\s*\{/);
});

test("mobile leads keeps identity and stage visible without horizontal overflow", () => {
  assert.match(revenueSource, /className="hub-table-card hub-leads-table"/);
  assert.match(revenueSource, /className="hub-row hub-leads-grid"/);
  assert.match(css, /\.hub-leads-grid\s*\{[\s\S]*?grid-template-columns:\s*26px minmax\(0,\s*1fr\) 78px !important/);
  assert.match(css, /\.hub-leads-grid\s*>\s*:nth-child\(3\)[\s\S]*?\.hub-lead-next-action\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.hub-lead-mobile-meta\s*\{[\s\S]*?display:\s*block/);
});

test("mobile topbar breadcrumbs meet the 44px touch-target floor", () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.hub-topbar__crumbs button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px !important/,
  );
  assert.doesNotMatch(css, /\.hub-topbar__crumbs button\s*\{[\s\S]*?min-height:\s*34px !important/);
});

test("Daily Brief ledger toggle exposes an accessible 44px mobile target", () => {
  assert.match(dailyBriefSource, /aria-label=\{open \? ['"]원장 상태 숨기기['"] : ['"]원장 상태 펼치기['"]\}/);
  assert.match(dailyBriefSource, /aria-expanded=\{open\}/);
  assert.match(dailyBriefSource, /aria-controls="daily-brief-ledger-statuses"/);
  assert.match(dailyBriefSource, /id="daily-brief-ledger-statuses"/);
});
