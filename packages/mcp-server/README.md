# @com-moon/mcp-server

MCP server that exposes Moonlight Hub actions as tools, so an MCP-compatible Codex
or Claude client can read and act on the same live data the Hub UI shows — without
a bespoke webhook per feature.

## What this is (and isn't)

- **Transport: stdio only.** This runs as a local child process launched by an MCP
  client (Claude Code, Claude Desktop). It is not a network-reachable server.
- **This does not make claude.ai's web chat able to reach Moonlight.** claude.ai
  connectors need a remote server (Streamable HTTP/SSE transport, hosted somewhere,
  with its own auth for random internet clients). That's a separate follow-up —
  intentionally not built here, since exposing write-capable tools on a public
  endpoint is a different risk profile than a local stdio process a trusted client
  spawns on your own machine.
- It is a thin adapter: every tool calls an existing `apps/hub` route
  (`/api/hub/*`, `/api/calendar/google/event`) and forwards that route's own
  `status` field (`live` / `preview` / `saved` / `error` / ...) verbatim. It does not
  invent new status semantics or fabricate data when a route reports `preview`.

## Setup

1. `npm install` at the repo root (picks this package up via the `packages/*` workspace).
2. Env vars (same names as `apps/hub/.env.example`):
   - `COM_MOON_HUB_URL` — defaults to `http://localhost:3000`.
   - `COM_MOON_HUB_WRITE_SECRET` — required for write tools and both advisor requests.
     Must match the Hub's own secret. Without it, writes return an MCP tool error
     without making a request. Advisor calls can incur model API charges.
   - Read-only tools work with just `COM_MOON_HUB_URL` set.

## Client registration

Register a **local stdio process** in the client's supported configuration UI or CLI.
Use an absolute script path; the process does not need a particular working directory.
The JSON below illustrates the common `mcpServers` shape, not a universal config format
or config-file location for every client:

```json
{
  "mcpServers": {
    "moonlight": {
      "command": "node",
      "args": ["/absolute/path/to/moonlight_proj/packages/mcp-server/src/index.js"],
      "env": {
        "COM_MOON_HUB_URL": "http://localhost:3000",
        "COM_MOON_HUB_WRITE_SECRET": "<supply securely; never commit a real secret>"
      }
    }
  }
}
```

Omit the write secret for a read-only first connection. Hub must be running separately.
Advisor calls additionally need Hub → Engine shared-secret configuration and the Engine's
model-provider configuration. MCP does not reuse the client's subscription to pay for
Engine API generations. This package does not configure a client or start Hub/Engine.

## Tools

| Tool | Type | Wraps |
| --- | --- | --- |
| `get_daily_brief` | read | `GET /api/hub/daily-brief` |
| `list_agents` | read | `GET /api/hub/agents` |
| `list_agent_runs` | read | `GET /api/hub/agent-runs` |
| `get_weekly_report` | read | `GET /api/hub/weekly-report` |
| `request_council` | write / generation | `POST /api/hub/brand-mentor` |
| `request_sales_mentor` | write / generation | `POST /api/hub/sales-mentor` |
| `list_work_orders` | read | `GET /api/hub/work-orders` |
| `decide_work_order` | write | `POST /api/hub/work-orders` |
| `list_projects` | read | `GET /api/hub/projects` |
| `list_tasks` | read | `GET /api/hub/tasks` |
| `create_task` | write | `POST /api/hub/tasks` |
| `get_revenue` | read | `GET /api/hub/revenue` |
| `list_calendar_events` | read | `GET /api/calendar/google/event` |
| `create_calendar_event` | write | `POST /api/calendar/google/event` |
| `get_content_queue` | read | `GET /api/hub/content` |
| `get_content` | read | `GET /api/hub/content` |
| `create_campaign` | write | `POST /api/hub/content` (`action: "campaign"`) |

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
- `get_weekly_report` accepts `scope: personal | company` (default personal). The campaign
  scorecard is a manual current snapshot, not dated week history or cash accounting.
- A Hub request has a 90-second timeout; Hub's Engine fetch has a 60-second timeout.
  No automatic retries. A timeout does not prove the write or generation did not happen.
  Read the run/order ledger before deciding whether another paid call is justified.
- Tools return JSON text plus `structuredContent` for object responses. HTTP/transport
  failures and explicit body errors use `isError`. Preview is retained as preview.
  Read/write annotations are client hints, not an authorization boundary.
- `decide_work_order(approved)` does not dispatch a generic executor. External sends,
  publication and company-system writes remain separate, explicitly authorized actions.

Full Korean playbook: [Agent/Council API·MCP operating plan](../../docs/agent-council-api-mcp-operating-plan-2026-09-09.md).

## Not included yet

- Remote/HTTP transport for claude.ai connector access (see above).
- Independent execution endpoints for each of the five persona roles.
- Durable request idempotency, asynchronous generation jobs, enforced spend caps, or a
  generic executor triggered by approval. Run/proposal/count writes are not atomic.

Protocol reference: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
