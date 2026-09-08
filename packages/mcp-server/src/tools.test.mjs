import assert from "node:assert/strict";
import { test } from "node:test";

import { registerMoonlightTools } from "./tools.js";
import { z } from "zod";

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

test('Council MCP call is bounded advice-only by default, with credentials and exact focus', async (t) => {
  const previousSecret = process.env.COM_MOON_HUB_WRITE_SECRET;
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.COM_MOON_HUB_WRITE_SECRET;
    else process.env.COM_MOON_HUB_WRITE_SECRET = previousSecret;
  });
  process.env.COM_MOON_HUB_WRITE_SECRET = 'test-only-secret';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(url).pathname, '/api/hub/brand-mentor');
    assert.equal(options.headers.authorization, 'Bearer test-only-secret');
    assert.ok(options.signal);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { mode: 'brand-strategy', ref: 'brand-1', draft: 'next experiment?', createWorkOrder: false });
    return Response.json({ status: 'generated', text: 'advice', runId: 'run-1' });
  };
  const tool = registeredTools().get('request_council');
  assert.equal(tool.definition.annotations.readOnlyHint, false);
  const input = z.object(tool.definition.inputSchema).parse({ ref: 'brand-1', draft: 'next experiment?' });
  const result = await tool.handler(input);
  assert.equal(result.structuredContent.runId, 'run-1');
  assert.equal(calls, 1);
  delete process.env.COM_MOON_HUB_WRITE_SECRET;
  assert.equal((await tool.handler(input)).isError, true);
  assert.equal(calls, 1);
});

test('MCP flags HTTP and body errors without retrying or leaking transport responses', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const tool = registeredTools().get('list_agent_runs');
  for (const response of [Response.json({ status: 'error', runs: [] }), new Response('private upstream content', { status: 502 })]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return response; };
    const result = await tool.handler({ agent: 'council', limit: 5 });
    assert.equal(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content[0].text.includes('private upstream'), false);
  }
});

test('run and weekly reads forward exact filters; all tools declare operation hints', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const tools = registeredTools();
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(new URL(url)); return Response.json({ status: 'preview' }); };
  assert.equal((await tools.get('list_agent_runs').handler({ agent: 'guru', ref: 'deal-1', limit: 3 })).isError, undefined);
  await tools.get('get_weekly_report').handler({ scope: 'company' });
  assert.equal(urls[0].searchParams.get('ref'), 'deal-1');
  assert.equal(urls[0].searchParams.get('limit'), '3');
  assert.equal(urls[1].searchParams.get('scope'), 'company');
  for (const { definition } of tools.values()) assert.equal(typeof definition.annotations.readOnlyHint, 'boolean');
});
