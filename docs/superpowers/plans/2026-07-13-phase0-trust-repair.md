# Moonlight Phase 0 Trust Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Claude 자동화 자산을 유지하면서 Content 계약, write 상태, mock/live 혼합, 사용자 identity를 고쳐 테스트·contract·typecheck·build가 모두 통과하는 신뢰 가능한 Phase 0 기준선을 만든다.

**Architecture:** native Supabase ledger와 기존 Hub/Engine 경계를 유지한다. Content variant는 DB canonical 5종만 저장하고, UI 별칭은 입구에서 canonical로 정규화한다. Mutation은 설정 전 `degraded`, 저장 실패 `failed`, 실제 성공 `saved`로 구분하며, read surface는 live-empty/error에 업무 fixture를 넣지 않는다.

**Tech Stack:** Next.js App Router, JavaScript/TypeScript, Node `node:test`, Supabase REST/RPC, PostgreSQL migrations.

---

## File Ownership

### Lane A — Content contract and atomic materialization

- Create `apps/hub/lib/content-variant-contract.js`
- Create `apps/hub/lib/content-variant-contract.test.mjs`
- Modify `apps/hub/lib/repositories/content-ledger.js`
- Modify `apps/hub/lib/sales-os/work-orders.js`
- Modify `apps/hub/lib/server-write.js` only if a reusable Supabase RPC helper is required
- Modify `scripts/check-contracts.mjs`
- Create `supabase/migrations/20260713_0014_atomic_content_draft_approval.sql`
- Modify `supabase/apply-pending.sql`
- Modify `supabase/seed.supabase_first.sql`

### Lane B — Honest write response taxonomy

- Create `apps/hub/lib/write-response.js`
- Create `apps/hub/lib/write-response.test.mjs`
- Create `apps/hub/lib/server-write.test.mjs`
- Create `apps/hub/lib/write-route-contract.test.mjs`
- Modify `apps/hub/lib/hub-write-guard.js`
- Modify `apps/hub/lib/hub-write-guard.test.mjs`
- Modify `apps/hub/lib/google-calendar.js`
- Modify `apps/hub/app/api/hub/content/route.js`
- Modify `apps/hub/app/api/projects/update/route.js`
- Modify `apps/hub/app/api/hub/inbox/route.js`
- Modify `apps/hub/app/api/integrations/outcomes/record/route.js`
- Modify `apps/hub/app/api/calendar/google/event/route.js`
- Modify `apps/hub/components/forms/project-update-form.jsx`

### Lane C — Honest read UI and identity

- Create `scripts/check-honest-ui.test.mjs`
- Modify `apps/hub/components/hub/pages/daily-brief.jsx`
- Modify `apps/hub/components/hub/pages/projects.jsx`
- Modify `apps/hub/components/hub/pages/work.jsx`
- Modify `apps/hub/components/hub/pages/followups.jsx`
- Modify `apps/hub/components/hub/pages/content.jsx`
- Modify `apps/hub/components/hub/hub-sidebar.jsx`
- Modify identity copy in Hub components found by the failing test

Agents must not edit files outside their lane and must not commit. The root agent integrates, reviews and commits after all three lanes are verified.

---

### Task 1: Canonical Content Variant Contract

**Files:** Lane A only.

- [x] **Step 1: Write a failing normalization test**

Create `apps/hub/lib/content-variant-contract.test.mjs` with assertions equivalent to:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_CONTENT_VARIANT_TYPES,
  normalizeContentVariantType,
} from "./content-variant-contract.js";

test("content variants use the five DB canonical types", () => {
  assert.deepEqual(CANONICAL_CONTENT_VARIANT_TYPES, [
    "newsletter", "blog_insight", "card_news", "x_thread", "reels_script",
  ]);
});

