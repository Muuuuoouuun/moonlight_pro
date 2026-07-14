# Moonlight Integration Control Plane Cleanup Plan

> **For Codex:** execute this plan in order, with the `superpowers:executing-plans` workflow. Preserve the existing dirty UI/calendar work and use tests before changing behavior.

**Goal:** Make OAuth, IAM, OpenClaw, eeoCRM snapshots, webhook intake, and Moonlight MCP report their real operating state, use separate credentials, and remain usable after a local restart.

**Architecture:** Supabase remains the operational ledger. Hub owns operator reads and guarded local writes, Engine owns write/intake execution, OpenClaw receives Hub snapshots through a local relay and returns progress through the Engine webhook, and MCP clients call Hub through a local stdio adapter. Readiness is provider-specific and distinguishes `configured`, `reachable`, `authenticated`, and `lastSuccessfulSyncAt`.

**Tech Stack:** Next.js App Router, Node.js, TypeScript/JavaScript, Supabase REST, Google OAuth 2.0, MCP stdio, OpenClaw CLI/gateway, macOS launchd.

---

## Confirmed baseline (2026-07-15 KST)

- Hub is live on `127.0.0.1:3000`; Engine is configured for `localhost:3001` but is not running.
- OpenClaw gateway is live on `127.0.0.1:18789`; Moonlight points to relay `127.0.0.1:4317/webhook/moonlight`, but that relay is not running.
- OpenClaw's weekday news cron reports `status=ok` while `delivered=false`; its delivery mode is `none`, and multi-channel message calls fail without an explicit channel.
- Moonlight Google Calendar OAuth is live and writable for the ClassIn calendar. Codex's built-in Calendar connector is a separate `seoulmentoss@gmail.com` primary calendar.
- Calendar OAuth and iCal match, but Gmail and Sheets reuse the same client ID in code without matching registered callbacks/scopes. Current generic `googleOAuthConfigured` therefore overstates readiness.
- `COM_MOON_OAUTH_STATE_SECRET` and `COM_MOON_SHARED_WEBHOOK_SECRET` are the same value. `COM_MOON_HUB_WRITE_SECRET` and `OPENCLAW_SYNC_SECRET` are absent.
- The Moonlight MCP package exists but is not registered in Claude/Codex. Its read tools can work; write tools cannot work without the missing Hub write secret.
- eeoCRM import/hydration succeeded on 2026-07-07 and produced 117 promoted leads plus 23 deals. There is no callable eeoCRM MCP server on this Mac. The retained script defaults to a Windows directory and `127.0.0.1:3000/sse`, which now collides with Hub.
- Two raw Google OAuth credential files in OpenClaw inbound media and one in Downloads are mode `0644`. The OpenClaw Google Workspace MCP configuration points at the web client with zero redirect URIs.
- Google Cloud IAM includes two project Owners and an unused Editor service account with no keys. Keep it disabled from runtime until a least-privilege role is explicitly defined.

## Task 1: Make readiness truthful

**Files:**
- Create: `apps/hub/lib/integration-readiness.js`
- Create: `apps/hub/lib/integration-readiness.test.mjs`
- Modify: `apps/hub/app/api/health/route.js`
- Modify: `scripts/check-connections.mjs`
- Modify: `apps/hub/.env.example`

1. Write failing tests for provider-specific Google flags, Engine reachability, OpenClaw relay reachability, and missing MCP write-secret status.
2. Add a pure readiness builder that returns separate `configured`, `reachable`, `authenticated`, `account`, and `lastSuccessfulSyncAt` fields without exposing credentials.
3. Keep network probes bounded to 1.5 seconds and treat an unreachable optional integration as `degraded`, not as a Hub health failure.
4. Replace the broad Google boolean with Calendar/Gmail/Sheets provider entries. Require an explicit enabled-provider list for connect routes.
5. Update `check-connections.mjs` to probe Engine and relay endpoints instead of accepting URL presence.
6. Run `node --test apps/hub/lib/integration-readiness.test.mjs` and `npm run check:connections`.

## Task 2: Separate secret responsibilities

**Files:**
- Modify: `apps/hub/lib/google-calendar.js`
- Modify: `apps/hub/lib/google-gmail.js`
- Modify: `apps/hub/lib/google-oauth.js`
- Modify: `apps/hub/.env.example`
- Modify: `apps/engine/.env.example`
- Modify locally, untracked: `apps/hub/.env.local`, `apps/engine/.env.local`

1. Write regression tests proving OAuth state signing does not fall back to the shared webhook secret.
2. Require four independent secrets: OAuth state, Hub write, shared Hub↔Engine webhook, and OpenClaw relay sync.
3. Generate 32-byte random values for missing/local-coupled secrets, copy only the shared webhook secret across Hub and Engine, and keep all secret values out of logs and docs.
4. Add startup/readiness warnings when two responsibility-specific secret fingerprints match.
5. Run the OAuth state, Hub guard, and shared webhook test suites.

## Task 3: Restore persistent Engine and OpenClaw relay

