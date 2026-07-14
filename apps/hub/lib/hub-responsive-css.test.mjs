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
const primitivesSource = await readFile(
  new URL("../components/hub/hub-primitives.jsx", import.meta.url),
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

test("Daily Brief quick capture has a real label and announced save state", () => {
  assert.match(dailyBriefSource, /<form[^>]+aria-label="빠른 입력"/);
  assert.match(dailyBriefSource, /<label[^>]+htmlFor="daily-brief-quick-task"/);
  assert.match(dailyBriefSource, /<input[^>]+id="daily-brief-quick-task"/);
  assert.match(dailyBriefSource, /aria-live="polite"/);
  assert.match(dailyBriefSource, /aria-pressed=\{hint === 'task'\}/);
  assert.match(dailyBriefSource, /aria-pressed=\{hint === 'inbox'\}/);
  assert.match(dailyBriefSource, /fetch\('\/api\/hub\/inbox'/);
});

test("Daily Brief task-only Today exposes durable completion controls", () => {
  assert.match(dailyBriefSource, /aria-label="오늘 할 일"/);
  assert.match(dailyBriefSource, /aria-label=\{`완료: \$\{task\.title\}`\}/);
  assert.match(dailyBriefSource, /method:\s*['"]PATCH['"]/);
  assert.match(dailyBriefSource, /body:\s*JSON\.stringify\(\{ id:\s*task\.id, status:\s*['"]done['"] \}\)/);
  assert.match(dailyBriefSource, /minHeight:\s*44/);
  assert.match(dailyBriefSource, /\['기한 도래', pms\.dueOrOverdueTasks\]/);
});

test("shared Button forwards native accessibility attributes", () => {
  assert.match(primitivesSource, /export function Button\(\{[\s\S]*?\.\.\.props[\s\S]*?\}\) \{/);
  assert.match(primitivesSource, /<button\s+\{\.\.\.props\}\s+type=\{type\}/);
});
