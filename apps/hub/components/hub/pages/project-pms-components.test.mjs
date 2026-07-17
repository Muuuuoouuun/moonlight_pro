import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pmsComponentsSource = await readFile(
  new URL("./project-pms-components.jsx", import.meta.url),
  "utf8",
).catch(() => "");
const pmsMetricsSource = await readFile(
  new URL("./project-pms-metrics.js", import.meta.url),
  "utf8",
).catch(() => "");
const pmsMetrics = await import("./project-pms-metrics.js").catch(() => null);
const projectsSource = await readFile(new URL("./projects.jsx", import.meta.url), "utf8");
const detailPanelSource = await readFile(new URL("./project-detail-panel.jsx", import.meta.url), "utf8");
const responsiveCss = await readFile(new URL("../hub-tokens.css", import.meta.url), "utf8");
const globalCss = await readFile(new URL("../../../app/globals.css", import.meta.url), "utf8");

test("project progress exposes evidence and only uses progressbar metadata when determinate", () => {
  assert.match(pmsComponentsSource, /export function ProjectProgressGauge/);
  assert.match(pmsComponentsSource, /role=["']progressbar["']/);
  assert.match(pmsComponentsSource, /aria-valuemin=\{0\}/);
  assert.match(pmsComponentsSource, /aria-valuemax=\{100\}/);
  assert.match(pmsComponentsSource, /aria-valuenow=\{value\}/);
  assert.match(pmsComponentsSource, /aria-valuetext=\{valueText\}/);
  assert.match(pmsComponentsSource, /aria-label=\{ariaLabel\}/);
  assert.match(pmsComponentsSource, /progress\.label/);
  assert.match(pmsComponentsSource, /progress\.done/);
  assert.match(pmsComponentsSource, /progress\.total/);
  assert.match(pmsComponentsSource, /진척 데이터 없음/);

  const indeterminateStart = pmsComponentsSource.indexOf("if (!determinate)");
  const determinateStart = pmsComponentsSource.indexOf('role="progressbar"', indeterminateStart);
  const indeterminateBlock = pmsComponentsSource.slice(indeterminateStart, determinateStart);
  assert.ok(indeterminateStart >= 0 && determinateStart > indeterminateStart);
  assert.doesNotMatch(indeterminateBlock, /role=["']progressbar["']/);
  assert.doesNotMatch(indeterminateBlock, /hub-pms-progress__fill/);
});

test("project progress semantics remain outside the native row-open button", () => {
  const openButtonStart = projectsSource.indexOf('className="hub-project-row__open"');
  const openButtonEnd = projectsSource.indexOf("</button>", openButtonStart);
  const openButtonBlock = projectsSource.slice(openButtonStart, openButtonEnd);

  assert.ok(openButtonStart >= 0 && openButtonEnd > openButtonStart);
  assert.doesNotMatch(openButtonBlock, /ProjectProgressGauge/);
  assert.match(
    projectsSource.slice(openButtonEnd),
    /<ProjectProgressGauge[\s\S]{0,180}ariaLabel=\{`\$\{p\.name\} 진척`\}/,
  );
  assert.match(globalCss, /\.hub-project-row\s*>\s*\.hub-pms-progress/);
});

test("planning links preserve one canonical project identity across every PMS surface", () => {
  assert.match(pmsComponentsSource, /export function ProjectPlanningLinks/);
  assert.match(pmsComponentsSource, /\/dashboard\/work\/projects\?project=/);
  assert.match(pmsComponentsSource, /\/dashboard\/work\/projects\?view=timeline&project=/);
  assert.match(pmsComponentsSource, /\/dashboard\/work\/roadmap\?project=/);
  assert.match(pmsComponentsSource, /\/dashboard\/work\/rhythm\?project=/);
  assert.match(pmsComponentsSource, /label: ["']상세 · 목록["']/);
  assert.match(pmsComponentsSource, /label: ["']Timeline["']/);
  assert.match(pmsComponentsSource, /label: ["']Roadmap["']/);
  assert.match(pmsComponentsSource, /label: ["']Rhythm["']/);
});

test("portfolio metrics execute active, blocked, overdue, and evidence calculations", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  const today = new Date(2026, 6, 17, 12);
  const projects = [
    { statusKey: "active", displayProgress: { value: 40, partial: false } },
    { statusKey: "blocked", dueAt: new Date(2026, 6, 16, 12).toISOString(), displayProgress: { value: 25, partial: false } },
    { statusKey: "draft", dueAt: new Date(2026, 6, 15, 12).toISOString(), displayProgress: null },
    { statusKey: "active", displayProgress: { value: 80, partial: true } },
    { statusKey: "completed", dueAt: new Date(2026, 6, 14, 12).toISOString(), displayProgress: { value: 100, partial: false } },
  ];

  assert.deepEqual(pmsMetrics.buildProjectPortfolioMetrics(projects, { today, sourceState: "live" }), {
    empty: false,
    active: 2,
    blockedOrOverdue: 2,
    dueSoon: 0,
    unmeasured: 2,
  });
});

test("portfolio due-soon metric uses today through the next six calendar days", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  const today = new Date(2026, 6, 17, 12);
  const dueAt = (offset) => new Date(2026, 6, 17 + offset, 12).toISOString();
  const projects = [
    { statusKey: "draft", dueAt: dueAt(0), displayProgress: { value: 0, partial: false } },
    { statusKey: "draft", dueAt: dueAt(6), displayProgress: { value: 0, partial: false } },
    { statusKey: "draft", dueAt: dueAt(7), displayProgress: { value: 0, partial: false } },
    { statusKey: "completed", dueAt: dueAt(1), displayProgress: { value: 100, partial: false } },
  ];

  assert.equal(
    pmsMetrics.buildProjectPortfolioMetrics(projects, { today, sourceState: "live" }).dueSoon,
    2,
  );
});

test("empty live portfolio returns unavailable cells instead of fake zeroes", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  assert.deepEqual(pmsMetrics.buildProjectPortfolioMetrics([], { sourceState: "live" }), {
    empty: true,
    active: null,
    blockedOrOverdue: null,
    dueSoon: null,
    unmeasured: null,
  });
});

test("preview and error portfolios never calculate operational metrics", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  const projects = [{ statusKey: "active", displayProgress: { value: 50, partial: false } }];
  assert.equal(pmsMetrics.buildProjectPortfolioMetrics(projects, { sourceState: "preview" }), null);
  assert.equal(pmsMetrics.buildProjectPortfolioMetrics(projects, { sourceState: "error" }), null);
});

test("portfolio presentation consumes the executable metric helper without synthetic scoring", () => {
  assert.match(pmsComponentsSource, /import \{ buildProjectPortfolioMetrics \} from ["']\.\/project-pms-metrics["']/);
  assert.match(pmsMetricsSource, /displayProgress/);
  assert.match(pmsMetricsSource, /dueAt/);
  assert.match(pmsMetricsSource, /sourceState !== ["']live["']/);
  assert.match(pmsComponentsSource, /표시할 원장 없음/);
  assert.doesNotMatch(`${pmsComponentsSource}\n${pmsMetricsSource}`, /AI.*(?:score|점수)|70\s*\/\s*30/i);
});

test("project list selection opens the exact query, preserves foreign keys, and closes by deleting only project", () => {
  assert.match(projectsSource, /const openProjectDetail = React\.useCallback/);
  assert.match(projectsSource, /mergeProjectDetailQuery\(searchParamsRef\.current, projectId\)/);
  assert.match(projectsSource, /router\.replace\(query \? `\$\{pathname\}\?\$\{query\}` : pathname, \{ scroll: false \}\)/);
  assert.match(projectsSource, /params\.delete\(['"]project['"]\)/);
  assert.match(projectsSource, /onClick=\{\(\) => openProjectDetail\(p\.id\)\}/);
  assert.match(projectsSource, /selectedProjectId[\s\S]{0,280}setOpenDetail\(null\)/);
});

test("project and task rows use native keyboard controls and named canonical checkboxes", () => {
  assert.match(projectsSource, /import \{[\s\S]*Checkbox[\s\S]*\} from ["']\.\.\/hub-primitives["']/);
  assert.match(projectsSource, /className=["']hub-project-row__open["']/);
  assert.match(projectsSource, /aria-label=\{`\$\{p\.name\} 상세 열기`\}/);
  assert.match(projectsSource, /<Checkbox[\s\S]{0,420}label=\{`프로젝트 선택: \$\{p\.name\}`\}/);
  assert.match(projectsSource, /<Checkbox[\s\S]{0,420}label=\{`\$\{t\.done \? ['"]다시 열기['"] : ['"]완료['"]\}: \$\{t\.title\}`\}/);
  assert.doesNotMatch(projectsSource, /<input\s+type=["']checkbox["']/);
});

test("project detail checklist also uses the labelled canonical Checkbox", () => {
  assert.match(detailPanelSource, /import \{[\s\S]*Checkbox[\s\S]*\} from ["']\.\.\/hub-primitives["']/);
  assert.match(detailPanelSource, /<Checkbox[\s\S]{0,360}label=\{`\$\{todo\.done \? ["']다시 열기["'] : ["']완료["']\}: \$\{todo\.title\}`\}/);
  assert.doesNotMatch(detailPanelSource, /<button[^>]+onClick=\{\(\) => onToggleTodo/);
});

test("board cards expose a labelled non-drag status control", () => {
  assert.match(projectsSource, /className=["']hub-project-board-status["']/);
  assert.match(projectsSource, /aria-label=\{`\$\{c\.title\} 상태 변경`\}/);
  assert.match(projectsSource, /onChange=\{\(event\) => moveCard\(c\.id, event\.target\.value\)\}/);
  assert.match(projectsSource, /visibleColumns\.map\(option/);
});

test("project reads keep error distinct from preview and offer retry", () => {
  const loadStart = projectsSource.indexOf("const loadLedger");
  const effectStart = projectsSource.indexOf("React.useEffect", loadStart);
  const loadBlock = projectsSource.slice(loadStart, effectStart);

  assert.match(loadBlock, /setSyncState\(['"]error['"]\)/);
  assert.match(projectsSource, /프로젝트 원장을 읽지 못했습니다/);
  assert.match(projectsSource, /onClick=\{\(\) => loadLedger\(\{ initial: true \}\)\}/);
  assert.doesNotMatch(loadBlock, /catch[\s\S]{0,120}setSyncState\(['"]preview['"]\)/);
});

test("project header shows numeric counts only for a live ledger", () => {
  const headerStart = projectsSource.indexOf("const projectHeaderSummary");
  const headerEnd = projectsSource.indexOf("const loadLedger", headerStart);
  const headerSummaryBlock = projectsSource.slice(headerStart, headerEnd);

  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  assert.match(headerSummaryBlock, /syncState === ["']live["']/);
  assert.match(headerSummaryBlock, /projects\.length/);
  assert.match(headerSummaryBlock, /brandTodos\.filter\(t => !t\.done\)\.length/);
  assert.match(headerSummaryBlock, /loading[\s\S]*원장 확인 중/);
  assert.match(headerSummaryBlock, /error[\s\S]*원장 읽기 실패/);
  assert.match(headerSummaryBlock, /preview/);
  assert.match(projectsSource, /\{projectHeaderSummary\}/);
});

test("new PMS borders use theme-aware line tokens", () => {
  const pmsCss = globalCss.slice(globalCss.indexOf("Projects · Moonstone PMS command center"));
  const hardCodedDarkBorder = /border(?:-(?:top|right|bottom|left)|-color)?:\s*[^;]*rgba\(255,\s*255,\s*255,\s*0\.07\)/;

  assert.doesNotMatch(pmsCss, hardCodedDarkBorder);
  assert.doesNotMatch(responsiveCss, hardCodedDarkBorder);
  assert.match(pmsCss, /border:\s*1px solid var\(--line-soft\)/);
  assert.match(responsiveCss, /border-bottom:\s*1px solid var\(--line-soft\)/);
});

test("selected mobile project is presented as a full-width modal sheet", () => {
  assert.match(projectsSource, /className=["']hub-project-detail-sheet["']/);
  assert.match(projectsSource, /role=\{mobileDetail \? ["']dialog["'] : ["']region["']\}/);
  assert.match(projectsSource, /aria-modal=\{mobileDetail \? ["']true["'] : undefined\}/);
  assert.match(projectsSource, /ProjectPlanningLinks/);
  assert.match(responsiveCss, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.hub-project-detail-sheet\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(responsiveCss, /\.hub-project-detail-sheet\s*>\s*aside\s*\{[\s\S]*?width:\s*100%/);
});

test("desktop detail remains a split inspector instead of trapping the full workspace", () => {
  assert.match(projectsSource, /data-detail-open=\{openDetail \? ["']true["'] : ["']false["']\}/);
  assert.match(projectsSource, /role=\{mobileDetail \? ["']dialog["'] : ["']region["']\}/);
  assert.match(projectsSource, /aria-modal=\{mobileDetail \? ["']true["'] : undefined\}/);
  assert.match(projectsSource, /if \(!openDetail\) return undefined;/);
  assert.match(projectsSource, /if \(event\.key === ["']Escape["']\)[\s\S]{0,180}closeProjectDetail\(\)/);
  assert.match(projectsSource, /if \(!mobileDetail \|\| event\.key !== ["']Tab["']/);
  assert.match(globalCss, /\.hub-projects-main-grid\[data-detail-open=["']true["']\][\s\S]*?\.hub-project-row__open/);
});
