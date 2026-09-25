# Guru Focus, Atlas, and Floating Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Focus shelf above the Atlas explorer, open source-backed card detail, replace the one-answer right drawer with a real floating chat, and connect compact Today/Overview tips.

**Architecture:** Keep scheduled selection and the reviewed catalogue in `@com-moon/guru-guidance`. The shelf owns local reading state. A separate detail component owns source presentation, while the Hub shell owns a nonmodal chat session launched from any card. The existing domain-specific mentor endpoints remain authoritative; both receive bounded, validated recent turns for follow-up questions.

**Tech Stack:** Next.js App Router, React, JSX/CSS Hub components, TypeScript Engine routes, Node `--test`, Supabase REST run ledger.

---

## Task 1: Integrate the reviewed Guru branch onto the current checkout

**Files:** existing Guru implementation and conflict files on `codex/guru-focus-chat`.

- [x] Merge `codex/guru-dual-experience` into the isolated worktree based on `09.bigmac1.3`; preserve current customer, brand, and database behavior while resolving conflicts.
- [x] Run `npm install` in the worktree because `packages/guru-guidance` changed.
- [x] Run the existing focused tests: `node --import ./scripts/register-hub-alias.mjs --test apps/hub/components/hub/pages/mentor-shelf.test.mjs apps/hub/components/hub/guidance-question-drawer.test.mjs packages/guru-guidance/index.test.mjs`.

## Task 2: Card detail and shelf composition

**Files:** `apps/hub/components/hub/pages/mentor-shelf.jsx`, `mentor-shelf.css`, `mentor-shelf.test.mjs`; new `apps/hub/components/hub/guidance-detail.jsx`, `.css`, `.test.mjs`; optional separate editorial data module.

- [x] Write a failing test that clicking the top Guru, top Legend, or lower selected mentor card opens a source-backed detail without calling an API; assert `?card=<reviewed id>` selects the same detail and an unknown ID does nothing.
- [x] Implement the Focus hierarchy above the Atlas explorer using current cards and Hub tokens. Keep 13/5/5 category counts, person/method selection, manual-only label, and independent scheduled selection.
- [x] Render the detail with `GuidanceSource`'s HTTPS link guard, verified short excerpts only, a clearly labelled Moonlight summary, claim explanation, use case, boundary, and question. Close on ESC/backdrop/button and restore focus.
- [x] Run focused shelf/detail tests and the source guard test.

## Task 3: Floating conversation with genuine follow-up context

**Files:** `apps/hub/components/hub/guidance-question-drawer.jsx/.css/.test.mjs`, `guidance-advice-client.js/.test.mjs`, `hub-app.jsx`; `apps/hub/app/api/hub/brand-mentor/route.js`, `apps/engine/app/api/ai/brand-mentor/route.ts`, their tests; possibly a small conversation-history helper.

- [x] Write failing tests: initial input is empty, opening/minimizing/reopening does not fetch, explicit send adds a user turn and one answer, a second send carries only the last three same-card/same-ref turns, and changing card or ref starts a separate session.
- [x] Build a desktop nonmodal, fixed chat window with visible header, ordered message log, source lens, sample question, fixed composer, loading/preview/error messages, close/minimize/reopen, ESC, and focus return. Use the current answer formatter for generated text. On mobile use a full-screen focus boundary, input ≥16px, and buttons ≥44px.
- [x] Extend `guidanceRequest` to carry validated bounded history. Sales keeps `/api/hub/sales-mentor`; marketing/content keeps `/api/hub/brand-mentor`. Reject Legend and cross-domain card IDs. For brand open-question, validate role/text/guidance ID at Hub and Engine, and treat history as untrusted context after current question and brand scope.
- [x] Change the shelf's `대화 시작` to open the same window with a free sales Guru question. Retain the existing `?agent=` full chat route for old deep links.
- [x] Run client, Hub route, Engine prompt, and task-action tests. Confirm no work order or approval is created by read/open/send.

## Task 4: Inline Today and Overview tips

**Files:** new `apps/hub/components/hub/guidance-inline-tip.jsx/.css/.test.mjs`; `pages/daily-brief.jsx`, `pages/overview.jsx`, relevant page tests; `hub-app.jsx` for `?card=` navigation.

- [x] Write failing tests for one Today tip after `TaskToday`, one Overview tip after the activity chart, and no Guru card in Home, Goals view, or Studio body.
- [x] Select Today's general sales card through `selectGuidanceCard({ cadence: 'daily', domain: 'sales' })`; select a weekly Legend for Overview. Use `card.text` without inferred customer/metric facts.
- [x] Make each full-width line a 44px accessible button that navigates to `dashboard/agents/chat?card=<id>`. The shelf opens that card's detail. Preserve source truth in preview/error states; never issue AI requests while displaying the tip.
- [x] Run placement and responsive tests.

## Task 5: Product QA and integration

**Files:** `DESIGN.md`, `docs/README.md`, this spec/plan as needed.

- [x] Update the old right-drawer and Today-exclusion decision entries to point to the 2026-09-25 operator decision, without claiming the app was deployed.
- [x] Run `npm test`, `npm run build`, and inspect focused routes on a local dev server in dark/light desktop and 390px. Verify card detail, deep link, domain selection, chat follow-up, minimize, ESC, and Today/Overview tip placement.
- [x] Review `git diff --check`, explicit changed-file list, and final test outputs before committing only touched files. Confirm the merge and feature diff preserve current checkout behavior.

## Verification record (2026-09-25)

- Full `npm test`: 3,247 tests, 3,234 pass, 0 fail, 13 skipped (DB-dependent). `npm run typecheck`: 4/4 tasks. `npm run build`: Hub and Engine both passed.
- Isolated dev server: Focus/Atlas, Today/Overview card deep links, dark/light themes, desktop and 390px, chat minimize/reopen, route persistence, preview draft restore, and detail focus return were inspected in the browser. At 390px, document width was 390px, chat width 390px, input 16px, and send target 44px.
- The sandbox does not configure `COM_MOON_ENGINE_URL`, so a submitted question correctly displayed `응답 연결 필요`; a generated model answer was not tested. Production deployment was not performed.
- Independent review identified three edge cases, then focused tests and browser QA confirmed the fixes: the minimized dock receives keyboard focus; selected sales-card history must match that card; and the 390px full-screen chat exposes modal semantics and wraps Tab/Shift+Tab within visible controls.
