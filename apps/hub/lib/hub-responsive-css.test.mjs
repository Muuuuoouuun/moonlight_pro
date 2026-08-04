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
const projectsSource = await readFile(
  new URL("../components/hub/pages/projects.jsx", import.meta.url),
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

test("contextual topbar tabs meet the 44px touch-target floor", () => {
  assert.match(
    css,
    /\.hub-topbar__tabs button\s*\{[\s\S]*?min-height:\s*44px/,
  );
  assert.doesNotMatch(css, /\.hub-topbar__tabs button\s*\{[\s\S]*?min-height:\s*34px/);
});

test("closed mobile navigation cannot leave off-screen links in the Tab order", () => {
  const mobileStart = css.indexOf("@media (max-width: 900px)");
  const mobileBlock = css.slice(mobileStart);

  assert.ok(mobileStart >= 0);
  assert.match(
    mobileBlock,
    /\.hub-sidebar-root\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/,
  );
  assert.match(
    mobileBlock,
    /\.hub-shell\[data-nav-open="true"\] \.hub-sidebar-root\s*\{[\s\S]*?visibility:\s*visible;[\s\S]*?pointer-events:\s*auto;/,
  );
});

test("mobile navigation opener keeps a 44px target through the full drawer breakpoint", () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.hub-mobile-nav-opener\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
  );
});

test("Daily Brief ledger toggle exposes an accessible 44px mobile target", () => {
  assert.match(dailyBriefSource, /aria-label=\{open \? ['"]기록 상태 숨기기['"] : ['"]기록 상태 펼치기['"]\}/);
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
  assert.match(dailyBriefSource, /\['열린 일', pms\.openTasks \?\? '—'\]/);
  assert.match(dailyBriefSource, /\['기한 도래', pms\.dueOrOverdueTasks \?\? '—'\]/);
  assert.match(dailyBriefSource, /pms\.taskCompletionRate == null \? '—'/);
});

test("shared Button forwards native accessibility attributes", () => {
  assert.match(primitivesSource, /export function Button\(\{[\s\S]*?\.\.\.props[\s\S]*?\}\) \{/);
  assert.match(primitivesSource, /<button\s+\{\.\.\.props\}\s+type=\{type\}/);
});

test("mobile PMS controls keep 44px targets while project cards avoid horizontal overflow", () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.hub-project-primary-control[\s\S]*?min-height:\s*44px/,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.hub-project-table\s*\{[\s\S]*?overflow-x:\s*hidden !important/,
  );
  assert.match(
    css,
    /\.hub-project-row__open\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) !important/,
  );
  assert.match(projectsSource, /className=["']hub-project-primary-control["']/);
  assert.match(projectsSource, /className=["'][^"']*hub-project-table[^"']*["']/);
});

test("project cards transform before the 769 to 900px sheet breakpoint can clip them", () => {
  const mediumStart = css.indexOf("@media (max-width: 900px)");
  const narrowStart = css.indexOf("@media (max-width: 768px)", mediumStart);
  const mediumBlock = css.slice(mediumStart, narrowStart);

  assert.ok(mediumStart >= 0 && narrowStart > mediumStart);
  assert.match(mediumBlock, /\.hub-project-table\s*\{[\s\S]*?overflow-x:\s*hidden !important/);
  assert.match(mediumBlock, /\.hub-project-list-head\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(mediumBlock, /\.hub-project-row\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(0,\s*1fr\) !important/);
  assert.match(mediumBlock, /\.hub-project-row__open\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) !important/);
  assert.match(mediumBlock, /\.hub-project-row\s*>\s*\.hub-pms-progress\s*\{[\s\S]*?grid-column:\s*2 !important/);
});

test("canonical drawer layers stay above the mobile project detail sheet", () => {
  const token = (name) => Number(css.match(new RegExp(`--${name}:\\s*(\\d+)`))?.[1]);
  const detailLayer = token("z-project-detail");
  const drawerOverlayLayer = token("z-drawer-overlay");
  const drawerLayer = token("z-drawer");

  assert.ok(Number.isFinite(detailLayer));
  assert.ok(drawerOverlayLayer > detailLayer);
  assert.ok(drawerLayer > drawerOverlayLayer);
  assert.match(css, /\.hub-project-detail-sheet\s*\{[\s\S]*?z-index:\s*var\(--z-project-detail\) !important/);
  assert.match(primitivesSource, /className="hub-drawer-overlay"[\s\S]*?zIndex:\s*["']var\(--z-drawer-overlay\)["']/);
  assert.match(primitivesSource, /className="hub-drawer"[\s\S]*?zIndex:\s*["']var\(--z-drawer\)["']/);
});
