# Account identity and scope recovery validation

Date: 2026-10-20. Before-change source: `720c8e3f44b86fa8d0531271f003de2e149a57be`.

## Result and scope

Account names are now labels, not identity. Selection, keyboard rows, search indexes, React keys, detail caches, rename, activity reads/writes, pin/delete recovery and undo closures use the saved ID or the original create UUID. The create UUID is also the saved primary key, so an acknowledgement does not re-key the selected record. No database, API, auth, migration, automatic customer conversion or production setting was changed.

The previously failing S9 same-name acceptance case is promoted from the residual diagnostic into the normal business regression suite. A second business scenario freezes the clock, creates two equal-name Accounts in one workspace, and verifies distinct IDs plus independent persisted rename/selection.

## Scenario matrix

| Scenario | Result | Evidence |
| --- | --- | --- |
| Same-name cards, keyboard selection, search contacts, detail notes | PASS | Actual Accounts component harness routes independently by ID. |
| Two same-second quick creates in one workspace | PASS | S10: equal labels, distinct primary IDs; renaming the first leaves the second selected and unchanged. |
| Same-name business/personal workspace records | PASS | S9: local rename and later recovered persistence affect only the intended ID. |
| Lost acknowledgement, current edited input, explicit confirmation then UPDATE | PASS | Existing S3/S4 plus actual-component create/recovery test; immutable receipt and dirty current input remain distinct. |
| Unknown Company create → Personal query switch → another unknown create → remount | PASS | Recoverable commands are keyed by workspace **and record type**; explicit retries recover the corresponding original IDs. |
| Query-only Personal deep link/create | PASS | Real scope hook exposes the current query's effective filter before effects run; a personal legacy name is no longer falsely ambiguous and new creation uses Personal. |
| Manual filter, same query, scope change and scope removal | PASS | Manual selection persists until scope actually changes; removal restores the all filter. |
| Exact-ID and legacy-name deep links | PASS | ID wins; a legacy name works only when unique within effective workspace/type; duplicate names never select an arbitrary row. Other query parameters remain. |
| Selected ID during ledger invalidate/loading/error/recovery | PASS | Empty transient snapshots do not change the selection; returning rows restore the same detail. |
| Later external ledger name after failed immediate refresh | PASS | Confirmed optimistic name overlays retire on later fresh ledger data; unresolved newer input remains protected. |
| Rename races, Enter/blur, Escape/blur | PASS | Per-ID queue preserves latest intent and last confirmed name; one explicit submission is not duplicated by blur; cancellation writes nothing. |
| Late activity load/ack/failure, pin rollback, delete undo | PASS | Completion/error/undo remain attached to the initiating identity, not another equal-name account. |
| Unsent note/log draft on account switch and return | PASS | ID-keyed memory cache retains text/type/tab without leaking it into another account. |
| Customer → Deal/Account conversion | NOT IMPLEMENTED | Existing S8 intentionally fails as a TODO diagnostic; the linking flow remains a separate product proposal. |
| Full browser rendering, production DB constraints/RLS, native auth | UNVERIFIED / EXCLUDED | Logic/component harnesses do not claim these surfaces were exercised. |

## Implementation boundaries

- `pages/account-identity.js` owns stable identity, type/workspace recovery scope, unambiguous link resolution and per-ID rename serialization.
- `pages/revenue.jsx` applies these to Accounts and retains draft fields in an Accounts-instance map. Its existing shared scope hook now derives the effective filter synchronously while still committing query changes to state in the effect. This preserves manual-filter semantics for its other consumers.
- Existing linked Company/Contact/Deal precedence is unchanged. No names are treated as automatic relationship keys.
- A successful create can be followed by another intentional same-name create. Equal names are not deduplicated, because they are not identity.
- Unsent detail drafts survive selection changes and keyed child remounts within the same Accounts instance. They do **not** gain browser/page restart durability. Existing unresolved create commands remain memory-only and survive component remounts, not browser restart.
- Row-local create receipts still disappear on hard deletion. Activity creation still has its existing lost-ack contract. No durable journal or universal exactly-once guarantee is claimed.

## Reproduction and validation

All test organizations and notes are synthetic. Business tests intercept requests in memory; component tests transpile the actual product functions and run state/effect callbacks with a deterministic hook harness. No browser, socket, live database, real account or credential is involved.

```sh
# 24 identity/scope/draft/activity tests plus existing callers/business regressions
node --import ./scripts/register-hub-alias.mjs --test \
  apps/hub/components/hub/pages/account-identity.test.mjs \
  apps/hub/components/hub/pages/revenue-business-scenarios.test.mjs \
  apps/hub/components/hub/pages/revenue-create-ui.test.mjs \
  apps/hub/components/hub/deals.regression-1.test.mjs

# Unimplemented linking acceptance: intentionally failing TODO, not a pass
node --import ./scripts/register-hub-alias.mjs --test \
  scripts/audits/revenue-business-scenarios.test.mjs
```

The relevant broad run covered sales-os, revenue-ledger, record-candidates, scope-filter, Revenue/Customer/Deal UI suites, the identity suite, no-mock-data guard and create-idempotency acceptance. Result: **693 tests, 692 passed, 0 failed, 1 PostgreSQL-dependent skip, 0 TODOs**. Inherited environment was stripped except PATH, HOME and LANG; fixture configuration is synthetic. Source syntax guard: **1,833 files, 0 issues**, explicitly not semantic/type/style checking.

Focused result: **71 passed, 0 failed, 0 skipped**. Residual linking diagnostic: **one intentionally failing TODO**, not evidence that conversion works. Full-root integrated-candidate and remote CI results must be reported separately.
