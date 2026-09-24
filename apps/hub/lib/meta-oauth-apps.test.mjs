import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { matchesMetaOAuthConnection, resolveMetaOAuthApp, resolveMetaOAuthAppFromState } from "./meta-oauth-apps.js";

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

test("Meta status selects only the requested account bound to the selected app", () => {
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_ID = "company-id";
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET = "company-secret";
  const app = resolveMetaOAuthApp({ provider: "instagram_api", brandKey: "classmoon", brandHandle: "moon.classin" });
  const valid = { account_key: "account-1", config: {
    username: "moon.classin", brandHandle: "moon.classin", brandKey: "classmoon",
    oauthAppId: "company-id", oauthAppKey: "classmoon",
  } };
  assert.equal(matchesMetaOAuthConnection(valid, app, "account-1"), true);
  assert.equal(matchesMetaOAuthConnection(valid, app, "another-account"), false);
  assert.equal(matchesMetaOAuthConnection({ ...valid, config: { ...valid.config, oauthAppId: "other-id" } }, app), false);
  assert.equal(matchesMetaOAuthConnection({ ...valid, config: { ...valid.config, oauthAppKey: "moonlight" } }, app), false);
  assert.equal(matchesMetaOAuthConnection({ ...valid, config: { ...valid.config, brandKey: "bridgemaker" } }, app), false);
  assert.equal(matchesMetaOAuthConnection({ ...valid, config: { ...valid.config, username: "other" } }, app), false);
});

test("only BridgeMaker's legacy Moonlight account may omit app identity", () => {
  process.env.COM_MOON_INSTAGRAM_APP_ID = "legacy-id";
  process.env.COM_MOON_INSTAGRAM_APP_SECRET = "legacy-secret";
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_ID = "company-id";
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET = "company-secret";
  const bridge = resolveMetaOAuthApp({ provider: "instagram_api", brandKey: "bridgemaker", brandHandle: "ml_bridgemaker" });
  const company = resolveMetaOAuthApp({ provider: "instagram_api", brandKey: "classmoon", brandHandle: "moon.classin" });
  const legacy = { account_key: "legacy-account", config: { username: "ml_bridgemaker", brandHandle: "ml_bridgemaker", brandKey: null } };
  assert.equal(matchesMetaOAuthConnection(legacy, bridge), true);
  assert.equal(matchesMetaOAuthConnection(legacy, company), false);
  assert.equal(matchesMetaOAuthConnection({ ...legacy, config: { ...legacy.config, brandKey: "classmoon" } }, bridge), false);
  assert.equal(matchesMetaOAuthConnection({ ...legacy, config: { ...legacy.config, oauthAppKey: "moonlight" } }, bridge), false);
});
