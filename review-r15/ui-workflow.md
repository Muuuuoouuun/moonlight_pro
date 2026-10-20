# R15 workflow UI implementation

Date: 2026-10-20. Isolated branch `audit/r15-ui-workflow-20261020`, base `14284e72dfb89096e8337abdb657413fb4fe4df5`.

## Selected scope and before/after

Implemented the semantic selections from R14 table 1 with current data contracts. No exact current cloud mock was available; historical previews were not treated as approved replacement designs.

| Surface | Before | After |
| --- | --- | --- |
| Home / Today / Overview roles | Home decision triage, Today execution, Overview aggregate context | Same role separation; Home unchanged |
| Today — TIME FLOW | Flat task, calendar and secondary panels; first three calendar events with a noninteractive remainder count | Capture → now/tasks → commitments/calendar → close the day. Calendar uses actual start-time order, all-day/unknown-time labels and next-start marker. Extra events are expandable. Weekly/report/dispatch/inquiry support is grouped behind one disclosure |
| Overview — GOAL LENS | Goal summary followed immediately by activity/dashboard panels | Existing goal summary becomes the lead; actual-value recording links to existing check-in. Activity/operations panels and their 7/14/30-day selector sit inside a native disclosure. Activity-ledger truth is explicitly labelled |
| Goals — RECORDS / ATTENTION | KPI strip and weekly memo before objective cards | Up to three active manual metrics, missing evidence first, and existing attention list lead. Existing KPI/objective panels follow; weekly memo stays available in a native disclosure |
| Projects / theme | Existing structure/theme | Unchanged |

Operational metric pulse remains directly visible on Today: an older explicit decision requires that placement, and the new semantic choice did not expressly revoke it. No global redesign, token, sidebar, finance, memo, capture, or motion ownership changes.

## Preserved contracts

- Calendar start timestamps determine ordering only. The existing read contract has no end timestamp; `시작 시각 지남` never claims ended/completed. All-day and unknown starts remain explicit. Real completion/note/revision handling stays in `CalendarOutcome`, with original `outcomeKey`.
- The first three agenda rows mount initially. After expansion, extra rows remain keyed and mounted while hidden, preserving pending save/conflict/acknowledgement state through collapse/reopen.
- Existing task capture, task completion/undo, customer recording, KA/follow-up navigation, calendar connection/open, Guru entry points, dispatch/report actions, review navigation and secondary panels remain available. No model call is introduced by the layout.
- Today secondary disclosure mounts lazily once and then retains children when closed, preserving unsaved drafts and pending state. Native Overview/weekly memo disclosures retain their children.
- Manual metric actions forward the same objective, metric and opener to the existing quick-record route/form. Existing scope, search, archive handling, revisions, score/threshold/observation formulas, edit/detail/continue actions remain unchanged. Measured zero is not missing evidence.
- Partial/error/preview/loading state remains explicit. The new record panel requires both objective and metric sources to be readable; definitive empty copy requires both complete. Failed data is not offered as actionable stale evidence.
- New CSS is page-scoped and uses existing color/radius/spacing tokens and 1px borders. Disclosure/record links have a 44px minimum; existing primitive mobile hitboxes and 16px input floor are retained. New layout adds no motion. Semantic sections, labelled buttons, `aria-expanded`, native keyboard disclosures and focus-visible styling are retained.

## Validation

