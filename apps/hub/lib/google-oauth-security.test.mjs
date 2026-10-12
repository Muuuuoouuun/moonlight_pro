import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { register } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";

import { decodeState, encodeState, sanitizeReturnPath } from "./google-oauth.js";
import { decodeGoogleCalendarState } from "./google-calendar.js";
import { decodeGoogleGmailState } from "./google-gmail.js";
import { decodeGoogleSheetsState } from "./google-sheets.js";

// The real routes use Next's extensionless export; Node's native test runner
// needs only this resolution adaptation, without replacing any route behavior.
register("data:text/javascript,export async function resolve(s,c,n){return n(s===\"next/server\"?\"next/server.js\":s,c)}", import.meta.url);

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const STATE_SECRET = "google-oauth-security-test-secret";
const ORIGIN = "https://hub.example.com";
let fetchCalls;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, COM_MOON_OAUTH_STATE_SECRET: STATE_SECRET };
  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("External fetch is forbidden in OAuth boundary tests.");
  };
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(fetchCalls, 0, "boundary failures must not exchange tokens or access persistence");
});

function signedState(value, secret = STATE_SECRET) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

const providers = [
  { key: "calendar", route: "calendar/google", fallback: "/dashboard/work/calendar", decode: decodeGoogleCalendarState },
  { key: "gmail", route: "email/gmail", fallback: "/dashboard/automations/email", decode: decodeGoogleGmailState },
  { key: "sheets", route: "integrations/sheets", fallback: "/dashboard/automations/integrations", decode: decodeGoogleSheetsState },
];
const unsafePaths = [
  "https://outside.example", "//outside.example", "/\\outside.example", "/\t/outside.example",
  "/dashboard\r\nLocation: https://outside.example", "/dashboard\u0000", "/dashboard\u007f", "dashboard",
];

