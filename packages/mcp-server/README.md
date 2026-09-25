# Moonlight MCP and Agent API

Claude Code, Codex and other MCP clients can query Moonlight and perform bounded business commands — locally over stdio, or over authenticated Streamable HTTP for tools that cannot spawn a local process. MCP and authenticated HTTP clients use the same `/api/agent/v1` services. Hub's Council screen can also submit durable jobs to the optional [Codex worker](../codex-worker/README.md).

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
# Optional — one own token per MCP client, see Per-client identity below:
# COM_MOON_AGENT_CLIENT_TOKEN_HASHES=claude-code:<sha256hex>,codex:<sha256hex>
COM_MOON_AGENT_SCOPES=read,tasks:write,contact-outcomes:write,jobs:read,jobs:write
COM_MOON_DEFAULT_WORKSPACE_ID=<existing-workspace-uuid>
COM_MOON_HUB_URL=http://localhost:3000
COM_MOON_ENGINE_URL=http://localhost:3001
COM_MOON_SHARED_WEBHOOK_SECRET=<existing-shared-secret>
```

Mirror workspace, actor, scopes, the shared webhook secret and (when used) `COM_MOON_AGENT_CLIENT_TOKEN_HASHES` in Engine's private environment. The API token stays in Hub and the MCP client; Engine validates the shared secret and server-derived identity/scopes. Keep worker credentials distinct. Scope defaults to `read` when omitted; capability discovery reports grants separately from verified persistence.

Start Hub and Engine in separate terminals with `npm run dev:hub` and `npm run dev:engine`, then register the clients you use (see [Connecting AI clients](#connecting-ai-clients)):

```sh
npm run mcp:connect -- status --probe
npm run mcp:connect -- install claude-code claude-desktop codex
```

Restart the MCP connection after changing its environment/profile.

Read-only connection diagnosis:

```sh
node --env-file=apps/hub/.env.local packages/mcp-server/src/doctor.js
```

It initializes the actual stdio protocol, discovers tools and performs a small read. Output includes discovered tool count, status, payload bytes and latency; it excludes row content and credentials. It neither writes a business record nor starts a model. `npm run mcp:doctor` automatically loads the local Hub environment file when present.

## Connecting AI clients

Every client runs the same launcher, `bin/moonlight-mcp.js`, by absolute path. It finds the repository from its own location and reads `apps/hub/.env.local` itself, so a registration holds one path, no `cwd` and no `--env-file`. From that file it loads only `COM_MOON_HUB_URL`, `COM_MOON_HUB_WRITE_SECRET`, `COM_MOON_AGENT_API_TOKEN` and `COM_MOON_MCP_*`; model, OAuth and database secrets never enter the MCP process. Values already set in the client's `env` win over the file, and `COM_MOON_MCP_ENV_FILE` points at a different file.

```sh
node packages/mcp-server/bin/moonlight-mcp.js [--profile core|pms|sales|content|jobs|assistant|all] [--read-only]
```

`--read-only` keeps only tools annotated `readOnlyHint`, in any profile. Registrations made with `src/index.js` and `--env-file` keep working unchanged. `mcp:connect install` treats only an `--env-file` pointing at Hub's `apps/hub/.env.local` as legacy; any other env file (such as a private file holding just `COM_MOON_HUB_URL` and `COM_MOON_AGENT_API_TOKEN`) is carried over as `COM_MOON_MCP_ENV_FILE`, so the write secret never gets loaded behind your back.

`npm run mcp:connect` manages the `moonlight` entry in each client's own file:

| Client | File | Format |
| --- | --- | --- |
| `claude-code` | `<repo>/.mcp.json` (git-ignored) | `mcpServers` |
| `claude-desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json` (also Cowork sessions) | `mcpServers` |
| `codex` | `~/.codex/config.toml` | `[mcp_servers.moonlight]` |
| `cursor` | `~/.cursor/mcp.json` | `mcpServers` |
| `vscode` | `~/Library/Application Support/Code/User/mcp.json` | `servers` + `type` |
| `gemini` | `~/.gemini/settings.json` | `mcpServers` |

- `status` names the exact failure per client — missing executable, dead `cwd` or path, an nvm-pinned Node, or the legacy `--env-file` form that loads every Hub secret. `--probe` launches each registration as written (GUI clients with the minimal PATH a Dock-launched app gets) and lists its tools. It calls no tool. `--json` is machine-readable.
- `install <client…>` (or `--all` for every client whose file exists) rewrites only the launch keys: `command` becomes a Node that survives upgrades (Homebrew's `/opt/homebrew/bin/node` when present), `args` becomes the launcher plus `--profile`/`--read-only` carried over or given, and `cwd` is dropped. `env`, other servers, other settings and Codex's `startup_timeout_sec`/`enabled`/`[mcp_servers.moonlight.env]` stay as they were. The original is copied to `<file>.bak.<timestamp>`, the file mode is kept, and the new registration is probed. `--dry-run` shows the result without writing. Files it cannot map safely (JSON with comments, unusual TOML) are left untouched and a snippet is printed instead.
- Registrations always point at the main checkout. Run from a linked worktree, `install` still targets the main worktree, and refuses until the launcher exists there (after merge). `--root` overrides.
- `print <client>` prints the snippet for manual setup; `print <client> --http` prints the HTTP form (token read from `MOONLIGHT_MCP_TOKEN` or an input prompt, never inline).

Claude Desktop, Cursor and VS Code read their file at start; restart the app after `install`.

## Per-client identity

With one shared `COM_MOON_AGENT_API_TOKEN`, every command, job and local skill receipt records the actor `COM_MOON_AGENT_ACTOR_ID` (default `codex`) — including work Claude Code did. Give each client its own token so receipts name who acted:

1. Create one private env file per client. Each gets a new random 32-byte base64url `COM_MOON_AGENT_API_TOKEN` plus what the launcher would otherwise have loaded from Hub's env file: `COM_MOON_HUB_URL`, `COM_MOON_HUB_WRITE_SECRET` (legacy tools such as `get_daily_brief` still send it) and `COM_MOON_MCP_*` such as `COM_MOON_MCP_PROFILE`/`COM_MOON_MCP_API_MODE`. The file is mode 0600, must lie outside any checkout, and an existing file is kept unless `--force` (which rotates its token). The token is never printed — stdout is only the `actor:sha256hex` pair. `--hub-env FILE` copies from another Hub env file.

   ```sh
   npm run mcp:connect -- client-token claude-code --out ~/.moonlight/mcp/claude-code.env
   npm run mcp:connect -- client-token codex --out ~/.moonlight/mcp/codex.env
   npm run mcp:connect -- client-token claude-desktop --out ~/.moonlight/mcp/claude-desktop.env
   ```

2. Put the printed pairs, comma-separated, in Hub's env and Engine's env (locally both read the same `.env.local`), then restart Hub and Engine:

   ```dotenv
   COM_MOON_AGENT_CLIENT_TOKEN_HASHES=claude-code:<sha256hex>,codex:<sha256hex>,claude-desktop:<sha256hex>
   ```

3. Point each registration at its own file, then restart that client:

   ```sh
   npm run mcp:connect -- install claude-code --mcp-env-file ~/.moonlight/mcp/claude-code.env
   npm run mcp:connect -- install codex --mcp-env-file ~/.moonlight/mcp/codex.env
   npm run mcp:connect -- install claude-desktop --mcp-env-file ~/.moonlight/mcp/claude-desktop.env
   ```

   This writes `COM_MOON_MCP_ENV_FILE` into that one registration (the flag is not `--env-file` because Node validates that runtime flag anywhere on the command line). It refuses several clients or `--all`, a relative or missing path and Hub's own env file. A `COM_MOON_AGENT_API_TOKEN` left in the registration's `env` would win over the file, so install warns about it. `status` lists each client's env file.

4. In each client, `get_hub_health` reports `data.permissions.actorId`. Check it before relying on the client's receipts.

How the servers decide:

- Hub stores only digests. A bearer equal to `COM_MOON_AGENT_API_TOKEN` is the default actor — the Hub's own Codex jobs screen uses it. A bearer whose SHA-256 matches an entry is that entry's actor. Every entry is compared in constant time.
- The list is strict: each entry is `actor:<64 lowercase hex>` with an actor matching `^[a-zA-Z0-9._:@/-]{1,128}$`, no actor or digest twice, and no digest of the shared token. Unset or blank keeps the single shared identity. A malformed value closes the Agent API with 503 `agent-auth-not-configured` (Engine: `agent-engine-not-configured`) instead of silently dropping an identity. Engine accepts the default actor or a listed actor name in `x-com-moon-agent-actor`; digests are never credentials there, and the shared webhook secret is still required.
- Scopes are not per actor: every client gets `COM_MOON_AGENT_SCOPES`.
- Records belong to the actor that wrote them. `get_command_receipt` finds only the caller's own commands, so check a command made before switching tokens under the old identity. A job is listed, cancelled and resumed only by the actor that started it, and the Hub's Codex jobs screen acts as the default actor — keeping Codex's client actor `codex` keeps its jobs visible there; jobs started as `claude-code` are not. `record_skill_receipt` with a `commandId` needs a `complete_task` saved by the same client. Command IDs are idempotent per actor, so retry an unknown outcome from the same client.
- Rotate: `client-token <actor> --out <same file> --force`, replace that actor's pair, restart Hub, Engine and the client. Revoke: delete the pair.
- HTTP transport tokens (`token create`) only admit tools to `npm run mcp:http`; that process calls Hub with its own single Agent token, so its HTTP clients share one actor.

## HTTP transport (other tools)

For tools that cannot spawn a local process — automation services, remote agents, editors that prefer URLs — the same tools are served over [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http):

```sh
npm run mcp:connect -- token create n8n --profile sales --read-only   # token is printed once
npm run mcp:http                                                     # http://127.0.0.1:3333/mcp
```

Clients send `Authorization: Bearer <token>` with each POST.

- **One token per external tool.** The token decides the profile and read-only status; a fresh server is built per request (stateless), so one client's grant never reaches another's tool list. `~/.moonlight/mcp/clients.json` (mode 0600, override `COM_MOON_MCP_CLIENTS_FILE`) stores SHA-256 digests only. `token list`, `token revoke <name>` — revocation applies to the running server on the next request. An unreadable registry rejects everything.
- **Client tokens stop at the MCP process.** Hub calls use the MCP process's own `COM_MOON_AGENT_API_TOKEN`; Hub scopes still apply on top of the client's profile.
- **Loopback by default.** Other bind addresses need `--host` and print a warning. `Host` must be loopback or listed in `COM_MOON_MCP_ALLOWED_HOSTS`; a request carrying `Origin` must match `COM_MOON_MCP_ALLOWED_ORIGINS` (empty by default). This blocks DNS rebinding from browser pages.
- **Bounded.** POST only (GET/DELETE get 405, no server-initiated stream), 512 KiB bodies, 120 requests per minute per client (`COM_MOON_MCP_HTTP_RATE_PER_MIN`). `GET /healthz` answers without credentials and returns only name and version.
- **Audit.** stderr gets one line per request with client name, JSON-RPC method and tool name, HTTP status and latency. Arguments, results and tokens are not logged.
- **URL tokens, last resort.** Some hosted connectors have no field for headers. A client created with `--allow-url --read-only` may put its token in the path, `/mcp/<token>`. The URL then is the password and ends up in connector settings and proxy logs — [Claude's connector guidance](https://claude.com/docs/connectors/building/authentication) and the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#token-requirements) advise against credentials in URLs — so URL-token clients are always read-only (enforced at creation and per request). Revoke on any doubt.

| Variable | Default |
| --- | --- |
| `COM_MOON_MCP_HTTP_HOST` / `--host` | `127.0.0.1` |
| `COM_MOON_MCP_HTTP_PORT` / `--port` | `3333` |
| `COM_MOON_MCP_ALLOWED_HOSTS` | loopback names only |
| `COM_MOON_MCP_ALLOWED_ORIGINS` | none |
| `COM_MOON_MCP_HTTP_RATE_PER_MIN` | `120` |
| `COM_MOON_MCP_READ_ONLY=1` / `--read-only` | off; forces every client read-only |

Nothing here makes Moonlight reachable from the internet. Hosted services connect from their own cloud (Anthropic from `160.79.104.0/21`), so they need a public HTTPS URL — for example a Cloudflare Tunnel to `127.0.0.1:3333` with its hostname added to `COM_MOON_MCP_ALLOWED_HOSTS` — and Hub plus this process running on the machine behind it. As of 2026-09:

| Hosted client | Works with | Notes |
| --- | --- | --- |
| claude.ai / Desktop / mobile custom connector | Header token | [Request headers](https://claude.com/docs/connectors/custom/remote-mcp#authenticating-with-request-headers) is beta for a limited set of organizations: choose **No sign-in**, header `authorization`, value `Bearer <token>`. Without that section only OAuth remains, which this server does not implement. |
| ChatGPT developer mode | URL token (read-only) | [OAuth, No Authentication or Mixed](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt); no header field. |
| Automation and agent platforms with header support | Header token | Give each its own token and profile. |

## Profiles and compatibility

The CLI defaults to `core` (10 tools). Select one profile with `COM_MOON_MCP_PROFILE`:

| Profile | Work |
| --- | --- |
| `core` | Health, daily brief, task list/detail/create/update/complete, command receipt, local skill request/receipt |
| `pms` | Task workflow plus project list/detail |
| `sales` | Follow-ups, work orders, actual contact outcome recording, revenue, receipt |
| `content` | Content queue and existing campaign command |
| `jobs` | Registered projects, job list/detail/start/cancel/resume |
| `assistant` | 13 bounded context, goals, candidate, recovery and review tools |
| `all` | Every tool, including existing calendar/content aliases |

`COM_MOON_MCP_API_MODE=agent` uses the new API for overlapping task/project/work-order tools. `auto` selects it when the Agent token is configured and otherwise preserves the original routes. `legacy` retains those original bindings; new Agent-only tools still require the Agent token. Existing writes keep `COM_MOON_HUB_WRITE_SECRET` checks. Explicit `all` preserves tool discovery for clients that depended on the original 13 tools. Registration does not grant permissions.

Transports are stdio and local Streamable HTTP ([above](#http-transport-other-tools)). Internet-facing hosting, OAuth authorization for hosted connectors, and remote browser authentication are outside this implementation. Local production Hub access works on loopback. A remotely served Hub job screen requires a separately configured authenticated gateway that satisfies the existing Hub write guard; no secret is embedded in browser code.

## HTTP contract

Every v1 GET/POST requires `Authorization: Bearer <COM_MOON_AGENT_API_TOKEN>` or a client token listed in `COM_MOON_AGENT_CLIENT_TOKEN_HASHES` ([Per-client identity](#per-client-identity)). Workspace and actor come from server configuration, never request fields. Requests accept allowlisted fields/actions rather than SQL, arbitrary URLs or shell commands.

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
| `GET /skill-requests/{id}` | One operator-approved local skill request by exact ID (`read`) |
| `POST /skill-requests/{id}/receipts` | Record the actual local outcome (`tasks:write`): `state` completed/failed/unconfirmed, `summary` ≤2000 chars, `evidence` ≤8 `{kind: path|url|note, value}` (completed needs ≥1), optional `commandId` of a same-task `complete_task` (completed only). Never completes the task |

Route prefixes above are `/api/agent/v1`. Request body limits are 64 KiB, 256 KiB for commands, and 16 KiB for skill-request receipts. The worker prompt limit is separately 16 KiB UTF-8. See [worker inputs and budgets](../codex-worker/README.md#durable-api-contract).

A narrow query example:

```json
{"resource":"tasks","detail":"rows","limit":20,"fields":["id","title","status","updatedAt"],"filters":{"status":"todo"}}
```

Resource field/filter definitions are exported from `@com-moon/agent-contracts`. Queries have `summary`, `rows`, `full` detail, limit 20 by default and 100 maximum, and signed cursors bound to workspace, scopes, filters and fields. Summary counts describe the returned page; `totalCount` stays null when not calculated. Task/project reads use server-side select/filter/limit, with process-local 15-second TTL/inflight caching. Write completion or receipt recovery invalidates cached reads. Detail reads are fresh; full text uses `nextSectionCursor` and checks the exact source revision.

Follow-ups are bounded lead/deal candidate pages with explicit inclusion/enrichment metadata. They are not a whole-ledger priority ranking or exact global total. Work orders currently lack an `updated_at` column, so their version availability is explicitly false. Body continuation rereads the selected source body to validate revision. Legacy revenue/content/calendar responses use a bounded projection after the old route reads; that reduces payload but does not establish lower database latency.

Responses preserve `live`, `preview`, `partial` and `error`. Read source failures may be HTTP 200 with `status:error`; consumers must inspect the envelope. MCP failures set `isError`; previews and partial results remain normal structured data. The v1 transport defaults to a 15-second timeout, configurable with `COM_MOON_MCP_TIMEOUT_MS` (maximum 120 seconds); legacy transport uses a 90-second default to allow advisor generation. No write is automatically retried.

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

## Advisor compatibility

Use `--profile all` to expose the existing advisor tools along with the scoped tools. Advisor calls require `COM_MOON_HUB_WRITE_SECRET`, Hub → Engine shared-secret configuration and the Engine model provider. The Agent API token alone does not authorize these legacy generations.

## Advisor operating contract

- `request_council`: one Gemini generation using a selected Writer/Strategist/Analyst
  lens, **not independent agents debating**. Personal brand/project/campaign context.
  Modes: `brand-strategy`, `content-critique`, `audience-analysis`, `meeting-synthesis`, `flow-review`.
- `request_sales_mentor`: Guru uses the existing **ClassIn/company** sales context.
  It is not a personal-business sales coach yet. Modes: `pipeline-triage`, `deal-review`,
  `proposal-critique`, `weekly-retro`.
- Both accept an optional exact `ref` (1–300 characters) and `draft` (up to 16,000 characters)
  through MCP. Prefer one decision and a precise existing entity ID per call.
- Council MCP defaults `createWorkOrder: false`; `true` additionally proposes an approval
  order and links `work_orders.run_id` when memory persisted. Direct Hub API callers that
  omit the flag retain the existing UI behavior (`true`). Guru does not create an order.
- Inspect `status`, `runId`, and Council's `memory`/`workOrder` receipts separately.
  `generated` is advice, not saved memory, an approved order, or executed work.
  `202 preview` is recorded as `needs_human`, never a successful generation.
- `list_agent_runs` accepts `agent`, exact `ref`, and `limit` (1–50; default 10).
  The returned recommendations are compact snapshots, not guaranteed full transcripts.
- `get_weekly_report` accepts `scope: personal | company` (default personal). It measures
  seven completed local calendar days and retains missing values, definitions and bounded
  source evidence. Goal details use `get_goals`; contract amounts are not cash receipts.
- A Hub request has a 90-second timeout; Hub's Engine fetch has a 60-second timeout.
  No automatic retries. A timeout does not prove the write or generation did not happen.
  Read the run/order ledger before deciding whether another paid call is justified.
- Tools return JSON text plus `structuredContent` for object responses. HTTP/transport
  failures and explicit body errors use `isError`. Preview is retained as preview.
  Read/write annotations are client hints, not an authorization boundary.
- `decide_work_order(approved)` does not dispatch a generic executor. External sends,
  publication and company-system writes remain separate, explicitly authorized actions.

Full Korean playbook: [Agent/Council API·MCP operating plan](../../docs/agent-council-api-mcp-operating-plan-2026-09-09.md).

## Advisor limitations

- Internet-facing MCP hosting and OAuth. Local Streamable HTTP is available (see [HTTP transport](#http-transport-other-tools)); the authenticated HTTP Agent API is available separately.
- Independent execution endpoints for each of the five persona roles.
- The legacy advisor requests do not have durable request idempotency, asynchronous
  generation jobs, enforced spend caps, or a generic executor triggered by approval.
  Run/proposal/count writes are not atomic. Codex jobs use the separate durable worker path.

Protocol reference: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).


## Source-backed assistance and measurable goals

The [setup and recovery guide](../../docs/measurable-personal-os-operations.md) includes
copyable configurations for all three clients with a separate private MCP environment file.

The `assistant` profile works with any local stdio MCP client, including Codex,
Claude Desktop/Code and Antigravity. Register the launcher shown under
[Connecting AI clients](#connecting-ai-clients), with `COM_MOON_MCP_PROFILE=assistant` and
`COM_MOON_MCP_ENV_FILE` pointing at the private environment file. Antigravity's current global
configuration is `~/.gemini/config/mcp_config.json`, or `.agents/mcp_config.json`
in the workspace, under `mcpServers`. See the [official Antigravity MCP guide](https://antigravity.google/docs/mcp).
No client configuration is changed by installing this package.

Apply additive migrations **0036 then 0037** only to the intended database.
Existing `read` grants allow context and goal reads. Explicit `goals:write` and
`ai:write` grants enable their respective commands; registration does not add
those scopes. The browser uses the existing Hub write guard. Agent bearer tokens
never replace that guard on browser routes.

The small profile includes `get_hub_health`, `get_work_context`, `search_knowledge`,
`get_weekly_report`, `get_ai_candidate`, `get_goals`, `record_goal_command`, `get_goal_receipt`,
`save_ai_candidate`, `request_ai_assist`, `record_assist_outcome`,
`recover_ai_candidate` and `get_assistance_receipt`.

- Read one exact task, project or content item with its `scope`, source revision
  and linked goals. Content context means saved source idea/summary; unsaved
  Studio edits and channel variant bodies are not included. Goals are bounded
  to three objectives/eight metrics; missing measurements stay missing.
- `get_goals` pages objectives; pass an `objectiveId` for metric details and latest
  measurements. Follow `nextCursor` without changing the filters. Full observation
  history remains in Hub, with truncation declared in the Agent response.
- Let the current subscription client draft or analyze, then use
  `save_ai_candidate` with the exact source version. This invokes no Gemini model.
  Its provider/client/model attribution is client-reported; usage is unknown.
- Alternatively, `request_ai_assist` performs one configured **Gemini API** call
  for `draft`, `rewrite`, `critique` or `analyze`. API credentials/billing are
  separate from consumer subscriptions; verify the actual project in
  [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing).
- Candidates are not applied edits, approved publications, sent messages or
  achieved goals. Studio's existing candidate application and revision restore
  remain available separately. This generic assistance panel does not apply text.
- Record an actual review as accepted/edited/rejected. Baseline, review and other
  work minutes are optional. Other work includes prompting, execution and rework,
  excluding review. Time difference is baseline minus review minus other work;
  any missing input makes it unknown. This excludes system setup/maintenance.

All mutations use a stable `commandId`. Same ID/content replays; changed content
conflicts. A durable claim happens before model generation. Unknown/running
responses never permit an automatic paid retry. Check the matching receipt.
A generated result whose final save failed returns `unsaved`, a bounded result preview,
and a signed compressed recovery token (24 hours) containing the complete result. Preserve both. `recover_ai_candidate`
saves that verified result without invoking the provider. Tokens are bound to the
workspace, actor and original candidate; arbitrary client output cannot acquire
verified Gemini provenance. The Hub panel preserves pending requests/results in
session storage and offers the same save-only recovery.

Candidate context lists at most three recent candidates without duplicated source
snapshots. Serialized context is bounded; output excerpts declare outputTruncated.
Use get_ai_candidate with nextOffset and outputHash to reconstruct full saved text
in bounded sections. The Hub panel offers the same read continuation. Actual Gemini model and reported usage are retained; absent usage is
null, not zero. Currency cost and account-wide hard spending caps are not computed
or enforced by these tools. Gemini generation has a 45-second provider timeout;
the MCP assist transport allows 90 seconds. No automatic retries are introduced.
