# Optional local Codex worker

This package runs one leased Moonlight job at a time on an operator's Mac or Linux host. Nothing starts at install, Hub startup, or build. It uses the official TypeScript SDK **0.154.0**, including that package's pinned **0.154.0** CLI; the desktop application's installed CLI is not selected. There is no App Server adapter, and desktop conversation history is not automatically shared.

## Configuration and explicit start

1. Apply `supabase/migrations/20260913_0033_agent_jobs.sql` to the intended database after the existing `workspaces` and `agent_runs` migrations. Hub and Engine use their existing service-role Supabase configuration. The worker never receives that database key.
2. Configure the same `COM_MOON_CODEX_PROJECTS_JSON` registry in Hub, Engine and the local worker. The path values are used only on the worker's host. Hub returns IDs, labels, modes and reference IDs to callers.
3. Set `COM_MOON_CODEX_WORKER_TOKEN` to a distinct credential in Engine and the worker. It must differ from Agent API and shared webhook secrets. Engine also needs `COM_MOON_DEFAULT_WORKSPACE_ID`; it exclusively derives the workspace from that setting. Optional `COM_MOON_CODEX_WORKER_ID` defaults to `local-codex` in Engine.
4. Give the worker a dedicated `COM_MOON_CODEX_HOME` outside every registered checkout and different from the operator's Codex home. Authenticate the bundled CLI in that home before starting, or provide the worker-only `COM_MOON_CODEX_API_KEY`. Keep this home persistent so recorded thread IDs remain resumable. The worker does not copy existing credentials or perform login for you.
5. Set `COM_MOON_CODEX_ENGINE_URL` (default `http://localhost:3001`). Non-local URLs require HTTPS. `COM_MOON_CODEX_MODEL` is optional; omitting it preserves the SDK's configured default without choosing a model on the operator's behalf.
6. Run `npm --workspace @com-moon/codex-worker run check`, then explicitly run `npm --workspace @com-moon/codex-worker start` when execution is intended. `check` verifies directories and configuration without calling a model, claiming work, or authenticating. It may create the dedicated runtime directory. Shell environment variables must be exported before launch; this package does not automatically load `.env` files.

Example registry (replace paths with operator-approved directories):

```json
{
  "moonlight": {
    "label": "Moonlight",
    "path": "/absolute/path/to/moonlight",
    "applyPath": "/absolute/path/to/moonlight-worker-worktree",
    "modes": ["read", "draft", "apply"],
    "contextRefs": { "design": "DESIGN.md" }
  }
}
```

`applyPath` must be an existing, separate Git worktree of `path`, registered by the operator. A new apply job requires a clean worktree. The worker creates no branches, resets no files, merges nothing and pushes nothing. After reviewing a completed change, the operator prepares a clean worktree for the next distinct job. Read and draft jobs use `path`; draft artifacts are returned as bounded result text.

### Bundled CLI authentication

From the repository root, define this shell helper. It reads the ignored `.env.codex-worker.local`, selects the installed pinned CLI directly, and passes only the dedicated home and executable search path to authentication commands. It does not copy the operator's Codex login or configuration.

```sh
moonlight_codex_auth() {
  node --env-file=.env.codex-worker.local --input-type=module -e '
    import { spawnSync } from "node:child_process";
    const runtimeHome = process.env.COM_MOON_CODEX_HOME;
    if (!runtimeHome) throw new Error("COM_MOON_CODEX_HOME is required");
    const result = spawnSync(process.execPath,
      ["./node_modules/@openai/codex/bin/codex.js", "login", ...process.argv.slice(1)],
      { stdio: "inherit", env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        HOME: runtimeHome,
        CODEX_HOME: runtimeHome
      } });
    process.exitCode = result.status ?? 1;
  ' -- "$@"
}
```

Check that dedicated login without starting a worker or model:

```sh
moonlight_codex_auth status
```

To authenticate the dedicated runtime, explicitly start device login and follow the CLI's instructions:

```sh
moonlight_codex_auth --device-auth
```

Both `login status` and `login --device-auth` are supported by the bundled CLI 0.154.0. The status command was checked against an empty temporary runtime home; device login was verified through the installed CLI's help, without initiating sign-in. Logging in does not start the worker.

## Execution controls

Read and draft request the SDK's `read-only` sandbox. Apply requests `workspace-write` for the registered separate worktree. Approvals are `never`; network, web search, apps, hooks and remote plugin discovery are disabled, and `/tmp` and `$TMPDIR` are excluded as additional write roots. The runtime supplies a minimal environment, isolates `HOME`/`CODEX_HOME`, excludes credential variables from tool shells, and marks the project untrusted so project-scoped configuration is not loaded. It rejects Codex configuration/hooks/plugins/skills in its dedicated home and project ancestor `.codex` directories, plus system Codex configuration. The operator's own `~/.codex` is excluded from this ancestor check only when it is outside the registered Git repository: the SDK uses its separate home, and the pinned CLI does not load that ancestor as project configuration. A home directory registered as the repository itself is still rejected if it contains `.codex`. A machine with centrally managed Codex configuration should use a separately isolated host instead of weakening these checks.

