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
