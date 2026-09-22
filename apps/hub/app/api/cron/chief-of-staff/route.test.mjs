import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const stubs = {
  "next/server": `export const NextResponse = { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status ?? 200 }) };`,
  "@/lib/hub-write-guard": `export function assertHubWriteAllowed() { return null; }`,
  "@/lib/repositories/followups-ledger": `export async function getFollowups() { return globalThis.__chiefFollowups; }`,
  "@/lib/sales-os/agent-runs": `export async function recordAgentRun() { globalThis.__chiefRuns += 1; return { id: "run-1" }; }`,
  "@/lib/sales-os/brand-context": `export async function assembleBrandContext() { return globalThis.__chiefBrand; }`,
  "@/lib/sales-os/work-orders": `export async function getWorkOrders() { return globalThis.__chiefOrders; }`,
  "@/lib/server-write": `
    export function resolveDefaultWorkspaceId() { return "ws-1"; }
    export async function insertSupabaseRecord() { globalThis.__chiefBriefs += 1; return { persisted: true }; }
  `,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = stubs[specifier];
    if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { GET } = await import("./route.js?chief-of-staff-read-failure");

async function runWith(overrides = {}) {
  globalThis.__chiefRuns = 0;
  globalThis.__chiefBriefs = 0;
  globalThis.__chiefFollowups = { source: "supabase", items: [] };
  globalThis.__chiefOrders = { source: "supabase", orders: [] };
  globalThis.__chiefBrand = { source: "supabase", content: { cadence: null } };
  Object.assign(globalThis, overrides);
  const response = await GET(new Request("https://hub.test/api/cron/chief-of-staff"));
  return response.json();
}

test("a failed approval queue read cannot persist a queue-empty morning brief", async () => {
  const body = await runWith({ __chiefOrders: { source: "error", error: "work-orders-read-failed", orders: [] } });
  assert.equal(body.status, "error");
  assert.equal(globalThis.__chiefRuns, 0);
  assert.equal(globalThis.__chiefBriefs, 0);
});

test("a failed deal read cannot persist a queue-empty morning brief", async () => {
  const body = await runWith({ __chiefFollowups: { source: "error", items: [] } });
  assert.equal(body.status, "error");
  assert.equal(globalThis.__chiefRuns, 0);
  assert.equal(globalThis.__chiefBriefs, 0);
});

test("a failed brand read cannot persist a queue-empty morning brief", async () => {
  const body = await runWith({ __chiefBrand: { source: "error", content: null } });
  assert.equal(body.status, "error");
  assert.equal(globalThis.__chiefRuns, 0);
  assert.equal(globalThis.__chiefBriefs, 0);
});
