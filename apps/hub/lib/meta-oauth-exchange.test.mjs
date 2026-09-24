import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { resolveMetaOAuthApp } from "./meta-oauth-apps.js";
import { exchangeInstagramApiCode, exchangeInstagramApiLongLivedToken } from "./instagram-api.js";
import { exchangeMetaThreadsCode, exchangeMetaThreadsLongLivedToken } from "./meta-threads.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

for (const [provider, prefix, exchangeCode, exchangeLongLived] of [
  ["instagram_api", "COM_MOON_INSTAGRAM", exchangeInstagramApiCode, exchangeInstagramApiLongLivedToken],
  ["meta_threads", "COM_MOON_META_THREADS", exchangeMetaThreadsCode, exchangeMetaThreadsLongLivedToken],
]) {
  test(`${provider} exchanges both tokens with the Class.Moon app secret`, async () => {
    process.env[`${prefix}_APP_ID`] = "other-id";
    process.env[`${prefix}_APP_SECRET`] = "other-secret";
    process.env[`${prefix}_CLASSMOON_APP_ID`] = "company-id";
    process.env[`${prefix}_CLASSMOON_APP_SECRET`] = "company-secret";
    const app = resolveMetaOAuthApp({ provider, brandKey: "classmoon", brandHandle: "moon.classin" });
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: new URL(url), body: new URLSearchParams(options.body || "") });
      return { ok: true, status: 200, json: async () => ({ access_token: "issued-token" }) };
    };

    await exchangeCode({ code: "auth-code", redirectUri: "https://hub.example.com/callback", app });
    await exchangeLongLived("issued-token", app);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.get("client_id"), "company-id");
    assert.equal(calls[0].body.get("client_secret"), "company-secret");
    const longLivedParams = calls[1].url.searchParams;
    assert.equal(longLivedParams.get("client_secret"), "company-secret");
  });
}
