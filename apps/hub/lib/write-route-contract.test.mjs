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
  const postIndex = source.indexOf("export async function POST");
  assert.notEqual(postIndex, -1, "expected a POST mutation handler");
  return source.slice(postIndex);
}

test("write routes never acknowledge mutations with preview or HTTP 202", async () => {
  const routes = await Promise.all([
    readSource("apps/hub/app/api/hub/content/route.js"),
    readSource("apps/hub/app/api/projects/update/route.js"),
    readSource("apps/hub/app/api/hub/inbox/route.js"),
    readSource("apps/hub/app/api/integrations/outcomes/record/route.js"),
    readSource("apps/hub/app/api/calendar/google/event/route.js"),
  ]);

  for (const route of routes) {
    const mutation = mutationSource(route);
    assert.doesNotMatch(mutation, /status\s*:\s*["']preview["']/);
    assert.doesNotMatch(mutation, /\{\s*status\s*:\s*202\s*\}/);
  }
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
