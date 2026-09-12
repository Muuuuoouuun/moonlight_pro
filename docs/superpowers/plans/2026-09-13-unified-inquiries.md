# Unified inquiries implementation plan

> For agentic workers: use superpowers:subagent-driven-development with bounded ownership; the controller implements Hub integration while one implementer owns Engine persistence. Review specification compliance before final code quality review.

**Goal:** Collect Gmail and landing form inquiries into a durable inbox and expose new messages through existing notification entry points.

**Architecture:** Engine owns atomic inquiry/event/sync commands in Postgres. Hub owns Gmail reading, guarded forwarding, scoped read models and UI. The existing Daily Brief consumes inquiry summaries; no Gmail request runs on dashboard reads.

**Tech stack:** Next.js, JavaScript/TypeScript, Supabase REST/RPC, Node test, PostgreSQL.

**Approval:** User approved the 2026-09-12 design on 2026-09-13 and requested a commit. Actual provider login, production migrations and landing-site registration remain deployment setup, not simulated completion.

## Shared contracts

- Engine `POST /api/inquiries/command`, shared-secret protected, default workspace from server. Body `{action, ...fields}`. Actions: `ingest`, `mark_read`, `update`, `split`, `claim_sync`, `save_sync`, `release_sync`.
- Ingest fields: `source` (`gmail|webhook|manual`), `sourceAccountKey`, `externalEventId`, optional `threadId`, optional verified `canonicalKey`, `subject`, `body`, `contact:{name,email,phone}`, `kind` (`sales|support|partnership|general`), `classification` (`inquiry|review|ignored`), `reason`, `orgScope` (`classin|personal|unclassified`), `receivedAt`, `historical`, optional `sourceUrl`.
- Responses: `{status:'saved'|'duplicate'|'conflict'|'invalid-input'|'error'|'busy'|'not-found', inquiry?, state?, leaseToken?, error?, retryable?}`. Persisted inquiry fields are snake_case.
- Tables: `inquiries` with `id,workspace_id,org_scope,kind,classification,reason,subject,contact_name,contact_email,contact_phone,status,sources,last_inbound_seq,last_read_seq,unread,received_at,updated_at,lead_id,deal_id,case_id`; `inquiry_events` with source identity, original body and inquiry sequence; `inquiry_sync_states` with stable account key, `state` JSON, lease and latest success/error.
- Inquiry statuses: `new|in_progress|waiting|closed|ignored`. `mark_read` uses `{id,seenSeq}` and must not consume later arrivals. Update uses `{id,patch,expectedUpdatedAt}`. Split uses `{id,eventId,idempotencyKey}`.
- Sync claim `{accountKey}` returns leaseToken + state. Save `{accountKey,leaseToken,state,success,error}` is fenced against expired/replaced leases; release has same fence. State JSON carries phase/history/page tokens, bootstrap boundary, pending message IDs and errors. No cursor advancement across unhandled events.
- External `POST /api/intake/inquiries`: per-source token configured in `COM_MOON_INQUIRY_SOURCES` JSON array `{id,token,workspaceId,orgScope,formIds}`. Header `x-inquiry-source` chooses registration, Bearer token authenticates it. Body follows approved design; server derives scope and canonicalKey `form:<sourceId>:<formId>:<eventId>`. Header Idempotency-Key must match eventId when both provided.

## Tasks

