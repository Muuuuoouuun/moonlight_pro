import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { resolveMetaOAuthApp, resolveMetaOAuthAppFromState } from "./meta-oauth-apps.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

test("BridgeMaker keeps the existing Instagram and Threads app credentials", () => {
  process.env.COM_MOON_INSTAGRAM_APP_ID = "legacy-instagram-id";
  process.env.COM_MOON_INSTAGRAM_APP_SECRET = "legacy-instagram-secret";
  process.env.COM_MOON_META_THREADS_APP_ID = "legacy-threads-id";
  process.env.COM_MOON_META_THREADS_APP_SECRET = "legacy-threads-secret";

  const instagram = resolveMetaOAuthApp({
    provider: "instagram_api", brandKey: "bridgemaker", brandHandle: "@ml_bridgemaker",
  });
  const threads = resolveMetaOAuthApp({
    provider: "meta_threads", brandKey: null, brandHandle: "ml_bridgemaker",
  });
  assert.deepEqual([instagram.appKey, instagram.appId], ["moonlight", "legacy-instagram-id"]);
  assert.deepEqual([threads.appKey, threads.appId], ["moonlight", "legacy-threads-id"]);
  assert.equal(instagram.configured, true);
  assert.equal(threads.configured, true);
});

test("Politic Officer and Class.Moon use only their dedicated app credentials", () => {
  process.env.COM_MOON_INSTAGRAM_POLITIC_OFFICER_APP_ID = "politic-instagram-id";
  process.env.COM_MOON_INSTAGRAM_POLITIC_OFFICER_APP_SECRET = "politic-instagram-secret";
  process.env.COM_MOON_META_THREADS_CLASSMOON_APP_ID = "classmoon-threads-id";
  process.env.COM_MOON_META_THREADS_CLASSMOON_APP_SECRET = "classmoon-threads-secret";

  const politic = resolveMetaOAuthApp({
    provider: "instagram_api", brandKey: "politicofficer", brandHandle: "politic_officer",
  });
  const classmoon = resolveMetaOAuthApp({
    provider: "meta_threads", brandKey: "classmoon", brandHandle: "moon.classin",
  });
  assert.deepEqual([politic.appKey, politic.appId], ["politic_officer", "politic-instagram-id"]);
  assert.deepEqual([classmoon.appKey, classmoon.appId], ["classmoon", "classmoon-threads-id"]);
});

test("an unknown brand or a mismatched handle cannot fall through to another app", () => {
  assert.equal(resolveMetaOAuthApp({ provider: "instagram_api", brandKey: "unknown", brandHandle: "moon.classin" }), null);
  assert.equal(resolveMetaOAuthApp({ provider: "instagram_api", brandKey: null, brandHandle: "politic_officer" }), null);
  assert.equal(resolveMetaOAuthApp({ provider: "instagram_api", brandKey: "classmoon", brandHandle: "ml_bridgemaker" }), null);
});

test("callback rejects an app ID changed after authorization started", () => {
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_ID = "current-id";
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET = "current-secret";
  const state = {
    provider: "instagram_api", brandKey: "classmoon", brandHandle: "moon.classin",
    appKey: "classmoon", appId: "old-id",
  };
  assert.equal(resolveMetaOAuthAppFromState(state), null);
  assert.equal(resolveMetaOAuthAppFromState({ ...state, appId: "current-id" }).appSecret, "current-secret");
  assert.equal(resolveMetaOAuthAppFromState({ ...state, appKey: "moonlight" }), null);
});

test("dedicated brands cannot accidentally reuse the legacy Meta app ID", () => {
  process.env.COM_MOON_INSTAGRAM_APP_ID = "shared-app-id";
  process.env.COM_MOON_INSTAGRAM_APP_SECRET = "legacy-secret";
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_ID = "shared-app-id";
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET = "company-secret";

  const company = resolveMetaOAuthApp({
    provider: "instagram_api", brandKey: "classmoon", brandHandle: "moon.classin",
  });
  const bridge = resolveMetaOAuthApp({
    provider: "instagram_api", brandKey: "bridgemaker", brandHandle: "ml_bridgemaker",
  });
  assert.equal(company.configured, false);
  assert.equal(bridge.configured, true);
});
