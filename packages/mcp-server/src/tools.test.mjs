import assert from "node:assert/strict";
import { test } from "node:test";

import { registerMoonlightTools } from "./tools.js";

function registeredTools() {
  const tools = new Map();
  const server = {
    registerTool(name, definition, handler) {
      tools.set(name, { definition, handler });
    },
  };

  registerMoonlightTools(server);
  return tools;
}

test("registers project, task, revenue, content queue, and task creation tools", () => {
  const tools = registeredTools();

  for (const name of [
    "list_projects",
    "list_tasks",
    "create_task",
    "get_revenue",
    "get_content_queue",
  ]) {
    assert.equal(tools.has(name), true, `${name} must be registered`);
  }
});

test("get_content_queue reuses the Hub content read route", async (t) => {
  const tool = registeredTools().get("get_content_queue");
  assert.ok(tool);

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "http://localhost:3000/api/hub/content");
    assert.equal(options.method, "GET");

    return new Response(
      JSON.stringify({ status: "live", queue: [{ id: "content-1", title: "Launch note" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await tool.handler({});

  assert.deepEqual(JSON.parse(result.content[0].text), {
    status: "live",
    queue: [{ id: "content-1", title: "Launch note" }],
  });
});

test("create_task declares the shared task statuses and priorities", () => {
  const tool = registeredTools().get("create_task");

  assert.ok(tool);
  assert.ok(tool.definition.inputSchema.title);
  assert.ok(tool.definition.inputSchema.status);
  assert.ok(tool.definition.inputSchema.priority);
  assert.ok(tool.definition.inputSchema.projectId);
});

// --- Error contract (R2) -----------------------------------------------------
// Before this contract existed, a dead Hub reached the caller as a bare "fetch failed"
// and an HTTP 401 reached it as a successful result. Both regressions are locked below,
// together with the rule that a route's honest `preview` is NOT an error.

function stubFetch(t, impl) {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = impl;
}

function withWriteSecret(t, value) {
  const original = process.env.COM_MOON_HUB_WRITE_SECRET;
  t.after(() => {
    if (original === undefined) delete process.env.COM_MOON_HUB_WRITE_SECRET;
    else process.env.COM_MOON_HUB_WRITE_SECRET = original;
  });
  if (value === undefined) delete process.env.COM_MOON_HUB_WRITE_SECRET;
  else process.env.COM_MOON_HUB_WRITE_SECRET = value;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("unreachable Hub reports an actionable error, not a bare 'fetch failed'", async (t) => {
  const tool = registeredTools().get("get_daily_brief");

  stubFetch(t, async () => {
    const error = new TypeError("fetch failed");
    error.cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3000"), {
      code: "ECONNREFUSED",
    });
    throw error;
  });

  const result = await tool.handler({});
  const text = result.content[0].text;

  assert.equal(result.isError, true);
  assert.notEqual(text, "fetch failed");
  assert.match(text, /ECONNREFUSED/);
  assert.match(text, /npm run dev:hub/);
  assert.match(text, /localhost:3000/);
});

test("HTTP error surfaces as a tool error carrying the route's own status", async (t) => {
  const tool = registeredTools().get("list_projects");

  stubFetch(t, async () =>
    jsonResponse({ status: "forbidden", error: "Hub write routes require a valid Hub write secret." }, 401),
  );

  const result = await tool.handler({});
  const text = result.content[0].text;

  assert.equal(result.isError, true);
  assert.match(text, /HTTP 401/);
  assert.match(text, /forbidden/);
  assert.match(text, /COM_MOON_HUB_WRITE_SECRET/);
});

test("preview is an honest answer, never an error", async (t) => {
  const tool = registeredTools().get("list_calendar_events");

  stubFetch(t, async () =>
    jsonResponse({ status: "preview", message: "Google Calendar is not connected.", events: [] }),
  );

  const result = await tool.handler({});

  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    status: "preview",
    message: "Google Calendar is not connected.",
    events: [],
  });
});

test("a 200 body declaring status:'error' is a tool error and keeps retryable", async (t) => {
  const tool = registeredTools().get("get_revenue");

  stubFetch(t, async () =>
    jsonResponse({ status: "error", error: "Revenue ledger persistence failed.", retryable: true }),
  );

  const result = await tool.handler({});
  const text = result.content[0].text;

  assert.equal(result.isError, true);
  assert.match(text, /Revenue ledger persistence failed/);
  assert.match(text, /retryable/);
});

test("write tools refuse before any request when the write secret is missing", async (t) => {
  withWriteSecret(t, undefined);

  let called = false;
  stubFetch(t, async () => {
    called = true;
    return jsonResponse({ status: "saved" });
  });

  const result = await registeredTools().get("create_task").handler({ title: "임시" });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /COM_MOON_HUB_WRITE_SECRET/);
  assert.equal(called, false, "no HTTP request may be made without the write secret");
});

test("a healthy live response still returns normally", async (t) => {
  withWriteSecret(t, "test-secret");

  stubFetch(t, async (url, options) => {
    assert.equal(options.method, "POST");
    assert.equal(options.headers.authorization, "Bearer test-secret");
    return jsonResponse({ status: "saved", task: { id: "t-1" } });
  });

  const result = await registeredTools().get("create_task").handler({ title: "임시" });

  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0].text), { status: "saved", task: { id: "t-1" } });
});

test("transport failure messages map each cause to its own remedy", async () => {
  const { describeTransportFailure } = await import("./hub-client.js");
  const ctx = { base: "http://localhost:3000", method: "GET", path: "/api/hub/tasks", timeoutMs: 60000 };

  const refused = describeTransportFailure(
    Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }),
    ctx,
  );
  assert.match(refused, /npm run dev:hub/);

  const dns = describeTransportFailure(
    Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }),
    ctx,
  );
  assert.match(dns, /COM_MOON_HUB_URL/);

  const timeout = describeTransportFailure(Object.assign(new Error("timed out"), { name: "TimeoutError" }), ctx);
  assert.match(timeout, /60000ms/);
  assert.match(timeout, /COM_MOON_MCP_TIMEOUT_MS/);
});
