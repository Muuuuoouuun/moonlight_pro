import { z } from "zod";

import { hasWriteSecret, hubGet, hubPost } from "./hub-client.js";

function jsonResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// Single exit point for every tool. `hubGet`/`hubPost` classify the outcome; this
// turns a failure into a real MCP error instead of handing the caller a 401 body that
// reads like data. A route's honest `preview` is never a failure and passes through.
function toolResult(result) {
  if (result.ok) {
    return jsonResult(result.data);
  }

  return errorResult(result.error);
}

// Every write tool refuses up front if COM_MOON_HUB_WRITE_SECRET isn't configured,
// instead of letting the Hub route's 401/403 read like a broken tool. Returns a tool
// result to hand back, or null when writes are allowed — the same guard shape as
// apps/hub's own `assertHubWriteAllowed`.
function requireWriteSecret() {
  if (hasWriteSecret()) {
    return null;
  }

  return errorResult(
    "COM_MOON_HUB_WRITE_SECRET is not set for this MCP server — write actions are disabled. " +
      "Set it to the same value as apps/hub's COM_MOON_HUB_WRITE_SECRET to enable writes.",
  );
}

export function registerMoonlightTools(server) {
  server.registerTool(
    "get_daily_brief",
    {
      title: "Get Daily Brief",
      description:
        "Read today's Moonlight brief: signals (what needs a decision), metrics, today's blocks, " +
        "and per-source live/preview status. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/daily-brief");
      return toolResult(result);
    },
  );

  server.registerTool(
    "list_agents",
    {
      title: "List Agent Personas",
      description:
        "List the 5 seeded personas (order/sales/content/production/review) with their role, " +
        "current status, and most recent agent_runs activity, plus the work-order queue summary. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/agents");
      return toolResult(result);
    },
  );

  server.registerTool(
    "list_work_orders",
    {
      title: "List Work Orders",
      description:
        "List work orders (persona-proposed actions) from the approval queue, optionally filtered by status. Read-only.",
      inputSchema: {
        status: z
          .enum(["proposed", "approved", "executed", "dismissed"])
          .optional()
          .describe("Filter by status. Omit to list all."),
      },
    },
    async ({ status }) => {
      const result = await hubGet("/api/hub/work-orders", { status });
      return toolResult(result);
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description:
        "Read Moonlight projects, task counts, progress, next actions, and recent updates from the shared Supabase ledger. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/projects");
      return toolResult(result);
    },
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description:
        "Read Moonlight tasks across projects from the same ledger used by Work OS and Projects. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/tasks");
      return toolResult(result);
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description:
        "Create a task in the Moonlight ledger. WRITE: requires COM_MOON_HUB_WRITE_SECRET. Use projectId when the task belongs to an existing project.",
      inputSchema: {
        title: z.string().min(1).max(300),
        projectId: z.string().optional(),
        areaId: z.string().optional(),
        status: z.enum(["inbox", "todo", "doing", "blocked", "done"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        nextAction: z.string().max(1000).optional(),
        dueAt: z.string().optional().describe("ISO datetime."),
      },
    },
    async ({ title, projectId, areaId, status, priority, nextAction, dueAt }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      const result = await hubPost("/api/hub/tasks", {
        title,
        projectId,
        areaId,
        status,
        priority,
        nextAction,
        dueAt,
        source: "mcp",
      });
      return toolResult(result);
    },
  );

  server.registerTool(
    "get_revenue",
    {
      title: "Get Revenue Ledger",
      description:
        "Read the Moonlight revenue ledger: leads, deals, accounts, operation cases, stages, and summary. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/revenue");
      return toolResult(result);
    },
  );

  server.registerTool(
    "decide_work_order",
    {
      title: "Decide Work Order",
      description:
        "Approve, dismiss, or mark a work order executed — the same one-click decision the Orders " +
        "screen makes. WRITE: requires COM_MOON_HUB_WRITE_SECRET. When moving to 'executed' for an " +
        "outreach-style order, pass outcome to close the learning loop.",
      inputSchema: {
        id: z.string().describe("Work order id."),
        status: z.enum(["approved", "dismissed", "executed"]),
        outcomeAction: z
          .string()
          .optional()
          .describe("e.g. 'sent' | 'replied' | 'meeting' | 'no_response' — only used when status is 'executed'."),
        outcomeNote: z.string().optional(),
      },
    },
    async ({ id, status, outcomeAction, outcomeNote }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      const outcome = outcomeAction ? { action: outcomeAction, note: outcomeNote || null } : undefined;
      const result = await hubPost("/api/hub/work-orders", { id, status, outcome });
      return toolResult(result);
    },
  );

  server.registerTool(
    "list_calendar_events",
    {
      title: "List Calendar Events",
      description:
        "List Google Calendar events in a time range (defaults to the next 7 days from now). " +
        "Honestly returns status:'preview' if Google Calendar isn't connected — does not fabricate events. Read-only.",
      inputSchema: {
        timeMin: z.string().optional().describe("ISO datetime. Defaults to now."),
        timeMax: z.string().optional().describe("ISO datetime. Defaults to timeMin + 7 days."),
      },
    },
    async ({ timeMin, timeMax }) => {
      const min = timeMin || new Date().toISOString();
      const max = timeMax || new Date(new Date(min).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await hubGet("/api/calendar/google/event", { timeMin: min, timeMax: max });
      return toolResult(result);
    },
  );

  server.registerTool(
    "create_calendar_event",
    {
      title: "Create Calendar Event",
      description:
        "Create a real Google Calendar event when connected. WRITE: requires COM_MOON_HUB_WRITE_SECRET. " +
        "Returns status:'preview' (not an error) if Google Calendar isn't connected — the event was not created.",
      inputSchema: {
        title: z.string(),
        startAt: z.string().describe("ISO datetime."),
        endAt: z.string().optional().describe("ISO datetime. Defaults to startAt + 1 hour."),
        description: z.string().optional(),
        location: z.string().optional(),
        allDay: z.boolean().optional(),
      },
    },
    async ({ title, startAt, endAt, description, location, allDay }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      const resolvedEnd = endAt || new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
      const result = await hubPost("/api/calendar/google/event", {
        title,
        startAt,
        endAt: resolvedEnd,
        description,
        location,
        allDay,
      });
      return toolResult(result);
    },
  );

  server.registerTool(
    "get_content_queue",
    {
      title: "Get Content Queue",
      description:
        "Read the Content OS publishing queue, pipeline, attention items, summary, idea queue, and cadence. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/content");
      return toolResult(result);
    },
  );

  server.registerTool(
    "get_content",
    {
      title: "Get Content Ledger",
      description:
        "Read the Content OS state: publish queue, campaigns, idea queue, and cadence. Read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await hubGet("/api/hub/content");
      return toolResult(result);
    },
  );

  server.registerTool(
    "create_campaign",
    {
      title: "Create Campaign",
      description:
        "Create a campaign in the Content/Campaigns war room list (top-level record only — the deep " +
        "strategy/audience/attribution tabs aren't part of this yet). WRITE: requires COM_MOON_HUB_WRITE_SECRET.",
      inputSchema: {
        name: z.string(),
        status: z.enum(["draft", "planning", "active", "paused", "completed"]).optional(),
        channels: z.array(z.string()).optional().describe("e.g. ['Email', 'Web', 'X']"),
        goalLabel: z.string().optional().describe("e.g. '신청 40'"),
        goalTarget: z.number().optional(),
        endsLabel: z.string().optional().describe("Freeform, e.g. '5월 말'."),
      },
    },
    async ({ name, status, channels, goalLabel, goalTarget, endsLabel }) => {
      const denied = requireWriteSecret();
      if (denied) return denied;

      const result = await hubPost("/api/hub/content", {
        action: "campaign",
        name,
        status,
        channels,
        goalLabel,
        goalTarget,
        endsLabel,
      });
      return toolResult(result);
    },
  );
}

export { errorResult };
