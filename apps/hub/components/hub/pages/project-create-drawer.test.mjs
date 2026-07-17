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
const rootPackage = JSON.parse(await readFile(
  new URL("../../../../../package.json", import.meta.url),
  "utf8",
));

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

test("content pipeline retries seed and verify all four deterministic tasks", () => {
  assert.match(projectsSource, /buildContentPipelineTaskSeeds/);
  assert.match(projectsSource, /contentPipelineReloadContains/);
  assert.match(projectsSource, /return \{ ok: true, projects: liveProjects, todos: liveTodos \}/);
  assert.match(projectsSource, /\[\s*['"]saved['"],\s*['"]duplicate['"]\s*\]\.includes\(stageData\.status\)/);
  assert.match(projectsSource, /status: ['"]pipeline-error['"]/);
  assert.match(createDrawerSource, /pipeline-error/);

  const seedStart = projectsSource.indexOf("if (draft.contentPipeline");
  const seedEnd = projectsSource.indexOf("const reloadResult", seedStart);
  const seedBlock = projectsSource.slice(seedStart, seedEnd);
  assert.ok(seedStart >= 0 && seedEnd > seedStart, "pipeline seed block must exist");
  assert.doesNotMatch(seedBlock, /data\.status === ['"]saved['"]/);
  assert.doesNotMatch(seedBlock, /createClientId\(\)/);
});

test("idempotency conflict preserves the entity and offers both recovery paths", () => {
  assert.match(projectsSource, /project: data\.project/);
  assert.match(createDrawerSource, /onRetryWithNewClientId/);
  assert.match(createDrawerSource, /새 요청으로 다시 시도/);
  assert.match(createDrawerSource, /onOpenConflictProject/);
  assert.match(createDrawerSource, /기존 프로젝트 열기/);
});

test("invalid conflict retry stops before rotating the client id or saving", () => {
  const retryStart = createDrawerSource.indexOf("const handleRetryWithNewClientId");
  const retryEnd = createDrawerSource.indexOf("const handleOpenConflictProject", retryStart);
  const retryBlock = createDrawerSource.slice(retryStart, retryEnd);
  const validationIndex = retryBlock.indexOf("if (!validateDraft(draft)) return;");
  const rotationIndex = retryBlock.indexOf("onRetryWithNewClientId?.(draft)");
  const saveIndex = retryBlock.indexOf("saveDraft(nextDraft)");

  assert.ok(retryStart >= 0 && retryEnd > retryStart, "retry handler must exist");
  assert.ok(validationIndex >= 0, "retry must run required-field validation first");
  assert.ok(rotationIndex > validationIndex, "invalid retry must not rotate its client id");
  assert.ok(saveIndex > rotationIndex, "only a valid rotated draft may be submitted");
});

test("retry shares inline required errors, feedback, and first-invalid focus", () => {
  const validationStart = createDrawerSource.indexOf("const validateDraft");
  const validationEnd = createDrawerSource.indexOf("const saveDraft", validationStart);
  const validationBlock = createDrawerSource.slice(validationStart, validationEnd);

  assert.ok(validationStart >= 0 && validationEnd > validationStart, "shared validation gate must exist");
  assert.match(validationBlock, /validateProjectDraft\(candidate\)/);
  assert.match(validationBlock, /setErrors\(nextErrors\)/);
  assert.match(validationBlock, /setSaveState\(["']invalid["']\)/);
  assert.match(validationBlock, /setFeedback\(["']필수 입력을 확인하세요\.["']\)/);
  assert.match(validationBlock, /requestAnimationFrame/);
  assert.match(validationBlock, /nextErrors\.title[\s\S]*titleRef\.current\?\.focus\(\)[\s\S]*locationRef\.current\?\.focus\(\)/);
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

test("stale project edit rebases its source and exposes the loaded-ledger message", () => {
  assert.match(projectsSource, /rebaseProjectEditSource/);
  assert.match(projectsSource, /data\.status === ['"]conflict['"][\s\S]{0,240}data\.project/);
  assert.match(projectsSource, /setProjectEditSource\([\s\S]{0,160}rebaseProjectEditSource/);
  assert.match(projectsSource, /최신 원장 기준을 불러왔습니다/);
  assert.match(primitivesSource, /r\?\.message/);
  assert.match(primitivesSource, /saveFeedback/);
});

test("root test command includes nested Hub component contracts", () => {
  assert.match(
    rootPackage.scripts.test,
    /["']apps\/hub\/components\/\*\*\/\*\.test\.mjs["']/,
  );
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
