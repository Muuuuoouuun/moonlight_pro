# Hub speed and stability implementation plan

> **For agentic workers:** Use `superpowers:dispatching-parallel-agents` for the independent confirmed defects below, and `superpowers:test-driven-development` for cache behavior fixes. Review each change against its contract before integrating.

**Goal:** Reduce repeated work in frequently used Hub reads and make interrupted or failed reads recover predictably.

**Architecture:** Preserve the existing REST repositories and read envelopes. Reuse fixed date formatters within repository modules. Give content and revenue reads bounded, generation-aware lifecycles; revenue consumers share one request and one authoritative browser snapshot.

**Tech stack:** Installed Next.js 16.3.5 (package range `^16.2.4`), React 18, plain ESM, Node 24.18.0 test runner.

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

- [x] Capture deterministic before/after output and timing for row mapping with generated inputs outside production source.
- [x] Replace per-row construction with module-scoped fixed formatters; keep input guards, locale, timezone and formatting options identical.

```js
const shortDateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
});
// Existing invalid/missing checks stay before shortDateFormat.format(date).
```

- [x] Verify existing repository tests, invalid dates and UTC/KST boundary behavior. Timing is evidence, never a flaky CI threshold.
- [x] Commit only the touched repository files and any necessary behavioral tests; review and integrate.

## Task 2: Content read lifecycle

**Files:** `apps/hub/lib/content-ledger-cache.js`, `apps/hub/lib/content-ledger-cache.test.mjs`, existing `apps/hub/lib/content-workflow.test.mjs`, `apps/hub/lib/content-loading-hook.test.mjs`, `apps/hub/components/hub/use-content-ledger.js`, `apps/hub/components/hub/pages/content.jsx`.

- [x] Add regression tests before changing implementation: source/status errors, invalid envelopes, synchronous failure followed by retry, response body timeout, invalidation cancellation, late old responses, and stale live data retention with a partial label.

```js
let calls = 0;
const cache = createContentLedgerCache(() => { calls++; throw Error('offline'); });
await cache.refresh();
await cache.refresh();
assert.equal(calls, 2);
assert.equal(cache.getSnapshot().syncState, 'error');
```

- [x] Register the pending read before executing transport or publishing to listeners. Apply a 15-second deadline covering response body consumption; cancel the prior generation on invalidation and always release timers/pending state.
- [x] Accept only explicit valid live/partial/preview envelopes. A failure preserves only recent known live data, labelled `partial`; cold/expired failures become `error`.
- [x] Remove the second content-page cache discovered during review. Queue, Campaigns and Brand Log subscribe to one full ledger; Studio retains its separate lightweight brand catalog. Keep `tagTrends` in the shared snapshot.
- [x] Keep `getSnapshot()` independent of elapsed time. Expiry moves to loading only when a real refresh starts; a mounted screen cannot become stuck in loading after five minutes.
- [x] Run `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/content-ledger-cache.test.mjs apps/hub/lib/content-workflow.test.mjs apps/hub/lib/content-loading-hook.test.mjs` (20 passed).
- [x] Review the behavior and commit the explicit files.

## Task 3: Revenue request sharing and freshness

**Files:** `apps/hub/components/hub/revenue-shared-cache.js`, `apps/hub/components/hub/pages/revenue.jsx`, `apps/hub/components/hub/command-palette-records.js`, their cache/palette/hook tests.

- [x] Reproduce simultaneous page/palette requests and old palette data winning over a newer shared snapshot.
- [x] Centralize revenue read ownership in a small shared module. Keep the five-minute serving window, background revalidation and one transient retry; share in-flight transport and bound requests. Invalidation must prevent pre-save responses from publishing after a fresh read.
- [x] Subscribe revenue page consumers to the shared state; keep cold reads `loading`, explicit disconnected reads `preview`, partial reads `partial` and failed reads `error` (or `partial` when preserving recent live data).
- [x] Let palette prefer current shared revenue results and share pending revenue transport. Retain independent task loading so a slow source never blocks the other.
- [x] Verify races with deferred promises rather than timing guesses, including failure → retry, invalidation during retry, stale responses and unmount/remount. First renders with expired or failed snapshots stay loading so customer deep links wait for the new read; mounted consumers keep a stable getter.
- [x] Run focused cache, palette, revenue hook, customer and deals regression tests; review and commit (176 passed).

