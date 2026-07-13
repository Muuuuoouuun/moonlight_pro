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

const {
  fetchAllSupabaseRows,
  fetchAllSupabaseRowsWithState,
  fetchSupabaseRowsWithState,
} = await import("./server-read.js");
const {
  getCanonicalTaskRead,
  getProjectLedger,
  mapCanonicalTodoForProjects,
} = await import("./repositories/operating-ledger.js");
const { resolveTaskLane } = await import("./task-attention.js");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";

function canonicalTaskRow(overrides = {}) {
  return {
    id: TASK_ID,
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    owner_id: OWNER_ID,
    title: "견적 후속 연락",
    status: "todo",
    priority: "medium",
    due_at: null,
    next_action: "카카오톡 발송",
    meta: {},
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-13T04:00:00.000Z",
    started_at: null,
    completed_at: null,
    project: { id: PROJECT_ID, name: "ClassIn 영업" },
    ...overrides,
  };
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
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

test("paginated Supabase readers do not silently truncate durable task ledgers", async () => {
  process.env.SUPABASE_URL = "https://db.example.com/";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  const requested = [];
  const pages = [
    [{ id: "1" }, { id: "2" }],
    [{ id: "3" }, { id: "4" }],
    [{ id: "5" }],
  ];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return Response.json(pages[requested.length - 1]);
  };

  const stateful = await fetchAllSupabaseRowsWithState("tasks", { order: "updated_at.desc" }, {
    fetchImpl,
    pageSize: 2,
  });
  assert.equal(stateful.state, "live");
  assert.deepEqual(stateful.rows.map((row) => row.id), ["1", "2", "3", "4", "5"]);
  assert.match(requested[0], /limit=2/);
  assert.doesNotMatch(requested[0], /offset=/);
  assert.match(requested[1], /offset=2/);
  assert.match(requested[2], /offset=4/);

  requested.length = 0;
  const plain = await fetchAllSupabaseRows("tasks", {}, { fetchImpl, pageSize: 2 });
  assert.deepEqual(plain.map((row) => row.id), ["1", "2", "3", "4", "5"]);
});

test("canonical task pagination uses a deterministic keyset instead of offsets", async () => {
  process.env.SUPABASE_URL = "https://db.example.com/";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  const requested = [];
  const pages = [
    [
      { id: "b", updated_at: "2026-07-13T04:00:00.000Z" },
      { id: "a", updated_at: "2026-07-13T04:00:00.000Z" },
    ],
    [{ id: "z", updated_at: "2026-07-12T04:00:00.000Z" }],
  ];
  const result = await fetchAllSupabaseRowsWithState("tasks", {
    order: "updated_at.desc,id.desc",
    keyset: { field: "updated_at", tieBreaker: "id", direction: "desc" },
  }, {
    pageSize: 2,
    fetchImpl: async (url) => {
      requested.push(new URL(String(url)));
      return Response.json(pages[requested.length - 1]);
    },
  });

  assert.equal(result.state, "live");
  assert.deepEqual(result.rows.map((row) => row.id), ["b", "a", "z"]);
  assert.equal(requested[0].searchParams.get("order"), "updated_at.desc,id.desc");
  assert.equal(requested[1].searchParams.has("offset"), false);
  assert.equal(
    requested[1].searchParams.get("or"),
    "(updated_at.lt.2026-07-13T04:00:00.000Z,and(updated_at.eq.2026-07-13T04:00:00.000Z,id.lt.a))",
  );
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
  assert.equal(taskCall.options.limit, undefined);
  assert.ok(taskCall.options.filters.some(([field, value]) => field === "workspace_id" && value === `eq.${WORKSPACE_ID}`));
  assert.ok(taskCall.options.filters.some(([field, value]) => field === "status" && value === "neq.done"));
  assert.match(taskCall.options.select, /updated_at/);
  assert.match(taskCall.options.select, /project:projects/);
  assert.equal(taskCall.options.order, "updated_at.desc,id.desc");
  assert.deepEqual(taskCall.options.keyset, { field: "updated_at", tieBreaker: "id", direction: "desc" });
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

  const timezoneFailed = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table) => table === "tasks"
      ? { state: "live", rows: [canonicalTaskRow()] }
      : { state: "error", rows: [], errorCode: "http-503" },
  });
  assert.deepEqual(timezoneFailed, {
    source: "error",
    timezone: "Asia/Seoul",
    tasks: [],
    errorCode: "timezone-http-503",
  });

  const workspaceMissing = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table) => table === "tasks"
      ? { state: "live", rows: [] }
      : { state: "live", rows: [] },
  });
  assert.deepEqual(workspaceMissing, {
    source: "error",
    timezone: "Asia/Seoul",
    tasks: [],
    errorCode: "timezone-workspace-not-found",
  });
});

