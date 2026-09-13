# Moonlight MCP and Agent API

Codex and other local MCP clients can query Moonlight and perform bounded business commands. MCP and authenticated HTTP clients use the same `/api/agent/v1` services. Hub's Council screen can also submit durable jobs to the optional [Codex worker](../codex-worker/README.md).

## Local setup

Run `npm install` at the repository root. Apply only the new additive migrations after existing Moonlight schema migrations:

```sh
npm run db:migrate -- 20260913_0032_agent_commands.sql 20260913_0033_agent_jobs.sql
```

The migration command uses the configured Supabase Management API credential. Check the intended project before running it. It does not create example business records.

Configure Hub's private `apps/hub/.env.local`:

```dotenv
COM_MOON_AGENT_API_TOKEN=<distinct-random-secret>
COM_MOON_AGENT_ACTOR_ID=codex
COM_MOON_AGENT_SCOPES=read,tasks:write,contact-outcomes:write,jobs:read,jobs:write
COM_MOON_DEFAULT_WORKSPACE_ID=<existing-workspace-uuid>
COM_MOON_HUB_URL=http://localhost:3000
COM_MOON_ENGINE_URL=http://localhost:3001
COM_MOON_SHARED_WEBHOOK_SECRET=<existing-shared-secret>
```

Mirror workspace, actor, scopes and the shared webhook secret in Engine's private environment. The API token stays in Hub and the MCP client; Engine validates the shared secret and server-derived identity/scopes. Keep worker credentials distinct. Scope defaults to `read` when omitted; capability discovery reports grants separately from verified persistence.

Start Hub and Engine in separate terminals with `npm run dev:hub` and `npm run dev:engine`. For Codex, use its `config.toml` registration (replace absolute paths):

```toml
[mcp_servers.moonlight]
command = "/absolute/path/to/node"
args = ["--env-file=/absolute/path/to/moonlight/apps/hub/.env.local", "/absolute/path/to/moonlight/packages/mcp-server/src/index.js"]

[mcp_servers.moonlight.env]
COM_MOON_MCP_PROFILE = "core"
COM_MOON_MCP_API_MODE = "agent"
```

Node 22+ can load the ignored environment file without embedding secrets in client configuration. Restart the MCP connection after changing its environment/profile. Claude Code/Desktop can use equivalent `command` and `args` in their `mcpServers` configuration; `.mcp.json` is not Codex's configuration format.

Read-only connection diagnosis:

```sh
node --env-file=apps/hub/.env.local packages/mcp-server/src/doctor.js
```

It initializes the actual stdio protocol, discovers tools and performs a small read. Output includes discovered tool count, status, payload bytes and latency; it excludes row content and credentials. It neither writes a business record nor starts a model. `npm run mcp:doctor` automatically loads the local Hub environment file when present.

## Profiles and compatibility

The CLI defaults to `core` (8 tools). Select one profile with `COM_MOON_MCP_PROFILE`:

| Profile | Work |
| --- | --- |
| `core` | Health, daily brief, task list/detail/create/update/complete, receipt |
| `pms` | Task workflow plus project list/detail |
| `sales` | Follow-ups, work orders, actual contact outcome recording, revenue, receipt |
| `content` | Content queue and existing campaign command |
| `jobs` | Registered projects, job list/detail/start/cancel/resume |
| `all` | Every tool, including existing calendar/content aliases |

`COM_MOON_MCP_API_MODE=agent` uses the new API for overlapping task/project/work-order tools. `auto` selects it when the Agent token is configured and otherwise preserves the original routes. `legacy` retains those original bindings; new Agent-only tools still require the Agent token. Existing writes keep `COM_MOON_HUB_WRITE_SECRET` checks. Explicit `all` preserves tool discovery for clients that depended on the original 13 tools. Registration does not grant permissions.

The server uses stdio only. Public Streamable HTTP MCP hosting, hosted Responses API access to local stdio, and remote browser authentication are outside this implementation. Local production Hub access works on loopback. A remotely served Hub job screen requires a separately configured authenticated gateway that satisfies the existing Hub write guard; no secret is embedded in browser code.

## HTTP contract

Every v1 GET/POST requires `Authorization: Bearer <COM_MOON_AGENT_API_TOKEN>`. Workspace and actor come from server configuration, never request fields. Requests accept allowlisted fields/actions rather than SQL, arbitrary URLs or shell commands.

