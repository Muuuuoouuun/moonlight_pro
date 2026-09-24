import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { upsertIntegrationConnection } from "./integration-state.ts";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("Engine provider upsert retains one default account under the three-column key", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = "workspace-1";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(url), row: JSON.parse(options.body)[0] });
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify([{ id: "connection-1" }]),
      headers: { get: () => null },
    };
  };

  await upsertIntegrationConnection({ provider: "gmail", status: "connected" });
  await upsertIntegrationConnection({ provider: "gmail", status: "connected" });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) =>
    url.searchParams.get("on_conflict") === "workspace_id,provider,account_key"));
  assert.ok(requests.every(({ row }) => row.account_key === ""));
});
