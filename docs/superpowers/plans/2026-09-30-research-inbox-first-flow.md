# Research Inbox First Flow Implementation Plan

> **For agentic workers:** Execute this plan task by task with test-first changes and review each saved boundary.

**Goal:** Make operator-authored, source-backed research briefs durable, reviewable, and promotable to the existing content queue or a neutral Studio draft.

**Status (2026-09-30):** Code and local PostgreSQL/UI verification completed. Operational database and deployment remain unapplied. The worktree has no Supabase credentials; a read-only `db:check` with the existing main checkout's migration environment reached the Seoul project and confirmed that only the new research migration is missing. No operational schema was changed.

**Architecture:** A service-role-only Supabase RPC owns brief intake, review decisions, receipts, and atomic content promotion. Hub repository functions validate inputs and consume that RPC; Hub routes retain the existing middleware and write guard. The content workspace gains one Research Inbox tab with list/detail and an explicit manual intake drawer. This first flow deliberately does not schedule paid collection or treat a Brave snippet as verified evidence.

**Tech Stack:** Next.js App Router, JavaScript/React, Supabase PostgREST and PL/pgSQL, Node test runner.

---

### Task 1: Durable ledger and neutral variant

**Files:** `supabase/migrations/20260930_0053_research_inbox.sql`, `scripts/database-readiness.mjs`, `apps/hub/lib/research-inbox-contract.test.mjs`.

- [x] Add contract tests for bounded evidence, URL validation, stable event keys and request IDs; run the test and observe the expected failure.
- [x] Add workspace-scoped brief roots, immutable revisions, append-only decisions, promotion links and request receipts. Add a service-only command RPC that serializes by brief, checks revision, state version and brand, and atomically creates exactly one content parent.
- [x] Add `base_text`/`unassigned` to the variant constraint and Studio channel validator. Register the new tables and RPC body in database readiness.
- [x] Run the contract and SQL tests; verify duplicate and stale requests return explicit results.

### Task 2: Hub read/write boundary

**Files:** `apps/hub/lib/repositories/research-inbox-ledger.js`, `apps/hub/lib/research-inbox-command.js`, `apps/hub/app/api/hub/research/briefs/route.js`, and adjacent `*.test.mjs`.

- [x] Add failing tests for unconfigured storage, read errors, workspace filtering, invalid payloads, write guard, request receipts and promotion results.
- [x] Implement bounded list/detail read envelopes and server-side command validation. Keep HTTP 200 with `{status:'error'}` for Hub reads.
- [x] Run the focused repository and route tests.

### Task 3: Review surface and Studio compatibility

**Files:** `apps/hub/components/hub/pages/research-inbox.jsx`, `research-inbox.css`, `apps/hub/components/hub/hub-app.jsx`, `hub-nav.js`, `hub-data.js`, `apps/hub/lib/content-workflow-client.js`, `apps/hub/components/hub/pages/content-studio-editors.jsx`, and adjacent tests.

- [x] Add failing route/navigation and neutral-draft tests.
- [x] Render real list/detail state, read errors, manual intake, reversible discard/defer and the two promotion destinations. Reuse Hub primitives and keep actions explicit.
- [x] Allow the neutral draft to be edited as base text in Studio while keeping its channel unassigned; require a separate channel variant for publishing.
- [x] Run focused UI and routing tests, then build and inspect the 390px layout.

### Task 4: Verify and document the boundary

**Files:** `docs/README.md`, `docs/superpowers/specs/2026-09-23-research-inbox-content-promotion-design.md` (status note only), `docs/superpowers/plans/2026-09-30-research-inbox-first-flow.md`.

- [x] Run `npm test`, `npm run typecheck`, `npm run build`, and read-only `db:check` against the configured operational project without applying the migration. The last command reports exactly the new research feature as missing.
- [x] Check error/empty distinction, replay, stale revision/state, two destinations and responsive interaction; record the operational verification gap.
- [x] Update the documentation status precisely: manual durable flow implemented; automatic collection/AI selection/cadence remains separate and disabled until real source and cost gates are met.
