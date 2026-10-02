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

- [ ] Reproduce any merge regression or repeated request cost before implementation; record the failing command or exact observed sequence below.
- [ ] Add focused regression coverage for asynchronous lifecycle/data-truth defects before fixing them. Keep loading/preview/partial/error and save behavior explicit.
- [ ] Review new fixes independently and rerun their affected tests.
- [ ] Run final root tests and desktop tests separately; run the Hub/Engine build using the CI filters because the desktop `build` script packages Windows.
- [ ] Verify affected browser flows in an isolated local preview; report native/production verification limits accurately.
- [ ] Record final commits, measurements, checks and cleanup.

## Verification commands

```sh
npm test
npm --workspace @com-moon/desktop test
npm run typecheck
npm run check:contracts
npm run check:classin
npm run build -- --filter=@com-moon/hub --filter=@com-moon/engine
git diff --check
```

## Evidence and results

Merged baseline: root tests 3,851 total / 3,838 passed / 0 failed / 13 database-dependent skips; desktop 346 passed / 0 failed. Typecheck, contract checks, ClassIn checks and both filtered web builds passed. Logs are `/tmp/moonlight-cmac-{baseline-test,desktop-test,typecheck,contracts,classin,baseline-build}.log`.

Additional confirmed defect: `pages/use-content-schedule.js` accepts an old GET after a successful write. `/tmp/moonlight-schedule-race-probe.mjs` reproduces saved revision 2 changing back to revision 1 when the pre-save response arrives. The next change will coalesce overlapping reads, cancel superseded work, ignore post-unmount/scope-change responses and invalidate pre-save reads before applying confirmed writes. Focused regression coverage will exercise the real hook with controlled effects and deferred transport.
