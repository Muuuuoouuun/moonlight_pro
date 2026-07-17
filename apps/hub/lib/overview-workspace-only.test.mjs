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

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(filters = []) {
  return [["workspace_id", "eq.workspace-only"], ...filters];
}
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__overviewWorkspaceOnlyState.calls.push({ kind: "fetch", table, options });
  return null;
}
export async function countSupabaseRows(table, filters = []) {
  globalThis.__overviewWorkspaceOnlyState.calls.push({ kind: "count", table, filters });
  return null;
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "workspace-only"; }
export function resolveSupabaseConfig() { return null; }
`;

const actualModules = new Map([
  ["@/lib/repositories/operating-ledger", new URL("./repositories/operating-ledger.js", import.meta.url).href],
  ["@/lib/repositories/content-ledger", new URL("./repositories/content-ledger.js", import.meta.url).href],
  ["@/lib/repositories/revenue-ledger", new URL("./repositories/revenue-ledger.js", import.meta.url).href],
  ["@/lib/repositories/automations-ledger", new URL("./repositories/automations-ledger.js", import.meta.url).href],
  ["@/lib/repositories/work-ledger", new URL("./repositories/work-ledger.js", import.meta.url).href],
  ["@/lib/operator-home-summary", new URL("./operator-home-summary.js", import.meta.url).href],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: `data:text/javascript,${encodeURIComponent(nextServerStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-read") {
      return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-write") {
      return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    }
    if (actualModules.has(specifier)) {
      return { url: actualModules.get(specifier), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__overviewWorkspaceOnlyState = { calls: [] };

const operatingRepository = await import("./repositories/operating-ledger.js?workspace-only-preview");
const contentRepository = await import("./repositories/content-ledger.js?workspace-only-preview");
const revenueRepository = await import("./repositories/revenue-ledger.js?workspace-only-preview");
const automationsRepository = await import("./repositories/automations-ledger.js?workspace-only-preview");
const workRepository = await import("./repositories/work-ledger.js?workspace-only-preview");
const overviewRoute = await import("../app/api/hub/overview/route.js?workspace-only-preview");

beforeEach(() => {
  globalThis.__overviewWorkspaceOnlyState.calls = [];
});

test("workspace id without Supabase config keeps every Overview repository in preview", async () => {
  const ledgers = await Promise.all([
    operatingRepository.getProjectLedger(),
    contentRepository.getContentLedger(),
    revenueRepository.getRevenueLedger(),
    automationsRepository.getAutomationsLedger(),
    workRepository.getWorkLedger(),
  ]);

  assert.deepEqual(ledgers.map((ledger) => ledger.source), [
    "preview",
    "preview",
    "preview",
    "preview",
    "preview",
  ]);
  assert.deepEqual(ledgers.map((ledger) => ledger.configured), [false, false, false, false, false]);
  assert.equal(ledgers[4].rhythm.state, "preview");
  assert.deepEqual(globalThis.__overviewWorkspaceOnlyState.calls, []);
});

test("workspace-only Overview route stays preview without failure disclosures", async () => {
  const body = await (await overviewRoute.GET()).json();

  assert.equal(body.status, "preview");
  assert.equal(body.source, "preview");
  assert.deepEqual(body.sources.map((source) => source.state), [
    "preview",
    "preview",
    "preview",
    "preview",
    "preview",
  ]);
  assert.deepEqual(body.failedSources, []);
  assert.deepEqual(body.partialSources, []);
  assert.equal(body.rhythm.state, "preview");
  assert.deepEqual(globalThis.__overviewWorkspaceOnlyState.calls, []);
});
