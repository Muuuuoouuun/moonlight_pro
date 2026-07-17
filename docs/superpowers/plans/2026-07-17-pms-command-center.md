# Moonlight PMS Command Center Implementation Plan

> **For Codex:** execute this plan in order with `superpowers:subagent-driven-development`. Every production behavior starts with a failing test, receives a fresh specification review, then a fresh code-quality review.

**Goal:** Turn Projects, Timeline, Roadmap, and Rhythm into one trustworthy PMS command center with durable project creation/editing, evidence-based progress, useful detail fields, responsive interaction, and stable project deep links.

**Architecture:** Supabase remains the operational ledger. Hub repositories expose raw project source fields separately from display fallbacks; Hub pages compose the operator UI and guarded BFF calls; Engine validates and persists commands. A project UUID is the shared navigation key across Projects, Timeline, Roadmap, and Rhythm. Progress is derived first from observable task completion, otherwise explicitly labelled as reported or absent. No 70/30 or AI progress formula is introduced because that product rule is not confirmed.

**Tech Stack:** Next.js App Router 16, React 18, JavaScript/TypeScript, Node test runner, Supabase REST, existing Moonstone Hub primitives and CSS tokens.

**Concept references:**

- Desktop: `docs/design-assets/moonlight-pms-desktop-concept-20260717.png`
- Mobile: `docs/design-assets/moonlight-pms-mobile-concept-20260717.png`

---

## Product contract

- The quick-create drawer starts with an empty title. Its primary fields are project name, goal/detail, and next action; status, priority, due date, and container live in collapsed advanced settings.
- Global entry does not silently choose a container. Container-context entry may seed that container. A missing container remains an honest, recoverable state.
- Manual progress is not requested during create. A project with tasks uses `done / total`; a project without observable evidence shows `진척 데이터 없음`; a legacy project/update value is labelled `보고된 진척`.
- Source fields and display fallbacks remain separate. Editing never materializes a latest-update fallback into `projects.summary`, `projects.progress`, or `projects.next_action`.
- Successful create reloads the ledger and opens the exact durable project detail via `?project=<id>`. Failure, preview, and conflict preserve draft fields and client-generated ID.
- The canonical routes are:
  - Projects: `/dashboard/work/projects?project=<id>`
  - Timeline: `/dashboard/work/projects?view=timeline&project=<id>`
  - Roadmap: `/dashboard/work/roadmap?project=<id>`
  - Rhythm: `/dashboard/work/rhythm?project=<id>`
- Timeline uses `started_at` only when it exists. A due date without a start is a due marker, never a fabricated period beginning at `created_at`.
- Roadmap reads the project/milestone ledger; Rhythm preserves `project_id` and writes check-ins durably or stays explicitly read-only.

## 100-point acceptance rubric

| Area | Weight | Baseline | Acceptance target | Evidence |
|---|---:|---:|---:|---|
| Information architecture | 15 | 11 | 13 | One project identity across the four surfaces; direct round trips preserve query context |
| Core workflows | 20 | 11 | 17 | Approved create flow, exact detail open, safe edit, task progress, recovery states |
| Visual hierarchy and density | 15 | 10 | 13 | Next action/risk/due/progress hierarchy, Moonstone tokens, no unapproved bright tones |
| Responsive behavior | 12 | 6 | 10 | 1440 desktop and 390 mobile; usable detail sheet and zero-state recovery |
| Accessibility | 12 | 5 | 10 | Inert closed nav, keyboard rows, labelled controls, accessible progress and 44px touch targets |
| Feedback and recovery | 12 | 7 | 10 | Distinct live/preview/error/conflict states, retry, aria-live feedback, draft preservation |
| Data truth and integrations | 14 | 8 | 13 | Raw/display separation, idempotent create, honest progress, durable cross-tab projections |
| **Total** | **100** | **58** | **86 minimum** | Final rubric is scored only from tests plus browser evidence |

## Task 1: Make the project read model lossless and progress honest

**Files:**

