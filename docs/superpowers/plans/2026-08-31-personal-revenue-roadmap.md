# Personal Revenue Roadmap Implementation Plan

> **For Codex:** execute this plan in the current feature branch. Every production behavior starts with a failing test, and completion requires targeted tests, the Hub test suite, a production build, and visual design QA against the selected mock.

**Goal:** Replace the Personal scope of Revenue Overview with the approved 30-day cashflow roadmap: summary first, an interactive revenue timeline, a deal drawer that opens only after selecting a deal, and a short list of actions that can change near-term revenue.

**Architecture:** Keep the existing Supabase revenue ledger and `/dashboard/revenue/overview?scope=personal` route. A new pure read-model module filters and classifies the already scoped deal records into a 30-day model. A dedicated React view renders that model with Moonlight primitives and tokens. `RevenueOverview` selects the new view only for `scope=personal`; All and ClassIn surfaces remain unchanged. Deal edits continue through the existing Deals deep link.

**Tech Stack:** Next.js App Router 16, React 18, JavaScript modules, Node test runner, existing Moonstone Hub primitives and CSS tokens.

**Visual truth:** `/Users/bigmac_moon/.codex/generated_images/01a0559e-6f60-7a11-bcc2-1f2920b1dc1b/exec-8f60be29-c502-415d-b0b2-8d207d6f9f64.png`

---

## Product contract

- The top region is the default summary: 30-day expected inflow, confirmed, payment waiting, high likelihood, and deals without an explicit next action.
- The timeline covers today through day 30 and uses actual `expected_close_at` values only. Unscheduled or out-of-window deals are not assigned invented dates.
- Every plotted deal is a semantic button with a visible focus state and a minimum 44px interaction target.
- The right detail drawer is absent by default and opens only after a deal click. Escape and its close button dismiss it and restore focus to the selected deal.
- Lifecycle and certainty use labels, marker geometry, and Moonstone luminance. Routine deal states do not use semantic warning/success colors.
- When the live ledger has no scheduled personal deals, show an honest empty state; do not mix preview rows into live data.
- On narrow screens, the detail drawer becomes an in-flow panel and the timeline remains operable without page-level horizontal overflow.

## Task 1: Build the pure 30-day revenue read model

**Files:**

- Create: `apps/hub/lib/personal-revenue-roadmap.test.mjs`
- Create: `apps/hub/lib/personal-revenue-roadmap.js`

1. Add failing tests for inclusive 30-day filtering, lost/out-of-window exclusion, certainty classification, amount aggregation, missing-next-action count, deterministic timeline position, and stage-based recommended actions.
2. Run `node --test apps/hub/lib/personal-revenue-roadmap.test.mjs` and confirm RED because the module does not exist.
3. Implement the pure model with an injected reference date and Korean locale-safe display fields. Keep numeric values separate from formatted labels.
4. Re-run the test and confirm GREEN.

## Task 2: Build the scoped Personal Revenue view

**Files:**

- Create: `apps/hub/components/hub/pages/personal-revenue.jsx`
- Create: `apps/hub/components/hub/pages/personal-revenue-source.test.mjs`
- Modify: `apps/hub/components/hub/pages/revenue.jsx`
- Modify: `apps/hub/components/hub/hub-tokens.css`

1. Add failing source-contract tests proving: `scope=personal` chooses the dedicated view; no deal is selected initially; timeline items are buttons; selection controls the drawer; Escape/close dismisses it; `aria-expanded`, `aria-controls`, and dialog labelling are present; the Deals deep link preserves personal scope.
2. Run the targeted source-contract test and confirm RED.
3. Implement `PersonalRevenueRoadmap` with memoized derived data, top summary, a 30-day axis, accessible deal markers, conditional detail drawer, honest loading/empty states, and the near-term action list.
4. Add only class-based responsive CSS, using existing semantic tokens, 1px borders, 4/8px spacing rhythm, reduced-motion handling, and a 44px interaction floor.
5. Make `RevenueOverview` read the query scope and return the dedicated view only for Personal.
6. Re-run the read-model and source-contract tests.

## Task 3: Preserve next-action truth from the ledger

**Files:**

- Modify: `apps/hub/lib/repositories/revenue-ledger.js`
- Create: `apps/hub/lib/repositories/revenue-deal-view-source.test.mjs`

1. Add a failing source-contract test that the deal projection preserves `meta.next_action` / row `next_action` as `nextAction` rather than forcing the UI to invent a confirmed action.
2. Run the test and confirm RED.
3. Extend `mapDeal` with a nullable `nextAction`. The Personal view labels stage-derived fallbacks as recommendations, never confirmed ledger facts.
4. Re-run the test and the revenue repository/UI tests.

## Task 4: Verify behavior, build, and visual fidelity

**Files:**

- Create: `design-qa.md`
- Create during QA: implementation screenshots under a temporary or documented QA path

1. Run the targeted tests, then all Hub `*.test.mjs` tests.
2. Run the Hub production build.
3. Start the Hub locally and inspect `/dashboard/revenue/overview?scope=personal` at desktop and narrow breakpoints. Test keyboard focus, selection, Escape, drawer close, Deals deep link, and console errors.
4. Capture the implementation at the same state and viewport as the selected mock. Put the source and implementation together in one comparison input, fix every P0/P1/P2 mismatch, and repeat.
5. Save `design-qa.md` with source path, implementation screenshot path, viewport and density, interactions tested, comparison history, fidelity-surface findings, console check, and an exact `final result: passed` or `final result: blocked`.
6. Re-run affected tests and the production build after the last visual fix. Do not claim completion without fresh verification evidence.