**Files:**
- Modify: `scripts/openclaw-local-relay.mjs`
- Create: `scripts/verify-local-control-plane.mjs`
- Create locally: `~/Library/LaunchAgents/com.moonlight.engine.plist`
- Create locally: `~/Library/LaunchAgents/com.moonlight.openclaw-relay.plist`

1. Add relay health output that reports CLI availability and gateway reachability without returning secrets.
2. Make async delivery record the child process's eventual success/failure instead of treating spawn as delivery success.
3. Install launchd jobs for Engine on 3001 and relay on 4317, loading their existing local env files.
4. Verify Hub health, Engine health, relay health, and OpenClaw gateway health after a `launchctl kickstart`.
5. Send one idempotent OpenClaw sync and one signed webhook smoke event; confirm new `sync_runs`, `webhook_events`, and `project_updates` rows.

## Task 4: Register Moonlight MCP for local Codex/Claude use

**Files:**
- Create: `.mcp.json`
- Modify: `packages/mcp-server/src/tools.js`
- Modify: `packages/mcp-server/src/hub-client.js`
- Create: `packages/mcp-server/src/tools.test.mjs`
- Modify locally: `~/.codex/config.toml`

1. Add failing tests for project/task/revenue reads, task creation, payload size/error propagation, and write-secret enforcement.
2. Add tools for `list_projects`, `list_tasks`, `create_task`, `get_revenue`, and `get_content_queue`, reusing existing Hub routes.
3. Register the stdio server with `node --env-file=apps/hub/.env.local ...` so no secret is copied into tracked config.
4. Register the same command in Codex's local MCP config and the project `.mcp.json` for Claude Code.
5. Run an MCP inspector smoke test for one read and one reversible task-create/update cycle.

## Task 5: Make the Google account topology explicit

**Files:**
- Modify: `apps/hub/lib/google-calendar.js`
- Modify: `apps/hub/app/api/calendar/google/callback/route.js`
- Modify: `apps/hub/app/api/health/route.js`
- Modify: `docs/integration-inventory.md`

1. Request the minimum identity scope needed to persist the connected email, or resolve the primary identity from event self metadata when available.
2. Store `external_account_id` and a redacted account label with the Calendar connection.
3. Display the distinction between Moonlight's ClassIn calendar and Codex's personal Calendar connector.
4. Do not enable Gmail or Sheets until their exact callback URIs and scopes are registered in Google Cloud and verified end to end.
5. Keep iCal as read-only fallback; never merge OAuth and iCal results in one response.

## Task 6: Repair eeoCRM ingestion semantics before enrichment

**Files:**
- Create: `apps/hub/lib/sales-os/lead-enrichment.js`
- Create: `apps/hub/lib/sales-os/lead-enrichment.test.mjs`
- Modify: `apps/hub/lib/sales-os/context-schema.js`
- Modify: `apps/hub/lib/repositories/revenue-ledger.js`
- Create: `scripts/enrich-eeocrm-leads.mjs`
- Create: `docs/superpowers/plans/2026-07-15-eeocrm-enrichment-and-scoring.md`

1. Treat the current 117 records as a dated snapshot, not a live MCP connection.
2. Preserve raw input, add enrichment provenance and timestamps, and never overwrite official ClassIn fields with inferred web facts.
3. Define deterministic tags for region, academy/organization type, subject, lifecycle stage, engagement signals, and evidence strength.
4. Recompute score from explicit components. The current flat score of 25 on all 117 imported leads is not a usable ranking.
5. Use call/meeting/activity evidence when present; mark absent evidence as unknown rather than zero intent.
6. Run a dry report first, review aggregate changes, then persist idempotently with a correlation ID and sync log.
7. Keep eeoCRM writes disabled until a Mac-compatible MCP or service OAuth credential is available and verified read-only first.

## Task 7: Credential and IAM hygiene

**Files:**
- Modify: `docs/integration-inventory.md`
- Local-only credential files under `~/.openclaw` and `~/Downloads`

1. Fingerprint all OAuth client IDs and map each to Calendar Hub, OpenClaw Google Workspace, desktop Gmail, or unused.
2. Change retained credential files to mode `0600`; quarantine duplicate/unused downloads outside inbound media.
3. Remove the unused Editor service account role only after confirming no audit-log activity and no repository/runtime reference.
4. Restrict the broad Google API key by application or replace it with service-specific keys. Do not use an unrestricted key as OAuth substitute.
5. Record owner rationale. Do not remove either project Owner without an explicit ownership decision.

## Task 8: Final verification and honest handoff

**Files:**
- Modify: `docs/integration-inventory.md`
- Modify: `docs/README.md` only if the status map changes

1. Run targeted tests, full `npm test`, Hub build/typecheck, Engine build/typecheck, `npm run check:connections`, and the local control-plane verifier.
2. Re-read aggregate ledger counts and confirm no duplicate webhook/project/task rows were introduced.
3. Verify calendar reads for both accounts in the same bounded window and label them separately.
4. Publish a connection matrix with `live`, `snapshot`, `configured-only`, `degraded`, and `disabled` states.
5. Record remaining external blockers: production HTTPS callback, eeoCRM service credential/MCP binary, and any IAM owner decision.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET. Execute the control-plane tasks first; review the separate eeoCRM scoring plan before persisting score changes.
