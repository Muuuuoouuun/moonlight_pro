import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const LIVE_SEED_PROJECT_ID = "33333333-3333-3333-3333-333333333331";

const nextServerStub = `
export class NextResponse extends Response {
  static json(value, init = {}) {
    return new Response(JSON.stringify(value), {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
  }
}
`;

const ledgerStub = `
export async function getWorkLedger(options) {
  const state = globalThis.__workRouteTestState;
  state.calls.push(options);
  return {
    source: "supabase",
    configured: true,
    workspaceId: "workspace-1",
    decisions: [],
    rituals: [{ id: "ritual-1", projectId: options?.projectId || null }],
    rhythm: { source: "supabase", state: "live", partial: false, truncatedSources: [], error: null },
    roadmap: { source: "supabase", state: "live-empty", partial: false, error: null, failedSources: [], truncatedSources: [], projects: [], milestones: [] },
    summary: { ritualsCompletedThisWeek: 0, ritualsTotalThisWeek: 1, longestStreak: 0, longestStreakRitual: "" },
    ...(state.ledger || {}),
  };
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: `data:text/javascript,${encodeURIComponent(nextServerStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/repositories/work-ledger") {
      return { url: `data:text/javascript,${encodeURIComponent(ledgerStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__workRouteTestState = { calls: [] };
const { GET } = await import("../app/api/hub/work/route.js?project-filter-route-test");

beforeEach(() => {
  globalThis.__workRouteTestState = { calls: [], ledger: null };
});

test("work API passes the selected project to the ledger before rows are limited", async () => {
  const response = await GET(new Request(
    `https://hub.example.com/api/hub/work?project=${PROJECT_ID}`,
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__workRouteTestState.calls, [{ projectId: PROJECT_ID }]);
  assert.equal(body.rituals[0].projectId, PROJECT_ID);
});

test("work API keeps the unscoped ledger query explicit", async () => {
  await GET(new Request("https://hub.example.com/api/hub/work"));

  assert.deepEqual(globalThis.__workRouteTestState.calls, [{ projectId: null }]);
});

test("work API rejects a non-UUID project before reading Supabase", async () => {
  const response = await GET(new Request(
    "https://hub.example.com/api/hub/work?project=project-target",
  ));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid-input");
  assert.equal(body.error, "invalid-project-id");
  assert.deepEqual(globalThis.__workRouteTestState.calls, []);
});

test("work API accepts the canonical PostgreSQL UUID shape used by live seed data", async () => {
  const response = await GET(new Request(
    `https://hub.example.com/api/hub/work?project=${LIVE_SEED_PROJECT_ID}`,
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__workRouteTestState.calls, [{ projectId: LIVE_SEED_PROJECT_ID }]);
});

test("work API preserves configured component failures as partial truth", async () => {
  globalThis.__workRouteTestState.ledger = {
    source: "supabase",
    partial: true,
    failedSources: ["decisions"],
    partialSources: [],
    decisions: [],
    decisionsState: {
      source: "supabase",
      state: "error",
      partial: false,
      failedSources: ["decisions"],
      truncatedSources: [],
      error: { message: "decisions read failed", retryable: true },
    },
  };

  const response = await GET(new Request("https://hub.example.com/api/hub/work"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "partial");
  assert.equal(body.source, "supabase");
  assert.equal(body.partial, true);
  assert.deepEqual(body.failedSources, ["decisions"]);
  assert.equal(body.decisionsState.state, "error");
});