| Route | Purpose |
| --- | --- |
| `GET /capabilities` | Configuration, read probe, action scopes, worker liveness |
| `POST /query` | Tasks, projects, follow-ups or work orders |
| `GET /entities/{type}/{id}` | One task/project/work-order with exact version and text continuation |
| `POST /commands` | Create/update/complete task or record actual contact outcome |
| `GET /commands/{commandId}` | Recover a persisted command receipt |
| `GET /jobs` | Recent jobs; `?view=projects` lists registered project IDs |
| `POST /jobs` | Submit with stable `requestId` |
| `GET /jobs/{id}` | Durable state, checkpoint, result and reported usage |
| `GET /jobs/{id}/events?after=0` | Event page; `Accept: text/event-stream` enables cursor replay |
| `POST /jobs/{id}/cancel` | Cancel the observed `expectedTurnCount` |
| `POST /jobs/{id}/resume` | Continue with stable `requestId` and `expectedTurnCount` |

Route prefixes above are `/api/agent/v1`. Request body limits are 64 KiB, or 256 KiB for commands. The worker prompt limit is separately 16 KiB UTF-8. See [worker inputs and budgets](../codex-worker/README.md#durable-api-contract).

A narrow query example:

```json
{"resource":"tasks","detail":"rows","limit":20,"fields":["id","title","status","updatedAt"],"filters":{"status":"todo"}}
```

Resource field/filter definitions are exported from `@com-moon/agent-contracts`. Queries have `summary`, `rows`, `full` detail, limit 20 by default and 100 maximum, and signed cursors bound to workspace, scopes, filters and fields. Summary counts describe the returned page; `totalCount` stays null when not calculated. Task/project reads use server-side select/filter/limit, with process-local 15-second TTL/inflight caching. Write completion or receipt recovery invalidates cached reads. Detail reads are fresh; full text uses `nextSectionCursor` and checks the exact source revision.

Follow-ups are bounded lead/deal candidate pages with explicit inclusion/enrichment metadata. They are not a whole-ledger priority ranking or exact global total. Work orders currently lack an `updated_at` column, so their version availability is explicitly false. Body continuation rereads the selected source body to validate revision. Legacy revenue/content/calendar responses use a bounded projection after the old route reads; that reduces payload but does not establish lower database latency.

Responses preserve `live`, `preview`, `partial` and `error`. Read source failures may be HTTP 200 with `status:error`; consumers must inspect the envelope. MCP failures set `isError`; previews and partial results remain normal structured data. The v1 transport defaults to a 15-second timeout, configurable with `COM_MOON_MCP_TIMEOUT_MS` (maximum 120 seconds); legacy transport keeps its 60-second default. No write is automatically retried.

## Reliable commands

Generate one UUID before submitting a command and keep it across retries:

```json
{"commandId":"11111111-1111-4111-8111-111111111111","action":"update_task","targetId":"22222222-2222-4222-8222-222222222222","expectedUpdatedAt":"2026-09-13T01:00:00.123456+00:00","input":{"status":"doing"}}
```

Use `get_task` to obtain the exact database version. The same command ID and normalized content returns the original receipt; changed content under that ID or a stale version returns 409. Mutation and receipt share a database transaction. Creation uses the command UUID as the task ID. `record_contact_outcome` records contact the operator already performed; it does not send messages.

After timeout, query the receipt first. An absent receipt means the outcome is still unknown: an earlier transaction may be running. Recheck or reuse the same ID and unchanged input; creating a new ID can duplicate work. Only `persisted:true` establishes storage. Preview is `persisted:false`; uncertain outcomes are null. Job submission/resume uses the same stable-request principle and cancellation checks the observed turn.

## Verification and measurements

```sh
node --import ./scripts/register-hub-alias.mjs --test packages/mcp-server/src/*.test.mjs apps/hub/lib/agent/*.test.mjs packages/agent-contracts/*.test.mjs
npm test
npm run check:contracts
npm run typecheck
```

Tests include a real MCP SDK client/server child, actual PostgreSQL transaction/race checks on a disposable cluster, exact microsecond versions, Korean UTF-8 bounds, invalid cursors, cache races and unknown write responses. Worker contract tests use fake events/executables; they do not incur model usage.

A deterministic Korean task fixture shrank from 4,288,900 bytes to 15,782 bytes (99.63%). This is payload measurement, not token measurement or a live latency promise. Real model/cache usage stays null when not reported. The design's token and p95 latency targets remain measurement goals.

Local read timing (2026-09-13, loopback development Hub and the configured Supabase): 30 fresh reads of one task returned 748 bytes, p50 106 ms / p95 331 ms; 30 cached reads returned 748 bytes, p50 4 ms / p95 8 ms. All 60 reported live. This measures the narrow HTTP query after compilation, not model latency or a cold application start.