- Create: `apps/hub/lib/repositories/operating-ledger.test.mjs`
- Modify: `apps/hub/lib/repositories/operating-ledger.js`
- Modify: `apps/hub/lib/pms-ui.js`
- Modify: `apps/hub/lib/pms-ui.test.mjs`

1. Add a failing repository projection test with a blocked, high-priority project whose raw summary/next action/progress differ from its latest update. Assert raw `brandId`, `statusKey`, `priority`, `projectSummary`, `projectProgress`, `projectNextAction`, `startedAt`, `dueAt`, and `updatedAt` survive unchanged.
2. Add failing pure tests for task-backed progress, reported fallback, and no-evidence `null`. Assert the result includes `value`, `source`, `label`, `done`, and `total`.
3. Run `node --test apps/hub/lib/repositories/operating-ledger.test.mjs apps/hub/lib/pms-ui.test.mjs` and observe the expected failures before implementation.
4. Split project source fields from `displaySummary`, `displayNextAction`, and `latestUpdate`. Derive checklist progress from tasks first; keep reported progress explicit; return `null` for no evidence.
5. Remove the obsolete `새 프로젝트` and create-time `progress: 0` contract from `buildProjectDraft`. Add `clientId`, empty title, `draft`, and `medium` defaults.
6. Extend task loading or aggregation so project counts are not silently based on the current global 160-row cap. If a complete aggregate cannot be proven, surface `progress.partial=true` and do not show a definitive percentage.
7. Re-run the targeted tests and the existing PMS tests.

## Task 2: Enforce safe Engine create and update semantics

**Files:**

- Modify: `apps/engine/lib/pms-command.test.mjs`
- Modify: `apps/engine/lib/pms-command-service.test.mjs`
- Modify: `apps/engine/lib/pms-command.ts`
- Modify: `apps/engine/lib/pms-command-service.ts`
- Modify: `apps/engine/lib/supabase-rest.ts`
- Modify: `apps/engine/app/api/pms/command/route.ts`
- Modify: `apps/hub/lib/pms-engine-client.test.mjs`
- Modify: `apps/hub/lib/pms-engine-client.js`

1. Write failing tests proving same client ID + canonical same payload returns `duplicate`, while the same ID + different payload returns `conflict`.
2. Write failing tests proving project update accepts `expectedUpdatedAt`, includes it in the workspace-scoped filter, returns the persisted representation, and reports stale/not-found when zero rows are updated.
3. Write failing tests for `brandId` and task `projectId` relationship checks against the same workspace.
4. Run the targeted Engine and Hub client tests and record the expected RED state.
5. Canonicalize comparable create fields and distinguish exact retry from ID reuse. Do not compare server timestamps or owner metadata that the client cannot reproduce.
6. Make Supabase PATCH request `return=representation` and return affected rows. Treat zero rows as conflict/not-found rather than saved.
7. Add same-workspace relationship validation before persistence. Return HTTP 409 for conflict and keep invalid input at 400.
8. Preserve the Engine response taxonomy through the Hub BFF/client without flattening conflict into a generic error.
9. Re-run targeted tests, `npm run typecheck`, and the PMS route tests.

## Task 3: Build the approved quick-create drawer and safe detail editing

**Files:**

- Create: `apps/hub/components/hub/pages/project-create-drawer.jsx`
- Create: `apps/hub/components/hub/pages/project-create-drawer.test.mjs`
- Create: `apps/hub/components/hub/pages/project-detail-panel.jsx`
- Modify: `apps/hub/components/hub/pages/projects.jsx`
- Modify: `apps/hub/components/hub/hub-primitives.jsx`
- Modify: `apps/hub/lib/pms-ui.js`
- Modify: `apps/hub/lib/pms-ui.test.mjs`

