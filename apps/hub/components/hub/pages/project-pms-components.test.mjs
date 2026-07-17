import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pmsComponentsSource = await readFile(
  new URL("./project-pms-components.jsx", import.meta.url),
  "utf8",
).catch(() => "");
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

test("portfolio summary derives active, blocked or overdue, due-soon, and unmeasured counts", () => {
  assert.match(pmsComponentsSource, /export function buildProjectPortfolioMetrics/);
  assert.match(pmsComponentsSource, /active/);
  assert.match(pmsComponentsSource, /blockedOrOverdue/);
  assert.match(pmsComponentsSource, /dueSoon/);
  assert.match(pmsComponentsSource, /unmeasured/);
  assert.match(pmsComponentsSource, /displayProgress/);
  assert.match(pmsComponentsSource, /dueAt/);
  assert.match(pmsComponentsSource, /sourceState !== ["']live["']/);
  assert.match(pmsComponentsSource, /표시할 원장 없음/);
  assert.doesNotMatch(pmsComponentsSource, /AI.*(?:score|점수)|70\s*\/\s*30/i);
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
