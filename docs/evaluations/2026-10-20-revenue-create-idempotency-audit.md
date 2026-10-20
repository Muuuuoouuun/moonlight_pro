# Revenue create acknowledgement audit (Track A)

## Current implementation status (2026-10-20)

The bounded product correction was separately authorized after the fixture-only audit. This follow-up implements row-local replay protection for leads, deals, customer accounts, and operation cases. It does **not** create a durable command journal, change DB schema, or change authentication/settings. Baseline `935a22fed28eea42309be7b3490cfdfec0b4a00b` remains the before-change reference.

- One stable UUID per draft is used as the existing primary key. An immutable versioned SHA-256 command receipt lives in existing metadata; duplicate-key reads acknowledge only matching original content in the same workspace.
- Lost/invalid acknowledgements stay `unknown`. Same-command retries remain explicit. Changed input first confirms the original read-only and keeps the editor open; the next explicit save updates that same row. If no original can yet be confirmed, a labeled action explicitly retries the frozen original while retaining edited input.
- Memory-only unresolved drafts survive drawer/tab remounts and are not discarded as unsaved local rows. Account quick-create recovery is separated by workspace; switching scope cannot reuse another scope's command. The shared controller also rejects a command changing scope.
- Browser reload/restart loses this memory, and hard deletion removes the row receipt. Those limitations below remain intentionally unresolved. No exactly-once/durable-journal claim is made.
- Four guarded create APIs now require a lowercase v4 UUID `createId`. Missing/invalid IDs return HTTP 400 before REST. This is an explicit API contract change, not a fallback to unprotected inserts. `confirm-create` uses the same write guard but performs reads only. Unknown returns 202, receipt mismatch 409.
- All known in-repository callers of these four create APIs were migrated: Lead/Deal/Case drafts, quick Account creation, and NewCustomerDrawer. The mentor direct Deal call is update-only. Other internal persistence users update existing rows. Activity/contact-log creation retains its existing contract. External callers and old open browser tabs must supply a stable `createId` or refresh; no claim is made to have inventoried third-party clients.

Validation in the dot-owned Linux cloud uses synthetic records and REST boundaries only. No real account, credential, DB, schema migration, deployment, merge, or worker push was used.

### Product verification

- Relevant broad suite: **644 tests; 643 passed, 0 failed, 1 skipped**. The skipped PostgreSQL contact-outcome test requires PostgreSQL binaries and a non-root user. Coverage includes real UI adapter → guarded API → real persistence for all four types, lost BFF and database responses, same-ID different content, changed-input read-only confirmation and explicit update, wrong workspace, unauthorized routes, malformed acknowledgements, original/current separation, in-flight edits, scope switch/remount, and actual create/delete UI callbacks.
- The ten opt-in acceptance gates that failed before implementation now pass and are included in that total.
- Source syntax guard: **1,819 files, 0 issues**. It does not perform semantic/type/style checking. Forced TypeScript checking passed **4 configured targets, 0 cached**; Hub JSX is not a configured semantic typecheck target.
- This worktree's focused results are not a full-root/integrated-SHA CI result. Final integration validation belongs to the publisher.

## Historical fixture-only investigation

The sections below record the reproduced baseline, proposed contract, and isolated prototype evidence that preceded authorization. The bounded implementation above supersedes the proposal's “not applied” status, but not its documented limits.

## Reproduced defects

P1: `apps/hub/lib/sales-os/revenue-write.js:467–477` drops the draft/command identifier on create and lets the database generate a fresh primary key. The shared REST adapter correctly does not retry writes itself. A committed insert whose reply is lost is reported `failed`; an explicit retry inserts another row. This was reproduced through the real persistence helper and real REST adapter for leads, deals, customer accounts, and operation cases.

- Lost first response followed by explicit retry: `failed`, then `saved`; **two rows**, two POSTs.
- Two concurrent repeats plus the same requested command ID with changed input: three `saved` results; **three rows**, three POSTs.
- Successful HTTP reply with malformed representation: `saved` with null ID, although it cannot confirm the identity of the saved row.
- The real UI helper in `revenue-core.jsx:56–68` labels a lost create response `error`, not an uncertain outcome.

The memory REST fixture enforces the existing required title/name columns, atomic primary-key collision, and workspace-scoped recovery reads. It is not a substitute for live Postgres, RLS, browser, or network testing.

## Caller impact

