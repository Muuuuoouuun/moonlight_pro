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

test("partial portfolios preserve metrics from the readable project core", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  const projects = [
    { statusKey: "active", displayProgress: { value: 50, partial: false } },
    { statusKey: "blocked", displayProgress: { value: null, partial: true } },
  ];

  assert.deepEqual(pmsMetrics.buildProjectPortfolioMetrics(projects, { sourceState: "partial" }), {
    empty: false,
    active: 1,
    blockedOrOverdue: 1,
    dueSoon: 0,
    unmeasured: 1,
  });
});

test("project-capped portfolios mark every visible metric as a lower bound", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  const projects = [
    { statusKey: "active", displayProgress: { value: 50, partial: false } },
    { statusKey: "blocked", displayProgress: { value: null, partial: true } },
  ];

  assert.deepEqual(pmsMetrics.buildProjectPortfolioMetrics(projects, {
    sourceState: "partial",
    projectCorePartial: true,
  }), {
    empty: false,
    active: 1,
    blockedOrOverdue: 1,
    dueSoon: 0,
    unmeasured: 1,
    lowerBound: true,
  });
});

test("project-capped empty visible slices stay lower bounds instead of proven empty", () => {
  assert.ok(pmsMetrics, "project-pms-metrics.js must expose executable calculations");
  assert.deepEqual(pmsMetrics.buildProjectPortfolioMetrics([], {
    sourceState: "partial",
    projectCorePartial: true,
  }), {
    empty: false,
    active: 0,
    blockedOrOverdue: 0,
    dueSoon: 0,
    unmeasured: 0,
    lowerBound: true,
  });
});

