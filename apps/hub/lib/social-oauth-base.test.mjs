import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { resolveGoogleCalendarRedirectUri } from "./google-calendar.js";
import {
  buildMetaThreadsSetupUrls,
  resolveMetaThreadsRedirectUri,
} from "./meta-threads.js";
import {
  buildInstagramApiSetupUrls,
  resolveInstagramApiRedirectUri,
} from "./instagram-api.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

test("social OAuth tunnel leaves Google Calendar on the local Hub origin", () => {
  delete process.env.COM_MOON_HUB_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.COM_MOON_SOCIAL_OAUTH_BASE_URL = "https://social-tunnel.example.com/";

  assert.equal(resolveMetaThreadsRedirectUri("http://localhost:3000"),
    "https://social-tunnel.example.com/api/social/meta/threads/callback");
  assert.equal(resolveInstagramApiRedirectUri("http://localhost:3000"),
    "https://social-tunnel.example.com/api/social/instagram/callback");
  assert.equal(buildMetaThreadsSetupUrls("http://localhost:3000").dataDeletionCallbackUrl,
    "https://social-tunnel.example.com/api/social/meta/threads/data-deletion");
  assert.equal(buildInstagramApiSetupUrls("http://localhost:3000").privacyUrl,
    "https://social-tunnel.example.com/legal/privacy");
  assert.equal(resolveGoogleCalendarRedirectUri("http://localhost:3000"),
    "http://localhost:3000/api/calendar/google/callback");
});

test("social OAuth keeps the existing global Hub URL fallback", () => {
  delete process.env.COM_MOON_SOCIAL_OAUTH_BASE_URL;
  process.env.COM_MOON_HUB_URL = "https://hub.example.com/";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

  assert.equal(resolveMetaThreadsRedirectUri("http://localhost:3000"),
    "https://hub.example.com/api/social/meta/threads/callback");
  assert.equal(resolveInstagramApiRedirectUri("http://localhost:3000"),
    "https://hub.example.com/api/social/instagram/callback");
});
