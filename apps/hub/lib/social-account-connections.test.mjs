import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  listSocialAccountConnections,
  resolveExpectedSocialAccountId,
  resolveSocialBrandKey,
  saveSocialAccountConnection,
} from "./social-account-connections.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("social account storage lists every row and selects by immutable account key", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const seen = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    seen.push(parsed);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([
        { id: "row-b", account_key: "account-b", config: { username: "account_b" } },
        { id: "row-a", account_key: "account-a", config: { username: "account_a" } },
      ]),
      headers: { get: () => null },
    };
  };

  const all = await listSocialAccountConnections("meta_threads", "workspace-1");
  const one = await listSocialAccountConnections("meta_threads", "workspace-1", "account-a");
  assert.equal(all.available, true);
  assert.equal(all.connections.length, 2);
  assert.equal(one.connections[0].account_key, "account-b");
  assert.equal(seen[0].searchParams.get("provider"), "eq.meta_threads");
  assert.equal(seen[0].searchParams.get("workspace_id"), "eq.workspace-1");
  assert.equal(seen[1].searchParams.get("account_key"), "eq.account-a");
});

test("social account upsert uses workspace, provider and stable account ID without replacing a sibling", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const posted = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (options.method === "GET") return {
      ok: true, status: 200, text: async () => "[]", headers: { get: () => null },
    };
    posted.push({ url: parsed, record: JSON.parse(options.body)[0] });
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify([{ id: `row-${posted.length}` }]),
      headers: { get: () => null },
    };
  };

  const first = await saveSocialAccountConnection({
    workspaceId: "workspace-1", provider: "youtube", accountId: "UC-A",
    config: { channelTitle: "A", brandKey: "bridgemaker" },
  });
  const second = await saveSocialAccountConnection({
    workspaceId: "workspace-1", provider: "youtube", accountId: "UC-B",
    config: { channelTitle: "B", brandKey: "bridgemaker" },
  });
  assert.equal(first.id, "row-1");
  assert.equal(second.id, "row-2");
  assert.deepEqual(posted.map((call) => call.record.account_key), ["UC-A", "UC-B"]);
  assert.deepEqual(posted.map((call) => call.record.external_account_id), ["UC-A", "UC-B"]);
  assert.ok(posted.every((call) => call.url.searchParams.get("on_conflict") === "workspace_id,provider,account_key"));
});

test("social account storage fails closed without a verified account ID", async () => {
  await assert.rejects(
    saveSocialAccountConnection({ workspaceId: "workspace-1", provider: "instagram_api", accountId: "" }),
    /social-account-id-missing/,
  );
});

test("explicit brand mapping must resolve to a brand in the same workspace", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get("workspace_id"), "eq.workspace-1");
    assert.equal(params.get("slug"), "eq.bridgemaker");
    return {
      ok: true, status: 200, text: async () => JSON.stringify([{ id: "brand-1" }]),
      headers: { get: () => null },
    };
  };
  assert.equal(await resolveSocialBrandKey("workspace-1", "bridgemaker"), "bridgemaker");
  assert.equal(await resolveSocialBrandKey("workspace-1", null), null);
  await assert.rejects(resolveSocialBrandKey("workspace-1", "../other"), /social-brand-invalid/);
});

test("reconnecting an account keeps its validated brand mapping when no new brand is selected", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let saved;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "GET") return {
      ok: true, status: 200,
      text: async () => JSON.stringify([{ id: "existing-row", account_key: "UC-A", config: { brandKey: "bridgemaker" } }]),
      headers: { get: () => null },
    };
    saved = JSON.parse(options.body)[0];
    return {
      ok: true, status: 201, text: async () => JSON.stringify([{ id: "existing-row" }]),
      headers: { get: () => null },
    };
  };
  await saveSocialAccountConnection({
    workspaceId: "workspace-1", provider: "youtube", accountId: "UC-A",
    config: { channelId: "UC-A", brandKey: null },
  });
  assert.equal(saved.config.brandKey, "bridgemaker");
});

test("reconnecting an account cannot silently assign it to another brand", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let writes = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "GET") return {
      ok: true, status: 200,
      text: async () => JSON.stringify([{ account_key: "account-A", config: { brandKey: "bridgemaker" } }]),
      headers: { get: () => null },
    };
    writes += 1;
    return { ok: true, status: 201, text: async () => "[]", headers: { get: () => null } };
  };

  await assert.rejects(saveSocialAccountConnection({
    workspaceId: "workspace-1", provider: "instagram_api", accountId: "account-A",
    config: { brandKey: "politicofficer" },
  }), /social-account-brand-mismatch/);
  assert.equal(writes, 0);
});

test("OAuth connect binds an existing handle to its verified account ID", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify([
      { account_key: "ig-1", config: { username: "ml_bridgemaker", brandKey: "bridgemaker" } },
      { account_key: "ig-2", config: { username: "politic_officer", brandKey: "politicofficer" } },
    ]),
    headers: { get: () => null },
  });

  assert.equal(await resolveExpectedSocialAccountId({
    provider: "instagram_api", workspaceId: "workspace-1", handle: "@ml_bridgemaker",
    brandKey: "bridgemaker",
  }), "ig-1");
  await assert.rejects(resolveExpectedSocialAccountId({
    provider: "instagram_api", workspaceId: "workspace-1", handle: "ml_bridgemaker",
    brandKey: "politicofficer",
  }), /social-account-brand-mismatch/);
  await assert.rejects(resolveExpectedSocialAccountId({
    provider: "instagram_api", workspaceId: "workspace-1", handle: "ml_bridgemaker",
    accountId: "ig-2",
  }), /social-account-mismatch/);
});

test("OAuth connect finds an existing account beyond the first 100 connections", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const rows = [
    ...Array.from({ length: 100 }, (_, index) => ({
      account_key: `other-${index}`,
      config: { username: `other_${index}`, brandKey: "other" },
    })),
    { account_key: "ig-original", config: { username: "moon.classin", brandKey: "classmoon" } },
  ];
  const offsets = [];
  globalThis.fetch = async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get("provider"), "eq.instagram_api");
    assert.equal(params.get("workspace_id"), "eq.workspace-1");
    const offset = Number(params.get("offset") || 0);
    offsets.push(offset);
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify(rows.slice(offset, offset + 100)),
      headers: { get: () => null },
    };
  };

  assert.equal(await resolveExpectedSocialAccountId({
    provider: "instagram_api", workspaceId: "workspace-1", handle: "moon.classin",
    brandKey: "classmoon",
  }), "ig-original");
  assert.deepEqual(offsets, [0, 100]);
});

test("OAuth connect rejects malformed successful account lookup responses", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true, status: 200, text: async () => "{not-json",
    headers: { get: () => null },
  });

  await assert.rejects(resolveExpectedSocialAccountId({
    provider: "instagram_api", workspaceId: "workspace-1", handle: "moon.classin",
    brandKey: "classmoon",
  }), /social-account-read-failed/);
});
