# Campaign metadata read guard

Baseline: `96fe447620121b7f17f05309dd3bb4378a4c79e5`.

Strategy updates read the existing campaign metadata and then replace the whole
JSON value with a merged value. Previously a failed or missing read became `{}`,
so a subsequent successful PATCH could erase unrelated keys such as channels,
progress, goal, current and origin.

Metadata updates now require exactly one row with an explicit `meta` property.
An object is preserved and merged; an explicit stored `null` keeps the existing
empty-metadata behavior. Failed reads, missing rows/properties, malformed values
and multiple rows return the existing `failed` envelope with a retryable reason
before any write. Reading up to two rows makes an ambiguous result observable.
Unconfigured writes remain `preview`; creates and column-only updates retain
their existing behavior.

The existing POST handler maps this failure to HTTP 502. The existing strategy
save handlers display their failure feedback and retain the editing draft. No
UI, route, permission, schema or database contract was changed.

## Validation

- Final regression file against baseline: 20 tests, 5 passed, 15 failed,
  0 cancelled. Fourteen failures were assertions about unsafe writes; one was
  the baseline's unhandled synthetic read exception.
- Fixed regression file: 20 passed. Including the existing campaign ledger and
  business-truth suites: 26 passed, 0 failed/cancelled/skipped.
- Normal metadata preservation, explicit null/empty-object metadata, missing
  and malformed responses, multiple rows, thrown reads, metadata-only updates,
  column-only updates, creates and unconfigured preview are covered.
- An additional handler-path test within those 20 tests executes the actual
  POST, page save callback and strategy-panel save body with synthetic I/O and
  state boundaries: read failure returns 502 without a write, preserves the
  draft, and a healthy retry saves once and closes editing.
- The production repository module is imported directly. UI/route bodies are
  extracted with the TypeScript AST. No network, real API server, database,
  browser, authorization check or mounted React lifecycle was exercised.
- The repository syntax/conflict/debugger guard reported no issues for the two
  changed source/test files. This is not a type/import/style lint result.

## Remaining boundary

This prevents replacement after an unavailable or invalid read. It does not
make the read and whole-metadata PATCH atomic: a concurrent writer can still
change metadata between those operations. No compare-and-swap, JSON merge RPC,
schema or permission change was introduced. Such concurrency protection needs
separate investigation and a separately reviewed change.

External audit evidence is preserved under `review-r8/usability/` in the audit
workspace: `campaign-meta-read-guard.final-baseline.log`,
`campaign-meta-read-guard.final-fixed.log`, and
`campaign-meta-read-guard.syntax.json`. Earlier reproduction and initial test
logs are retained separately.
