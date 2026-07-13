import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

function mutationSource(source) {
  const mutationIndices = ["POST", "PATCH", "PUT", "DELETE"]
    .map((method) => source.indexOf(`export async function ${method}`))
    .filter((index) => index >= 0);
  assert.ok(mutationIndices.length > 0, "expected a mutation handler");
  return source.slice(Math.min(...mutationIndices));
}

test("write routes never acknowledge mutations with preview or HTTP 202", async () => {
  const routes = await Promise.all([
    readSource("apps/hub/app/api/hub/content/route.js"),
    readSource("apps/hub/app/api/projects/update/route.js"),
    readSource("apps/hub/app/api/hub/inbox/route.js"),
    readSource("apps/hub/app/api/integrations/outcomes/record/route.js"),
    readSource("apps/hub/app/api/calendar/google/event/route.js"),
    readSource("apps/hub/app/api/hub/tasks/route.js"),
    readSource("apps/hub/app/api/hub/tasks/[id]/route.js"),
  ]);

  for (const route of routes) {
    const mutation = mutationSource(route);
    assert.doesNotMatch(mutation, /status\s*:\s*["']preview["']/);
    assert.doesNotMatch(mutation, /\{\s*status\s*:\s*202\s*\}/);
  }
});

test("durable Task BFF routes guard, limit JSON, then proxy to the exact Engine path", async () => {
  const [createRoute, updateRoute] = await Promise.all([
    readSource("apps/hub/app/api/hub/tasks/route.js"),
    readSource("apps/hub/app/api/hub/tasks/[id]/route.js"),
  ]);

  for (const source of [createRoute, updateRoute]) {
    const guard = source.indexOf("assertHubWriteAllowed(req)");
    const read = source.indexOf("readHubWriteJson(req)");
    const send = source.indexOf("sendEngineWrite(");
    assert.ok(guard >= 0 && guard < read && read < send, "route order must be auth -> bounded JSON -> Engine");
    assert.match(source, /idempotency-key/i);
    assert.match(source, /x-correlation-id/i);
    assert.doesNotMatch(source, /SUPABASE_|insertSupabase|updateSupabase|callSupabaseRpc/);
  }

  assert.match(createRoute, /export async function POST/);
  assert.match(createRoute, /sendEngineWrite\(["']\/api\/tasks["']/);
  assert.match(updateRoute, /export async function PATCH/);
  assert.match(updateRoute, /encodeURIComponent\(id\)/);
  assert.doesNotMatch(updateRoute, /taskId\s*:\s*id\b/);
  for (const forgedField of ["id", "taskId", "task_id"]) {
    assert.match(
      updateRoute,
      new RegExp(`${forgedField}:\\s*_[A-Za-z]+`),
      `PATCH body must discard forged ${forgedField}; the route param is canonical`,
    );
  }
});

test("Hub Inbox keeps pure classification but only proxies durable inbox work orders", async () => {
  const inboxRoute = await readSource("apps/hub/app/api/hub/inbox/route.js");
  const guard = inboxRoute.indexOf("assertHubWriteAllowed(req)");
  const read = inboxRoute.indexOf("readHubWriteJson(req)");
  const send = inboxRoute.indexOf("sendEngineWrite(");

  assert.ok(guard >= 0 && guard < read && read < send, "inbox order must be auth -> bounded JSON -> Engine");
  assert.match(inboxRoute, /classifyCapture\(/);
  assert.match(inboxRoute, /destination:\s*["']inbox["']/);
  for (const field of ["raw", "kind", "persona", "summary"]) {
    assert.match(inboxRoute, new RegExp(`(?:${field}\\s*:|\\b${field},)`));
  }
  assert.match(inboxRoute, /sendEngineWrite\(["']\/api\/intake\/quick-capture["']/);
  assert.doesNotMatch(inboxRoute, /routeCapture|createWorkOrder|insertSupabase|updateSupabase|callSupabaseRpc/);
});

test("compound insert routes explicitly mark partial persistence as non-retryable", async () => {
  const [contentRoute, projectRoute] = await Promise.all([
    readSource("apps/hub/app/api/hub/content/route.js"),
    readSource("apps/hub/app/api/projects/update/route.js"),
  ]);

  assert.match(contentRoute, /partialPersisted:\s*true/);
  assert.match(contentRoute, /partialWrite:/);
  assert.match(projectRoute, /partialPersisted:\s*true/);
  assert.match(projectRoute, /partialWrite:/);
});

test("Phase 0 target updates require a returned row before reporting persistence", async () => {
  const [contentRoute, projectRoute] = await Promise.all([
    readSource("apps/hub/app/api/hub/content/route.js"),
    readSource("apps/hub/app/api/projects/update/route.js"),
  ]);

  assert.equal(
    (contentRoute.match(/returnRepresentation:\s*true/g) || []).length,
    2,
    "both content item and variant PATCH calls must request affected-row representations",
  );
  assert.match(contentRoute, /select:\s*["']id["']/);
  assert.match(projectRoute, /returnRepresentation:\s*true/);
  assert.match(projectRoute, /select:\s*["']id["']/);
});

test("outcome recording delegates authorization and JSON limits to the shared Hub guard", async () => {
  const outcomeRoute = await readSource("apps/hub/app/api/integrations/outcomes/record/route.js");

  assert.match(outcomeRoute, /assertHubWriteAllowed\(req\)/);
  assert.match(outcomeRoute, /readHubWriteJson\(req/);
  assert.doesNotMatch(outcomeRoute, /timingSafeEqual|function\s+authorize|function\s+isSameOrigin/);
});

test("operator session route delegates JSON limits and never exposes the raw secret", async () => {
  const [sessionRoute, writeGuard] = await Promise.all([
    readSource("apps/hub/app/api/hub/session/route.js"),
    readSource("apps/hub/lib/hub-write-guard.js"),
  ]);

  assert.match(sessionRoute, /readHubWriteJson\(req/);
  assert.match(sessionRoute, /httpOnly:\s*true/);
  assert.match(sessionRoute, /sameSite:\s*["']strict["']/);
  assert.match(sessionRoute, /path:\s*["']\/["']/);
  assert.match(writeGuard, /webcrypto\.subtle/);
  assert.match(writeGuard, /createHmac\(["']sha256["']/);
  assert.match(writeGuard, /timingSafeEqual/);
  assert.doesNotMatch(sessionRoute, /localStorage|sessionStorage|console\.(?:log|info|debug)/);
});

test("Google mutation errors carry upstream status into the route classifier", async () => {
  const [calendarHelper, calendarRoute] = await Promise.all([
    readSource("apps/hub/lib/google-calendar.js"),
    readSource("apps/hub/app/api/calendar/google/event/route.js"),
  ]);

  assert.match(calendarHelper, /class GoogleCalendarHttpError extends Error/);
  assert.match(calendarHelper, /this\.httpStatus\s*=\s*httpStatus/);
  assert.match(calendarRoute, /error\?\.httpStatus/);
  assert.match(calendarRoute, /`http-\$\{upstreamStatus\}`/);
});

test("project update form describes degraded setup instead of preview success", async () => {
  const form = await readSource("apps/hub/components/forms/project-update-form.jsx");

  assert.doesNotMatch(form, /status\s*===\s*["']preview["']/);
  assert.match(form, /status\s*===\s*["']degraded["']/);
  assert.match(form, /Setup required/);
});