1. Write failing helper/source-contract tests for empty title, stable `clientId`, context-only container seeding, required title validation, collapsed advanced settings, no manual progress input, and textarea goal/detail.
2. Write failing tests for `buildProjectPatch(source, draft)` so unchanged fields are omitted and display fallbacks are never written.
3. Run the targeted tests and observe RED.
4. Compose a dedicated `ProjectCreateDrawer` from the canonical `Drawer`, not the generic `EditDrawer`. Add one active Cmd/Ctrl+Enter handler, `aria-live` save feedback, conflict detail, and draft preservation.
5. On successful create, reload, set `?project=<durable-id>`, keep `view=list`, and open the created detail. Do not close on preview, error, or conflict.
6. Build the detail editor from raw source fields. Use a multiline goal/detail field and next action field; send a dirty patch with `expectedUpdatedAt`.
7. Make the no-container mobile state recoverable with a visible container-create path or an explicit location selector.
8. Ensure every drawer restores focus, handles Escape, traps focus, and has one save listener only while mounted.
9. Re-run targeted tests and all existing PMS tests.

## Task 4: Turn Projects into the portfolio command center

**Files:**

- Create: `apps/hub/components/hub/pages/project-pms-components.jsx`
- Create: `apps/hub/components/hub/pages/project-pms-components.test.mjs`
- Modify: `apps/hub/components/hub/pages/projects.jsx`
- Modify: `apps/hub/components/hub/hub-tokens.css`
- Modify: `apps/hub/app/globals.css`
- Modify: `apps/hub/lib/hub-responsive-css.test.mjs`

1. Write failing tests for accessible progress metadata, canonical planning links, selected-project query behavior, keyboard-open rows, labelled checkboxes, and mobile 44px controls.
2. Run targeted tests and observe RED.
3. Add compact portfolio summary cells for active, blocked/overdue, due soon, and unmeasured projects. Every metric must derive from ledger data and expose an empty state rather than a fake zero.
4. Reorder list hierarchy to project/title, next action, due/risk, and evidence-labelled progress. Keep status and priority available but visually secondary.
5. Add `ProjectProgressGauge` with `role=progressbar` only when determinate; include value text, task numerator/denominator, and source label. Render `진척 데이터 없음` without a filled bar when indeterminate.
6. Add `ProjectPlanningLinks` for detail, Timeline, Roadmap, and Rhythm using the same project ID. Query updates may change only keys owned by Projects (`view`, `project`, `task`, `new`).
7. Make list rows and task controls keyboard operable. Replace unnamed raw checkboxes with the canonical labelled `Checkbox`. Add a non-drag status menu to the board.
8. On mobile, render the selected detail as a full-width sheet/drawer instead of a compressed third grid column. Keep primary segments and actions at least 44px tall.
9. Distinguish API error from preview, add retry, and never describe a failed read as live.
10. Re-run targeted, responsive, and PMS tests.

## Task 5: Make Timeline and Roadmap use the project ledger

**Files:**

- Modify: `apps/hub/lib/pms-ui.js`
- Modify: `apps/hub/lib/pms-ui.test.mjs`
- Create: `apps/hub/lib/repositories/work-ledger.test.mjs`
- Modify: `apps/hub/lib/repositories/work-ledger.js`
- Modify: `apps/hub/components/hub/pages/projects.jsx`
- Modify: `apps/hub/components/hub/pages/work.jsx`

1. Write failing Timeline tests for started+due bars, due-only markers, overdue, undated, and selected project deep links. Assert `createdAt` is not accepted as a planned start.
2. Write failing Roadmap projection tests using the same project/milestone IDs, including live-empty and read-error states.
3. Run targeted tests and observe RED.
4. Change Timeline to a deadline axis: a real `startedAt` may render a range; due-only projects render points. Clicking opens project detail by query rather than jumping straight to edit.
5. Add project and milestone projections to the work ledger without introducing a second roadmap table. Return data source/error/partial metadata.
6. Replace Roadmap's hard-coded `items=[]` with the ledger projection. Preserve `?project=` and provide “프로젝트로 돌아가기”.
7. Keep the four-month overview responsive with horizontal scrolling and accessible row links.
8. Re-run Timeline, work-ledger, PMS, and responsive tests.

