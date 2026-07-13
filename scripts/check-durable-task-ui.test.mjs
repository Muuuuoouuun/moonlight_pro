import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = process.cwd();
const [dailySource, projectsSource, primitiveSource, tokenSource, projectTaskStateSource, hubAppSource, sidebarSource, topBarSource, quickCaptureSource] = await Promise.all([
  readFile(`${root}/apps/hub/components/hub/pages/daily-brief.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/pages/projects.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-primitives.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-tokens.css`, "utf8"),
  readFile(`${root}/apps/hub/lib/project-task-state.js`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-app.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-sidebar.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/hub-topbar.jsx`, "utf8"),
  readFile(`${root}/apps/hub/components/hub/quick-capture.jsx`, "utf8"),
]);

test("Daily ledger keeps the canonical task source and lanes independent from legacy brief state", () => {
  assert.match(dailySource, /taskSource:\s*['"]loading['"]/);
  assert.match(dailySource, /taskLanes/);
  assert.match(dailySource, /['"]empty['"]/);
  assert.match(dailySource, /['"]preview['"]/);
  assert.match(dailySource, /['"]error['"]/);
  assert.match(dailySource, /['"]live['"]/);
  assert.doesNotMatch(dailySource, /liveCount\s*>\s*0[^\n]*taskLanes/);
  assert.match(
    dailySource,
    /if\s*\(taskSource === ['"]error['"]\)\s*\{[\s\S]*?taskLanes:\s*previousLanes/,
  );
});

test("first fold puts durable attention between Quick Capture and the status line", () => {
  const quickCapture = dailySource.indexOf("<QuickCapture");
  const durableAttention = dailySource.indexOf("<DurableTaskAttention");
  const statusLine = dailySource.indexOf("<StatusLine");

  assert.ok(quickCapture >= 0, "Quick Capture must remain mounted");
  assert.ok(durableAttention > quickCapture, "durable attention must follow Quick Capture");
  assert.ok(statusLine > durableAttention, "status line must follow durable attention");
});

test("Daily durable attention uses the approved lane order and five-item focus cap", () => {
  assert.match(
    dailySource,
    /TASK_LANE_ORDER\s*=\s*\[['"]missed['"],\s*['"]today['"],\s*['"]waiting['"],\s*['"]inbox['"]\]/,
  );
  assert.match(dailySource, /TASK_FOCUS_LIMIT\s*=\s*5/);
  assert.doesNotMatch(dailySource, /\bblocks\b|\bsetBlocks\b|toggle\s*\(\s*i\s*\)/);
  assert.doesNotMatch(dailySource, /09:00|14:00/);
});

test("task completion uses the durable OCC client and canonical refetches for success or conflict", () => {
  assert.match(dailySource, /createDurableTaskClient/);
  assert.match(dailySource, /client\.updateTask\s*\(/);
  assert.match(dailySource, /id:\s*task\.id/);
  assert.match(dailySource, /expectedUpdatedAt:\s*task\.updatedAt/);
  assert.match(dailySource, /patch:\s*\{\s*status:\s*['"]done['"]\s*\}/);
  assert.match(dailySource, /result\.httpStatus\s*>=\s*200/);
  assert.match(dailySource, /['"]saved['"].*['"]duplicate['"]|['"]duplicate['"].*['"]saved['"]/s);
  assert.match(dailySource, /await ledger\.refetch\s*\(/);
  assert.match(
    dailySource,
    /result\.status\s*===\s*['"]conflict['"]\s*\)\s*\{\s*await ledger\.refetch\s*\(/,
  );
  assert.doesNotMatch(
    dailySource,
    /result\.(?:currentTask|task)\?\.(?:updatedAt|updated_at)/,
  );
  assert.match(dailySource, /createRefreshGenerationCoordinator/);
  assert.match(dailySource, /\.settle\s*\(loadGeneration\)/);
  assert.doesNotMatch(dailySource, /refreshWaitersRef/);
});

test("Daily completion 401 exposes an inline exact-task unlock retry", () => {
  assert.match(dailySource, /const \[unlockTask, setUnlockTask\]/);
  assert.match(dailySource, /client\.unlockSession\s*\(/);
  assert.match(dailySource, /unlockTask\?\.id === task\.id/);
  assert.match(dailySource, /currentTask\.updatedAt !== unlockTask\.updatedAt/);
  assert.match(dailySource, /await completeTask\(unlockTask/);
  assert.match(dailySource, /className="durable-task-attention__unlock"/);
  assert.match(dailySource, />\s*\uC4F0\uAE30 \uC7A0\uAE08 \uD574\uC81C\s*</);
});

test("initial task loading uses a fixed-height two-row token skeleton without fake content", () => {
  assert.match(dailySource, /function TaskAttentionSkeleton\s*\(/);
  assert.match(dailySource, /<TaskAttentionSkeleton\s*\/>/);
  assert.match(
    dailySource,
    /className=['"]durable-task-attention__skeleton['"][^>]*role=['"]status['"][^>]*aria-label=/,
  );
  assert.equal(
    [...dailySource.matchAll(/className=['"]durable-task-attention__skeleton-row['"]/g)].length,
    2,
  );
  assert.match(tokenSource, /\.durable-task-attention__skeleton\s*\{[^}]*height:\s*104px/s);
  assert.match(
    tokenSource,
    /\.durable-task-attention__skeleton-row\s*\{[^}]*background:\s*var\(--surface-2\)[^}]*border-bottom:\s*1px solid var\(--line-soft\)/s,
  );
});

test("task rows expose row-only pending and an announced retry without optimistic removal", () => {
  assert.match(dailySource, /pendingTaskIds/);
  assert.match(dailySource, /aria-busy/);
  assert.match(dailySource, /role=['"]alert['"]/);
  assert.match(dailySource, /다시 시도/);
  assert.match(dailySource, /label=\{.*task\.title.*\}/);
  assert.doesNotMatch(dailySource, /setTaskLanes|filter\s*\([^)]*task\.id/);
});

test("task read errors keep previously loaded rows visible beside the retry alert", () => {
  assert.match(dailySource, /ledger\.taskSource === ['"]error['"] && visibleTasks\.length === 0/);
  assert.match(dailySource, /ledger\.taskSource === ['"]error['"] && \(/);
  assert.match(dailySource, /기존[^<\n]*행|불러온[^<\n]*할 일/);
  assert.match(dailySource, /if\s*\([^)]*ledger\.taskSource === ['"]error['"][^)]*\)\s*return/);
  assert.match(
    dailySource,
    /aria-label=\{`\$\{task\.title\} 완료 다시 시도`\}[\s\S]{0,220}disabled=\{ledger\.taskSource === ['"]error['"]\}/,
  );
});

test("Button forwards DOM props and Checkbox supports busy disabled state", () => {
  assert.match(primitiveSource, /export function Button\s*\(\{[^)]*\.\.\.rest/s);
  assert.match(primitiveSource, /<button\s+\{\.\.\.rest\}/);
  assert.match(primitiveSource, /export function Checkbox\s*\(\{[^)]*disabled/s);
  assert.match(primitiveSource, /aria-busy=\{ariaBusy/);
  assert.match(primitiveSource, /className=['"]hub-checkbox['"]/);
});

test("Checkbox keeps a small face with a real 44px hit target", () => {
  assert.match(tokenSource, /\.hub-app\s+\.hub-checkbox::before/);
  assert.match(tokenSource, /width:\s*44px/);
  assert.match(tokenSource, /height:\s*44px/);
  assert.match(primitiveSource, /size\s*=\s*14/);
});

test("Projects keeps canonical task health separate from project sync health", () => {
  assert.match(projectsSource, /taskSource,\s*setTaskSource/);
  assert.match(projectsSource, /taskError,\s*setTaskError/);
  assert.match(projectsSource, /const nextTaskSource = data\.taskSource/);
  assert.match(projectsSource, /setTaskSource\(nextRead\.taskSource\)/);
  assert.match(projectsSource, /nextTaskSource\s*===\s*['"]error['"]/);
  assert.match(projectsSource, /setTodos\(previousTodos\s*=>\s*previousTodos\)/);
  assert.match(projectsSource, /role=['"]alert['"]/);
  assert.match(projectsSource, /기존[^<\n]*할 일|불러온[^<\n]*할 일/);
  assert.doesNotMatch(projectsSource, /taskSource\s*=\s*syncState/);
});

test("Projects read lifecycle survives React Strict Mode effect replay", () => {
  assert.match(
    projectsSource,
    /React\.useEffect\(\(\)\s*=>\s*\{\s*mountedRef\.current\s*=\s*true;[\s\S]*return\s*\(\)\s*=>\s*\{\s*mountedRef\.current\s*=\s*false;/,
  );
});

test("expanded Projects rows create project-linked durable tasks and refetch canonically", () => {
  assert.match(projectsSource, /createDurableTaskClient/);
  assert.match(projectsSource, /client\.createTask\s*\(/);
  assert.match(projectsSource, /title:\s*operation\.title/);
  assert.match(projectsSource, /projectId:\s*operation\.projectId/);
  assert.match(projectsSource, /status:\s*['"]todo['"]/);
  assert.match(projectsSource, /['"]saved['"].*['"]duplicate['"]|['"]duplicate['"].*['"]saved['"]/s);
  assert.match(projectsSource, /await loadLedger\s*\(/);
  assert.match(projectsSource, /\+ Task/);
  assert.match(projectsSource, /className=['"]project-task-composer['"]/);
});

test("Projects task rows use labeled durable checkboxes and row-only pending", () => {
  assert.match(projectsSource, /pendingTaskIds/);
  assert.match(projectsSource, /persistedTaskIds/);
  assert.match(projectsSource, /<Checkbox/);
  assert.match(projectsSource, /label=\{`\$\{t\.title\} 완료`\}/);
  assert.match(projectsSource, /client\.updateTask\s*\(/);
  assert.match(projectsSource, /if\s*\(persistedTaskIds\.has\(t\.id\)\)[\s\S]*await loadLedger\(\)[\s\S]*return/);
  assert.match(projectsSource, /expectedUpdatedAt:\s*t\.updatedAt/);
  assert.match(projectsSource, /patch:\s*\{\s*status:\s*['"]done['"]\s*\}/);
  assert.match(projectsSource, /result\.status\s*===\s*['"]conflict['"]/);
  assert.match(
    projectsSource,
    /else if \(result\.status === ['"]conflict['"]\) \{[\s\S]*const refreshed = await loadLedger\(\);[\s\S]*refreshed\.ok[\s\S]*최신 값을 불러왔[\s\S]*최신 값을 다시 읽지 못/,
  );
  assert.doesNotMatch(projectsSource, /aria-label=\{t\.done \? ['"]완료된 할 일/);
});

test("Projects task titles open the canonical durable EditDrawer", () => {
  assert.match(projectsSource, /<EditDrawer/);
  assert.match(projectsSource, /fields=\{TASK_EDIT_FIELDS/);
  assert.match(projectsSource, /title.*status.*priority.*dueDate.*nextAction/s);
  assert.match(projectsSource, /allowedTaskStatuses/);
  assert.match(projectTaskStateSource, /dueAt:\s*null,\s*duePrecision:\s*['"]none['"]/);
  assert.match(projectTaskStateSource, /dueAt.*duePrecision:\s*['"]date['"]/s);
  assert.match(projectsSource, /result\.status\s*===\s*['"]conflict['"][\s\S]*await loadLedger/);
  assert.match(projectsSource, /replaceTaskDraft\(latestDraft\)/);
});

test("Projects preserves timed due values and never claims an unfetched conflict refresh", () => {
  assert.match(projectsSource, /buildTaskDuePatch\(draftSnapshot,\s*taskTimezone\)/);
  assert.match(projectTaskStateSource, /task\.duePrecision\s*===\s*['"]timed['"]/);
  assert.match(projectTaskStateSource, /dueAt:\s*task\.dueAt,\s*duePrecision:\s*['"]timed['"]/);
  assert.match(projectsSource, /if\s*\(latest\)[\s\S]*최신 값으로 교체/);
  assert.match(projectsSource, /최신 값을 불러오지 못했습니다/);
});

test("EditDrawer keeps failed drafts open and disables all fields while saving or retrying", () => {
  assert.match(primitiveSource, /saveError,\s*setSaveError/);
  assert.match(primitiveSource, /try\s*\{[\s\S]*await onSave\(\)[\s\S]*catch/s);
  assert.match(primitiveSource, /const busy = saveState === ['"]saving['"] \|\| externalBusy/);
  assert.match(primitiveSource, /ariaBusy=\{busy\}/);
  assert.match(primitiveSource, /disabled=\{busy\}/g);
  assert.match(primitiveSource, /role=['"]alert['"]/);
  assert.match(primitiveSource, /r\?\.message|r\?\.error/);
  assert.match(primitiveSource, /if\s*\(busy\) return/);
});

test("Projects writable task controls meet mobile sizing without unlocking project writes", () => {
  assert.match(projectsSource, /프로젝트 생성·삭제는 읽기 전용/);
  assert.match(projectsSource, /Board.*읽기 전용|읽기 전용.*Board/s);
  assert.match(tokenSource, /\.project-task-composer\s+input[\s\S]*font-size:\s*16px/);
  assert.match(tokenSource, /\.project-task-control[\s\S]*min-height:\s*44px/);
  assert.match(tokenSource, /@media\s*\(max-width:\s*640px\)[\s\S]*\.hub-project-task-row/s);
  assert.match(projectsSource, /className=['"]hub-project-row['"]/);
  assert.match(projectsSource, /className=['"]hub-project-task-group['"]/);
  assert.match(projectsSource, /className=['"]hub-project-readonly-footer['"]/);
  assert.match(tokenSource, /@media\s*\(max-width:\s*640px\)[\s\S]*\.hub-project-row[\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto/s);
  assert.match(tokenSource, /\.hub-project-readonly-footer[\s\S]*min-width:\s*0/);
});

test("Projects keeps last-known-live surfaces mounted through read failures and preview", () => {
  assert.match(projectsSource, /hasLedgerSnapshot/);
  assert.match(projectsSource, /showLedgerSurface/);
  assert.match(projectsSource, /showLedgerSurface\s*&&\s*view === ['"]tree['"]/);
  assert.match(projectsSource, /showLedgerSurface\s*&&\s*syncState !== ['"]live['"]/);
  assert.match(projectsSource, /role=['"]alert['"][\s\S]*다시 시도/);
});

test("Projects binds composer async settlement to the originating operation", () => {
  assert.match(projectsSource, /beginComposerOperation/);
  assert.match(projectsSource, /settleComposerOperation/);
  assert.match(projectsSource, /operation\.projectId/);
  assert.match(projectsSource, /operation\.title/);
});

test("Projects task status and due dates use persisted status and API timezone", () => {
  assert.match(projectsSource, /record\.baseStatus/);
  assert.match(projectsSource, /taskTimezone/);
  assert.match(projectsSource, /buildTaskDuePatch\(draftSnapshot,\s*taskTimezone\)/);
  assert.doesNotMatch(projectsSource, /T00:00:00\+09:00|timeZone:\s*['"]Asia\/Seoul['"]/);
});

test("Projects blocks stale editors while the canonical task source is in error", () => {
  assert.match(projectsSource, /const openTaskEditor = \(t\) => \{\s*if \(taskSource === ['"]error['"]\) return;/);
  assert.match(projectsSource, /className="project-task-title"[\s\S]{0,180}disabled=\{taskSource === ['"]error['"]/);
});

test("Projects resolves OCC conflicts from mutation currentTask before refetch", () => {
  assert.match(projectsSource, /resolveConflictTask\(result\)/);
  assert.match(projectsSource, /applyAuthoritativeTask/);
  assert.match(projectsSource, /currentTask[\s\S]*await loadLedger\(\)/);
});

test("Projects unlocks write session inline without unmounting drafts", () => {
  assert.match(projectsSource, /client\.unlockSession/);
  assert.match(projectsSource, /type=['"]password['"]/);
  assert.match(projectsSource, /onSecretConsumed:\s*\(\)\s*=>\s*setUnlockSecret\(['"]['"]\)/);
  assert.match(projectsSource, /pendingUnlockRetryRef/);
  assert.doesNotMatch(projectsSource, /Quick Capture에서/);
});

test("editor unlock form stays inside the modal drawer instead of behind its overlay", () => {
  assert.match(projectsSource, /const unlockKind = requiresUnlock/);
  assert.match(projectsSource, /requiresUnlock && unlockKind !== ['"]editor['"]/);
  assert.match(projectsSource, /<EditDrawer[\s\S]*requiresUnlock && unlockKind === ['"]editor['"][\s\S]*project-session-unlock--drawer/);
  assert.match(tokenSource, /\.project-session-unlock--drawer[\s\S]*order:\s*-1/);
});

test("Projects mobile layout hides only the workspace sidebar, not the edit drawer", () => {
  assert.match(projectsSource, /className="hub-workspace-sidebar"/);
  assert.match(tokenSource, /\.hub-workspace-shell > \.hub-workspace-sidebar\s*\{\s*display: none !important;/);
  assert.doesNotMatch(tokenSource, /\.hub-workspace-shell > aside\s*\{\s*display: none !important;/);
});

test("closed mobile navigation leaves the tab order and theme changes do not cross-fade contrast", () => {
  assert.match(hubAppSource, /matchMedia\(["']\(max-width: 900px\)["']\)/);
  assert.match(hubAppSource, /inert=\{mobileNavClosed\}/);
  assert.match(hubAppSource, /ariaHidden=\{mobileNavClosed\}/);
  assert.match(hubAppSource, /event\.key === ["']Escape["']/);
  assert.match(hubAppSource, /\.hub-sidebar-root button/);
  assert.match(hubAppSource, /\.hub-mobile-only/);
  assert.match(hubAppSource, /focusMobileTriggerOnResizeRef/);
  assert.match(hubAppSource, /focusDesktopSidebarOnResizeRef/);
  assert.match(hubAppSource, /contains\(document\.activeElement\)/);
  assert.match(hubAppSource, /document\.hasFocus\(\)/);
  assert.match(hubAppSource, /onPointerDownCapture=\{\(event\) => \{/);
  assert.match(hubAppSource, /lastFocusWithinSidebarRef\.current = Boolean\(event\.target\?\.closest\?\.\('\.hub-sidebar-root'\)\)/);
  assert.match(hubAppSource, /lastFocusWasMobileTriggerRef\.current = Boolean\(event\.target\?\.closest\?\.\('\.hub-mobile-nav-trigger'\)\)/);
  assert.match(hubAppSource, /data-theme-switching=\{themeTransitionSuppressed/);
  assert.match(hubAppSource, /className="hub-mobile-backdrop"\s+aria-hidden="true"/);
  assert.match(sidebarSource, /aria-hidden=\{ariaHidden \|\| undefined\}/);
  assert.match(sidebarSource, /id="hub-primary-navigation"/);
  assert.match(topBarSource, /aria-expanded=\{navOpen\}/);
  assert.match(topBarSource, /aria-controls="hub-primary-navigation"/);
  assert.doesNotMatch(primitiveSource, /transition:\s*["']all\s/);
  assert.match(tokenSource, /data-theme-switching="true"\][\s\S]*transition:\s*none !important/);
  assert.match(tokenSource, /\.hub-mobile-nav-trigger,[\s\S]*\.hub-sidebar-toggle[\s\S]*min-width:\s*44px !important;[\s\S]*min-height:\s*44px !important/);
  assert.doesNotMatch(tokenSource, /transition:\s*background\s+0\.2s,\s*color\s+0\.2s/);
});

test("Quick Capture restores focus after every durable saved or duplicate response", () => {
  const persistedBranch = quickCaptureSource.slice(
    quickCaptureSource.indexOf("if (persisted)"),
    quickCaptureSource.indexOf("if (result.requiresUnlock)"),
  );
  assert.match(persistedBranch, /focusCaptureWhenReadyRef\.current\s*=\s*true/);
  assert.match(quickCaptureSource, /if \(!busy && focusCaptureWhenReadyRef\.current\)/);
});

test("task mutations announce success and EditDrawer avoids iOS input zoom", () => {
  assert.match(projectsSource, /aria-live=['"]polite['"]/);
  assert.match(projectsSource, /setTaskAnnouncement/);
  assert.match(tokenSource, /@media\s*\(max-width:\s*640px\)[\s\S]*\.hub-edit-drawer-field/);
  assert.match(tokenSource, /\.hub-edit-drawer-field\s+(?:input|input,\s*\n?\s*\.hub-edit-drawer-field\s+select)[\s\S]*font-size:\s*16px/);
  assert.match(primitiveSource, /className=['"]hub-edit-drawer-field['"]/);
});

test("Daily due labels use the same workspace timezone as lane assignment", () => {
  assert.match(dailySource, /taskTimezone/);
  assert.match(dailySource, /formatTaskDue\(task,\s*ledger\.taskTimezone\)/);
  assert.match(dailySource, /timeZone:\s*resolveTaskTimezone\(timezone\)/);
});

test("Daily task read errors preserve the last verified workspace timezone", () => {
  assert.match(
    dailySource,
    /if \(taskSource === ['"]error['"]\) \{[\s\S]*taskTimezone: resolveTaskTimezone\(previousTimezone\)/,
  );
});

test("Projects initial read has a fixed-height real-data skeleton", () => {
  assert.match(projectsSource, /ProjectLedgerSkeleton/);
  assert.match(projectsSource, /role=['"]status['"]/);
  assert.match(tokenSource, /\.project-ledger-skeleton[\s\S]*min-height:/);
});

test("Engine conflict payload prefers task and preserves canonical timed fields", () => {
  assert.match(projectTaskStateSource, /result\?\.task\s*\|\|\s*result\?\.currentTask/);
  assert.match(projectTaskStateSource, /normalized\.duePrecision\s*=\s*task\.duePrecision\s*\?\?\s*task\.due_precision/);
  assert.match(projectsSource, /const currentTask = resolveConflictTask\(result\)/);
});

test("inline unlock guards composer, editor, and completion identity before retry", () => {
  assert.match(projectsSource, /bindUnlockRetry/);
  assert.match(projectsSource, /guardUnlockRetry/);
  assert.match(projectsSource, /kind:\s*['"]composer['"]/);
  assert.match(projectsSource, /kind:\s*['"]editor['"]/);
  assert.match(projectsSource, /kind:\s*['"]complete['"]/);
  assert.match(
    projectsSource,
    /const guardedRetry = guardUnlockRetry[\s\S]*if \(!guardedRetry\.allowed\)[\s\S]*return;[\s\S]*await guardedRetry\.run\(\)/,
  );
  assert.match(projectsSource, /isTaskOperationCurrent\(taskDraftRef\.current,\s*editorIdentity\)/);
});

test("inline unlock retries are bound to exact writable snapshots", () => {
  assert.match(projectTaskStateSource, /writableTaskFingerprint/);
  assert.match(projectTaskStateSource, /binding\.fingerprint/);
  assert.match(projectsSource, /changeTaskComposerTitle[\s\S]*dismissStaleUnlock\(\)/);
  assert.match(projectsSource, /changeTaskDraft[\s\S]*dismissStaleUnlock\(\)/);
  assert.match(projectsSource, /editorIsCurrent[\s\S]*writableTaskFingerprint/);
  assert.match(projectsSource, /editorRetryPending/);
  assert.match(projectsSource, /externalBusy=\{editorRetryPending\}/);
  assert.match(primitiveSource, /externalBusy/);
});

test("Engine nested project conflicts retain the scalar Projects filter key", () => {
  assert.match(projectTaskStateSource, /task\.project\.id/);
  assert.match(projectTaskStateSource, /projectName/);
  assert.match(projectsSource, /t\.project === p\.id/);
});

test("date-only saves retain date precision across nonexistent local midnight", () => {
  assert.match(projectsSource, /buildTaskDuePatch\(draftSnapshot,\s*taskTimezone\)/);
  assert.match(projectTaskStateSource, /dueAt,\s*duePrecision:\s*['"]date['"]/);
  assert.match(projectTaskStateSource, /earliest real instant/);
  assert.match(projectTaskStateSource, /scanStart/);
});

test("Projects skeleton animation respects reduced motion", () => {
  assert.match(
    tokenSource,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.project-ledger-skeleton__row\s*\{[^}]*animation:\s*none/s,
  );
});

test("drawer slide motion keeps its opaque shell above global chrome", () => {
  const drawerMotion = tokenSource.match(/@keyframes\s+hubDrawerIn[^\n]*/)?.[0] || "";
  assert.match(drawerMotion, /transform:\s*translateX/);
  assert.doesNotMatch(drawerMotion, /opacity:/);
  assert.match(primitiveSource, /className="hub-drawer"[\s\S]*zIndex:\s*61/);
});
