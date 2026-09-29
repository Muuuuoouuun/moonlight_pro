import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resolveRouteAccess } from "../../../../lib/route-access.js";
import { GET } from "./route.js";

const names = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "COM_MOON_DEFAULT_WORKSPACE_ID", "DEFAULT_WORKSPACE_ID"];
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
for (const name of names) delete process.env[name];
after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(original)) value === undefined ? delete process.env[name] : process.env[name] = value;
});

test("the AI usage read route is not open: the middleware requires an operator session", () => {
  const blocked = resolveRouteAccess({ pathname: "/api/hub/ai-usage", secretConfigured: true, hasSession: false, allowLoopback: false });
  assert.notEqual(blocked.action, "allow");
  assert.equal(resolveRouteAccess({ pathname: "/api/hub/ai-usage", secretConfigured: true, hasSession: true, allowLoopback: false }).action, "allow");
});

test("without storage the route answers preview over HTTP 200", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "preview");
});

test("a failed read is HTTP 200 with the error envelope, never an empty month", async () => {
  Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "db-test", COM_MOON_DEFAULT_WORKSPACE_ID: "11111111-1111-4111-8111-111111111111" });
  globalThis.fetch = async () => new Response("boom", { status: 500 });
  const failed = await GET();
  assert.equal(failed.status, 200);
  const data = await failed.json();
  assert.equal(data.status, "error");
  assert.equal(data.current, undefined);

  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });
  const live = await (await GET()).json();
  assert.equal(live.status, "live");
  assert.equal(live.current.calls, 0);
  assert.equal(live.previous.calls, 0);
});
