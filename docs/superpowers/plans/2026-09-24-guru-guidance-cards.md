# Guru Guidance Cards Implementation Plan

> **For agentic workers:** Execute inline in this session. Each behavior starts with a failing test, then the smallest implementation, then focused verification.

**Goal:** Put source-backed Guru/Legend cards and request-only advice into an isolated Hub development server.

**Architecture:** A shared `@com-moon/guru-guidance` catalogue owns authored summaries and deterministic selection. Hub renders those cards inside existing Guru surfaces. Engine receives a short selected frame for user-requested advice and removes the obsolete default approval-queue instruction.

**Tech Stack:** Next.js 16, React 18, TypeScript/JavaScript, Node test runner, CSS tokens.

---

### Task 1: Catalogue and selection

**Files:** Create `packages/guru-guidance/package.json`, `index.ts`, `index.test.mjs`; modify `apps/hub/package.json`, `apps/engine/package.json`, both `next.config.mjs` transpile lists.

- [x] Write tests for deterministic Seoul daily/weekly selection, domain filtering, manual offset, source metadata, and no unverifiable statistics.
- [x] Run `node --test packages/guru-guidance/index.test.mjs` and confirm the missing module fails.
- [x] Implement curated Guru cards for sales, marketing, content and Legend cards for weekly reading. Export `listGuidanceCards`, `selectGuidanceCard`, `guidancePeriodKey`, and `guidancePromptFrame`. Use Dick Dunkel for MEDDIC, not Aaron Ross as inventor.
- [x] Re-run the test and `npm install` in this worktree.

### Task 2: Quiet Hub card

**Files:** Create `apps/hub/components/hub/guru-guidance-card.jsx`, `.css`, `.test.mjs`; modify `pages/agents.jsx`, `pages/revenue.jsx`, `pages/customers.jsx`.

- [x] Write component and surface tests: selected Guru tab shows card instead of long intro, Revenue reuses its existing panel, Customer replaces the Guru entry point, hide/show uses session storage, and clicking a card never calls `/api/hub/sales-mentor`.
- [x] Run the focused tests to see the missing component/behavior fail.
- [x] Build one component with daily/weekly and compact variants, explicit source caption, manual next, and optional `이 관점으로 묻기`. Use `--fg*`, `--surface*`, and 1px `--line*` tokens; 44px touch targets at 390px.
- [x] Run focused tests and visual QA on `localhost:3177` in light, dark, desktop, and 390px.

### Task 3: Request-only advice contract

**Files:** Modify `apps/engine/app/api/ai/sales-mentor/route.ts`, `apps/engine/lib/advisor-guardrails.ts`, `apps/engine/lib/advisor-directives.ts`, `apps/hub/components/hub/guru-client.js`, `pages/agents.jsx`; extend relevant `*.test.mjs` files.

- [x] Write failing tests asserting: default advice has no forced work-order candidate or forced next action, a selected frame is source-labelled, no card view invokes AI, and `followup-draft` keeps its explicit JSON behavior.
- [x] Run the focused tests and confirm they fail for the intended contract.
- [x] Pass only an allowlisted card ID with user-triggered advice. Resolve the frame on the Engine side. Use `관찰 → 프레임 → 질문/선택` and retain human approval for external actions. Remove misleading `project_updates.next_action` copy for advisory-only replies.
- [x] Re-run focused tests, Engine typecheck, Hub and Engine builds, and full `npm test`.
- [x] Remove only `/api/cron/followup-autopilot` from the Vercel schedule; keep the authenticated manual endpoint and assert the schedule is absent.

### Task 4: Development handoff

- [x] Start the isolated Hub on port 3177 using its own `.next` directory, verify it responds, and open the card surface for operator use.
- [x] Check `git diff --check`, inspect changed files, commit only touched paths, verify `git show --stat`, and report the exact URL, test results, and operational limits.

## 2026-09-24 local verification

- `npm test`: 2,598 tests; 2,587 pass, 0 fail, 11 skip (database-gated).
- Hub and Engine production builds: pass. Engine TypeScript typecheck: pass.
- Browser: daily Guru, weekly Legend, domain switch, manual browse, session hide/restore, card-to-question navigation, light/dark, and 390px width checked on the isolated Hub at `http://127.0.0.1:3177`.
- This worktree intentionally has no production Supabase or Gemini credentials. The local Hub shows honest preview data; live generation and customer-ledger behavior require a separate development data connection before operational rollout.
