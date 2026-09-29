import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { POST as deauthorize } from "./deauthorize/route.js";
import { POST as dataDeletion } from "./data-deletion/route.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function requestFor(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", "app-secret").update(encoded).digest("base64url");
  return new NextRequest("http://localhost:3000/api/social/meta/threads/callback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: `${signature}.${encoded}` }).toString(),
  });
}

function configureApp() {
  process.env.COM_MOON_META_THREADS_APP_ID = "app-id";
  process.env.COM_MOON_META_THREADS_APP_SECRET = "app-secret";
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "workspace-1";
}

for (const [name, route] of [["deauthorize", deauthorize], ["data deletion", dataDeletion]]) {
  test(`${name} does not acknowledge a failed connection read`, async () => {
    configureApp();
    globalThis.fetch = async (_url, options) => options.method === "POST"
      ? { ok: true, status: 201, text: async () => "[]", headers: { get: () => null } }
      : { ok: false, status: 503, text: async () => "unavailable", headers: { get: () => null } };

    const response = await route(requestFor({ user_id: "thread-user" }));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, "error");
    assert.equal(body.confirmation_code, undefined);
    assert.equal(body.url, undefined);
  });

  test(`${name} does not acknowledge a zero-row update`, async () => {
    configureApp();
    globalThis.fetch = async (_url, options) => {
      if (options.method === "POST") return {
        ok: true, status: 201, text: async () => "[]", headers: { get: () => null },
      };
      if (options.method === "PATCH") return {
        ok: true, status: 200, text: async () => "[]", headers: { get: () => null },
      };
      return {
        ok: true, status: 200, text: async () => JSON.stringify([{
          id: "connection-1", config: { userId: "thread-user", oauthAppId: "app-id", oauthAppKey: "moonlight" },
        }]), headers: { get: () => null },
      };
    };

    const response = await route(requestFor({ user_id: "thread-user" }));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, "error");
    assert.equal(body.confirmation_code, undefined);
    assert.equal(body.url, undefined);
  });
}
