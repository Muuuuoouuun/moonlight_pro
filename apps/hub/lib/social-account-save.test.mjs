import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { saveMetaThreadsConnection } from "./meta-threads.js";
import { saveInstagramApiConnection } from "./instagram-api.js";
import { saveYouTubeConnection } from "./youtube-oauth.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("each social OAuth save addresses the verified provider account and never patches the latest sibling", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const writes = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === "GET") {
      assert.ok(new URL(url).searchParams.get("account_key")?.startsWith("eq."));
      return { ok: true, status: 200, text: async () => "[]", headers: { get: () => null } };
    }
    if (options.method !== "POST") throw new Error("unexpected-social-patch");
    const parsed = new URL(url);
    const record = JSON.parse(options.body)[0];
    writes.push({ conflict: parsed.searchParams.get("on_conflict"), record });
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify([{ id: `connection-${writes.length}` }]),
      headers: { get: () => null },
    };
  };

  const threads = await saveMetaThreadsConnection({
    workspaceId: "workspace-1", brandHandle: "ml_bridgemaker",
    tokenData: { access_token: "threads-token" },
    profile: { id: "threads-user-1", username: "ml_bridgemaker" },
  });
  const instagram = await saveInstagramApiConnection({
    workspaceId: "workspace-1", brandHandle: "politic_officer",
    tokenData: { access_token: "instagram-token" },
    profile: { id: "instagram-app-user-2", username: "politic_officer" },
  });
  const youtube = await saveYouTubeConnection({
    workspaceId: "workspace-1", token: { access_token: "youtube-token", refresh_token: "youtube-refresh" },
    channel: { id: "UC123", title: "Channel" },
  });

  assert.deepEqual([threads.connectionId, instagram.connectionId, youtube.connectionId], [
    "connection-1", "connection-2", "connection-3",
  ]);
  assert.deepEqual(writes.map((write) => write.record.account_key), [
    "threads-user-1", "instagram-app-user-2", "UC123",
  ]);
  assert.ok(writes.every((write) => write.conflict === "workspace_id,provider,account_key"));
});

test("social OAuth cannot save a token without the verified platform account", async () => {
  await assert.rejects(saveMetaThreadsConnection({
    workspaceId: "workspace-1", tokenData: { access_token: "token" }, profile: null,
  }), /social-account-id-missing/);
  await assert.rejects(saveInstagramApiConnection({
    workspaceId: "workspace-1", tokenData: { access_token: "token" }, profile: null,
  }), /social-account-id-missing/);
});
