import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, test } from "node:test";

const hubRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const relative = specifier.slice(2);
    const target = /\.[a-z]+$/i.test(relative) ? relative : `${relative}.js`;
    return nextResolve(new URL(target, hubRoot).href, context);
  },
});

const { fetchSupabaseRowsWithState } = await import("./server-read.js");
const {
  getCanonicalTaskRead,
  mapCanonicalTodoForProjects,
} = await import("./repositories/operating-ledger.js");

const ORIGINAL_ENV = { ...process.env };
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("discriminated Supabase reads distinguish preview, live empty, HTTP, JSON, and network states", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  let calls = 0;
  const preview = await fetchSupabaseRowsWithState("tasks", {}, {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not fetch");
    },
  });
  assert.deepEqual(preview, { state: "preview", rows: [] });
  assert.equal(calls, 0);

  process.env.SUPABASE_URL = "https://db.example.com/";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  const empty = await fetchSupabaseRowsWithState("tasks", {}, {
    fetchImpl: async () => Response.json([]),
  });
  assert.deepEqual(empty, { state: "live", rows: [] });

  const httpFailure = await fetchSupabaseRowsWithState("tasks", {}, {
    fetchImpl: async () => Response.json({ message: "unavailable" }, { status: 503 }),
  });
  assert.deepEqual(httpFailure, { state: "error", rows: [], errorCode: "http-503" });

  const invalidJson = await fetchSupabaseRowsWithState("tasks", {}, {
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  });
  assert.deepEqual(invalidJson, { state: "error", rows: [], errorCode: "invalid-json" });

  const networkFailure = await fetchSupabaseRowsWithState("tasks", {}, {
    fetchImpl: async () => {
      throw new TypeError("connect ECONNREFUSED private-detail");
    },
  });
  assert.deepEqual(networkFailure, { state: "error", rows: [], errorCode: "request-failed" });
});

test("canonical task read is workspace-scoped, excludes done, and preserves OCC fields", async () => {
  const calls = [];
  const row = {
    id: TASK_ID,
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    owner_id: OWNER_ID,
    title: "견적 후속 연락",
    status: "doing",
    priority: "critical",
    due_at: "2026-07-14T09:00:00.000Z",
    next_action: "카카오톡 발송",
    meta: {
      due_precision: "date",
      entity_ref: { type: "deal", id: "55555555-5555-4555-8555-555555555555" },
    },
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-13T04:00:00.000Z",
    started_at: "2026-07-12T01:00:00.000Z",
    completed_at: null,
    project: { id: PROJECT_ID, name: "ClassIn 영업" },
  };
  const result = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table, options) => {
      calls.push({ table, options });
      if (table === "workspaces") {
        return { state: "live", rows: [{ timezone: "Asia/Seoul" }] };
      }
      return { state: "live", rows: [row] };
    },
  });

  const taskCall = calls.find((call) => call.table === "tasks");
  assert.ok(taskCall.options.filters.some(([field, value]) => field === "workspace_id" && value === `eq.${WORKSPACE_ID}`));
  assert.ok(taskCall.options.filters.some(([field, value]) => field === "status" && value === "neq.done"));
  assert.match(taskCall.options.select, /updated_at/);
  assert.match(taskCall.options.select, /project:projects/);
  assert.deepEqual(result, {
    source: "live",
    timezone: "Asia/Seoul",
    tasks: [{
      id: TASK_ID,
      title: "견적 후속 연락",
      status: "doing",
      priority: "critical",
      dueAt: "2026-07-14T09:00:00.000Z",
      duePrecision: "date",
      updatedAt: "2026-07-13T04:00:00.000Z",
      createdAt: "2026-07-10T00:00:00.000Z",
      startedAt: "2026-07-12T01:00:00.000Z",
      completedAt: null,
      nextAction: "카카오톡 발송",
      meta: row.meta,
      projectId: PROJECT_ID,
      projectName: "ClassIn 영업",
      ownerId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    }],
  });
});

test("canonical task read distinguishes live empty, preview, and error without mock rows", async () => {
  const empty = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table) => table === "tasks"
      ? { state: "live", rows: [] }
      : { state: "live", rows: [{ timezone: "Invalid/Zone" }] },
  });
  assert.deepEqual(empty, { source: "empty", timezone: "Asia/Seoul", tasks: [] });

  const preview = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async () => ({ state: "preview", rows: [] }),
  });
  assert.deepEqual(preview, { source: "preview", timezone: "Asia/Seoul", tasks: [] });

  const failed = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table) => table === "tasks"
      ? { state: "error", rows: [], errorCode: "http-500" }
      : { state: "live", rows: [{ timezone: "Asia/Seoul" }] },
  });
  assert.deepEqual(failed, {
    source: "error",
    timezone: "Asia/Seoul",
    tasks: [],
    errorCode: "http-500",
  });
});

test("Projects todo adapter keeps display compatibility and adds canonical OCC fields", () => {
  const task = {
    id: TASK_ID,
    title: "견적 후속 연락",
    status: "doing",
    priority: "critical",
    dueAt: "2026-07-14T09:00:00.000Z",
    duePrecision: "date",
    updatedAt: "2026-07-13T04:00:00.000Z",
    createdAt: "2026-07-10T00:00:00.000Z",
    startedAt: "2026-07-12T01:00:00.000Z",
    completedAt: null,
    nextAction: "카카오톡 발송",
    meta: { due_precision: "date" },
    projectId: PROJECT_ID,
    projectName: "ClassIn 영업",
    ownerId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
  };
  const projectById = new Map([[PROJECT_ID, { id: PROJECT_ID, brand_id: "brand-one" }]]);
  const brandById = new Map([["brand-one", { slug: "classmoon" }]]);

  const mapped = mapCanonicalTodoForProjects(task, projectById, brandById);
  assert.match(mapped.bucket, /^(오늘|내일|이번주|다음주)$/);
  assert.deepEqual(mapped, {
    ...task,
    brand: "classmoon",
    project: PROJECT_ID,
    due: "7. 14.",
    bucket: mapped.bucket,
    done: false,
    priority: "high",
    priorityKey: "critical",
    assignee: "Me",
  });
});

test("Daily Brief exposes honest task lanes and no fabricated clock blocks", async () => {
  const source = await readFile(
    new URL("app/api/hub/daily-brief/route.js", hubRoot),
    "utf8",
  );

  assert.match(source, /buildTaskLanes/);
  assert.match(source, /taskSource/);
  assert.match(source, /taskLanes/);
  assert.match(source, /blocks:\s*\[\]/);
  assert.doesNotMatch(source, /time:\s*["']14:00["']/);
  assert.doesNotMatch(source, /9\s*\+\s*index/);
});
