import assert from "node:assert/strict";
import { test } from "node:test";

let pmsRoute = null;

try {
  pmsRoute = await import("./route.ts");
} catch {
  // Red phase: the authenticated Engine PMS command route does not exist yet.
}

test("rejects a PMS command without the Hub-to-Engine shared secret", async () => {
  assert.ok(pmsRoute, "Engine PMS command route must exist");

  const previous = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create_task", title: "Should not save" }),
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      status: "unauthorized",
      error: "invalid-shared-secret",
    });
  } finally {
    if (previous === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous;
  }
});

test("validates an authenticated PMS command before touching the ledger", async () => {
  const previousSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const previousWorkspace = process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "pms-test-shared-secret",
      },
      body: JSON.stringify({
        action: "create_task",
        id: "55555555-5555-4555-8555-555555555555",
        title: "",
      }),
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "invalid-input",
      error: "missing-title",
    });
  } finally {
    if (previousSecret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previousSecret;
    if (previousWorkspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previousWorkspace;
  }
});

test("maps create payload conflicts to HTTP 409", async () => {
  const previous = {
    secret: process.env.COM_MOON_SHARED_WEBHOOK_SECRET,
    workspace: process.env.COM_MOON_DEFAULT_WORKSPACE_ID,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/workspaces")) {
      return new Response(JSON.stringify([{ owner_id: null }]), { status: 200 });
    }
    if (target.includes("/rest/v1/areas")) {
      return new Response(JSON.stringify([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]), { status: 200 });
    }
    if (target.includes("/rest/v1/projects") && init.method === "POST") {
      return new Response("duplicate key value violates unique constraint (23505)", { status: 409 });
    }
    if (target.includes("/rest/v1/projects")) {
      return new Response(JSON.stringify([{
        id: "11111111-1111-4111-8111-111111111111",
        workspace_id: "33333333-3333-4333-8333-333333333333",
        area_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        brand_id: null,
        lead_id: null,
        customer_account_id: null,
        name: "Existing project",
        summary: null,
        status: "active",
        priority: "medium",
        progress: 0,
        next_action: null,
        due_at: null,
        meta: { source: "manual", org_scope: "personal" },
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "pms-test-shared-secret",
      },
      body: JSON.stringify({
        action: "create_project",
        id: "11111111-1111-4111-8111-111111111111",
        areaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgScope: "personal",
        title: "Different project",
      }),
    }));

    assert.equal(response.status, 409);
    assert.equal((await response.json()).status, "conflict");
  } finally {
    if (previous.secret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous.secret;
    if (previous.workspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previous.workspace;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    globalThis.fetch = previous.fetch;
  }
});

test("PATCH requests a representation and returns the persisted project row", async () => {
  const previous = {
    secret: process.env.COM_MOON_SHARED_WEBHOOK_SECRET,
    workspace: process.env.COM_MOON_DEFAULT_WORKSPACE_ID,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  const persisted = {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    name: "Persisted server title",
    updated_at: "2026-07-17T01:00:00.000Z",
  };
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/workspaces")) {
      return new Response(JSON.stringify([{ owner_id: null }]), { status: 200 });
    }
    if (target.includes("/rest/v1/projects") && init.method === "PATCH") {
      assert.equal(init.headers.prefer, "return=representation");
      assert.match(target, /workspace_id=eq\.33333333-3333-4333-8333-333333333333/);
      assert.match(target, /updated_at=eq\.2026-07-16T01%3A00%3A00\.000Z/);
      return new Response(JSON.stringify([persisted]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "pms-test-shared-secret",
      },
      body: JSON.stringify({
        action: "update_project",
        id: persisted.id,
        title: "Requested title",
        expectedUpdatedAt: "2026-07-16T01:00:00.000Z",
      }),
    }));

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).entity, persisted);
  } finally {
    if (previous.secret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous.secret;
    if (previous.workspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previous.workspace;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    globalThis.fetch = previous.fetch;
  }
});

test("keeps missing Supabase configuration in the existing HTTP 202 taxonomy during relationship validation", async () => {
  const previous = {
    secret: process.env.COM_MOON_SHARED_WEBHOOK_SECRET,
    workspace: process.env.COM_MOON_DEFAULT_WORKSPACE_ID,
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  };
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "pms-test-shared-secret";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;

  try {
    const response = await pmsRoute.POST(new Request("http://engine.local/api/pms/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-com-moon-shared-secret": "pms-test-shared-secret",
      },
      body: JSON.stringify({
        action: "create_project",
        id: "11111111-1111-4111-8111-111111111111",
        areaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        brandId: "22222222-2222-4222-8222-222222222222",
        orgScope: "personal",
        title: "Project",
      }),
    }));

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { status: "error", error: "missing-config" });
  } finally {
    if (previous.secret === undefined) delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
    else process.env.COM_MOON_SHARED_WEBHOOK_SECRET = previous.secret;
    if (previous.workspace === undefined) delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
    else process.env.COM_MOON_DEFAULT_WORKSPACE_ID = previous.workspace;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.serviceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.serviceKey;
    if (previous.anonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previous.anonKey;
  }
});
