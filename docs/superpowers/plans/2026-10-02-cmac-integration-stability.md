# CMac integration and stability plan

> **For agentic workers:** Use `superpowers:executing-plans` for integration, `superpowers:systematic-debugging` and `superpowers:test-driven-development` for reproduced defects, and `superpowers:requesting-code-review` before completion. Keep independent reviews read-only or use isolated worktrees.

**Goal:** Merge the latest CMac remote branch into the verified speed/stability work and improve the resulting application's reliability and repeated-read performance.

**Architecture:** Preserve both branches' existing product behavior and the shared content/revenue read lifecycles. Integrate the native desktop/Android source without changing production settings, secrets or records. Further changes require a concrete regression or measured repeated work.

**Tech stack:** Next.js/React Hub and Engine, Supabase REST, Electron desktop, SwiftPM native Mac companion, Node test runner.

## Source and merge

- Starting commit: `24e8769a` on `codex/speed-stability-1002`.
- `git fetch origin` discovered `origin/10.cmac2.0`, latest CMac branch: `42d12e4c` (2026-10-01 17:57:24 +0900).
- Common ancestor: `944fac9e`. The branches have 10/157 exclusive commits; tree comparison is 603 files.
- Main checkout `10.bigmac2.0` has unrelated uncommitted changes, so integration continues in the existing isolated checkout.
- [x] Inspect remote names, timestamps, commit ancestry, changed instructions and dependency/build contracts.
- [x] Merge `origin/10.cmac2.0` with `--no-ff --no-commit`. Preserve both sides of the sole `DESIGN.md` conflict: local OKR decisions and remote widget/product decisions.
- [x] Install the merged workspace dependencies and inspect lockfile changes (313 packages installed; lockfile unchanged).
- [x] Verify automatic merges in Hub routing, content/revenue consumers and content mapping preserve both branches' behavior. Independent focused review: 108/108 tests, no P1/P2 at these integration boundaries.
- [x] Run merged baseline tests, typecheck, contract checks and the CI web build, then commit the concrete integration.

## Further stabilization

- [x] Reproduce any merge regression or repeated request cost before implementation; record the failing command or exact observed sequence below.
- [x] Add focused regression coverage for asynchronous lifecycle/data-truth defects before fixing them. Keep loading/preview/partial/error and save behavior explicit.
- [x] Review new fixes independently and rerun their affected tests.
- [x] Run final root tests and desktop tests separately; run the Hub/Engine build using the CI filters because the desktop `build` script packages Windows.
- [x] Verify affected browser flows in an isolated local preview; report native/production verification limits accurately.
- [x] Record final commits, measurements, checks and cleanup.

## Verification commands

```sh
npm test
npm --workspace @com-moon/desktop test
npm run typecheck
npm run check:contracts
npm run check:classin
npm run build -- --filter=@com-moon/hub --filter=@com-moon/engine
npm audit --omit=dev --audit-level=high
git diff --check
```

## Evidence and results

Merged baseline: root tests 3,851 total / 3,838 passed / 0 failed / 13 database-dependent skips; desktop 346 passed / 0 failed. Typecheck, contract checks, ClassIn checks and both filtered web builds passed. Logs are `/tmp/moonlight-cmac-{baseline-test,desktop-test,typecheck,contracts,classin,baseline-build}.log`.

### Schedule lifecycle

`pages/use-content-schedule.js` accepted an old GET after a successful write. `/tmp/moonlight-schedule-race-probe.mjs` reproduced saved revision 2 changing back to revision 1 when the pre-save response arrived.

The fix coalesces overlapping reads within each hook instance, cancels superseded work, ignores completions after unmount/scope changes and invalidates pre-save reads before applying confirmed writes. HTTP success and the read envelope are both checked; preview/error responses do not expose attached rows. A 15-second deadline also releases a stalled body reader that ignores abort. A newer confirmed revision survives a late duplicate acknowledgment.

Regression coverage executes the actual hook with a small controlled React lifecycle adapter and deferred transport, not a browser React renderer. The original ten-test run was 9 failed / 1 passed; the final expanded suite is 13/13 passed. The timer failure in the original harness alone is not evidence that the old native `AbortSignal.timeout` was absent. Schedule/repository/publish/Studio/data-state focused checks passed 60/60. Independent review found no P1/P2 and separately exercised four adversarial response-order cases.

### Publish-log CPU cost