- [x] 1. Engine persistence: write failing normalization/auth tests and a local PostgreSQL transaction suite for duplicate/conflict, cross-source aliases, read-arrival race, reopen/split, workspace references and lease fencing. Implement new Engine command, external intake route and additive migration `20260913_0028_unified_inquiries.sql`. Verify before integration.
- [x] 2. Hub read/forwarding: test preview/error distinction, exact total/unread counts independent of page size, source/scope filters and detail access. Implement `lib/inquiry-engine-client.js`, `lib/repositories/inquiries-ledger.js`, `app/api/hub/inquiries/route.js` and detail route. Browser mutations are limited to manual ingest/read/update/split; workspace and source identities come from the server.
- [x] 3. Gmail: tests first for personal-domain inquiries, support, body-only inquiry, forwarded form sender vs customer, spam/system signals, MIME handling, pagination, bounded runs, invalid history, retry and historical notification behavior. Implement `lib/inquiry-email.js`, `lib/gmail-inquiry-sync.js`; reuse existing token resolution and forward Engine commands. Wire the existing scan API and a CRON_SECRET-protected server route.
- [x] 4. UI: build scoped inquiry list and detail/create drawers using existing primitives, durable read/status/edit/split, source/kind/status filters, safe plaintext messages, exact counts and pagination. Register route in hub-app, hub-nav, NAV_TREE and workspace-map. Make Gmail Connect usable and show sync state and retry. Add inquiry notification summary to Daily Brief and bell count without replacing existing actions.
- [x] 5. Verification: run focused behavioral tests, full `npm test`, `npm run typecheck`, `npm run build`, contract checks and rendered desktop/mobile interaction checks. Test local migration/RPC transactions without touching production. Review spec coverage, then review code quality; fix material findings.
- [x] 6. Update design status/setup guide, commit only owned paths, inspect commit stat, integrate safely into original working branch if no conflicting active edits, and remove clean worktree after integration. Never stage other sessions' files.

## Commands and expected evidence

```sh
node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/inquiry*.test.mjs apps/hub/lib/gmail-inquiry*.test.mjs apps/hub/lib/repositories/inquiries*.test.mjs apps/engine/lib/inquiry*.test.mjs
npm test
npm run typecheck
npm run build
npm run check:contracts
git diff --check
```

The first new tests must fail before their implementation. Later runs must pass with failure cases represented as explicit statuses, including a configured-but-unavailable database. UI verification uses synthetic inquiries only; OAuth connection and actual webhooks are reported as setup requirements unless independently verified.

## Review and verification record

- Baseline: 767 Node tests passed before implementation. New tests were run failing before the first Engine, Hub read/BFF, email classifier and view-state implementations.
- Independent review covered the approved specification, all new Engine SQL/auth commands, Gmail continuation/auth/form verification, and Hub read/UI. Regression fixes include deleted-message progress, reply-before-original imports, full signed-envelope verification, seeded UUID support, preflight auth health, exact linked-record labels and historical chronology.
- A pre-existing unmatched JSX wrapper in `rhythm-visualizer.jsx` blocked the initial build; one closing tag restores compilation. The original working branch independently contains the same correction and is preserved during integration.
- Playwright used the bundled local runtime with synthetic API responses; no installed Browser skill was available in this session. Desktop 1440px and mobile 390px passed preview/error states, exact 109-unread count, scope, plaintext safety, read-arrival sequence, create failure preservation and same-key retry, keyboard drawers, mobile width, and Daily Brief summary (11 scenarios, zero page errors). Screenshots were visually inspected after animations settled. Product routes contain no mock-data fallback.
- Actual Gmail login, provider API traffic, production migration and landing registration were not performed. Activation steps and public payload contract are in `docs/inquiry-integration-setup.md` and `docs/inquiry-gmail-setup.md`.

- Final feature verification before integration: `npm test` **851/851 passed, zero skips**, including real PostgreSQL inquiry transactions; `npm run build`, `npm run typecheck`, `npm run check:contracts`, and `git diff --check` passed. Independent review finished with no outstanding P0–P2 findings.

- Integration verification against the current working branch: **909 passed, 0 failed, 3 skipped** of 912 Node tests. The three skipped tests belong to the separate content-workflow database suite and require its external test database; inquiry PostgreSQL tests ran. Hub/Engine production builds, typecheck and contract checks passed again. The only merge conflict was the earlier draft of this inquiry design; the approved implementation record replaces it.

- Delivery: feature commit `4faff06`, integration commit `32ef918`. Integrated into the active local workspace without discarding concurrent work. The dedicated inquiry worktree and its local verification server were removed/stopped after integration. The 11 synthetic UI scenarios passed again against the integrated production build with zero page errors.
