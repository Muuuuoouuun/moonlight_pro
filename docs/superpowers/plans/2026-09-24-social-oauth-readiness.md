# Social OAuth Connection Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing Threads and Instagram OAuth callbacks reject invalid state and report only durable account connections as successful.

**Architecture:** Keep the current single-account OAuth routes and provider-specific clients. Validate the signed state before token exchange, and require a persisted connection ID before reporting success. This prepares the existing connection flow without expanding the brand-to-account schema or attempting a post.

**Tech Stack:** Next.js App Router, Node.js, Supabase REST, `node --test`.

---

### Task 1: Validate callback state

**Files:** `apps/hub/lib/meta-threads.js`, `apps/hub/lib/instagram-api.js`, `apps/hub/lib/social-oauth-state.test.mjs`

- [x] Write tests showing missing, malformed, future, and expired state are invalid; a newly signed state stays valid.
- [x] Run `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/social-oauth-state.test.mjs` and observe the missing/expired cases fail.
- [x] Require a signed payload with a valid issue time within ten minutes in both decoders.
- [x] Rerun the focused test.

### Task 2: Verify persistence before success

**Files:** `apps/hub/app/api/social/meta/threads/callback/route.js`, `apps/hub/app/api/social/instagram/callback/route.js`, `apps/hub/lib/social-oauth-persistence.js`, `apps/hub/lib/social-oauth-persistence.test.mjs`

- [x] Write a test showing a missing connection ID or failed Supabase write is rejected.
- [x] Run the focused test and observe failure.
- [x] Add one shared predicate for the save result and make both callbacks fail closed before writing success sync records.
- [x] Rerun the focused test.

### Task 3: Verify and integrate

- [x] Run focused OAuth tests, then `npm test` and confirm no regressions.
- [ ] Inspect the diff for unrelated files and secrets; commit only the touched paths.
- [ ] Merge into the shared checkout if its existing edits are unaffected, and remove the dedicated worktree.
