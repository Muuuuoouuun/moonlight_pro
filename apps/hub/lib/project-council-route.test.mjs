import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = globalThis.__projectCouncilRouteTest = {};
const stubs = {
  "@/lib/hub-write-guard": `export function assertHubWriteAllowed() { return globalThis.__projectCouncilRouteTest.guard || null; }
    export async function readHubWriteJson(req) { return { data: await req.json() }; }`,
  "@/lib/repositories/content-ledger": `export async function getContentLedger() {
    globalThis.__projectCouncilRouteTest.reads++; return globalThis.__projectCouncilRouteTest.content; }`,
  "@/lib/repositories/operating-ledger": `export async function getProjectLedger(args) {
    globalThis.__projectCouncilRouteTest.reads++;
    globalThis.__projectCouncilRouteTest.projectArgs = args;
    return globalThis.__projectCouncilRouteTest.ledger; }`,
  "@/lib/sales-os/agent-runs": `export async function getRecentAgentRuns() { return globalThis.__projectCouncilRouteTest.memory; }
    export async function recordAgentRun(input) { globalThis.__projectCouncilRouteTest.run = input; return { persisted: true, id: 'run-a' }; }
    export async function setAgentRunEmittedCount() { throw new Error('unexpected emission'); }`,
  "@/lib/sales-os/work-orders": `export async function createWorkOrder() { throw new Error('unexpected work order'); }`,
  "@/lib/server-read": `export async function fetchSupabaseRows() { globalThis.__projectCouncilRouteTest.reads++; throw new Error('unexpected record read'); }
    export function withWorkspaceFilter(filters) { return filters; }`,
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "next/server") return next("next/server.js", context);
  if (stubs[specifier]) return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import("../app/api/hub/brand-mentor/route.js");
const { POST: personaPOST } = await import("../app/api/hub/persona-chat/route.js");
const { requestCouncilAdvice } = await import("../components/hub/council-client.js");
const { projectCouncilScope } = await import("./project-council-context.js");

beforeEach(t => {
  for (const key of Object.keys(state)) delete state[key];
  state.reads = 0;
  state.engineCalls = [];
  state.content = { source: "supabase", brands: [
    { key: "brand-a", orgScope: "personal", name: "선택 브랜드", voice: "A" },
    { key: "brand-b", orgScope: "personal", name: "무관한 개인 브랜드", voice: "B" },
    { key: "company", orgScope: "classin", name: "회사 브랜드", voice: "회사" },
  ], items: [{ id: "idea-b", brandKey: "brand-b" }], ideaQueue: [{ id: "idea-b", title: "무관한 아이디어", brandKey: "brand-b" }] };
  state.ledger = { source: "supabase", projects: [
    { id: "project-a", name: "동일 이름", orgScope: "personal", workspace: "brand", brand: "brand-a", status: "Active", tasks: 1, done: 0 },
    { id: "project-b", name: "동일 이름", orgScope: "personal", workspace: "brand", brand: "brand-b" },
    { id: "project-company", name: "동일 이름", orgScope: "classin", workspace: "classin", brand: "company" },
  ], todos: [
    { id: "task-a", project: "project-a", workspace: "brand", title: "연결된 할 일", status: "blocked", done: false, nextAction: "자료 확인", checklist: [{ title: "원문 대조", done: true }] },
    { id: "task-b", project: "project-b", workspace: "brand", title: "무관한 개인 할 일" },
    { id: "task-company", project: "project-company", workspace: "classin", title: "회사 할 일" },
  ] };
  state.memory = { source: "supabase", runs: [
    { id: "run-a", agent: "council", ref: "project-a" },
    { id: "run-b", agent: "council", ref: "project-b" },
    { id: "run-guru", agent: "guru", ref: "project-a" },
  ] };
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.COM_MOON_ENGINE_URL;
  process.env.COM_MOON_ENGINE_URL = "http://engine.test";
  globalThis.fetch = async (url, options) => {
    assert.ok(["http://engine.test/api/ai/brand-mentor", "http://engine.test/api/ai/persona-chat"].includes(url), "no real network is permitted");
    state.engineCalls.push(JSON.parse(options.body));
    return Response.json({ status: "generated", text: "합성 자문" });
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.COM_MOON_ENGINE_URL;
    else process.env.COM_MOON_ENGINE_URL = oldUrl;
  });
});

const request = input => new Request("http://hub.test/api/hub/brand-mentor", { method: "POST", body: JSON.stringify(input) });
const projectRequest = changes => ({ mode: "flow-review", contextType: "project", scope: "personal", ref: "project-a", draft: "막힌 일을 검토해 주세요.", ...changes });

test("the full project route sends only the exact personal project, its canonical tasks and linked brand", async () => {
  const response = await POST(request(projectRequest()));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "generated");
  assert.deepEqual(state.projectArgs, { projectId: "project-a" });
  const context = state.engineCalls[0].context;
  assert.equal(context.scope, "personal");
  assert.equal(context.focus.entity.id, "project-a");
  assert.equal(context.focus.entity.orgScope, "personal");
  assert.deepEqual(context.projects.map(row => row.id), ["project-a"]);
  assert.deepEqual(context.brands.map(row => row.key), ["brand-a"]);
  assert.deepEqual(context.memory.recent_runs.map(row => row.id), ["run-a"]);
  assert.equal(context.projects[0].todos[0].nextAction, "자료 확인");
  assert.deepEqual(context.projects[0].todos[0].checklist, [{ title: "원문 대조", done: true }]);
  assert.doesNotMatch(JSON.stringify(context), /무관한|회사 할 일|회사 브랜드|project-company/);
  assert.equal(state.run.ref, "project-a");
});

