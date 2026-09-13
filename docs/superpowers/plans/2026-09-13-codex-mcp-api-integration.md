# Codex MCP·API Integration Implementation Plan

> **For agentic workers:** Use the executing-plans workflow with bounded independent domains under dispatching-parallel-agents; root reviews and integrates each result. The user approved the design with “진행”.

**Goal:** Make local Codex/MCP and authenticated HTTP clients complete Moonlight work using bounded reads, reliable commands and a durable optional Codex job worker.

**Architecture:** Existing Hub repositories and Engine command validation remain authoritative. Agent API authenticates a single configured workspace, MCP is a protocol binding, and an isolated SDK worker owns long tasks. Remote public MCP hosting remains the design's optional P3 extension.

**Tech Stack:** Node.js, Next.js routes, Zod, MCP SDK 1.x, Supabase REST/RPC, official Codex TypeScript SDK.

## Fixed interfaces and ownership

- Query/auth agent: `packages/agent-contracts/**`, `apps/hub/lib/agent/auth.js`, `queries.js`, `capabilities.js` and their tests. Export `authorizeAgentRequest(request, { scope, env })` returning `{ok,httpStatus,data,context}`; context is `{workspaceId,actorId,scopes}`. Export `queryAgentData(input, context)` and `getAgentEntity(type,id,input,context)` returning `{httpStatus,data}`. Export `getAgentCapabilities(context)` with the same result wrapper.
- Command agent: `apps/hub/lib/agent/commands.js`, Engine agent command route/service/tests and migration `20260913_0032_agent_commands.sql`. Export `executeAgentCommand(input,context)` and `getAgentCommandReceipt(id,context)` with `{httpStatus,data}`. Reuse PMS validation and existing contact outcome RPC; ensure domain mutation and receipt share a transaction.
- Job/worker agent: `packages/codex-worker/**`, `apps/hub/lib/agent/jobs.js`, Engine worker route/service/tests and migration `20260913_0033_agent_jobs.sql`. Export `handleAgentJob(action,input,context)` with `{httpStatus,data}`. Root binds HTTP/BFF routes. No worker starts automatically.
- Root: API route bindings, MCP binding/profiles/compact legacy projections, diagnostic CLI, environment examples, npm installation/lockfile, docs, final integration tests/review.
- Scopes: `read`, `tasks:write`, `contact-outcomes:write`, `jobs:read`, `jobs:write`. Agent auth uses `COM_MOON_AGENT_API_TOKEN`, server-derived `COM_MOON_DEFAULT_WORKSPACE_ID`, optional stable `COM_MOON_AGENT_ACTOR_ID` default `codex`, and comma-separated `COM_MOON_AGENT_SCOPES` (default read-only).
- API errors: `{status:"error",error,code?,retryable?}`; auth/input/conflict use 401/403/400/409. Preview is normal and never claimed persisted.

## Task 1 — Isolate and baseline

- [x] Commit only the approved design and index; preserve the existing next-env change.
- [x] Create `../moonlight_pro-codex-agent` on `codex/mcp-api-integration-20260913`.
- [x] Run `npm install --no-audit --no-fund` and `npm test`; record baseline independently of new changes.

## Task 2 — Bounded reads and caller authorization

- [x] Write auth/cursor/projection/repository tests first: reject absent/wrong tokens, arbitrary scopes/fields/cursors and cross-workspace reads; preserve preview/error/partial; paginate by stable created_at/id; test Korean payload limits.
- [x] Run `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/agent/*.test.mjs packages/agent-contracts/*.test.mjs` and observe missing behavior.
- [x] Implement only allowlisted query fields, signed scoped cursors, select/filter/limit at Supabase, TTL/inflight cache and fresh detail; keep returned receipt version exact.
- [x] Test empty/live/preview/partial/error states and 16KiB rows/32KiB details.

## Task 3 — Transactional work commands

- [x] Write duplicate/conflict/concurrent version/unknown outcome tests before implementing.
- [x] Implement Engine command normalization for create/update/complete task and record_contact_outcome; allocate client-stable task IDs from command IDs.
- [x] Add receipt RPC keyed by workspace/actor/command ID with canonical request hash, atomic mutation+receipt, source/action/target validation and permission grants to service role only.
- [x] Implement Hub transport and receipt lookup, preserving missing configuration and transport errors.
- [x] Run Engine command tests and validate SQL with an ephemeral local PostgreSQL-compatible test database when available.

