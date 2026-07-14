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
