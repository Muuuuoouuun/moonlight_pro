import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { buildYouTubeAuthUrl, decodeYouTubeState } from "./youtube-oauth.js";

register("data:text/javascript,export async function resolve(s,c,n){return n(s===\"next/server\"?\"next/server.js\":s,c)}", import.meta.url);

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const origin = "https://hub.example.com";
const fallback = "/dashboard/settings";
const stateSecret = "social-redirect-boundary-test-secret";
const unsafePaths = [
  "/\t/outside.example", "/\n/outside.example", "/\r/outside.example",
  "//outside.example", "/\\outside.example", "https://outside.example",
  "/dashboard\u0000", "/dashboard\u007f", "dashboard/settings",
];
const localPath = "/dashboard/settings?tab=integrations#youtube";
let fetchCalls;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    COM_MOON_YOUTUBE_CLIENT_ID: "redirect-test-client",
    COM_MOON_YOUTUBE_CLIENT_SECRET: "redirect-test-client-secret",
    COM_MOON_OAUTH_STATE_SECRET: stateSecret,
  };
  delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("External requests are forbidden in redirect boundary tests.");
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  assert.equal(fetchCalls, 0);
});

function signedYouTubeState(returnPath) {
  const payload = Buffer.from(JSON.stringify({
    workspaceId: "redirect-test-workspace", iat: Date.now(), returnPath,
  })).toString("base64url");
  return `${payload}.${createHmac("sha256", stateSecret).update(payload).digest("base64url")}`;
}

function assertLocalTarget(response, expectedPath, provider, result) {
  assert.equal(response.status, 307);
  const target = new URL(response.headers.get("location"));
  const expected = new URL(expectedPath, origin);
  expected.searchParams.set(provider, result);
  assert.equal(target.href, expected.href);
}

test("YouTube signs only safe local return paths", () => {
  for (const returnPath of [...unsafePaths, localPath]) {
    const auth = new URL(buildYouTubeAuthUrl({ origin, workspaceId: "redirect-test-workspace", returnPath }));
    const state = decodeYouTubeState(auth.searchParams.get("state"));
    assert.equal(state.returnPath, returnPath === localPath ? localPath : fallback);
  }
});

for (const error of [false, true]) {
  test(`YouTube callback contains unsafe signed return paths on ${error ? "provider denial" : "missing code"}`, async () => {
    const { GET } = await import("../app/api/social/youtube/callback/route.js");
    // Check the callback independently of the signer, including previously issued state.
    for (const returnPath of [...unsafePaths, localPath]) {
      const url = new URL("/api/social/youtube/callback", origin);
      url.searchParams.set("state", signedYouTubeState(returnPath));
      if (error) url.searchParams.set("error", "access_denied");
      assertLocalTarget(await GET(new NextRequest(url)), returnPath === localPath ? localPath : fallback,
        "youtube", error ? "oauth-denied" : "missing-code");
    }
  });
}

for (const [route, provider] of [["instagram", "instagram"], ["meta/threads", "metaThreads"]]) {
  for (const failure of ["missing-oauth-state-secret", "invalid-brand", "missing-provider-config"]) {
    test(`${provider} connect contains return paths on ${failure}`, async () => {
      const { GET } = await import(`../app/api/social/${route}/connect/route.js`);
      if (failure === "missing-oauth-state-secret") delete process.env.COM_MOON_OAUTH_STATE_SECRET;
      for (const returnPath of [...unsafePaths, localPath]) {
        const url = new URL(`/api/social/${route}/connect`, origin);
        url.searchParams.set("returnPath", returnPath);
        if (failure === "invalid-brand") url.searchParams.set("brandKey", "invalid-brand-key");
        // A handle outside the app registry deterministically exercises the missing-config fallback.
        if (failure === "missing-provider-config") url.searchParams.set("brand", "not-a-configured-brand");
        const result = failure === "missing-provider-config"
          ? provider === "instagram" ? "missing-instagram-config" : "missing-meta-config"
          : failure;
        assertLocalTarget(await GET(new NextRequest(url)), returnPath === localPath ? localPath : fallback,
          provider, result);
      }
    });
  }
}
