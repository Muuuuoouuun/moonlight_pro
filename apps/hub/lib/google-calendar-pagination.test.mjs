import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Execute the real auth-read/pagination adapter with a memory-only HTTP boundary.
// Every possible fetch is intercepted, and any non-read operation fails the test.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/server-write") return {
    shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(`
      export function resolveDefaultWorkspaceId() { return "synthetic-workspace"; }
      export function resolveSupabaseConfig() { return { url: "https://supabase.test", apiKey: "synthetic" }; }
      export function makeSupabaseHeaders() { return {}; }
      export function insertSupabaseRecord() { throw new Error("unexpected write"); }
      export function updateSupabaseRecord() { throw new Error("unexpected write"); }
    `)}`,
  };
  return nextResolve(specifier, context);
} });
const { listGoogleCalendarEvents } = await import("./google-calendar.js");

test("production OAuth adapter follows pageToken with fixed query/auth scope and one timeout signal", async t => {
  const calls = [];
  const connection = {
    id: "synthetic-connection",
    config: { accessToken: "synthetic-not-a-credential", expiresAt: "2100-01-01T00:00:00Z", calendarId: "synthetic/calendar" },
  };
  t.mock.method(globalThis, "fetch", async (target, init = {}) => {
    assert.equal(init.method || "GET", "GET");
    const url = new URL(target);
    if (url.hostname === "supabase.test") return Response.json([connection]);
    assert.equal(url.hostname, "www.googleapis.com");
    calls.push({ url, init });
    return Response.json(calls.length === 1
      ? { items: [], nextPageToken: "page two / encoded" }
      : { items: [{ id: "last", start: { dateTime: "2026-10-20T08:00:00Z" } }] });
  });
  const read = await listGoogleCalendarEvents({
    timeMin: "2026-10-19T15:00:00Z", timeMax: "2026-10-20T15:00:00Z", maxResults: 50,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get("pageToken"), null);
  assert.equal(calls[1].url.searchParams.get("pageToken"), "page two / encoded");
  for (const call of calls) {
    assert.equal(call.url.pathname, "/calendar/v3/calendars/synthetic%2Fcalendar/events");
    assert.equal(call.url.searchParams.get("maxResults"), "50");
    assert.equal(call.url.searchParams.get("timeMin"), "2026-10-19T15:00:00Z");
    assert.equal(call.url.searchParams.get("timeMax"), "2026-10-20T15:00:00Z");
    assert.equal(call.url.searchParams.get("singleEvents"), "true");
    assert.equal(call.url.searchParams.get("orderBy"), "startTime");
    assert.equal(call.init.headers.authorization, "Bearer synthetic-not-a-credential");
  }
  assert.equal(calls[0].init.signal, calls[1].init.signal, "whole traversal shares one timeout budget");
  assert.equal(read.coverage.complete, true);
  assert.equal(read.items[0].id, "last");
});
