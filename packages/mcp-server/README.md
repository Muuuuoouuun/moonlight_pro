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

## Error contract

Tool failures are real MCP errors (`isError`), not data. Three outcomes are kept apart:

| Outcome | Result | Example message |
| --- | --- | --- |
| Hub unreachable / timeout | `isError` | `Hub(http://localhost:3000)에 연결할 수 없습니다 (ECONNREFUSED) … npm run dev:hub로 먼저 띄우세요` |
| HTTP 4xx/5xx | `isError` | `Hub 요청 실패 (HTTP 401) … 조치: COM_MOON_HUB_WRITE_SECRET이 Hub의 값과 같은지 확인하세요` |
| 200 with `status: "error"` | `isError` | route error text, `retryable` preserved |
| 200 with `status: "preview"` | **normal result** | an honest "not connected" answer is never an error |

That last row is the contract that matters: this server never turns a route’s honest
`preview` into a failure, and never lets a real failure pass as data.

Requests time out after 60s (`COM_MOON_MCP_TIMEOUT_MS` to change).

## Setup

1. `npm install` at the repo root (picks this package up via the `packages/*` workspace).
2. Env vars (same names as `apps/hub/.env.example`):
   - `COM_MOON_HUB_URL` — defaults to `http://localhost:3000`.
   - `COM_MOON_HUB_WRITE_SECRET` — required for write tools (`decide_work_order`,
     `create_task`, `create_calendar_event`, `create_campaign`). Must match the Hub's own
     `COM_MOON_HUB_WRITE_SECRET`. Without it, write tools throw a clear error instead
     of silently no-op'ing or hitting the Hub's 401.
   - Read-only tools work with just `COM_MOON_HUB_URL` set.

## Register with Codex or Claude Code

Add the stdio server to your client's MCP config. For Claude Code, use
`~/.claude/mcp.json` or a project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "moonlight": {
      "command": "node",
      "args": ["packages/mcp-server/src/index.js"],
      "cwd": "/absolute/path/to/moonlight_pro",
      "env": {
        "COM_MOON_HUB_URL": "http://localhost:3000",
        "COM_MOON_HUB_WRITE_SECRET": "same value as apps/hub's COM_MOON_HUB_WRITE_SECRET"
      }
    }
  }
}
```

## Register with Claude Desktop

Same shape, in Claude Desktop's `claude_desktop_config.json` under `mcpServers`.

## Tools

| Tool | Type | Wraps |
| --- | --- | --- |
| `get_daily_brief` | read | `GET /api/hub/daily-brief` |
| `list_agents` | read | `GET /api/hub/agents` |
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

## Not included yet

- Remote/HTTP transport for claude.ai connector access (see above).
- Per-persona live chat (Guru is live in the Hub UI itself, but isn't exposed as an
  MCP tool here — talking to Guru through this server would need its own tool wrapping
  `requestGuruCoaching`, not done in this pass).
