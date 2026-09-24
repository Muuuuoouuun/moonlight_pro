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
      returnPath: "/dashboard/settings",
    });
    const state = new URL(authUrl).searchParams.get("state");
    const decoded = decodeState(state);

    assert.equal(decoded.invalid, undefined);
    assert.equal(decoded.workspaceId, "workspace-1");
    assert.equal(decoded.brandHandle, "brand-one");
    assert.equal(decoded.returnPath, "/dashboard/settings");
    assert.ok(Number.isSafeInteger(decoded.iat));
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
}
