import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

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
  globalThis.__workRouteTestState = { calls: [] };
});

test("work API passes the selected project to the ledger before rows are limited", async () => {
  const response = await GET(new Request(
    "https://hub.example.com/api/hub/work?project=project-target",
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__workRouteTestState.calls, [{ projectId: "project-target" }]);
  assert.equal(body.rituals[0].projectId, "project-target");
});

test("work API keeps the unscoped ledger query explicit", async () => {
  await GET(new Request("https://hub.example.com/api/hub/work"));

  assert.deepEqual(globalThis.__workRouteTestState.calls, [{ projectId: null }]);
});