test("company, unknown or missing scope and missing ID fail before any context or model call", async () => {
  for (const changes of [
    { scope: "classin" }, { scope: "all" }, { scope: null }, { scope: undefined },
    { ref: null }, { ref: "" }, { ref: 7 }, { mode: "office-review" }, { mode: "open-question" },
  ]) {
    const response = await POST(request(projectRequest(changes)));
    assert.equal(response.status, 400, JSON.stringify(changes));
    assert.equal((await response.json()).status, "error");
  }
  assert.equal(state.reads, 0);
  assert.deepEqual(state.engineCalls, []);
  assert.equal(state.run, undefined);
});

test("display names, stale IDs and a company project claimed as personal never fall back to personal portfolio", async () => {
  for (const ref of ["동일 이름", "project-missing", "project-company"]) {
    const response = await POST(request(projectRequest({ ref })));
    assert.equal(response.status, 409, ref);
    assert.equal((await response.json()).status, "error");
  }
  assert.deepEqual(state.engineCalls, []);
  assert.equal(state.run, undefined);
});

test("unknown or conflicting authoritative project scope is rejected", async () => {
  for (const changes of [
    { orgScope: undefined, workspace: undefined },
    { orgScope: "unknown", workspace: "brand" },
    { orgScope: "personal", workspace: "classin" },
  ]) {
    Object.assign(state.ledger.projects[0], changes);
    const response = await POST(request(projectRequest()));
    assert.equal(response.status, 409);
  }
  assert.deepEqual(state.engineCalls, []);
  assert.equal(projectCouncilScope({ workspace: "brand" }), "personal");
  assert.equal(projectCouncilScope({ orgScope: "classin" }), "classin");
});

test("missing project ledger blocks generation even when personal content is available", async () => {
  for (const source of ["error", "preview"]) {
    state.ledger = { source, projects: [], error: "unavailable" };
    const response = await POST(request(projectRequest()));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /원장을 읽을 수 없/);
  }
  assert.deepEqual(state.engineCalls, []);
});

test("project task partial reads are disclosed instead of implying a complete task list", async () => {
  state.ledger.partial = true;
  state.ledger.failedSources = ["tasks"];
  state.ledger.projects[0].tasksPartial = true;
  const response = await POST(request(projectRequest()));
  assert.equal(response.status, 200);
  const context = state.engineCalls[0].context;
  assert.equal(context.source, "partial");
  assert.equal(context.focus.entity.tasksPartial, true);
  assert.ok(context.missing.some(row => row.source === "operating-ledger" && row.failedSources.includes("tasks")));
});

test("scope is not bypassed by omitting project context type and existing write guard runs first", async () => {
  const response = await POST(request({ scope: "classin", ref: "project-company" }));
  assert.equal(response.status, 400);
  state.guard = Response.json({ error: "blocked" }, { status: 403 });
  assert.equal((await POST(request(projectRequest()))).status, 403);
  assert.equal(state.reads, 0);
  assert.deepEqual(state.engineCalls, []);
});

test("Council client rejects invalid project boundaries and serializes valid scope and exact ID", async () => {
  let body;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/hub/brand-mentor");
    body = JSON.parse(options.body);
    return Response.json({ status: "generated", text: "응답" });
  };
  for (const changes of [{ scope: "classin" }, { scope: null }, { ref: null }, { contextType: null, scope: "classin" }]) {
    assert.equal((await requestCouncilAdvice(projectRequest(changes))).state, "error");
    assert.equal(body, undefined);
  }
  assert.equal((await requestCouncilAdvice(projectRequest())).state, "done");
  assert.equal(body.scope, "personal");
  assert.equal(body.ref, "project-a");
  assert.equal(body.contextType, "project");
});

test("bounded task context declares truncation without changing canonical task totals", async () => {
  state.ledger.projects[0].tasks = 51;
  state.ledger.todos = Array.from({ length: 51 }, (_, index) => ({
    id: `task-${index}`, project: "project-a", title: `할 일 ${index}`, status: "todo",
  }));
  await POST(request(projectRequest()));
  const context = state.engineCalls[0].context;
  assert.equal(context.focus.entity.tasks, 51);
  assert.equal(context.focus.entity.todos.length, 50);
  assert.equal(context.focus.entity.todosPartial, true);
  assert.equal(context.source, "partial");
  assert.ok(context.missing.some(row => row.reason === "task-context-truncated"));
});

test("project persona extraction and lens chat never enrich selected context with repository records", async () => {
  const context = { source: "operator-provided", scope: "personal", id: "project-a", title: "선택한 일", todos: [{ title: "연결된 할 일" }] };
  for (const input of [
    { personaId: "order", mode: "extract-actions" },
    { personaId: "council", mode: "chat", lens: "voss" },
    { personaId: "council", mode: "critique" },
  ]) {
    const response = await personaPOST(request({ ...input, draft: "선택한 프로젝트 질문", context, conversationOnly: true }));
    assert.equal(response.status, 200);
    assert.deepEqual(state.engineCalls.at(-1).context, context);
    assert.equal(state.engineCalls.at(-1).conversationOnly, true);
  }
  assert.equal(state.reads, 0);
});