- Focused Node suite: **95 passed, 0 failed, 0 skipped**. Includes existing Today Guru/action/navigation contracts; Goals surface, goal client/input and overview truth tests; new time ordering/manual record selection/source incompleteness/disclosure retention fixtures; existing palette/focus/motion/state/no-production-mock guards.
- The six initial legacy presentation-test failures were confined to the moved calendar component dependency (three Guru extraction tests and two layout tests) and the renamed Goals tab label. Fixtures now load/stub the new boundary appropriately and assert the same original IDs/routes/truth states, plus expanded coverage. No guard or action assertion was removed to make them pass.
- Independent review identified and resolved two P2 gaps: objective-source completeness in new empty copy, and pending calendar editor unmount on collapse. Activity-source label clarity was also corrected.
- Actual React SSR rendered **DailyBrief, TodayTimeFlow, Overview, Goals** through 130 production modules, shared primitives, CSS and goal helpers with synthetic read hooks/Next boundaries. Eight light/dark HTML fixtures and `render-report.json` are in `/workspace/moonlight-audit-20261019/review-r15/ui-workflow-browser`; `render.mjs` is the reproducible isolated runner. Assertions cover actual capture/task/calendar/close-day ordering, goal-record identity and measured zero, goal summary before native closed activity disclosure, source label and period control.
- `git diff --check` passes. Full repository/type/build checks are delegated to the parent integration worktree.

Focused command (allowlist environment; no app environment loaded):

```sh
env -i PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 node --import ./scripts/register-hub-alias.mjs --test apps/hub/components/hub/pages/daily-brief-*.test.mjs apps/hub/components/hub/pages/goals-surface.test.mjs apps/hub/components/hub/pages/overview-*.test.mjs apps/hub/components/hub/pages/workflow-*.test.mjs apps/hub/components/hub/state-usage.test.mjs apps/hub/components/hub/motion.test.mjs apps/hub/components/hub/focus-ring.test.mjs apps/hub/components/hub/palette.test.mjs scripts/no-mock-data.test.mjs apps/hub/lib/goal-client.test.mjs apps/hub/lib/goal-input-ux.test.mjs
```

## Limits and browser follow-up

Shared-environment browser preflight by the finance/capture agent failed before page load: installed Chromium with `chromiumSandbox:true` aborted because the host SUID sandbox helper is not configured (expected root ownership/mode 4755). No `--no-sandbox` retry or host modification was made. Evidence: sibling `review-r15/ui-finance-capture/browser-report.json`. This is an execution-environment failure, not an approval denial.

The HTML fixtures are render evidence, not completed visual/browser acceptance. Actual 390px/desktop overflow, focus/keyboard/touch behavior, long content, theme contrast and reduced-motion computed styles remain unverified in a browser. SSR does not run effects; calendar outcome controls faithfully remain loading in these fixtures. Font requests may fall back when opening standalone HTML directly. No real-data/network/model/DB/auth/write behavior was tested, no dependencies installed, and no external publication, push, PR, merge or deployment occurred.

For later browser checks: `TodayTimeFlow({agenda:{state,items},onNavigate})`, `DailyBrief({onNavigate})`, `Overview({onNavigate})`, `Goals()`; the latter uses Next navigation and `useGoals`. Existing local JSX loader is `scripts/register-hub-alias.mjs`. The isolated runner supplies synthetic read hooks and production rendering, and can be adapted to the already-installed Playwright runtime once Chromium's normal sandbox works.

## Full-suite follow-up: unified guidance placement

Root aggregate `ca824bc0` exposed the combined guidance-placement test labelled “Home places one unified tip outside and above the morning brief card.” Narrow reproduction yielded 6 passes and 1 failure at the Overview ordering assertion: it still required activity chart → tip → domain panels. Home/Today placement, single-tip counts, source selection, timing, accessible button, no-advice-call and style assertions all passed. This was an obsolete ordering expectation after the selected GOAL LENS hierarchy, not a calendar extraction issue or product regression.

Updated only the test's name and Overview placement checks: the existing goal summary must precede the single visible tip; the activity disclosure must follow it; chart and domain panels must remain ordered inside that disclosure. Every Home/Today count and placement assertion, no-tip-in-HomeMorningBrief/content-studio assertion, source/timing/accessibility/network/style assertion remains. Production UI is unchanged. Focused guidance + Today layout/Guru + Overview + workflow tests: **33 passed, 0 failed, 0 skipped**. `git diff --check` passed. Evidence: shared `review-r15/ui-workflow-browser/guidance-followup-tests.log`.