## Integration and evidence

- [x] Independently review source-truth semantics and lifecycle races, then code quality. The content expiry finding was fixed and re-reviewed; final revenue review found no reproducible P1/P2 issues.
- [x] Run the full `npm test` and `npm run build`; distinguish existing warnings and database-dependent skips.
- [x] Smoke-check the affected rendered routes using a local preview instance, without borrowing production credentials or writing operational records.
- [x] Record measured results, exact validation commands and remaining limitations below.

## Results

### Measured performance

Node 24.18.0, UTC, 300 generated rows per mapper, median of nine warm runs after one cold run. Inputs and temporary instrumentation were kept outside production source. These are CPU mapping measurements, not whole-page or network latency claims.

| Mapper | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Project rows | 25.086 | 1.170 |
| Operating projects | 24.143 | 0.512 |
| Operating todos | 24.588 | 0.945 |
| Revenue deals | 8.126 | 0.229 |
| Revenue accounts | 8.213 | 0.202 |
| Attention tasks | 8.703 | 0.367 |
| Attention events | 24.427 | 0.685 |
| Content items | 16.008 | 0.287 |
| Publication logs | 15.902 | 0.247 |
| Content assets | 16.133 | 0.282 |

The integration checkout independently repeated project mapping at 1.266 ms (about 95% less CPU time than baseline). For each timezone run (UTC and Asia/Seoul), 21 date edge cases produced 252 helper outputs and 294 mapped rows identical to baseline. Existing missing/invalid value handling and locale/timezone options are unchanged.

Overlapping revenue consumers now issue one GET instead of two. Page and palette share pending reads, results and post-save invalidation; content surfaces no longer own competing full-ledger caches. Studio still calls `/api/hub/content/catalog` rather than the full content endpoint.

### Validation

- `npm test`: **3,520 total; 3,507 passed; 0 failed; 13 skipped**, 65.0 seconds. The 13 database-dependent skips match baseline; 47 additional tests pass.
- `npm run build`: **Hub and Engine both succeeded**, two uncached build tasks, 10.0 seconds.
- `git diff --check`: passed.
- Regression tests cover synchronous failures, subscriber reentry, response-body timeouts, timer cleanup, retry cancellation, obsolete replies, malformed/source-error envelopes, preview clearing, expired reads, shared consumers, catalog isolation, tag trends, palette freshness and deep-link first-render behavior.
- Independent final review: 58 focused tests passed; extra reentry and Strict Mode setup → cleanup → setup probes confirmed one shared request. Live React rendering was not exercised by that review; lifecycle races were checked deterministically.
- Local Next dev browser: content Queue → Studio, content stage selection, Customers → command palette search → Deals → stage view. Preview/connection-needed states render explicitly; captured browser warning/error logs are empty. Server logs show the customer revenue read reused by the palette, and a background revenue read on the next revenue-page mount.
- Test logs: `/tmp/moonlight-speed-stability-final-test.log`; build logs: `/tmp/moonlight-speed-stability-final-build.log`. Formatter probe: `/tmp/moonlight-ledger-date-speed-1002.mjs` with UTC/Seoul before-and-after snapshots.

### Boundaries

Live production latency and real operational writes were not exercised. Browser checks used a local preview without Supabase credentials; live/error/race behavior was checked with deterministic tests. Existing Node module-type warnings in `project-delivery`/`content-manager` and Next's middleware-to-proxy deprecation warning remain. No dependencies, database schema, authentication policy or page styling changed.

All implementation commits are on `codex/speed-stability-1002`; the shared main checkout's unrelated edits are preserved. Nothing was pushed or deployed.
