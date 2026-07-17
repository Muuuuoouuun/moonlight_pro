import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const createDrawerSource = await readFile(
  new URL("./project-create-drawer.jsx", import.meta.url),
  "utf8",
).catch(() => "");
const detailPanelSource = await readFile(
  new URL("./project-detail-panel.jsx", import.meta.url),
  "utf8",
).catch(() => "");
const projectsSource = await readFile(new URL("./projects.jsx", import.meta.url), "utf8");
const primitivesSource = await readFile(new URL("../hub-primitives.jsx", import.meta.url), "utf8");

test("quick create is a dedicated canonical Drawer with the approved primary fields", () => {
  assert.match(createDrawerSource, /export function ProjectCreateDrawer/);
  assert.match(createDrawerSource, /<Drawer\b/);
  assert.match(createDrawerSource, /프로젝트명 \*/);
  assert.match(createDrawerSource, /목표 결과/);
  assert.match(createDrawerSource, /<textarea[\s\S]*완료됐을 때 어떤 상태가 되어야 하나요\?/);
  assert.match(createDrawerSource, /다음 행동/);
  assert.doesNotMatch(createDrawerSource, /name=["']progress["']/);
  assert.doesNotMatch(createDrawerSource, /진행률 \(%\)/);
});

test("quick create explicitly focuses the empty project title on open", () => {
  assert.match(createDrawerSource, /initialFocusRef=\{titleRef\}/);
  assert.match(primitivesSource, /initialFocusRef\?\.current/);
});

test("advanced project settings start collapsed and expose their state accessibly", () => {
  assert.match(createDrawerSource, /useState\(false\)/);
  assert.match(createDrawerSource, /aria-expanded=\{advancedOpen\}/);
  assert.match(createDrawerSource, /상태/);
  assert.match(createDrawerSource, /우선순위/);
  assert.match(createDrawerSource, /기한/);
});

test("global project entry has an explicit recoverable save-location rule", () => {
  assert.match(createDrawerSource, /저장 위치 \*/);
  assert.match(createDrawerSource, /컨테이너 선택/);
  assert.match(createDrawerSource, /onCreateContainer/);
  assert.match(createDrawerSource, /컨테이너 만들기/);
  assert.match(createDrawerSource, /aria-describedby/);
});

test("create feedback is live and failed saves keep the mounted draft", () => {
  assert.match(createDrawerSource, /aria-live=["']polite["']/);
  assert.match(createDrawerSource, /conflict/);
  assert.match(createDrawerSource, /savingRef\.current/);
  assert.match(createDrawerSource, /if \(result\?\.ok[\s\S]*onClose/);
  assert.doesNotMatch(createDrawerSource, /finally\s*\{[^}]*onClose/);
});

test("create success waits for a fresh ledger containing the exact durable id", () => {
  assert.match(projectsSource, /const reloadResult = await loadLedger\(\)/);
  assert.match(projectsSource, /projectReloadContains\(reloadResult, durableProjectId\)/);
  assert.match(projectsSource, /status: ['"]reload-error['"]/);
  assert.match(createDrawerSource, /reload-error/);
});

test("idempotency conflict preserves the entity and offers both recovery paths", () => {
  assert.match(projectsSource, /project: data\.project/);
  assert.match(createDrawerSource, /onRetryWithNewClientId/);
  assert.match(createDrawerSource, /새 요청으로 다시 시도/);
  assert.match(createDrawerSource, /onOpenConflictProject/);
  assert.match(createDrawerSource, /기존 프로젝트 열기/);
});

test("query and keyboard entry always open an unseeded global project draft", () => {
  assert.match(projectsSource, /const openGlobalProjectCreate = React\.useCallback/);
  assert.match(projectsSource, /searchParams\.get\(['"]new['"]\) !== ['"]project['"][\s\S]{0,160}createdFromQueryRef\.current = false/);
  assert.match(projectsSource, /openGlobalProjectCreate\(\)/);
  assert.match(projectsSource, /shouldOpenGlobalProjectCreate/);
  assert.match(projectsSource, /addEventListener\(['"]keydown['"]/);
  assert.match(projectsSource, /<Kbd>N<\/Kbd>/);
});

test("projects use durable create identity, raw edit drafts, dirty patches, and merged detail queries", () => {
  assert.match(projectsSource, /ProjectCreateDrawer/);
  assert.match(projectsSource, /ProjectDetailPanel/);
  assert.match(projectsSource, /buildProjectEditDraft/);
  assert.match(projectsSource, /buildProjectPatch/);
  assert.match(projectsSource, /mergeProjectDetailQuery/);
  assert.match(projectsSource, /data\.project\?\.id/);
  assert.match(projectsSource, /expectedUpdatedAt/);
  assert.doesNotMatch(projectsSource, /key: 'progress', label: '진행률 \(%\)'/);
});

test("project detail keeps useful display context while editing goal detail as multiline text", () => {
  assert.match(detailPanelSource, /export function ProjectDetailPanel/);
  assert.match(detailPanelSource, /displaySummary/);
  assert.match(detailPanelSource, /displayNextAction/);
  assert.match(projectsSource, /key: 'summary'[\s\S]{0,120}type: 'textarea'/);
});

test("EditDrawer only binds its save shortcut for an open record and blocks re-entry", () => {
  assert.match(primitivesSource, /if \(!record\) return[\s\S]{0,240}addEventListener\('keydown'/);
  assert.match(primitivesSource, /savingRef\.current/);
  assert.match(primitivesSource, /f\.type === 'textarea'/);
});