test("legacy UI aliases normalize toward the DB contract", () => {
  assert.equal(normalizeContentVariantType("blog"), "blog_insight");
  assert.equal(normalizeContentVariantType("social_post"), "x_thread");
  assert.equal(normalizeContentVariantType("landing_copy"), "blog_insight");
  assert.equal(normalizeContentVariantType("thread"), "x_thread");
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test apps/hub/lib/content-variant-contract.test.mjs
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the canonical module and update all writers**

The module must export the exact 5-type array and a normalizer. Unknown values fall back to `blog_insight`. Update `content-ledger.js` to store canonical types and preserve labels for canonical keys. Update Content Flywheel materialization to request `blog_insight`, never `blog`.

- [x] **Step 4: Make contract extraction use the shared canonical source**

Update `scripts/check-contracts.mjs` so repository/schema/migration parity still checks exact ordered values after the array moves to `content-variant-contract.js`.

- [x] **Step 5: Add atomic internal materialization**

Add an idempotent PostgreSQL function that validates the proposed work order, inserts a canonical content variant, updates the content item, then marks the work order approved in one transaction. Existing approved/materialized calls return the existing result rather than duplicating a variant. Update `work-orders.js` to call the RPC instead of changing status before direct REST inserts.

- [x] **Step 6: Verify GREEN**

Run:

```bash
node --test apps/hub/lib/content-variant-contract.test.mjs
npm run check:contracts
npm test
```

Expected: normalization tests pass and the previous 3 contract-derived failures disappear.

---

### Task 2: Honest Mutation Response Taxonomy

**Files:** Lane B only.

- [x] **Step 1: Write failing taxonomy tests**

`apps/hub/lib/write-response.test.mjs` must assert:

```js
classifyWritePersistence({ persisted: true })
// -> { status: "saved", httpStatus: 200, retryable: false }

classifyWritePersistence({ persisted: false, reason: "missing-config" })
// -> { status: "degraded", httpStatus: 503, retryable: true }

classifyWritePersistence({ persisted: false, reason: "supabase-503" })
// -> { status: "failed", httpStatus: 503, retryable: true }

classifyWritePersistence({ persisted: false, reason: "validation" })
// -> { status: "failed", httpStatus: 400, retryable: false }
```

- [x] **Step 2: Run focused test and verify RED**

Run:

```bash
node --test apps/hub/lib/write-response.test.mjs
```

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement the helper**

Return explicit `status`, `httpStatus`, `retryable`, `reason`, and optional `correlationId`. Do not use `preview` for a mutation whose persistence was attempted and failed.

- [x] **Step 4: Apply it to Phase 0 write routes**

For Content, Project update, Inbox, Outcome and Calendar routes:

- missing configuration/workspace on write -> `503 degraded`
- validation -> `400 failed`
- rejected/failed persistence -> `4xx/5xx failed`
- durable persistence -> `200/201 saved|accepted`
- never return `202 preview` after a failed write attempt

Preserve route-specific durable IDs and details.

- [x] **Step 5: Verify GREEN**

Run:

```bash
node --test apps/hub/lib/write-response.test.mjs
npm test
```

Expected: taxonomy unit tests pass and existing write guard/outcome tests remain green.

---

### Task 3: Honest Read States and Junhyuk Identity

**Files:** Lane C only.

- [x] **Step 1: Write a failing UI contract test**

Create `scripts/check-honest-ui.test.mjs` that reads the owned Hub files and fails while any of these remain:

- `Hyeon` or `Hyeon Park`
- Daily Brief initializing or substituting `BRIEF_SIGNALS`, `TODAY_BLOCKS`, or `METRICS`
- Projects substituting `FALLBACK_PROJECTS`/`FALLBACK_TODOS` after a live/failed read
- Calendar using `FALLBACK_CALENDAR_EVENTS` or adding disconnected events to local state

The test must also assert the Daily Brief contains `Junhyuk Mun` and disconnected Calendar copy contains an explicit connection CTA.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/check-honest-ui.test.mjs
```

Expected: FAIL on current fallback/identity strings.

- [x] **Step 3: Remove fake work from Daily Brief**

Initialize arrays empty. When API returns live-empty, render the existing `EmptyState`; when fetch fails, preserve an explicit error/preview setup state without fixture signals, blocks or metrics. Do not fabricate 09:00 task times on the client.

- [x] **Step 4: Remove fake Project and Calendar records**

Projects must show empty/setup/error state without fallback business rows. Calendar disconnected state must show the connect CTA and must not create a local event. A create attempt while disconnected should lead to the CTA/message, not mutate the grid.

- [x] **Step 5: Correct identity**

Replace user-facing demo identity with `Junhyuk Mun` and remove founder demo copy in the owned components. Do not rename real customer or historical content data.

- [x] **Step 6: Verify GREEN**

Run:

```bash
node --test scripts/check-honest-ui.test.mjs
npm test
```

Expected: honest-state contract passes and no existing test regresses.

---

### Task 4: Integration Review and Full Verification

**Files:** all Phase 0 changes after lanes finish.

- [x] **Step 1: Review lane diffs for file ownership and spec compliance**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no lane edited another lane's files, no whitespace errors.

- [x] **Step 2: Run focused tests**

```bash
node --test apps/hub/lib/content-variant-contract.test.mjs
node --test apps/hub/lib/write-response.test.mjs
node --test scripts/check-honest-ui.test.mjs
```

Expected: all pass.

- [x] **Step 3: Run full gates**

```bash
npm test
npm run check:contracts
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [x] **Step 4: Run code review and fix Critical/Important findings**

Review the complete diff against the Phase 0 sections of the canonical design and this plan. Re-run all gates after fixes.

- [x] **Step 5: Commit the verified Phase 0 slice**

```bash
git add apps scripts supabase docs/superpowers/plans/2026-07-13-phase0-trust-repair.md
git commit -m "fix: establish moonlight phase 0 trust baseline"
```