test("portfolio presentation consumes the executable metric helper without synthetic scoring", () => {
  assert.match(pmsComponentsSource, /import \{ buildProjectPortfolioMetrics \} from ["']\.\/project-pms-metrics["']/);
  assert.match(pmsMetricsSource, /displayProgress/);
  assert.match(pmsMetricsSource, /dueAt/);
  assert.match(pmsMetricsSource, /\[["']live["'],\s*["']partial["']\]\.includes\(sourceState\)/);
  assert.match(pmsComponentsSource, /projectCorePartial/);
  assert.match(pmsComponentsSource, /metrics\.lowerBound[\s\S]*\+`/);
  assert.match(pmsComponentsSource, /일부 범위/);
  assert.match(pmsComponentsSource, /표시할 원장 없음/);
  assert.doesNotMatch(pmsComponentsSource, /preview에서는/);
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
  // The row checkbox means "complete" — same semantics as the subtask checkbox
  // below it (selection is the row click's job). Checking schedules an undoable
  // completion; on an already-terminal row it reopens.
  assert.match(projectsSource, /<Checkbox[\s\S]{0,520}label=\{terminal \? `다시 열기: \$\{p\.name\}` : `완료: \$\{p\.name\}`\}/);
  assert.match(projectsSource, /onChange=\{\(\) => terminal \? completeProject\(p\) : scheduleCompleteProject\(p\)\}/);
  assert.match(projectsSource, /<Checkbox[\s\S]{0,420}label=\{`\$\{t\.done \? ['"]다시 열기['"] : ['"]완료['"]\}: \$\{t\.title\}`\}/);
  assert.doesNotMatch(projectsSource, /<input\s+type=["']checkbox["']/);
});

test("row completion is undoable and terminal projects live in a collapsed section", () => {
  // 3.5s cancel window: the PATCH only fires after the undo window closes. The window
  // lives in the shared useUndoableAction hook, whose unmount semantic is flush(즉시 실행)
  // — 페이지 이탈로 "완료됨" 영수증이 증발하지 않는다(2026-08-05 system-eval).
  assert.match(projectsSource, /import \{ useUndoableAction \} from ["']\.\.\/use-undoable-action["']/);
  assert.match(projectsSource, /action: \{ label: '되돌리기', onClick: \(\) => undoCompleteProject\(project\) \}/);
  assert.match(projectsSource, /scheduleUndoable\(id, async \(\) => \{/);
  // 7차 재감사: 창 닫힘 시 알림 전체 소거(라벨만 남기면 영구 표시) — revenue·daily-brief와
  // 통일된 계약을 cancel 실패 분기에서 잠근다.
  assert.match(projectsSource, /if \(!cancelUndoable\(project\.id\)\) \{/);
  assert.match(projectsSource, /cur\?\.key === `complete-\$\{project\.id\}` \? null : cur/);
  // Terminal projects never mix into the active groups — they render only in
  // the collapsed 완료·보관 accordion at the bottom (aria-expanded contract).
  assert.match(projectsSource, /brandProjects\.filter\(p => !isTerminalProject\(p\) && !hiddenIds\.has\(p\.id\)\)/);
  assert.match(projectsSource, /aria-expanded=\{showTerminal\}/);
  assert.match(projectsSource, /label=\{`다시 열기: \$\{p\.name\}`\}/);
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

test("task status controls lock the same item until its durable reload finishes", () => {
  const updateStart = projectsSource.indexOf("const updateTaskStatus");
  const updateEnd = projectsSource.indexOf("const toggleTodo", updateStart);
  const updateBlock = projectsSource.slice(updateStart, updateEnd);

  assert.match(projectsSource.slice(0, updateStart), /const taskStatusPendingRef = React\.useRef\(new Set\(\)\)/);
  assert.match(projectsSource.slice(0, updateStart), /const \[pendingTaskIds, setPendingTaskIds\] = React\.useState/);
  assert.match(updateBlock, /if \(taskStatusPendingRef\.current\.has\(id\)\) return false/);
  assert.match(updateBlock, /taskStatusPendingRef\.current\.add\(id\)/);
  assert.match(updateBlock, /finally[\s\S]{0,220}taskStatusPendingRef\.current\.delete\(id\)/);
  assert.match(projectsSource, /disabled=\{pendingTaskIds\.has\(t\.id\)\}/);
  assert.match(projectsSource, /pendingTodoIds=\{pendingTaskIds\}/);
  assert.match(detailPanelSource, /disabled=\{pendingTodoIds\.has\(todo\.id\)\}/);
});

test("project reads keep error distinct from preview and offer retry", () => {
  const loadStart = projectsSource.indexOf("const loadLedger");
  const effectStart = projectsSource.indexOf("React.useEffect", loadStart);
  const loadBlock = projectsSource.slice(loadStart, effectStart);

  assert.match(loadBlock, /setSyncState\(['"]error['"]\)/);
  assert.match(loadBlock, /data\.source === ['"]error['"]/);
  assert.match(projectsSource, /프로젝트 원장을 읽지 못했습니다/);
  assert.match(projectsSource, /onClick=\{\(\) => loadLedger\(\{ initial: true \}\)\}/);
  assert.doesNotMatch(loadBlock, /catch[\s\S]{0,120}setSyncState\(['"]preview['"]\)/);
});

test("canonical project selection is forwarded to the Projects API before the bounded read", () => {
  const loadStart = projectsSource.indexOf("const loadLedger");
  const effectStart = projectsSource.indexOf("React.useEffect", loadStart);
  const loadBlock = projectsSource.slice(loadStart, effectStart);

  assert.match(projectsSource.slice(0, loadStart), /const selectedProjectId = searchParams\.get\(['"]project['"]\)/);
  // 선택값은 ref로 읽는다 — deps에 넣으면 상세 열기/닫기마다 마운트 이펙트가 전체 원장을
  // 재조회한다(2026-08-05 perf). 선택 read-back은 아래 전용 이펙트가 담당한다.
  assert.match(projectsSource.slice(0, loadStart), /selectedProjectIdRef\.current = selectedProjectId/);
  assert.match(loadBlock, /projectId\s*=\s*selectedProjectIdRef\.current/);
  assert.match(loadBlock, /\/api\/hub\/projects\?project=\$\{encodeURIComponent\(exactProjectId\)\}/);
  assert.match(loadBlock, /fetch\(endpoint, \{ cache: ['"]no-store['"], signal: controller\.signal \}\)/);
  // 열기 시 exact read를 수행하는 선택 이펙트 — 닫기(null)는 재조회하지 않는다.
  assert.match(projectsSource, /if \(!selectedProjectId \|\| !initialLoadDoneRef\.current\) return;/);
  assert.match(projectsSource, /loadLedger\(\{ projectId: selectedProjectId \}\)/);
  assert.match(projectsSource, /ledger\.selection\?\.projectId === p\.id/);
  assert.match(projectsSource, /failedSources=\{detailFailedSources\}/);
});

test("a superseded project read cannot overwrite the latest ledger state", () => {
  const loadStart = projectsSource.indexOf("const loadLedger");
  const effectStart = projectsSource.indexOf("React.useEffect", loadStart);
  const loadBlock = projectsSource.slice(loadStart, effectStart);

  assert.match(projectsSource.slice(0, loadStart), /const ledgerReadRef = React\.useRef/);
  assert.match(loadBlock, /ledgerReadRef\.current\.controller\?\.abort\(\)/);
  assert.match(loadBlock, /const controller = new AbortController\(\)/);
  assert.match(loadBlock, /signal:\s*controller\.signal/);
  assert.match(loadBlock, /const isCurrentRequest = \(\) =>/);
  assert.match(loadBlock, /if \(!isCurrentRequest\(\)\)[\s\S]{0,100}stale:\s*true/);
  assert.match(loadBlock, /AbortError[\s\S]{0,140}stale:\s*true/);
});

test("mutation reloads keep the current ledger mounted while refreshing", () => {
  const loadStart = projectsSource.indexOf("const loadLedger");
  const effectStart = projectsSource.indexOf("React.useEffect", loadStart);
  const loadBlock = projectsSource.slice(loadStart, effectStart);

  // SWR 캐시 도입(4차 재감사): initial 여부와 무관하게, 현재 원장이 live/partial이면
  // loading으로 덮지 않는다 — 뮤테이션 재검증과 캐시 서빙 마운트 둘 다 행을 유지한다.
  assert.match(loadBlock, /setSyncState\(current\s*=>[\s\S]{0,180}(live|partial)[\s\S]{0,180}loading/);
  assert.doesNotMatch(loadBlock, /^\s*setSyncState\(['"]loading['"]\);/m);
});

test("the linked-content ledger loads only when project detail is used", () => {
  const contentStart = projectsSource.indexOf('프로젝트 상세의 "연관 콘텐츠"');
  const effectStart = projectsSource.indexOf("React.useEffect", contentStart);
  const contentEnd = projectsSource.indexOf("React.useEffect", effectStart + 1);
  const contentBlock = projectsSource.slice(contentStart, contentEnd);

  assert.ok(contentStart >= 0 && effectStart > contentStart && contentEnd > effectStart);
  assert.match(projectsSource.slice(0, contentStart), /const contentLoadedRef = React\.useRef\(false\)/);
  assert.match(contentBlock, /if \(!openDetail \|\| contentLoadedRef\.current\) return undefined/);
  assert.match(contentBlock, /contentLoadedRef\.current = true/);
  assert.match(contentBlock, /AbortController/);
  assert.match(contentBlock, /\[openDetail\]/);
});

test("partial project reads preserve core rows and offer a named retry state", () => {
  assert.match(projectsSource, /data\.partial \? ['"]partial['"] : ['"]live['"]/);
  assert.match(projectsSource, /프로젝트 일부 원장을 읽지 못했습니다/);
  assert.match(projectsSource, /ledger\.failedSources/);
  assert.match(projectsSource, /onClick=\{\(\) => loadLedger\(\{ initial: true \}\)\}/);
  assert.match(projectsSource, /failedSources=\{detailFailedSources\}/);
});

test("project detail distinguishes failed optional ledgers from successful empty history", () => {
  assert.match(detailPanelSource, /failedSources = \[\]/);
  assert.match(detailPanelSource, /failedEmpty\("project_updates"/);
  assert.match(detailPanelSource, /failedEmpty\("decisions"/);
  assert.match(detailPanelSource, /failedEmpty\("notes"/);
  assert.match(detailPanelSource, /failedEmpty\("routine_checks"/);
  assert.match(detailPanelSource, /\$\{source\} 원장을 읽지 못했습니다/);
  assert.match(detailPanelSource, /업데이트 기록 미확인/);
});

test("project header marks an incomplete open-todo count as a lower bound", () => {
  const headerStart = projectsSource.indexOf("const projectHeaderSummary");
  const headerEnd = projectsSource.indexOf("const loadLedger", headerStart);
  const headerSummaryBlock = projectsSource.slice(headerStart, headerEnd);

  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  assert.match(headerSummaryBlock, /taskReadPartial/);
  assert.match(headerSummaryBlock, /projectReadPartial/);
  assert.match(headerSummaryBlock, /projectCountLabel/);
  assert.match(headerSummaryBlock, /partialSources/);
  assert.match(headerSummaryBlock, /taskAggregation/);
  assert.match(headerSummaryBlock, /projects\.length/);
  assert.match(headerSummaryBlock, /openTodoCount/);
  assert.match(headerSummaryBlock, /\$\{openTodoCount\}\+ open todos/);
  assert.match(headerSummaryBlock, /\$\{projectCountLabel\} projects/);
  assert.match(headerSummaryBlock, /loading[\s\S]*원장 확인 중/);
  assert.match(headerSummaryBlock, /error[\s\S]*원장 읽기 실패/);
  assert.match(headerSummaryBlock, /preview/);
  assert.match(projectsSource, /\{projectHeaderSummary\}/);
  assert.match(projectsSource, /partialSources:\s*Array\.isArray\(data\.partialSources\)/);
  assert.match(projectsSource, /taskAggregation:\s*data\.taskAggregation/);
  assert.match(projectsSource, /projectCorePartial=\{projectReadPartial\}/);
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
  assert.match(responsiveCss, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.hub-project-detail-sheet\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(responsiveCss, /\.hub-project-detail-sheet\s*>\s*aside\s*\{[\s\S]*?width:\s*100%/);
});

test("desktop detail remains a split inspector instead of trapping the full workspace", () => {
  assert.match(projectsSource, /data-detail-open=\{openDetail \? ["']true["'] : ["']false["']\}/);
  assert.match(projectsSource, /role=\{mobileDetail \? ["']dialog["'] : ["']region["']\}/);
  assert.match(projectsSource, /aria-modal=\{mobileDetail \? ["']true["'] : undefined\}/);
  assert.match(projectsSource, /if \(!openDetail \|\| drawerOpen\) return undefined;/);
  assert.match(projectsSource, /if \(event\.key === ["']Escape["']\)[\s\S]{0,180}closeProjectDetail\(\)/);
  assert.match(projectsSource, /if \(!mobileDetail \|\| event\.key !== ["']Tab["']/);
  assert.match(globalCss, /\.hub-projects-main-grid\[data-detail-open=["']true["']\][\s\S]*?\.hub-project-row__open/);
});

test("canonical drawers suspend the underlying project detail Escape handler", () => {
  const drawerOpenIndex = projectsSource.indexOf("const drawerOpen");
  const detailEffectStart = projectsSource.indexOf("if (!openDetail");
  const detailEffectEnd = projectsSource.indexOf("const toggleExpand", detailEffectStart);
  const detailEffect = projectsSource.slice(detailEffectStart, detailEffectEnd);

  assert.ok(drawerOpenIndex >= 0 && drawerOpenIndex < detailEffectStart, "drawerOpen must be computed before the detail effect");
  assert.match(detailEffect, /if \(!openDetail \|\| drawerOpen\) return undefined;/);
  assert.match(detailEffect, /if \(event\.key === ["']Escape["']\)[\s\S]{0,180}closeProjectDetail\(\)/);
  assert.match(detailEffect, /\[closeProjectDetail, drawerOpen, mobileDetail, openDetail\]/);
  assert.match(projectsSource, /\{openDetail && \(\(\) => \{/);
  assert.doesNotMatch(projectsSource, /stopImmediatePropagation/);
});

test("drawer close focus restoration is not overridden by detail autofocus", () => {
  const autofocusStart = projectsSource.indexOf("const detailAutofocusRaf");
  const nextEffect = projectsSource.indexOf("React.useEffect", autofocusStart);
  const autofocusBlock = projectsSource.slice(autofocusStart, nextEffect);

  assert.ok(autofocusStart >= 0 && nextEffect > autofocusStart);
  assert.match(autofocusBlock, /querySelector\(['"]\[aria-label=[^\n]+상세 닫기/);

  const listenerStart = projectsSource.indexOf("if (!openDetail || drawerOpen)", nextEffect);
  const listenerEnd = projectsSource.indexOf("const toggleExpand", listenerStart);
  const listenerBlock = projectsSource.slice(listenerStart, listenerEnd);
  assert.doesNotMatch(listenerBlock, /detailAutofocusRaf|상세 닫기[^\n]+focus\(\)/);
});

test("mobile detail autofocus handles each presentation once without crossing an open drawer", () => {
  const autofocusRef = projectsSource.indexOf("const detailAutofocusPresentationRef");
  const autofocusRaf = projectsSource.indexOf("const detailAutofocusRaf");
  const effectStart = projectsSource.lastIndexOf("React.useEffect", autofocusRaf);
  const effectEnd = projectsSource.indexOf("React.useEffect", autofocusRaf);
  const effectBlock = projectsSource.slice(effectStart, effectEnd);

  assert.ok(autofocusRef >= 0 && autofocusRef < effectStart, "the one-shot presentation ref must outlive effect reruns");
  assert.match(effectBlock, /if \(!openDetail \|\| !mobileDetail\) \{[\s\S]{0,160}detailAutofocusPresentationRef\.current = null;[\s\S]{0,80}return undefined;/);
  assert.match(effectBlock, /const detailPresentationKey = [`'"][^`'"\n]*\$\{openDetail\}[^`'"\n]*[`'"]/);

  const handledCheck = effectBlock.indexOf("detailAutofocusPresentationRef.current === detailPresentationKey");
  const markHandled = effectBlock.indexOf("detailAutofocusPresentationRef.current = detailPresentationKey");
  const drawerGuard = effectBlock.indexOf("if (drawerOpen) return undefined");
  const focusUnderlyingDetail = effectBlock.indexOf("const detailAutofocusRaf");
  assert.ok(handledCheck >= 0 && handledCheck < markHandled, "an already handled presentation must not autofocus twice");
  assert.ok(markHandled < drawerGuard, "a drawer-covered presentation must be marked handled before returning");
  assert.ok(drawerGuard < focusUnderlyingDetail, "the topmost drawer must block underlying detail autofocus");
  assert.match(effectBlock, /\[drawerOpen, mobileDetail, openDetail\]/);
});

test("desktop detail-open rows fit the standard sidebar-constrained width without clipping", () => {
  const rule = (selector) => {
    const start = globalCss.indexOf(selector);
    const end = globalCss.indexOf("}", start);
    return globalCss.slice(start, end);
  };
  const minimumWidth = (block) => {
    const template = block.match(/grid-template-columns:\s*([^;]+)/)?.[1] || "";
    const tracks = [...template.matchAll(/(?:^|\(|\s)(\d+)px/g)].map((match) => Number(match[1]));
    const gap = Number(block.match(/gap:\s*(\d+)px/)?.[1] || 0);
    const inlinePadding = Number(block.match(/padding:\s*\d+px\s+(\d+)px/)?.[1] || 0);
    return tracks.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, tracks.length - 1) + inlinePadding * 2;
  };

  const defaultRow = rule(".hub-app .hub-project-row {");
  const detailHead = rule('.hub-app .hub-projects-main-grid[data-detail-open="true"] .hub-project-list-head {');
  const detailRow = rule('.hub-app .hub-projects-main-grid[data-detail-open="true"] .hub-project-row {');

  assert.ok(minimumWidth(defaultRow) <= 880, `default row minimum is ${minimumWidth(defaultRow)}px`);
  assert.ok(minimumWidth(detailHead) <= 540, `detail header minimum is ${minimumWidth(detailHead)}px`);
  assert.ok(minimumWidth(detailRow) <= 540, `detail row minimum is ${minimumWidth(detailRow)}px`);
  assert.match(detailRow, /gap:\s*\d+px/);
  assert.match(detailRow, /padding:\s*0\s+\d+px/);
  assert.doesNotMatch(detailRow, /overflow:\s*hidden/);
});

test("mobile project todos collapse to a readable two-column card instead of squeezing desktop tracks", () => {
  assert.match(projectsSource, /className=["']hub-project-todo-row["']/);
  assert.match(projectsSource, /className=["']hub-project-todo-check["']/);
  assert.match(projectsSource, /className=["']hub-project-todo-main hub-row["']/);
  assert.match(projectsSource, /className=["']hub-project-todo-priority["']/);
  assert.match(projectsSource, /className=["']mono hub-project-todo-due["']/);

  const mobileStart = responsiveCss.indexOf("@media (max-width: 900px)");
  const mobileCss = responsiveCss.slice(mobileStart);
  assert.match(mobileCss, /\.hub-project-todo-row\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(0,\s*1fr\)/);
  assert.match(mobileCss, /\.hub-project-todo-check\s*\{[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/);
  assert.match(mobileCss, /\.hub-project-todo-main\s*\{[\s\S]*?grid-column:\s*2/);
  assert.match(mobileCss, /\.hub-project-todo-assignee\s*\{[\s\S]*?display:\s*none/);
});

test("desktop project detail owns a viewport-bounded scroller and persistent action footer", () => {
  assert.match(detailPanelSource, /className=["']hub-project-detail-panel["']/);
  assert.match(detailPanelSource, /className=["']hub-project-detail-actions["']/);
  assert.match(projectsSource, /hub-project-page-header--detail/);
  assert.match(projectsSource, /className=["']hub-project-brand-trigger["']/);
  assert.match(globalCss, /\.hub-app \.hub-project-detail-sheet\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 126px\)/);
  assert.match(globalCss, /\.hub-project-page-header--detail \.hub-project-header-context[\s\S]*?display:\s*none/);
  assert.match(globalCss, /\.hub-project-page-header--detail \.hub-project-brand-trigger__meta[\s\S]*?display:\s*none/);
  assert.match(globalCss, /\.hub-app \.hub-project-detail-actions\s*\{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(globalCss, /\.hub-app \.hub-project-detail-panel\s*\{[\s\S]*?min-height:\s*0/);
});
