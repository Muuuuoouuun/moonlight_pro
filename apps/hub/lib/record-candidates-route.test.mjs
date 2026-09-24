// 라우트 경계: 읽기 실패는 HTTP 200 + status:"error"(허브 read 계약), 쓰기는 hub-write-guard를 거친다.
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { GET, POST } from "../app/api/hub/record-candidates/route.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const keys = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "COM_MOON_DEFAULT_WORKSPACE_ID", "DEFAULT_WORKSPACE_ID", "COM_MOON_HUB_WRITE_SECRET"];
const env = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});

function setup() {
  for (const key of keys) delete process.env[key];
  process.env.SUPABASE_URL = "https://record-route.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE;
  process.env.COM_MOON_HUB_WRITE_SECRET = "test-secret";
}

const post = (body, headers = { "x-com-moon-hub-write-secret": "test-secret" }) => POST(new Request("https://hub.example/api/hub/record-candidates", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
}));

test("a failed read is an HTTP 200 error envelope, never a 5xx or an empty live list", async () => {
  setup();
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  const response = await GET(new Request("https://hub.example/api/hub/record-candidates"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "error");
  assert.deepEqual(body.candidates, []);
});

test("unconfigured reads are preview", async () => {
  setup();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return Response.json([]); };
  const body = await (await GET(new Request("https://hub.example/api/hub/record-candidates"))).json();
  assert.equal(body.status, "preview");
  assert.equal(fetched, 0);
});

test("writes require the hub write guard and validate before touching storage", async () => {
  setup();
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return Response.json([]); };
  const crossOrigin = await post({ id: "phone:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", action: "dismiss" }, { origin: "https://evil.example" });
  assert.equal(crossOrigin.status, 401);
  const invalid = await post({ id: "phone:nope", action: "dismiss" });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).status, "invalid-input");
  assert.equal(fetched, 0);
  const missing = await post({ id: "phone:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", action: "dismiss" });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).status, "not-found");
});
