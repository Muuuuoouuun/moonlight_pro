# Revenue purpose-driven business simulation

> Follow-up: the separate [Account stable-identity correction](2026-10-20-account-stable-identity.md) fixes S9 and promotes it to normal regression coverage. S8 linking remains unimplemented. The matrix and counts below describe this earlier business-simulation patch, not the later combined candidate.

Date: 2026-10-20. Before-change source: `eb523f120dfb20221b3c0bdbc4f83034e65c4474`.

## Purpose and boundary

Simulate a ClassIn-like operator registering a prospect, retaining a follow-up promise, recovering uncertain saves, and finding the same customer context afterwards. All organizations, names, phone placeholders and activity content are synthetic. The harness runs actual extracted UI callbacks/payloads, the shared create controller, guarded route handlers, persistence and ledger projection. Every fetch is intercepted in memory with an asserted synthetic origin. It opens no sockets and uses no real database, account, credential, external service or native authentication surface.

This is logic-level business simulation, not a real browser or live Postgres/RLS test. The memory fixture models primary-key uniqueness, scoped reads and compare-and-swap writes; it does not claim all SQL constraints or foreign-key enforcement. No native authentication work is included.

## Scenario matrix

| Scenario | Before | After bounded correction | Business outcome |
| --- | --- | --- | --- |
| S1: customer registration, committed response lost, explicit retry, promise read-back, linked activity note | PASS | PASS | One customer ID; promise retained; note retrievable by the customer ID. |
| S2: edit unknown customer, close/reopen, confirm original, explicitly save edits | PASS | PASS | Current input retained; confirmation does not claim edits saved; UPDATE targets original row. |
| S3: unresolved Account create, switch business/personal scope, remount and retry both | PASS | PASS | Separate commands/IDs and workspace tags; two intended records, not duplicate retries. |
| S4: rename Account after unknown create, then retry | FAIL | PASS | Original command is confirmed without falsely claiming the renamed input saved; later explicit UPDATE saves it. |
| S4 race: rename before first acknowledgement, switch scope, remount, explicitly save | Not previously covered | PASS | Late original acknowledgement keeps edited input dirty; the unrelated workspace row is unchanged. |
| S5: clear phone and promise/date after uncertain customer creation | FAIL | PASS | Explicit clears reach UPDATE; old values do not silently survive a success message. |
| S6: manually entered phone after customer ledger reload | FAIL | PASS | Manual phone remains visible; an actual linked contact's phone still wins. |
| S7: Case free-text account label after reload | FAIL | PASS | Saved label survives without pretending to establish a foreign-key link; linked account wins and malformed/blank labels are safe. |
| S8: newly registered customer, independently created deal, customer contextual deal list | FAIL / existing workflow gap | FAIL / unchanged | Create surfaces do not establish lead/company/account relationships. No automatic conversion/linkage was invented. |
| S9: two same-name Accounts, rename one across business/personal scope | FAIL / existing identity limitation | FAIL / unchanged | Accounts still uses display names for selection/details/local rename; distinct IDs do not prevent a wrong local name change. |
| Full browser interaction, real database constraints, restart and hard-delete durability | UNVERIFIED / bounded out | UNVERIFIED / bounded out | In-memory commands still disappear on restart; hard deletion still removes row receipts. No durable exactly-once claim. |

The two existing gaps are executable, intentionally failing TODO acceptance scenarios outside the default root glob. A successful test-process exit for that diagnostic file does **not** mean those business outcomes passed.

## Four bounded corrections

1. `pages/revenue.jsx`: Account create retries prefer the current recovery draft. Renaming an unresolved account updates the retained current input and scoped local reference, not the frozen original command. The next explicit save confirms the original and a later one updates it.
2. `pages/customers.jsx`: NewCustomer payload always carries phone, next_action and next_action_at, including empty values. The recovery controller can legitimately turn a later save into UPDATE, where omission would mean unchanged rather than cleared.
3. `lib/repositories/revenue-ledger.js`: manual lead phone is a fallback behind linked contact phone.
4. The same ledger mapper uses a trimmed string-only `meta.account_label` fallback behind the real linked Account name.

The first two close newly exposed recovery-path false-success cases. The phone and Case-label projection defects were independently confirmed to predate create idempotency at `935a22fe`.

## Remaining product decisions

- NewCustomer creates a Lead, not a Company, Contact or Account. Changing its stage to Customer only changes Lead status. Quick Account, Deal and Case creates are independent. Customer deal context joins through lead/company IDs, but these manual create surfaces do not currently establish those relationships. A scoped linking/conversion workflow is needed before claiming end-to-end connected customer history.
- Account detail state, selection and rename remain name-keyed. Two quick creates in the same second can receive the same generated name. Renaming one can change both local labels even across scopes while only one command/server row changes. This needs a separate identity correction; the four fixes do not solve it.
- Activity creation retains its pre-existing contract. The successful linked-note scenario does not claim activity lost-response idempotency.

## Reproduction

From a matching-lock installed checkout:

```sh
# Supported workflow and bounded regression scenarios (also in the default root glob)
node --import ./scripts/register-hub-alias.mjs --test \
  apps/hub/components/hub/pages/revenue-business-scenarios.test.mjs

# Known missing outcomes: intentionally failing TODOs, not a green acceptance claim
node --import ./scripts/register-hub-alias.mjs --test \
  scripts/audits/revenue-business-scenarios.test.mjs
```

Shared memory-only fixture: `scripts/audits/revenue-business-fixture.mjs`. Dependencies are the existing locked registry packages; no new dependency is added.

Final local results: supported scenario/guard tests **10 passed**; residual diagnostics **2 failing TODOs**, not passes. Relevant broad suite: **663 tests, 662 passed, 0 failed, 1 PostgreSQL-dependent skip, 0 TODOs**. Source syntax guard: **1,830 files, 0 issues**, not semantic/type/style analysis. The broad run used an empty inherited environment except PATH, HOME and LANG; each fixture supplied synthetic configuration. An earlier expanded run exposed cross-test pending-state contamination in the simulation, corrected by completing both workspace retries before beginning the next business scenario.

Full-root and remote integrated-SHA results are separate, not inferred from these tests. Hub JSX is not semantically checked by the configured TypeScript targets.