## Task 4 — Job ledger and SDK worker

- [x] Write claim/heartbeat/fencing/cancel/resume/event cursor/offline/missing usage tests first.
- [x] Add jobs/events/worker heartbeat storage and authenticated lease RPCs. Mutable jobs with expired leases require attention instead of reexecution.
- [x] Implement a Node worker with registered project paths, one job at a time, SDK stream, persisted thread/checkpoint, bounded context/output, abort and wall-clock limits. No model override unless configured by operator.
- [x] Pin the SDK version after inspecting official docs and installed types; use only available SDK controls.
- [x] Test with injected fake SDK/clock/storage to avoid billing or real workspace writes.

## Task 5 — HTTP and MCP binding

- [x] Write route tests for authentication and delegation using Request/Response; bind capabilities/query/entity/command/receipt/job/event/cancel/resume endpoints.
- [x] Add same-origin guarded Hub BFF for job controls, keeping the Agent token out of the browser.
- [x] Write MCP tests for v1 authentication on reads/writes, stable command ID, update/complete, error envelope, profile selection and legacy aliases.
- [x] Implement binding with explicit actions, output schemas/annotations, compact JSON, bounded legacy output and useful source-aware errors.
- [x] Add read-only diagnostic command: initialize/list tools/read, no provider write smoke.

## Task 6 — Verification and integration

- [x] Run focused tests once after each functional change; then `npm test`, `npm run check:contracts`, `npm run typecheck`, Hub and Engine production builds.
- [x] Benchmark deterministic Korean fixtures against legacy full payload; report bytes independently of token usage.
- [x] Review implementation with a bounded code-review agent while root checks docs/configuration and existing tests.
- [x] Fix significant findings and repeat only affected checks.
- [x] Update spec/index/README with implemented and optional scope, configuration and migration instructions.
- [ ] Commit explicit changed paths; integrate into the user checkout without overwriting existing changes, verify integration and remove the worktree.

## Verification record

- Baseline before implementation: 1,071 tests, 1,066 passed, 5 skipped, no failures.
- Implementation suite: 1,195 tests, 1,184 passed, 11 skipped, no failures. The six optional worker SQL cases were then explicitly enabled; combined command/worker PostgreSQL run passed all 17 tests with no skips.
- Contract checks, root typecheck, Hub and Engine production builds passed.
- Actual stdio MCP initialize/discovery/read passed against the configured Supabase. Core exposes 8 tools; the diagnostic one-row response was 1,614 bytes including its default row fields.
- Browser checks cover unconfigured state, submit/cancel/resume, stable request identities, mobile layout and drawer Escape. Additional recovery checks cover terminal detail failure and draft reconciliation without a recorded thread.
- Independent reviews corrected uncertain receipt absence, unbounded receipt entities, unknown job-response retry identity, terminal event backlog, final-detail recovery, canonical input bounds and worker shutdown ordering.
- Live narrow HTTP reads, 30 samples each: fresh p50 106 ms / p95 331 ms; cached p50 4 ms / p95 8 ms; 748 bytes and `live` for all 60 responses. Model token usage was not measured.
- The current user branch advanced with discovery-nudge migration 0031 during work. Agent migrations were renamed to 0032 and 0033 to preserve ordering; all references were updated.

## Local activation

- Repaired Codex's stale Desktop/Projects MCP paths to the actual `/Users/bigmac_moon/dev/moonlight_pro` checkout. Existing unrelated client configuration is preserved.
- Configured distinct Agent/worker credentials in ignored local environment files; the worker receives no Supabase service key. Main checkout's existing Engine next-env change is preserved.
- Supabase Management API returned 401 for the configured management token; no hosted schema or business data was written. A private token refresh is requested before migration activation.
- Worker preflight succeeds with a dedicated persistent home. Provider authentication and a real model job have not been run; startup remains explicit.
- Remote MCP hosting and remote browser authentication remain outside local P0–P2 scope.
