import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const drawerSource = await readFile(
  new URL("../components/hub/pages/project-create-drawer.jsx", import.meta.url),
  "utf8",
).catch(() => "");

const projectsSource = await readFile(
  new URL("../components/hub/pages/projects.jsx", import.meta.url),
  "utf8",
);

const primitivesSource = await readFile(
  new URL("../components/hub/hub-primitives.jsx", import.meta.url),
  "utf8",
);

test("project create drawer composes the shared shell around the approved core fields", () => {
  assert.match(drawerSource, /import\s*\{[^}]*Drawer[^}]*\}\s*from\s*["']\.\.\/hub-primitives["']/);
  assert.match(drawerSource, /<Drawer[\s\S]*title=["']프로젝트 만들기["']/);
  assert.match(drawerSource, /큰 결과와 첫 행동부터 기록하세요\./);
  assert.match(drawerSource, /프로젝트명\s*\*/);
  assert.match(drawerSource, /예: 갈무리 첫결제 SW/);
  assert.match(drawerSource, /목표 결과/);
  assert.match(drawerSource, /완료됐을 때 어떤 상태가 되어야 하나요\?/);
  assert.match(drawerSource, /다음 행동/);
  assert.match(drawerSource, /가장 먼저 할 한 가지/);
  assert.match(drawerSource, /업무 분야\s*\*/);
  assert.doesNotMatch(drawerSource, /진행률/);
});

test("project create drawer keeps optional context in an accessible collapsed section", () => {
  assert.match(drawerSource, /상세 설정/);
  assert.match(drawerSource, /aria-expanded=\{advancedOpen\}/);
  assert.match(drawerSource, /브랜드/);
  assert.match(drawerSource, /관련 리드\/고객/);
  assert.match(drawerSource, /상태/);
  assert.match(drawerSource, /우선순위/);
  assert.match(drawerSource, /기한/);
  assert.match(drawerSource, /entities\.map/);
});

test("project create drawer validates inline, announces state, and gates duplicate saves", () => {
  assert.match(drawerSource, /validateProjectDraft/);
  assert.match(drawerSource, /aria-describedby/);
  assert.match(drawerSource, /aria-live=["']polite["']/);
  assert.match(drawerSource, /if \(savingRef\.current\) return/);
  assert.match(drawerSource, /\(event\.metaKey \|\| event\.ctrlKey\)[\s\S]*event\.key === ["']Enter["']/);
  assert.match(drawerSource, /만드는 중…/);
  assert.match(drawerSource, /프로젝트 만들기/);
  assert.match(drawerSource, /저장 위치가 연결되지 않았습니다\./);
  assert.match(drawerSource, /["']degraded["']/);
  assert.match(drawerSource, /<Iconed\s+name=["']chevronR["']/);
  assert.doesNotMatch(drawerSource, />›</);
});

test("projects page separates create and edit drawers and hands durable success to detail", () => {
  assert.match(projectsSource, /import\s+\{\s*ProjectCreateDrawer\s*\}\s+from\s+["']\.\/project-create-drawer["']/);
  assert.match(projectsSource, /<ProjectCreateDrawer/);
  assert.match(projectsSource, /draft=\{projectDraft\}/);
  assert.match(projectsSource, /projectDraft\s*&&\s*!projectDraft\.isNew\s*&&\s*\(\s*<EditDrawer/);
  assert.match(projectsSource, /buildProjectCreatePayload\(draft\)/);
  assert.match(projectsSource, /\[['"]saved['"],\s*['"]duplicate['"]\]\.includes\(data\.status\)/);
  assert.match(projectsSource, /const durableProjectId\s*=\s*data\.project\?\.id/);
  assert.match(projectsSource, /await loadLedger\(\)/);
  assert.match(projectsSource, /setExpanded\([\s\S]*durableProjectId/);
  assert.match(projectsSource, /setOpenDetail\(durableProjectId\)/);
  assert.match(projectsSource, /mergeProjectDetailQuery\(searchParamsRef\.current,\s*durableProjectId\)/);
});

test("only the visible create drawer owns the create shortcut submit path", () => {
  assert.match(primitivesSource, /React\.useEffect\(\(\) => \{\s*if \(!record\) return undefined;[\s\S]*metaKey[\s\S]*handleDoneRef/);
  assert.match(projectsSource, /projectDraft\s*&&\s*!projectDraft\.isNew\s*&&\s*\(\s*<EditDrawer/);
});

test("page N and query entry points preserve the latest command-center guards", () => {
  assert.match(projectsSource, /shouldOpenGlobalProjectCreate\(event,\s*\{\s*drawerOpen/);
  assert.match(projectsSource, /window\.addEventListener\(['"]keydown['"],\s*onKey\)/);
  assert.match(projectsSource, /if \(drawerOpen \|\| !initialLoadDoneRef\.current/);
  assert.match(projectsSource, /createdFromQueryRef\.current/);
});

test("shared drawer close control keeps a compact icon inside a 44px target", () => {
  assert.match(primitivesSource, /<IconButton icon=["']x["'] size=\{44\} iconSize=\{13\} tooltip=["']닫기["']/);
});

test("edit stays on the concurrency-safe edit drawer while create owns context", () => {
  assert.match(projectsSource, /buildProjectEditDraft\(project\)/);
  assert.match(projectsSource, /buildProjectPatch\(projectEditSource,\s*projectDraft\)/);
  assert.doesNotMatch(projectsSource, /method:\s*['"]PATCH['"][\s\S]{0,500}orgScope/);
});

test("content-stage seeding is stable and retries for saved or matching duplicate projects", () => {
  assert.match(projectsSource, /buildContentPipelineTaskSeeds\(durableProjectId\)/);
  assert.match(projectsSource, /draft\.contentPipeline/);
  assert.doesNotMatch(projectsSource, /draft\.contentPipeline && data\.status === ['"]saved['"]/);
});