These are the pinned CLI's sandbox controls, not a custom operating-system filesystem jail. In particular, `read-only` prevents writes; it does not claim that every read is confined to the repository. Keep sensitive files outside the worker account's readable filesystem when read isolation is required. This P2 worker deliberately has no inherited Moonlight MCP write tools or other external integrations. It can return findings/drafts and make local worktree changes; authenticated Moonlight business writes use the separate Agent command API.

Each execution runs in a dedicated child process group. The wall-clock timer passes an actual `AbortSignal` to `runStreamed`; after a five-second shutdown grace period the supervisor kills the group and waits for exit before accepting another job. The supervisor persists terminal state after the SDK child exits and the remaining process group is cleaned up. SIGINT/SIGTERM also stop the active child. A hard termination of the supervisor or host crash is recovered through lease expiry. Cancellation does not undo files or business changes already made.

Budgets apply to each execution attempt: 10–3600 wall-clock seconds (default 600), at most 200 SDK events, one execution at a time, and 1–10 explicit turns per job (default 3). `maxTokens` is a **soft** threshold assessed only when the SDK reports usage, which is normally at turn completion. It cannot prevent already-incurred token usage. Unknown usage remains `null`, with `usageReason: "not-reported"`; partial SDK usage keeps missing fields null. Usage keys are `inputTokens`, `outputTokens`, `cachedInputTokens`, `cacheWriteInputTokens`, and `reasoningOutputTokens`.

Inputs allow a 16 KiB UTF-8 prompt, up to eight registered reference IDs, 8 KiB per referenced file and 24 KiB total reference content. Reference paths are resolved against the selected checkout and symlink escapes are rejected. Final text is capped at 16 KiB, SDK message events at 8 KiB, and checkpoints at 8 KiB. Command stdout/stderr, tool arguments/results and reasoning are excluded from the shared event ledger. A project's normal Codex instructions and files can still contribute model context independently of the reference-text budget.

## Durable API contract

The common Hub service is `handleAgentJob(action,input,context)`, where only authenticated `context` supplies workspace, actor and scopes. Reads require `jobs:read`; submit/cancel/resume require `jobs:write`. Workspace and actor fields, arbitrary cwd, shell commands and unregistered reference paths are rejected.

| Action | Input |
| --- | --- |
| `projects` | `{}` |
| `list` | `{ "limit": 20 }` (maximum 20, bounded summaries) |
| `submit` | `{ "requestId": "UUID", "projectId": "moonlight", "mode": "read", "prompt": "Review…", "contextRefs": ["design"], "budget": { "wallClockSeconds": 600, "maxTokens": null, "maxTurns": 3 }, "queueIfOffline": false }` |
| `get` | `{ "id": "job UUID" }` |
| `events` | `{ "id": "job UUID", "after": 0, "limit": 50 }` |
| `cancel` | `{ "id": "job UUID", "expectedTurnCount": 1 }` |
| `resume` | `{ "id": "job UUID", "requestId": "new UUID", "expectedTurnCount": 1, "prompt": "Continue the same task…", "queueIfOffline": false }` |

Submit retries must reuse the same `requestId` and content. A changed payload under an existing ID returns `409 request-conflict`. Resume also has a durable request receipt: retrying it after the continuation finishes does not create another turn. Reuse its request ID after a lost response. Cancellation is idempotent within the supplied turn; an outdated `expectedTurnCount` returns `409 stale-job-turn`.

All caller reads and controls are scoped to both workspace and actor. Events have monotonically increasing `seq` values; `after` returns only later events and supplies `nextAfter`/`hasMore` for SSE replay or polling. Event appends deduplicate the worker's stable event ID within its fenced lease. Terminal jobs link to a summary in the existing `agent_runs` ledger.

Worker heartbeat is current for 60 seconds; it means that the process and registry are reachable, not that provider authentication or model quota was verified. Leases last 90 seconds and renew every 15 seconds during execution. Submission while the target worker is unavailable requires explicit `queueIfOffline: true`. Read jobs can automatically retry once after lease expiry. Draft/apply jobs and exhausted read retries become `needs_attention`. Resume of an interrupted draft/apply additionally requires:

```json
{
  "reconciliation": {
    "confirmed": true,
    "checkedThreadId": "the job's saved threadId, or null if none was recorded",
    "note": "Reviewed the stopped worker, saved thread, command receipts and changed files; safe next action is …"
  }
}
```

The note and actor are recorded; the service verifies the supplied thread ID and current job turn. The operator must actually stop/reconcile the old execution before confirming. This is not an automated claim that external state has been inspected. A missing local thread fails visibly and never silently starts an unrelated replacement thread.

## Verification without model calls

```sh
node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/agent/jobs.test.mjs apps/engine/lib/agent-worker.test.mjs packages/codex-worker/*.test.mjs
CODEX_JOBS_POSTGRES_TEST=1 node --test packages/codex-worker/jobs.postgres.test.mjs
```

The PostgreSQL suite starts a disposable cluster on a private Unix socket, uses no hosted database, and removes the cluster afterward (`initdb`, `pg_ctl`, `psql` required). Tests inject SDK events and fake transport; the installed-SDK contract test uses a temporary executable that emits fixture JSON and never calls a model. A real child that ignores cancellation verifies the process watchdog.

Official contract references: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), and [sample configuration](https://learn.chatgpt.com/docs/config-file/config-sample). Current documentation may describe newer interfaces; this package is checked against the installed 0.154.0 SDK/runtime pair.
