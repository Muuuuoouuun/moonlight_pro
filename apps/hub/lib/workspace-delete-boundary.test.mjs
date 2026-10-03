import assert from "node:assert/strict";
import { register } from "node:module";
import { afterEach, beforeEach, test } from "node:test";

// Resolve Next's extensionless server export for Node without mocking handlers.
register("data:text/javascript,export async function resolve(s,c,n){return n(s===\"next/server\"?\"next/server.js\":s,c)}", import.meta.url);
const { DELETE: deleteTask } = await import("../app/api/hub/tasks/route.js");
const { DELETE: deleteRoutine } = await import("../app/api/routine/route.js");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID = "00000000-0000-4000-8000-000000000002";
const PROJECT_ID = "00000000-0000-4000-8000-000000000003";
const WRITE_SECRET = "workspace-delete-boundary-test-secret";
let requests;

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    COM_MOON_HUB_WRITE_SECRET: WRITE_SECRET,
    SUPABASE_URL: "https://workspace-boundary.supabase.example",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-supabase-service-key",
  };
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  delete process.env.DEFAULT_WORKSPACE_ID;
  requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(url), method: options.method || "GET" });
    // No network operation: the read and delete representations are synthetic.
    return Response.json([{ id: TASK_ID }]);
  };
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

const routes = [
  { name: "task", path: "/api/hub/tasks", table: "tasks", handler: deleteTask, body: { id: TASK_ID } },
  { name: "routine", path: "/api/routine", table: "routine_checks", handler: deleteRoutine,
    body: { ritualKey: "daily-review", matchProjectId: PROJECT_ID } },
];
function request(route) {
  return new Request(`https://hub.example.com${route.path}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", "x-com-moon-hub-write-secret": WRITE_SECRET },
    body: JSON.stringify(route.body),
  });
}

for (const route of routes) {
  for (const missing of [undefined, "", "   "]) {
    test(`${route.name} delete refuses an absent or blank workspace before any DB request (${JSON.stringify(missing)})`, async () => {
      if (missing !== undefined) process.env.COM_MOON_DEFAULT_WORKSPACE_ID = missing;
      const response = await route.handler(request(route));
      const body = await response.json();
      assert.equal(response.status, 202);
      assert.equal(body.status, "preview");
      assert.match(body.message, /Workspace.*not configured/);
      assert.deepEqual(requests, [], "configured Supabase must not permit an unscoped delete");
    });
  }

  for (const workspaceKey of ["COM_MOON_DEFAULT_WORKSPACE_ID", "DEFAULT_WORKSPACE_ID"]) {
    test(`${route.name} delete includes the exact configured workspace on every mocked DB call (${workspaceKey})`, async () => {
      process.env[workspaceKey] = WORKSPACE_ID;
      const response = await route.handler(request(route));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "saved");
      const deleted = requests.filter(({ method }) => method === "DELETE");
      assert.equal(deleted.length, 1);
      assert.equal(requests.length, route.name === "routine" ? 2 : 1);
      for (const { url } of requests) {
        assert.equal(url.origin, "https://workspace-boundary.supabase.example");
        assert.equal(url.pathname, `/rest/v1/${route.table}`);
        assert.deepEqual(url.searchParams.getAll("workspace_id"), [`eq.${WORKSPACE_ID}`]);
        if (route.name === "task") assert.equal(url.searchParams.get("id"), `eq.${TASK_ID}`);
        else {
          assert.equal(url.searchParams.get("project_id"), `eq.${PROJECT_ID}`);
          assert.equal(url.searchParams.get("meta->>ritual_key"), "eq.daily-review");
        }
      }
    });
  }
}