- Lead draft: `revenue.jsx:552–553,590–605`, millisecond local ID; retry keeps the local draft but starts another server insert.
- Deal draft: `revenue.jsx:1825–1869`, short timestamp local ID; same insert risk and possible local-ID reuse.
- Case draft: `revenue.jsx:2437–2499`, timestamp local ID; same risk.
- Quick account create: `revenue.jsx:3598–3626`, no stable draft ID. A live create error removes the local row and recommends retry, even when the original create may have committed.
- New customer drawer: `customers.jsx:1409–1442`, each submit sends a fresh create without a command identity. Typed values remain, but retry is not idempotent.
- Activity/contact-log creation is a different persistence contract. This track does not claim to repair or validate its idempotency.

## Bounded implementation contract

1. Generate one UUID per create draft, not per click. Freeze the submitted JSON command separately from current edited input. Preserve identity across in-flight requests, explicit retry, drawer close/reopen, and tab remount. Join repeated clicks; never add automatic write retries.
2. For the four record kinds, use that UUID as the existing table primary key. Store a versioned SHA-256 digest of the canonical original command in existing metadata. The digest covers table, workspace, and payload; object key order is canonical, arrays keep order. Exclude only local draft ID, operation, and command ID. This conservative command comparison does not equate changed input merely because a mapper ignores it.
3. On primary-key conflict, perform a workspace/ID-scoped read. Acknowledge only an exact original receipt match. An unrelated row, missing receipt, or different payload must not be reported saved; never upsert or overwrite it. Existing metadata merge/CAS must retain this receipt.
4. Lost, timed-out, HTTP 5xx, unreadable, or malformed acknowledgements remain `unknown`. A definitive input/rejection error may allow correcting the command; uncertainty must never rotate its identity. Confirm identity and receipt on successful representations too.
5. After edits to an uncertain draft, do not replay edited input under the frozen command or silently claim it saved. Offer read-only confirmation of the original. If confirmed, re-key onto the existing row but keep current edits dirty; saving them requires a new explicit UPDATE. A missing row is still inconclusive while the original request may complete late.
6. Keep unresolved input and command recoverable; do not use the account caller's current remove-on-error branch for unknown outcomes. User-facing text must say the result is unconfirmed, not that creation failed.

Product ownership: `revenue-write.js`, a small command/receipt helper and tests; `revenue-core.jsx`; the four Revenue draft/quick-create paths; `NewCustomerDrawer`; the four guarded write routes for unknown/confirmation status; corresponding interruption/replay/UI tests. No schema or authentication changes are needed for the bounded existing-row guarantee. API compatibility for callers lacking a command ID must be explicit rather than silently unprotected.

## Prototype evidence and important limits

An isolated scratch prototype, not imported by or committed into the product, exercised real builders and the shared REST adapter. **33 acceptance-oriented checks passed**, plus **two limitation checks** reproduced these boundaries:

- Hard deletion removes a row-local receipt. A late replay can recreate that UUID. An absolute no-recreation guarantee needs a durable command receipt/tombstone with an agreed retention and deletion contract; row metadata alone cannot provide it.
- Losing a draft's command identity on restart permits a new UUID to create another row. Persisting unresolved commands across a browser restart needs an explicit local retention/recovery policy. In-memory state only covers its documented lifetime.

Therefore, choosing the bounded no-schema fix must not be described as durable exactly-once creation across hard deletion or lost client state. Durable command storage/migration and its privacy/retention policy require a broader decision.

Prototype coverage also includes delayed first request overtaken by retry, different-payload race winner, duplicate recovery read failure, foreign-workspace collision, malformed success, mutable row edits, input mutation after submit, read-only confirmation, and no hidden write retry.

## Re-run the opt-in product acceptance gates

From an installed matching-lock checkout:

```sh
node --import ./scripts/register-hub-alias.mjs --test scripts/audits/revenue-create-idempotency.test.mjs
```

These tests are deliberately outside the root `scripts/*.test.mjs` glob. Baseline result was **0 passed / 10 failed**; after the bounded correction they are **10 passed / 0 failed**. Production regression tests in the ordinary root glob cover the same server and client behavior. Do not weaken assertions or claim product acceptance based on the scratch prototype.

Independent defect-confirmation checks: **10 passed / 0 failed** (asserting the observed bad behavior, not acceptance). No new full-root run is claimed in this worktree; broader integrated-SHA validation is separate. Native/browser/live DB end-to-end testing is not included in this track.
