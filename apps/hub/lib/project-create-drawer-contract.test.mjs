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
  assert.match(drawerSource, /리드 ·/);
  assert.match(drawerSource, /고객 ·/);
});

test("project create drawer validates inline, announces state, and gates duplicate saves", () => {
  assert.match(drawerSource, /프로젝트명을 입력하세요\./);
  assert.match(drawerSource, /업무 분야를 선택하세요\./);
  assert.match(drawerSource, /aria-describedby/);
  assert.match(drawerSource, /aria-live=["']polite["']/);
  assert.match(drawerSource, /if \(saveState === ["']saving["']\) return/);
  assert.match(drawerSource, /\(event\.metaKey \|\| event\.ctrlKey\)[\s\S]*event\.key === ["']Enter["']/);
  assert.match(drawerSource, /만드는 중…/);
  assert.match(drawerSource, /프로젝트 만들기/);
  assert.match(drawerSource, /저장 위치가 연결되지 않았습니다\./);
});

test("projects page separates create and edit drawers and hands durable success to detail", () => {
  assert.match(projectsSource, /import\s+\{\s*ProjectCreateDrawer\s*\}\s+from\s+["']\.\/project-create-drawer["']/);
  assert.match(projectsSource, /<ProjectCreateDrawer/);
  assert.match(projectsSource, /record=\{projectDraft\?\.isNew\s*\?\s*projectDraft\s*:\s*null\}/);
  assert.match(projectsSource, /record=\{projectDraft\?\.isNew\s*\?\s*null\s*:\s*projectDraft\}/);
  assert.match(projectsSource, /buildProjectCreatePayload\(projectDraft\)/);
  assert.match(projectsSource, /\[['"]saved['"],\s*['"]duplicate['"]\]\.includes\(data\.status\)/);
  assert.match(projectsSource, /const durableProjectId\s*=\s*data\.project\?\.id\s*\|\|\s*projectDraft\.id/);
  assert.match(projectsSource, /await loadLedger\(\)/);
  assert.match(projectsSource, /setExpanded\([\s\S]*durableProjectId/);
  assert.match(projectsSource, /setOpenDetail\(durableProjectId\)/);
  assert.match(projectsSource, /setView\(['"]tree['"]\)/);
});

