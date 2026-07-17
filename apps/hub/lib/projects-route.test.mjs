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
export async function getProjectLedger(options) {
  const state = globalThis.__projectsRouteTestState;
  state.ledgerArgs.push(options);
  if (state.throwError) throw state.throwError;
  return state.ledger;
}
`;

const writeGuardStub = `
export function assertHubWriteAllowed() { return null; }
export async function readHubWriteJson() {
  return { data: globalThis.__projectsRouteTestState.payload || {} };
}
`;

const engineClientStub = `
export async function forwardPmsCommand(command) {
  globalThis.__projectsRouteTestState.forwarded.push(command);
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

globalThis.__projectsRouteTestState = {
  ledger: null,
  throwError: null,
  payload: {},
  forwarded: [],
  ledgerArgs: [],
};
const projectRoute = await import("../app/api/hub/projects/route.js?project-read-truth-route-test");
const taskRoute = await import("../app/api/hub/tasks/route.js?task-write-workspace-route-test");
const brandRoute = await import("../app/api/hub/brands/route.js?brand-write-workspace-route-test");
const { GET } = projectRoute;

beforeEach(() => {
  globalThis.__projectsRouteTestState.throwError = null;
  globalThis.__projectsRouteTestState.payload = {};
  globalThis.__projectsRouteTestState.forwarded = [];
  globalThis.__projectsRouteTestState.ledgerArgs = [];
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

test("projects API preserves optional ledger failures as named partial data", async () => {
  globalThis.__projectsRouteTestState.ledger = {
    source: "supabase",
    configured: true,
    partial: true,
    failedSources: ["project_updates", "notes"],
    projects: [{ id: "project-1" }],
    todos: [],
  };

  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "partial");
  assert.equal(body.source, "supabase");
  assert.equal(body.partial, true);
  assert.deepEqual(body.failedSources, ["project_updates", "notes"]);
  assert.deepEqual(body.projects, [{ id: "project-1" }]);
});

test("projects API forwards a canonical selected project to the repository", async () => {
  const projectId = "99999999-9999-4999-8999-999999999999";
  const response = await GET(new Request(`https://hub.example.com/api/hub/projects?project=${projectId}`));

  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__projectsRouteTestState.ledgerArgs, [{ projectId }]);
});

test("projects API rejects a non-canonical selected project before reading the ledger", async () => {
  const response = await GET(new Request("https://hub.example.com/api/hub/projects?project=outside-cap"));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "invalid-input");
  assert.equal(body.error, "invalid-project-id");
  assert.equal(globalThis.__projectsRouteTestState.ledgerArgs.length, 0);
});

test("projects API never leaks internal exception details", async () => {
  globalThis.__projectsRouteTestState.throwError = new Error("column private_customer_secret does not exist");
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 500);
    assert.equal(body.status, "error");
    assert.equal(body.error, "project-ledger-request-failed");
    assert.equal(body.retryable, true);
    assert.doesNotMatch(serialized, /private_customer_secret|column/i);
  } finally {
    console.error = originalError;
    globalThis.__projectsRouteTestState.throwError = null;
  }
});

test("guarded PMS writes discard client workspace ids before forwarding to Engine", async () => {
  const state = globalThis.__projectsRouteTestState;
  const writes = [
    [projectRoute.POST, "create_project"],
    [projectRoute.PATCH, "update_project"],
    [taskRoute.POST, "create_task"],
    [taskRoute.PATCH, "update_task"],
    [brandRoute.POST, "create_brand"],
  ];

  for (const [write, action] of writes) {
    state.payload = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Scoped write",
      workspaceId: "99999999-9999-4999-8999-999999999999",
    };
    await write(new Request("https://hub.example.com/api/hub/write", { method: "POST" }));
    const forwarded = state.forwarded.at(-1);
    assert.equal(forwarded.action, action);
    assert.equal(forwarded.workspaceId, "workspace-1");
  }
});
