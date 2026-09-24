import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { resolveSocialOAuthReturnUrl } from "./social-oauth-return.js";
import { resolveMetaThreadsRedirectUri } from "./meta-threads.js";
import { resolveInstagramApiRedirectUri } from "./instagram-api.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

test("social OAuth UI return uses local Hub despite HTTPS proxy request origin", () => {
  delete process.env.COM_MOON_HUB_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.COM_MOON_SOCIAL_OAUTH_BASE_URL = "https://social-tunnel.example.com";
  const proxied = new NextRequest("https://localhost:3000/api/social/meta/threads/callback", {
    headers: { host: "localhost:3000", "x-forwarded-proto": "https" },
  });

  assert.equal(proxied.nextUrl.origin, "https://localhost:3000");
  assert.equal(resolveSocialOAuthReturnUrl("/dashboard/settings", proxied.nextUrl.origin).href,
    "http://localhost:3000/dashboard/settings");
  assert.equal(resolveMetaThreadsRedirectUri(proxied.nextUrl.origin),
    "https://social-tunnel.example.com/api/social/meta/threads/callback");
  assert.equal(resolveInstagramApiRedirectUri(proxied.nextUrl.origin),
    "https://social-tunnel.example.com/api/social/instagram/callback");
});

test("social OAuth UI return falls back to request origin without app URL", () => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  assert.equal(resolveSocialOAuthReturnUrl("/dashboard/settings", "https://hub.example.com").href,
    "https://hub.example.com/dashboard/settings");
});

test("social OAuth UI return rejects paths that can leave the trusted Hub origin", () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  for (const path of ["/\\evil.com", "/\t/evil.com", "//evil.com", "https://evil.com", "dashboard/settings"]) {
    assert.equal(resolveSocialOAuthReturnUrl(path, "https://localhost:3000").href,
      "http://localhost:3000/dashboard/settings", `rejected ${path}`);
  }
});
