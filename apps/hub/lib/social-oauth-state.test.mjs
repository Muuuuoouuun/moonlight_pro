import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  buildMetaThreadsAuthUrl,
  decodeMetaThreadsState,
} from "./meta-threads.js";
import {
  buildInstagramApiAuthUrl,
  decodeInstagramApiState,
} from "./instagram-api.js";

const stateSecret = "social-oauth-state-test-secret";
process.env.COM_MOON_OAUTH_STATE_SECRET = stateSecret;
process.env.COM_MOON_META_THREADS_APP_ID = "threads-test-app";
process.env.COM_MOON_META_THREADS_APP_SECRET = "threads-test-secret";
process.env.COM_MOON_INSTAGRAM_APP_ID = "instagram-test-app";
process.env.COM_MOON_INSTAGRAM_APP_SECRET = "instagram-test-secret";

function signedState(value) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", stateSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

for (const [provider, buildAuthUrl, decodeState] of [
  ["Threads", buildMetaThreadsAuthUrl, decodeMetaThreadsState],
  ["Instagram", buildInstagramApiAuthUrl, decodeInstagramApiState],
]) {
  test(`${provider} accepts a newly signed state`, () => {
    const authUrl = buildAuthUrl({
      origin: "https://hub.example.com",
      workspaceId: "workspace-1",
      brandHandle: "brand-one",
      brandKey: "bridgemaker",
      expectedAccountId: "account-1",
      returnPath: "/dashboard/settings",
    });
    const state = new URL(authUrl).searchParams.get("state");
    const decoded = decodeState(state);

    assert.equal(decoded.invalid, undefined);
    assert.equal(decoded.workspaceId, "workspace-1");
    assert.equal(decoded.brandHandle, "brand-one");
    assert.equal(decoded.brandKey, "bridgemaker");
    assert.equal(decoded.expectedAccountId, "account-1");
    assert.equal(decoded.provider, provider === "Threads" ? "meta_threads" : "instagram_api");
    assert.match(decoded.nonce, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(decoded.returnPath, "/dashboard/settings");
    assert.ok(Number.isSafeInteger(decoded.iat));
  });

  test(`${provider} uses an unpredictable nonce for each authorization`, () => {
    const args = { origin: "https://hub.example.com", workspaceId: "workspace-1", brandHandle: "brand-one" };
    const first = decodeState(new URL(buildAuthUrl(args)).searchParams.get("state"));
    const second = decodeState(new URL(buildAuthUrl(args)).searchParams.get("state"));
    assert.notEqual(first.nonce, second.nonce);
  });

  test(`${provider} rejects signed states without a provider or nonce`, () => {
    const base = { iat: Date.now(), workspaceId: "workspace-1", brandHandle: "brand-one" };
    assert.deepEqual(decodeState(signedState({ ...base, nonce: "a".repeat(43) })), { invalid: true });
    assert.deepEqual(decodeState(signedState({ ...base, provider: provider === "Threads" ? "meta_threads" : "instagram_api" })), { invalid: true });
  });

  test(`${provider} rejects missing state`, () => {
    assert.deepEqual(decodeState(null), { invalid: true });
    assert.deepEqual(decodeState(""), { invalid: true });
  });

  test(`${provider} rejects malformed or forged signatures`, () => {
    const valid = signedState({ iat: Date.now(), workspaceId: "workspace-1" });
    assert.deepEqual(decodeState(`${valid}.extra`), { invalid: true });
    assert.deepEqual(decodeState(`${valid.slice(0, -1)}x`), { invalid: true });
  });

  test(`${provider} rejects non-numeric and missing issue times`, () => {
    for (const iat of [undefined, null, "123", -1, 1.5]) {
      assert.deepEqual(
        decodeState(signedState({ workspaceId: "workspace-1", iat })),
        { invalid: true },
      );
    }
  });

  test(`${provider} rejects state older than ten minutes`, () => {
    assert.deepEqual(
      decodeState(signedState({ iat: Date.now() - 600_001 })),
      { invalid: true },
    );
  });

  test(`${provider} rejects state issued in the future`, () => {
    assert.deepEqual(
      decodeState(signedState({ iat: Date.now() + 60_000 })),
      { invalid: true },
    );
  });

  test(`${provider} rejects a signed state without a workspace or expected account`, () => {
    assert.deepEqual(decodeState(signedState({ iat: Date.now(), brandHandle: "brand-one" })), { invalid: true });
    assert.deepEqual(decodeState(signedState({ iat: Date.now(), workspaceId: "workspace-1" })), { invalid: true });
  });
}

test("Instagram and Threads cannot accept each other's signed OAuth state", () => {
  const threadsState = new URL(buildMetaThreadsAuthUrl({
    origin: "https://hub.example.com", workspaceId: "workspace-1", brandHandle: "brand-one",
  })).searchParams.get("state");
  const instagramState = new URL(buildInstagramApiAuthUrl({
    origin: "https://hub.example.com", workspaceId: "workspace-1", brandHandle: "brand-one",
  })).searchParams.get("state");
  assert.deepEqual(decodeInstagramApiState(threadsState), { invalid: true });
  assert.deepEqual(decodeMetaThreadsState(instagramState), { invalid: true });
});