The shared `formatKstShort` created one `Intl.DateTimeFormat` per call. It now reuses a fixed Korean-locale/Seoul-time-zone formatter. The alternating before/after benchmark used 300 generated schedule rows, 10 warmups and 30 measured samples:

| Work | Before median | After median | Reduction |
| --- | ---: | ---: | ---: |
| Build 300 publish-log rows | 8.336 ms | 0.771 ms | 90.8% |

All 307 date inputs and 300 complete output rows matched the previous implementation. This measures local CPU work only, not network latency or total page speed. Results: `/tmp/moonlight-cmac-publish-log-benchmark.json`.

### Mac connection recovery

The latest login view retained a saved Hub origin but removed its only native editor. A saved, failed localhost connection therefore had no recovery path. An isolated UserDefaults/service probe reproduced this without contacting a real Hub.

The login view now offers a collapsed **Hub 주소 설정** section with a local address draft. Authentication uses the submitted address; success saves its normalized origin. Cancellation and failed authentication retain the saved preference. The default-origin button changes only the draft, and address editing/cancellation are disabled during login. Authentication policy, HubStore and AppModel implementation are unchanged.

Four UI wiring regression checks went from red to green, six native address-recovery conditions passed, and the existing domain/API and transport checks passed. Native verification, from `prototypes/moonlight-pet-macos`:

```sh
./script/test_hub_domain.sh
./script/test_hub_transport.sh
MOONLIGHT_CODE_SIGN_IDENTITY=- ./script/build_and_run.sh --build-only
```

The native build completed in 44.27 seconds and strict ad-hoc signature verification passed. These outputs are retained in the task's tool records; no separate native log file was written. Native manual interaction, Windows packaging and Android execution were not tested. The installed application was not launched or replaced.

### Dependency security

The CI audit initially failed with one critical and two moderate production-dependency findings. The installed Next.js 16.3.5 was updated to the compatible 16.3.6 security release; both app manifests now require at least that version. The existing transitive ranges resolve `fast-uri` 3.1.8 and `ip-address` 10.7.3. React/React DOM remain 18.3.1, within Next's declared peer range. No major-version migration or codemod was necessary.

The [Next.js security release](https://github.com/vercel/next.js/releases/tag/v16.3.6), [fast-uri advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj) and [ip-address advisory](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-j6r3-76f7-8jcv) establish the patched versions. Repository search found no direct `next/og`/`ImageResponse` use; an audit finding is not a claim that this application was exploited.

Independent dependency review confirmed all 521 lockfile entries remain, with no added/removed packages and all eight SWC platforms retained. Production audit after the patch: **0 vulnerabilities**. This check excludes development dependencies. Initial report: `/tmp/moonlight-cmac-audit-before.log`.

### Final verification and delivery

After the dependency patch, all commands completed successfully:

- Root: **3,868 tests / 3,855 passed / 0 failed / 13 database-dependent skips**.
- Electron desktop: **346 passed / 0 failed**.
- Typecheck: 4 successful tasks; contract and ClassIn checks passed.
- Hub and Engine builds: 2 successful, neither cached.
- Production dependency audit: 0 findings; whitespace check passed.
- Logs: `/tmp/moonlight-cmac-patched-{test,desktop-test,typecheck,contracts,classin,build,audit}.log`.

Local browser verification used an isolated port/dist directory without operational environment variables. Products, Queue, Studio, Research, Publish Log, Customers and command search displayed the appropriate preview/connection state. After the Next patch, Publish Log refresh, Studio, Products and command-search navigation to Customers were verified again, with no console warnings/errors. Save races were tested with controlled transport; production DB writes/login were not exercised.

Integration and follow-up commits:

- `cc629275`: merge latest CMac and preserve both branches' design decisions.
- `d8de20ff`: schedule lifecycle and 13 regression checks.
- `8bdf5424`: reused schedule date formatter.
- `5c301cc7`: native Hub address recovery.
- `717ae24d`: compatible production security patches.

The remote CMac head was rechecked and remains `42d12e4c`. It is an ancestor of the delivery branch `codex/speed-stability-1002`. The main `10.bigmac2.0` checkout's unrelated edits are preserved; this work is committed in `/Users/bigmac_moon/dev/moonlight_pro-speed-stability-1002`. No push, deployment or production migration was performed. The native helper worktree was removed after integration; temporary browser tabs and preview servers were cleaned up.