test("legacy due precision uses workspace-local midnight and stays today until the next midnight", async () => {
  const midnightTask = canonicalTaskRow({
    id: "legacy-midnight",
    due_at: "2026-07-13T15:00:00.000Z",
  });
  const nonMidnightTask = canonicalTaskRow({
    id: "legacy-non-midnight",
    due_at: "2026-07-13T15:00:00.001Z",
  });
  const noDueTask = canonicalTaskRow({ id: "legacy-no-due" });
  const result = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table) => table === "tasks"
      ? { state: "live", rows: [midnightTask, nonMidnightTask, noDueTask] }
      : { state: "live", rows: [{ timezone: "Asia/Seoul" }] },
  });

  const byId = new Map(result.tasks.map((task) => [task.id, task]));
  assert.equal(byId.get("legacy-midnight").duePrecision, "date");
  assert.equal(byId.get("legacy-non-midnight").duePrecision, "timed");
  assert.equal(byId.get("legacy-no-due").duePrecision, "none");
  assert.equal(
    resolveTaskLane(
      byId.get("legacy-midnight"),
      new Date("2026-07-14T14:59:59.999Z"),
      result.timezone,
    ),
    "today",
  );
  assert.equal(
    resolveTaskLane(
      byId.get("legacy-midnight"),
      new Date("2026-07-14T15:00:00.000Z"),
      result.timezone,
    ),
    "missed",
  );
});

test("legacy due inference falls back to Asia/Seoul while explicit precision stays authoritative", async () => {
  const result = await getCanonicalTaskRead({
    workspaceId: WORKSPACE_ID,
    readRows: async (table) => table === "tasks"
      ? {
          state: "live",
          rows: [
            canonicalTaskRow({
              id: "legacy-invalid-zone",
              due_at: "2026-07-13T15:00:00.000Z",
            }),
            canonicalTaskRow({
              id: "explicit-timed-midnight",
              due_at: "2026-07-13T15:00:00.000Z",
              meta: { due_precision: "timed" },
            }),
            canonicalTaskRow({
              id: "explicit-date-non-midnight",
              due_at: "2026-07-14T03:00:00.000Z",
              meta: { due_precision: "date" },
            }),
          ],
        }
      : { state: "live", rows: [{ timezone: "Invalid/Zone" }] },
  });

  const byId = new Map(result.tasks.map((task) => [task.id, task]));
  assert.equal(result.timezone, "Asia/Seoul");
  assert.equal(byId.get("legacy-invalid-zone").duePrecision, "date");
  assert.equal(byId.get("explicit-timed-midnight").duePrecision, "timed");
  assert.equal(byId.get("explicit-date-non-midnight").duePrecision, "date");
});

test("project ledger preserves canonical tasks when a supporting legacy task read fails", async () => {
  process.env.SUPABASE_URL = "https://db.example.com";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE_ID;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    const select = url.searchParams.get("select");

    if (table === "tasks" && select === "*") {
      return Response.json({ message: "legacy task stats unavailable" }, { status: 503 });
    }
    if (table === "tasks") {
      return Response.json([canonicalTaskRow({
        id: "canonical-survivor",
        priority: "critical",
        due_at: "2026-07-13T15:00:00.000Z",
      })]);
    }
    if (table === "workspaces") {
      return Response.json([{ timezone: "Asia/Seoul" }]);
    }
    if (table === "brands") {
      return Response.json([{
        id: "brand-one",
        workspace_id: WORKSPACE_ID,
        slug: "classmoon",
        name: "ClassMoon",
        description: null,
        status: "active",
        color: null,
        icon: null,
        meta: {},
        created_at: "2026-07-10T00:00:00.000Z",
        updated_at: "2026-07-10T00:00:00.000Z",
      }]);
    }
    if (table === "projects") {
      return Response.json([{
        id: PROJECT_ID,
        workspace_id: WORKSPACE_ID,
        brand_id: "brand-one",
        owner_id: OWNER_ID,
        name: "ClassIn 영업",
        status: "active",
        priority: "high",
        progress: 25,
        due_at: null,
        summary: "",
        next_action: "견적 후속 연락",
        meta: {},
        last_activity_at: null,
        created_at: "2026-07-10T00:00:00.000Z",
        updated_at: "2026-07-13T04:00:00.000Z",
      }]);
    }

    return Response.json([]);
  };

  const result = await getProjectLedger();

  assert.equal(result.source, "preview");
  assert.equal(result.taskSource, "live");
  assert.deepEqual(result.tasks.map((task) => task.id), ["canonical-survivor"]);
  assert.equal(result.todos.length, 1);
  assert.equal(result.todos[0].id, "canonical-survivor");
  assert.equal(result.todos[0].brand, "classmoon");
  assert.equal(result.todos[0].project, PROJECT_ID);
  assert.equal(result.todos[0].projectName, "ClassIn 영업");
  assert.equal(result.todos[0].priorityKey, "critical");
  assert.equal(result.todos[0].updatedAt, "2026-07-13T04:00:00.000Z");
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
  assert.match(source, /projects\.tasks/);
  assert.match(source, /taskSource/);
  assert.match(source, /taskLanes/);
  assert.match(source, /taskTimezone:\s*projects\.taskTimezone/);
  assert.match(
    source,
    /projectsResult\.status === ["']rejected["']\s*\?\s*["']error["']\s*:\s*projects\.taskSource \|\| ["']preview["']/,
  );
  assert.doesNotMatch(source, /const taskSource = projects\.taskSource \|\| ["']preview["']/);
  assert.match(source, /blocks:\s*\[\]/);
  assert.doesNotMatch(source, /time:\s*["']14:00["']/);
  assert.doesNotMatch(source, /9\s*\+\s*index/);
});