for (const provider of providers) {
  test(`${provider.key} rejects missing and malformed OAuth state`, () => {
    const valid = signedState({ workspaceId: "workspace-one", iat: Date.now() });
    for (const value of [undefined, null, "", 42, "invalid", `${valid}.extra`, `${valid.slice(0, -1)}!`]) {
      assert.deepEqual(provider.decode(value), { invalid: true });
    }
  });

  test(`${provider.key} rejects invalid payload shapes and expired issue times`, () => {
    for (const body of [null, [], "text", 42, {}, { iat: "123" }, { iat: null }, { iat: 0 },
      { iat: -1 }, { iat: 1.5 }, { iat: Date.now() + 60_000 }, { iat: Date.now() - 15 * 60_000 - 60_000 }]) {
      assert.deepEqual(provider.decode(signedState(body)), { invalid: true });
    }
  });

  test(`${provider.key} retains the existing freshly signed payload contract`, () => {
    const body = { workspaceId: "workspace-one", provider: provider.key, iat: Date.now(),
      returnPath: provider.fallback, mailbox: "me", calendarId: "primary", spreadsheetId: "sheet-one" };
    assert.deepEqual(provider.decode(signedState(body)), body);
  });

  test(`${provider.key} callback rejects missing or expired state before any token exchange`, async () => {
    const { GET } = await import(`../app/api/${provider.route}/callback/route.js`);
    for (const state of [null, "forged", signedState({ iat: Date.now() - 15 * 60_000 - 60_000 })]) {
      const request = new URL(`/api/${provider.route}/callback`, ORIGIN);
      request.searchParams.set("code", "never-exchanged-test-code");
      if (state !== null) request.searchParams.set("state", state);
      const response = await GET(new NextRequest(request));
      const target = new URL(response.headers.get("location"));
      assert.equal(response.status, 307);
      assert.equal(target.origin, ORIGIN);
      assert.equal(target.pathname, provider.fallback);
      assert.equal(target.searchParams.get(provider.key), "invalid-state");
    }
  });

  test(`${provider.key} callback keeps unsafe return paths within the Hub without a code`, async () => {
    const { GET } = await import(`../app/api/${provider.route}/callback/route.js`);
    for (const returnPath of unsafePaths) {
      const request = new URL(`/api/${provider.route}/callback`, ORIGIN);
      request.searchParams.set("state", signedState({ iat: Date.now(), returnPath }));
      const target = new URL((await GET(new NextRequest(request))).headers.get("location"));
      assert.equal(target.origin, ORIGIN);
      assert.equal(target.pathname, provider.fallback);
      assert.equal(target.searchParams.get(provider.key), "missing-code");
    }
  });

  test(`${provider.key} callback preserves a valid local return path, query, and fragment`, async () => {
    const { GET } = await import(`../app/api/${provider.route}/callback/route.js`);
    const request = new URL(`/api/${provider.route}/callback`, ORIGIN);
    request.searchParams.set("state", signedState({ iat: Date.now(), returnPath: "/dashboard/settings?tab=integrations#google" }));
    const target = new URL((await GET(new NextRequest(request))).headers.get("location"));
    assert.equal(target.origin, ORIGIN);
    assert.equal(target.pathname, "/dashboard/settings");
    assert.equal(target.searchParams.get("tab"), "integrations");
    assert.equal(target.searchParams.get(provider.key), "missing-code");
    assert.equal(target.hash, "#google");
  });

  for (const configuration of ["missing-state-secret", "missing-google-client"]) {
    test(`${provider.key} connect fallback validates return paths when ${configuration}`, async () => {
      const { GET } = await import(`../app/api/${provider.route}/connect/route.js`);
      delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
      if (configuration === "missing-state-secret") delete process.env.COM_MOON_OAUTH_STATE_SECRET;
      else {
        delete process.env.GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_SECRET;
        process.env.GOOGLE_OAUTH_ENABLED_PROVIDERS = "calendar,gmail,sheets";
      }
      for (const returnPath of unsafePaths) {
        const request = new URL(`/api/${provider.route}/connect`, ORIGIN);
        request.searchParams.set("returnPath", returnPath);
        const response = await GET(new NextRequest(request));
        const target = new URL(response.headers.get("location"));
        assert.equal(response.status, 307);
        assert.equal(target.origin, ORIGIN);
        assert.equal(target.pathname, provider.fallback);
        assert.equal(target.searchParams.get(provider.key), configuration === "missing-state-secret"
          ? "missing-oauth-state-secret" : "missing-google-config");
      }
    });
  }
}

test("the shared Google signer produces a freshly decodable state", () => {
  const decoded = decodeState(encodeState({ workspaceId: "workspace-one" }));
  assert.equal(decoded.workspaceId, "workspace-one");
  assert.ok(Number.isSafeInteger(decoded.iat));
});

test("Gmail retains its existing shared-secret fallback for freshly signed state", () => {
  delete process.env.COM_MOON_OAUTH_STATE_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = "gmail-existing-test-secret";
  const body = { iat: Date.now(), mailbox: "me", workspaceId: "workspace-one" };
  const value = signedState(body, "gmail-existing-test-secret");
  assert.deepEqual(decodeGoogleGmailState(value), body);
  assert.deepEqual(decodeGoogleCalendarState(value), { invalid: true });
  assert.deepEqual(decodeGoogleSheetsState(value), { invalid: true });
});

test("Google return paths accept local navigation and reject unsafe URL forms", () => {
  const fallback = "/dashboard/settings";
  for (const path of unsafePaths) assert.equal(sanitizeReturnPath(path, fallback), fallback);
  for (const path of ["/dashboard/work/calendar", "/dashboard/settings?tab=integrations#google", "/", "/%5Coutside.example"]) {
    assert.equal(sanitizeReturnPath(path, fallback), path);
    assert.equal(new URL(sanitizeReturnPath(path, fallback), ORIGIN).origin, ORIGIN);
  }
});