## Task 6: Connect Rhythm durably without inventing a new model

**Files:**

- Modify: `apps/hub/lib/repositories/work-ledger.test.mjs`
- Modify: `apps/hub/lib/repositories/work-ledger.js`
- Create: `apps/hub/lib/rhythm-ui.js`
- Create: `apps/hub/lib/rhythm-ui.test.mjs`
- Modify: `apps/hub/components/hub/pages/work.jsx`
- Modify: `apps/hub/app/api/routine/check/route.js`

1. Write failing tests showing ritual aggregation keys by `(projectId|null, ritualKey)` and does not merge two projects with the same ritual name.
2. Write failing tests for project query filtering, durable check-in payload, saved/duplicate/preview/error feedback, and local-state rollback on failure.
3. Run targeted tests and observe RED.
4. Preserve `routine_checks.project_id` in the work ledger and expose a canonical Projects deep link for project-bound rituals.
5. Replace local-only Check in with the guarded `/api/routine/check` write, then refetch the ledger. Keep preview/error visibly unsaved and do not mutate the weekly bitmap as if durable.
6. If the route cannot safely persist the project relationship under its existing guard, disable the action and label the page read-only rather than pretending success.
7. Re-run work-ledger, rhythm, Hub write-guard, and route tests.

## Task 7: Close mobile navigation and accessibility gaps

**Files:**

- Modify: `apps/hub/components/hub/hub-app.jsx`
- Modify: `apps/hub/components/hub/hub-sidebar.jsx`
- Modify: `apps/hub/components/hub/hub-tokens.css`
- Modify: `apps/hub/lib/hub-responsive-css.test.mjs`
- Modify: `apps/hub/components/hub/hub-nav.test.mjs`

1. Write failing source/runtime-contract tests for `aria-hidden`, `inert`, focus restoration, and off-screen navigation exclusion while the mobile sidebar is closed.
2. Run the navigation and responsive tests and observe RED.
3. Apply `inert` and `aria-hidden` to the closed mobile sidebar without hiding the desktop sidebar. Restore focus to the menu opener after close.
4. Ensure the overlay and Escape close navigation, and no hidden link appears in the Tab order.
5. Re-run navigation, responsive, and full Hub tests.

## Task 8: Browser QA, fidelity ledger, and 86-point gate

**Files:**

- Create: `docs/superpowers/reports/2026-07-17-pms-command-center-qa.md`
- Modify: this plan only to append final measured results if scope changes materially

1. Run `npm test`, `npm run check:contracts`, `npm run typecheck`, and `npm run build` from the isolated worktree.
2. Start Hub and Engine with bounded local ports. Exercise create, reload, open exact detail, edit, duplicate retry, conflict, task completion, Timeline, Roadmap, and Rhythm.
3. Capture 1440x1000 and 390x844 screenshots for populated, empty, loading, error, and drawer states.
4. In one final visual QA pass, inspect the desktop concept, mobile concept, desktop browser screenshot, and mobile browser screenshot with `view_image`.
5. Record a five-point fidelity ledger: information hierarchy, density, drawer/detail behavior, progress treatment, and responsive transformation. Explain every intentional deviation.
6. Test keyboard order, Escape, focus restoration, Cmd/Ctrl+Enter, row activation, checkbox naming, progress announcements, and closed mobile navigation.
7. Score the 100-point rubric from observed evidence. If below 86, identify the lowest-scoring area, add a failing regression test, implement the smallest improvement, and repeat review/QA.
8. Request a final independent code review, resolve all high/medium findings, rerun the full gate, and only then mark the goal complete.

## Explicit non-goals for this slice

- No unconfirmed 70/30 AI/manual progress formula.
- No automatic “important project” threshold.
- No CRM deal/customer auto-linking.
- No custom workflow builder, dependency graph, or new milestone weighting model.
- No new roadmap source of truth separate from projects/milestones.
- No personal detailed memo replication into ClassIn.
