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
export async function getProjectLedger() {
  return globalThis.__projectsRouteTestState.ledger;
}
`;

const writeGuardStub = `
export function assertHubWriteAllowed() { return null; }
export async function readHubWriteJson() { return { data: {} }; }
`;

const engineClientStub = `
export async function forwardPmsCommand() {
  return { data: {}, httpStatus: 200 };
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "workspace-1"; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: `data:text/javascript,${encodeURIComponent(nextServerStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/repositories/operating-ledger") {
      return { url: `data:text/javascript,${encodeURIComponent(ledgerStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/hub-write-guard") {
      return { url: `data:text/javascript,${encodeURIComponent(writeGuardStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/pms-engine-client") {
      return { url: `data:text/javascript,${encodeURIComponent(engineClientStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-write") {
      return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__projectsRouteTestState = { ledger: null };
const { GET } = await import("../app/api/hub/projects/route.js?project-read-truth-route-test");

beforeEach(() => {
  globalThis.__projectsRouteTestState.ledger = {
    source: "preview",
    configured: false,
    projects: [],
    todos: [],
  };
});

test("projects API preserves configured ledger read errors as retryable upstream failures", async () => {
  globalThis.__projectsRouteTestState.ledger = {
    source: "error",
    configured: true,
    error: "project-ledger-core-read-failed",
    failedSources: ["projects"],
    projects: [],
    todos: [],
  };

  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.equal(body.source, "error");
  assert.equal(body.configured, true);
  assert.equal(body.error, "project-ledger-core-read-failed");
  assert.deepEqual(body.failedSources, ["projects"]);
});

test("projects API keeps genuinely unconfigured ledgers in preview", async () => {
  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "preview");
  assert.equal(body.source, "preview");
  assert.equal(body.configured, false);
});

test("projects API reports a successful Supabase ledger as live", async () => {
  globalThis.__projectsRouteTestState.ledger = {
    source: "supabase",
    configured: true,
    projects: [],
    todos: [],
  };

  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "live");
  assert.equal(body.source, "supabase");
});
