# Hub speed and stability implementation plan

> **For agentic workers:** Use `superpowers:dispatching-parallel-agents` for the independent confirmed defects below, and `superpowers:test-driven-development` for cache behavior fixes. Review each change against its contract before integrating.

**Goal:** Reduce repeated work in frequently used Hub reads and make interrupted or failed reads recover predictably.

**Architecture:** Preserve the existing REST repositories and read envelopes. Reuse fixed date formatters within repository modules. Give content and revenue reads bounded, generation-aware lifecycles; revenue consumers share one request and one authoritative browser snapshot.

**Tech stack:** Next.js 16.2, React 18, plain ESM, Node's test runner.

## Baseline and boundaries

- Base commit: `6ed72d09`; implementation branch: `codex/speed-stability-1002`.
- `npm test`: 3,473 tests, 3,460 passed, zero failures, 13 database-dependent skips; 62.6 seconds.
- Main checkout contains unrelated edits; implementation and review use isolated worktrees.
- `mapProjectRows` on 300 generated rows: 37.48 ms cold, then 25.22 / 25.43 / 24.96 ms.
- Content error envelope `{ source: 'error' }` currently becomes `preview`.
- A synchronously failed content transport leaves a settled pending promise: two refreshes make only one attempt.
- Content requests have no abort signal, and invalidation leaves superseded requests running.
- Revenue's page hook owns transport independently of the shared snapshot. Palette has another transport and prefers its own 60-second cache over fresh shared data.
- No schema changes, production writes, deployment, product rule changes, UI additions, or new dependencies.

## Task 1: Repository formatting cost

**Files:** `apps/hub/lib/repositories/{project-ledger-context,operating-ledger,revenue-ledger,attention-ledger,content-ledger}.js`.

- [ ] Capture deterministic before/after output and timing for row mapping with generated inputs outside production source.
- [ ] Replace per-row construction with module-scoped fixed formatters; keep input guards, locale, timezone and formatting options identical.

```js
const shortDateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
});
// Existing invalid/missing checks stay before shortDateFormat.format(date).
```

- [ ] Verify existing repository tests, invalid dates and UTC/KST boundary behavior. Timing is evidence, never a flaky CI threshold.
- [ ] Commit only the touched repository files and any necessary behavioral tests; review and integrate.

## Task 2: Content read lifecycle

**Files:** `apps/hub/lib/content-ledger-cache.js`, `apps/hub/lib/content-ledger-cache.test.mjs`, existing `apps/hub/lib/content-workflow.test.mjs`.

- [ ] Add regression tests before changing implementation: source/status errors, invalid envelopes, synchronous failure followed by retry, response body timeout, invalidation cancellation, late old responses, and stale live data retention with a partial label.

```js
let calls = 0;
const cache = createContentLedgerCache(() => { calls++; throw Error('offline'); });
await cache.refresh();
await cache.refresh();
assert.equal(calls, 2);
assert.equal(cache.getSnapshot().syncState, 'error');
```

- [ ] Register the pending read before executing transport or publishing to listeners. Apply a 15-second deadline covering response body consumption; cancel the prior generation on invalidation and always release timers/pending state.
- [ ] Accept only explicit valid live/partial/preview envelopes. A failure preserves only recent known live data, labelled `partial`; cold/expired failures become `error`.
- [ ] Run `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/content-ledger-cache.test.mjs apps/hub/lib/content-workflow.test.mjs`.
- [ ] Review the behavior and commit the explicit files.

## Task 3: Revenue request sharing and freshness

**Files:** `apps/hub/components/hub/revenue-shared-cache.js`, `apps/hub/components/hub/pages/revenue.jsx`, `apps/hub/components/hub/command-palette-records.js`, their cache/palette/hook tests.

- [ ] Reproduce simultaneous page/palette requests and old palette data winning over a newer shared snapshot.
- [ ] Centralize revenue read ownership in a small shared module. Keep the five-minute serving window, background revalidation and one transient retry; share in-flight transport and bound requests. Invalidation must prevent pre-save responses from publishing after a fresh read.
- [ ] Subscribe revenue page consumers to the shared state; keep cold reads `loading`, explicit disconnected reads `preview`, partial reads `partial` and failed reads `error` (or `partial` when preserving recent live data).
- [ ] Let palette prefer current shared revenue results and share pending revenue transport. Retain independent task loading so a slow source never blocks the other.
- [ ] Verify races with deferred promises rather than timing guesses, including failure → retry, invalidation during retry, stale responses and unmount/Strict Mode.
- [ ] Run focused cache, palette, revenue hook, customer and deals regression tests; review and commit.

## Integration and evidence

- [ ] Independently review source-truth semantics and lifecycle races, then code quality.
- [ ] Run the full `npm test` and `npm run build`; distinguish existing warnings and database-dependent skips.
- [ ] Smoke-check the affected rendered routes using a local preview instance, without borrowing production credentials or writing operational records.
- [ ] Record measured results, exact validation commands and remaining limitations below.

## Results

Implementation and validation are in progress.
