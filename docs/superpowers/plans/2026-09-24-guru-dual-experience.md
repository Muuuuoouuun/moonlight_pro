# Guru Dual Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved mentor shelf and quiet contextual rail to the Hub development surface with domain-correct, user-requested questions.

**Architecture:** Keep `@com-moon/guru-guidance` as the only card catalogue. A shelf owns discovery at the existing coaching route; a shared rail owns compact entry on three permitted business surfaces. One question drawer sends only after explicit submission, routing sales to Sales Guru and personal marketing/content to a new source-labelled brand mentor question mode.

**Tech Stack:** Next.js App Router, React 18, JavaScript/TypeScript, CSS Hub tokens, Node `--test`.

---

### Task 1: Domain-safe request contract

**Files:** `apps/hub/lib/advisor-input.js`, `apps/hub/app/api/hub/sales-mentor/route.js`, `apps/hub/app/api/hub/brand-mentor/route.js`, `apps/hub/components/hub/council-client.js`, `apps/engine/app/api/ai/brand-mentor/route.ts`, `apps/engine/lib/advisor-guardrails.ts`; tests in `apps/hub/lib/advisor-routes.test.mjs`, `apps/engine/lib/advisor-guardrails.test.mjs`, and a focused Engine brand prompt test.

- [ ] Write tests that reject a marketing card at the Sales route, reject a sales card at the Brand `open-question` route, and show no context/provider call for either rejection. Run the focused files and observe the intended failures.
- [ ] Add the smallest domain check using `GURU_CARDS` and allowlisted IDs. Keep legacy Brand modes unchanged.
- [ ] Write an Engine prompt test that expects `open-question` to include the selected source and operator question while excluding required `다음 액션`, `승인 큐 후보`, and the opportunity-catch directive. Observe failure, then add the new mode and guardrail branch.
- [ ] Forward `guidanceId` from Hub Brand to Engine. `createWorkOrder` remains false by default; an `open-question` request must reject `createWorkOrder: true`.
- [ ] Run the focused Hub/Engine tests until green.

### Task 2: Question surface and routing

**Files:** `apps/hub/components/hub/guidance-question-drawer.jsx`, `.css`, `guidance-question-drawer.test.mjs`, `apps/hub/components/hub/guidance-advice-client.js`, `apps/hub/components/hub/hub-app.jsx`.

- [ ] Write tests for sales versus marketing/content endpoint selection, Legend read-only behavior, and no request on drawer open. Run and observe failures.
- [ ] Implement a single drawer with an editable question, explicit `전송`, `preview`/`error` state, source caption, and response text. Use existing `Drawer`, `Button`, `TextAreaField`, `TruthBadge` primitives; keep the question draft until response or close.
- [ ] Add one `questionCard` state owner in `HubApp` and pass `onGuidanceAsk` only to A and the three B surfaces. The card click opens the drawer; submission calls the domain-specific client helper.
- [ ] Run the focused tests.

### Task 3: A — mentor shelf

**Files:** `apps/hub/components/hub/pages/mentor-shelf.jsx`, `.css`, `.test.mjs`, `apps/hub/components/hub/hub-app.jsx`, `apps/hub/components/hub/pages/agents.jsx`, `apps/hub/components/hub/guru-guidance-card.test.mjs`.

- [ ] Write failing tests for default coaching route = shelf, Guru/Legend appearing together, three Guru domains, independent manual next offsets, session hide/restore, and existing `?agent=` chat deep links.
- [ ] Build the shelf with `selectGuidanceCard` and `guidancePeriodKey` using shared catalogue data. Clicking the sales/brand/content Guru question calls `onGuidanceAsk(card)` only; Legend has no generation CTA.
- [ ] Route the existing `dashboard/agents/chat` default to the shelf and `?agent=`/`?prompt=` to `AgentsChat`. Preserve other Agent destinations and direct links. Scope the approved large title to this page and record the design exception.
- [ ] Run focused tests and keyboard/390px browser checks.

### Task 4: B — quiet mentor rail

**Files:** `apps/hub/components/hub/context-mentor-rail.jsx`, `.css`, `.test.mjs`, `apps/hub/components/hub/pages/customers.jsx`, `pages/brands.jsx`, `pages/content.jsx`, and route/surface tests.

- [ ] Write failing tests for exact permitted placements, no rail in Studio/Home/Today, closed initial state, user-only open and next, domain-specific catalogue selection, and no API call on view.
- [ ] Implement one shared rail. Desktop has a 58px closed entry and right Drawer; ≤600px gets a 44px horizontal entry and compact bottom sheet. Use `SegmentedControl`, `Drawer`, and tokenized CSS; the drawer closes on route unmount and restores focus.
- [ ] Mount sales on the Customers list, marketing on personal Brands, and content on personal Queue. Do not mount in an existing customer detail drawer or Studio. Link to A as a secondary action.
- [ ] Run focused tests and browser checks at desktop dark/light and 390px.

### Task 5: Complete verification and handoff

- [ ] Run `npm test`; expect no failures, retaining only database-gated skips.
- [ ] Run Engine typecheck plus Hub and Engine builds. Run `git diff --check` and inspect every touched path.
- [ ] Start an isolated Hub development server, verify the real A and B routes in the in-app browser, and confirm no horizontal overflow, no console error, and no card-open network generation.
- [ ] Update `docs/README.md` and `DESIGN.md` with actual implementation status and exact visual exception. Commit only the touched files and inspect `git show --stat`.
