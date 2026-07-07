import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { buildGoogleAuthUrl } from "./google-oauth.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.COM_MOON_OAUTH_STATE_SECRET = "state-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("buildGoogleAuthUrl includes a login hint for the target Google account", () => {
  const url = buildGoogleAuthUrl({
    scopes: ["scope-a"],
    redirectUri: "http://localhost:3000/callback",
    state: "signed-state",
    loginHint: "junhyuk.mun@classin.com",
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("login_hint"), "junhyuk.mun@classin.com");
  assert.equal(parsed.searchParams.get("prompt"), "consent");
});
