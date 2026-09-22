import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const projectsSource = await readFile(new URL("./projects.jsx", import.meta.url), "utf8");
const timelineSource = await readFile(new URL("./project-timeline-view.jsx", import.meta.url), "utf8");
const workSource = await readFile(new URL("./work.jsx", import.meta.url), "utf8");
const pmsUiSource = await readFile(new URL("../../../lib/pms-ui.js", import.meta.url), "utf8");

test("Timeline uses exact native project links and never opens the edit drawer", () => {
  // 타임라인 렌더러는 project-timeline-view.jsx로 분리됐다. 마운트 배선은 projects.jsx가
  // 계속 소유하므로 두 파일을 함께 고정한다(계약 축소 아님 — 마운트 단언이 추가됐다).
  const block = timelineSource;

  assert.match(projectsSource, /\{view === 'timeline' && \(\s*<ProjectTimelineView/);
  assert.match(projectsSource, /timeline=\{projectTimeline\}/);
  assert.match(timelineSource, /mergeTimelineProjectQuery/);
  assert.match(block, /<a[\s\S]*?href=\{timelineProjectHref/);
  assert.match(block, /aria-current=\{selectedProjectId === p\.id \? ['"]page['"] : undefined\}/);
  assert.match(block, /data-kind=\{item\.kind\}/);
  assert.match(block, /item\.kind === ['"]range['"]/);
  assert.match(timelineSource, /buildTimelineItemAriaLabel/);
  assert.match(block, /aria-label=\{buildTimelineItemAriaLabel\(item\)\}/);
  assert.match(block, /minHeight:\s*44/);
  assert.match(block, /ProjectProgressGauge/);
  assert.match(block, /프로젝트 상세로 돌아가기/);
  assert.doesNotMatch(block, /editProject\(p\)/);

  const linkStart = block.indexOf("href={timelineProjectHref(p.id)}");
  const linkEnd = block.indexOf("</a>", linkStart);
  assert.ok(linkStart >= 0 && linkEnd > linkStart);
  assert.doesNotMatch(
    block.slice(linkStart, linkEnd),
    /ProjectProgressGauge/,
    "the evidence progressbar must remain a sibling of the native project link",
  );
});

test("Roadmap consumes the shared ledger with truthful states and retry", () => {
  const start = workSource.indexOf("export function Roadmap");
  const end = workSource.indexOf("export function Rhythm", start);
  const block = workSource.slice(start, end);

  assert.match(block, /useWorkLedger\(selectedProjectId\)/);
  assert.doesNotMatch(block, /useWorkLedger\(\)/);
  assert.match(block, /roadmap\.state === ['"]loading['"]/);
  assert.match(block, /roadmap\.state === ['"]preview['"]/);
  assert.match(block, /roadmap\.state === ['"]error['"]/);
  assert.match(block, /roadmap\.state === ['"]live-empty['"]/);
  assert.match(block, /roadmap\.partial/);
  assert.match(block, /roadmap\.truncatedSources/);
  assert.match(block, /표시 한도를 넘어 일부만 표시합니다/);
  assert.match(block, /일부 기록을 읽지 못했습니다/);
  assert.match(block, /onClick=\{retry\}/);
  assert.match(block, /프로젝트로 돌아가기/);
});

test("Roadmap projects and milestones use accessible canonical project links", () => {
  const start = workSource.indexOf("export function Roadmap");
  const end = workSource.indexOf("export function Rhythm", start);
  const block = workSource.slice(start, end);

  assert.match(block, /\/dashboard\/work\/projects\?project=/);
  assert.match(block, /<a[\s\S]*?aria-current=/);
  assert.match(workSource, /buildRoadmapItemAriaLabel/);
  assert.match(block, /aria-label=\{buildRoadmapItemAriaLabel\(item\)\}/);
  assert.match(block, /data-kind=\{item\.kind\}/);
  assert.match(pmsUiSource, /kind:\s*['"]milestone['"]/);
  assert.match(pmsUiSource, /kind:\s*['"]range['"]/);
  assert.match(pmsUiSource, /kind:\s*['"]marker['"]/);
  assert.match(block, /className=["']hub-scroll-x["']/);
  assert.match(block, /minWidth:\s*760/);
});
