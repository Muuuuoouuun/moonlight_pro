import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  countSupabaseRows,
  deleteSupabaseRecord,
  eqFilter,
  fetchSupabaseRows,
  fetchSupabaseRowsDetailed,
  inFilter,
  insertSupabaseRecord,
  updateSupabaseRecord,
  upsertSupabaseRecords,
} from "./index.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("fetchSupabaseRows returns null and does not throw when unconfigured", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  globalThis.fetch = () => {
    throw new Error("fetch must not be called without config");
  };

  assert.equal(await fetchSupabaseRows("leads"), null);
});

test("fetchSupabaseRows returns rows and builds select/filter/order/limit URL", async () => {
  let seenUrl = "";
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    return jsonResponse([{ id: "a" }]);
  };

  const rows = await fetchSupabaseRows("leads", {
    select: "id,status",
    filters: [["workspace_id", eqFilter("w1")], ["status", inFilter(["new", "qualified"])]],
    order: "created_at.desc",
    limit: 10,
  });

  assert.deepEqual(rows, [{ id: "a" }]);
  const url = new URL(seenUrl);
  assert.equal(url.pathname, "/rest/v1/leads");
  assert.equal(url.searchParams.get("select"), "id,status");
  assert.equal(url.searchParams.get("workspace_id"), "eq.w1");
  assert.equal(url.searchParams.get("status"), "in.(new,qualified)");
  assert.equal(url.searchParams.get("order"), "created_at.desc");
  assert.equal(url.searchParams.get("limit"), "10");
});

test("fetchSupabaseRows returns null on HTTP failure (legacy preview contract)", async () => {
  globalThis.fetch = async () => new Response("boom", { status: 500 });
  assert.equal(await fetchSupabaseRows("leads"), null);
});

test("fetchSupabaseRowsDetailed surfaces the failure instead of erasing it", async () => {
  globalThis.fetch = async () => new Response("permission denied", { status: 403 });

  const result = await fetchSupabaseRowsDetailed("leads");
  assert.equal(result.rows, null);
  assert.equal(result.configured, true);
  assert.equal(result.error.reason, "http-403");
  assert.equal(result.error.status, 403);
  assert.match(result.error.detail, /permission denied/);
});

test("concurrent identical reads share one HTTP request but not one rows array", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return jsonResponse([{ id: "a", meta: { n: 1 } }]);
  };

  const [first, second] = await Promise.all([
    fetchSupabaseRows("brands", { select: "id", limit: 5 }),
    fetchSupabaseRows("brands", { select: "id", limit: 5 }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
});

test("distinct reads do not dedupe, and dedupe can be opted out", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse([]);
  };

  await Promise.all([
    fetchSupabaseRows("brands", { select: "id" }),
    fetchSupabaseRows("brands", { select: "id,name" }),
  ]);
  assert.equal(calls, 2);

  calls = 0;
  await Promise.all([
    fetchSupabaseRows("brands", { select: "id", dedupe: false }),
    fetchSupabaseRows("brands", { select: "id", dedupe: false }),
  ]);
  assert.equal(calls, 2);
});

test("countSupabaseRows parses content-range and uses count=exact", async () => {
  let seenHeaders = null;
  globalThis.fetch = async (url, init) => {
    seenHeaders = init.headers;
    return jsonResponse([{ id: "a" }], { headers: { "content-range": "0-0/42" } });
  };

  assert.equal(await countSupabaseRows("leads", [["workspace_id", "eq.w1"]]), 42);
  assert.equal(seenHeaders.prefer, "count=exact");
  assert.equal(seenHeaders.Range, "0-0");
});

test("concurrent exact-count reads share requests without mixing count modes", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(init);
    return jsonResponse([{ id: "a" }], { headers: { "content-range": "0-0/42" } });
  };
  const options = { select: "id", limit: 1 };
  const results = await Promise.all([
    fetchSupabaseRowsDetailed("tasks", { ...options, count: "exact" }),
    fetchSupabaseRowsDetailed("tasks", { ...options, count: "exact" }),
    fetchSupabaseRowsDetailed("tasks", options),
    countSupabaseRows("tasks"),
    countSupabaseRows("tasks"),
  ]);
  assert.equal(calls.length, 3, "five consumers need only three distinct HTTP requests");
  assert.deepEqual(results.map(result => typeof result === "number" ? result : result.count), [42, 42, null, 42, 42]);
  assert.notEqual(results[0].rows, results[1].rows);
  assert.ok(calls.every(call => call.cache === "no-store"));

  await countSupabaseRows("tasks");
  assert.equal(calls.length, 4, "completed reads are never cached");
  await Promise.all([countSupabaseRows("tasks", [], { dedupe: false }), countSupabaseRows("tasks", [], { dedupe: false })]);
  assert.equal(calls.length, 6);
});

test("reads with different credentials or timeout budgets stay independent", async () => {
  const keys = [];
  globalThis.fetch = async (url, init) => {
    keys.push(init.headers.apikey);
    return jsonResponse([]);
  };
  const first = fetchSupabaseRows("tasks", { timeoutMs: 1000 });
  const short = fetchSupabaseRows("tasks", { timeoutMs: 10 });
  process.env.SUPABASE_SERVICE_ROLE_KEY = "different-service-key";
  const otherCredential = fetchSupabaseRows("tasks", { timeoutMs: 1000 });
  await Promise.all([first, short, otherCredential]);
  assert.deepEqual(keys, ["service-role-key", "service-role-key", "different-service-key"]);
});

test("equivalent resolved timeout budgets still coalesce", async () => {
  let calls = 0;
  process.env.SUPABASE_REST_TIMEOUT_MS = "1000";
  globalThis.fetch = async () => { calls += 1; return jsonResponse([]); };
  await Promise.all([fetchSupabaseRows("tasks"), fetchSupabaseRows("tasks", { timeoutMs: 1000 })]);
  assert.equal(calls, 1);
});

test("refresh after a write does not reuse old in-flight rows or counts", async () => {
  const pending = [];
  globalThis.fetch = (url, init) => {
    if (init.method === "PATCH") return Promise.resolve(new Response(null, { status: 204 }));
    return new Promise(resolve => pending.push(resolve));
  };
  const oldRows = fetchSupabaseRows("tasks");
  const oldCount = countSupabaseRows("tasks");
  assert.equal(pending.length, 2);
  await updateSupabaseRecord("tasks", [["id", "eq.a"]], { status: "done" });
  const freshRows = fetchSupabaseRows("tasks");
  const freshCount = countSupabaseRows("tasks");
  assert.equal(pending.length, 4);

  pending[0](jsonResponse([{ id: "a", status: "todo" }]));
  pending[1](jsonResponse([], { headers: { "content-range": "0-0/1" } }));
  await Promise.all([oldRows, oldCount]);
  const joinedRows = fetchSupabaseRows("tasks");
  const joinedCount = countSupabaseRows("tasks");
  assert.equal(pending.length, 4, "old cleanup must not remove the fresh pending entries");
  pending[2](jsonResponse([{ id: "a", status: "done" }]));
  pending[3](jsonResponse([], { headers: { "content-range": "0-0/2" } }));
  const [rows, count, joined, joinedTotal] = await Promise.all([freshRows, freshCount, joinedRows, joinedCount]);
  assert.equal(rows[0].status, "done");
  assert.equal(joined[0].status, "done");
  assert.equal(count, 2);
  assert.equal(joinedTotal, 2);
});

test("a failed shared count read is released so retry can reach the server", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response("unavailable", { status: 503 })
      : jsonResponse([], { headers: { "content-range": "0-0/3" } });
  };
  assert.deepEqual(await Promise.all([countSupabaseRows("tasks"), countSupabaseRows("tasks")]), [null, null]);
  assert.equal(calls, 1);
  assert.equal(await countSupabaseRows("tasks"), 3);
  assert.equal(calls, 2);
});

test("write completion releases reads that started while the write was pending", async () => {
  let finishWrite;
  const pending = [];
  globalThis.fetch = (url, init) => init.method === "PATCH"
    ? new Promise(resolve => { finishWrite = resolve; })
    : new Promise(resolve => pending.push(resolve));
  const write = updateSupabaseRecord("tasks", [["id", "eq.a"]], { status: "done" });
  const duringWrite = fetchSupabaseRows("tasks");
  finishWrite(new Response(null, { status: 204 }));
  await write;
  const afterWrite = fetchSupabaseRows("tasks");
  assert.equal(pending.length, 2);
  pending[0](jsonResponse([{ id: "a", status: "todo" }]));
  pending[1](jsonResponse([{ id: "a", status: "done" }]));
  assert.equal((await duringWrite)[0].status, "todo");
  assert.equal((await afterWrite)[0].status, "done");
});

test("response-body timeouts stay errors instead of becoming empty reads or successful writes", async () => {
  globalThis.fetch = async () => ({
    ok: true, status: 200, headers: new Headers(),
    text: async () => { throw new DOMException("body timed out", "TimeoutError"); },
  });
  const read = await fetchSupabaseRowsDetailed("tasks");
  assert.equal(read.rows, null);
  assert.equal(read.error.reason, "timeout");
  const write = await insertSupabaseRecord("tasks", { title: "test" }, { returnRepresentation: true });
  assert.equal(write.persisted, false);
  assert.equal(write.reason, "timeout");
});

test("insertSupabaseRecord returns representation record and id", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(init.method, "POST");
    assert.equal(init.headers.prefer, "return=representation");
    assert.equal(new URL(String(url)).searchParams.get("select"), "id");
    return jsonResponse([{ id: "new-id" }], { status: 201 });
  };

  const result = await insertSupabaseRecord("leads", { name: "x" }, { returnRepresentation: true, select: "id" });
  assert.equal(result.persisted, true);
  assert.equal(result.id, "new-id");
});

test("insertSupabaseRecord accepts an array as one bulk POST", async () => {
  let body = null;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse([{ id: "1" }, { id: "2" }], { status: 201 });
  };

  const result = await insertSupabaseRecord("leads", [{ name: "a" }, { name: "b" }], {
    returnRepresentation: true,
    select: "id",
  });

  assert.equal(Array.isArray(body), true);
  assert.equal(body.length, 2);
  assert.equal(result.persisted, true);
  assert.deepEqual(result.records.map((r) => r.id), ["1", "2"]);
});

test("insertSupabaseRecord maps unique violations to reason duplicate", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }), {
      status: 409,
    });

  const result = await insertSupabaseRecord("webhook_events", { a: 1 });
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "duplicate");
});

test("empty bulk insert short-circuits without any HTTP call", async () => {
  globalThis.fetch = () => {
    throw new Error("must not fetch");
  };

  const result = await insertSupabaseRecord("leads", []);
  assert.equal(result.persisted, true);
  assert.deepEqual(result.records, []);
});

test("upsertSupabaseRecords sends on_conflict and merge-duplicates prefer", async () => {
  let seenUrl = "";
  let seenPrefer = "";
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenPrefer = init.headers.prefer;
    return jsonResponse([{ id: "1" }]);
  };

  const result = await upsertSupabaseRecords(
    "integration_connections",
    [{ workspace_id: "w", provider: "gemini" }],
    { onConflict: "workspace_id,provider", returnRepresentation: true },
  );

  assert.equal(new URL(seenUrl).searchParams.get("on_conflict"), "workspace_id,provider");
  assert.match(seenPrefer, /resolution=merge-duplicates/);
  assert.match(seenPrefer, /return=representation/);
  assert.equal(result.persisted, true);
});

test("updateSupabaseRecord refuses an unfiltered PATCH", async () => {
  globalThis.fetch = () => {
    throw new Error("must not fetch");
  };

  const result = await updateSupabaseRecord("leads", [], { score: 0 });
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "missing-filter");
});

test("updateSupabaseRecord reports no-matching-row on empty representation", async () => {
  globalThis.fetch = async () => jsonResponse([]);

  const result = await updateSupabaseRecord(
    "work_orders",
    [["id", "eq.x"], ["status", "eq.approved"]],
    { status: "executing" },
    { returnRepresentation: true },
  );

  assert.equal(result.persisted, false);
  assert.equal(result.reason, "no-matching-row");
});

test("deleteSupabaseRecord refuses an unfiltered DELETE", async () => {
  globalThis.fetch = () => {
    throw new Error("must not fetch");
  };

  const result = await deleteSupabaseRecord("leads", []);
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "missing-filter");
});

test("deleteSupabaseRecord reports no-matching-row on empty representation", async () => {
  // RLS 거부·이미 삭제됨·workspace 불일치는 200 + 빈 배열로 온다 — saved로 뭉개면
  // "삭제됨" 영수증 뒤 다음 로드에 레코드가 부활한다(8차 안정성).
  let seenPrefer = "";
  globalThis.fetch = async (url, init) => {
    seenPrefer = init.headers.prefer;
    return jsonResponse([]);
  };

  const result = await deleteSupabaseRecord("tasks", [["id", "eq.missing"]]);
  assert.match(seenPrefer, /return=representation/);
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "no-matching-row");
});

test("deleteSupabaseRecord returns the deleted representation on success", async () => {
  globalThis.fetch = async () => jsonResponse([{ id: "t1" }]);

  const result = await deleteSupabaseRecord("tasks", [["id", "eq.t1"]]);
  assert.equal(result.persisted, true);
  assert.equal(result.id, "t1");
  assert.equal(result.records.length, 1);
});

test("timeouts surface as reason timeout instead of hanging", async () => {
  globalThis.fetch = async (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "TimeoutError";
        reject(error);
      });
    });

  // AbortSignal.timeout의 내부 타이머는 unref다 — 이 테스트만 남으면 이벤트 루프가
  // abort 발화 전에 비어 cancelledByParent로 죽는다. ref된 타이머로 잡아둔다.
  const keepAlive = setTimeout(() => {}, 5000);
  try {
    const result = await insertSupabaseRecord("leads", { a: 1 }, { timeoutMs: 20 });
    assert.equal(result.persisted, false);
    assert.equal(result.reason, "timeout");
  } finally {
    clearTimeout(keepAlive);
  }
});

test('opt-in strict rows distinguish malformed HTTP 200 payloads from an empty array', async () => {
  for (const body of ['', 'not JSON', '{}', 'null', '{"error":"private detail"}']) {
    globalThis.fetch = async () => new Response(body, { status: 200 });
    const result = await fetchSupabaseRowsDetailed('discovery_records', { strictRows: true });
    assert.equal(result.rows, null, body);
    assert.equal(result.error?.reason, 'invalid-rows');
    assert.equal(result.error?.detail, 'Expected a JSON array.');
    assert.equal(await fetchSupabaseRows('discovery_records', { strictRows: true }), null);
    assert.deepEqual(await fetchSupabaseRows('legacy_records'), []);
  }
  globalThis.fetch = async () => jsonResponse([]);
  assert.deepEqual(await fetchSupabaseRows('discovery_records', { strictRows: true }), []);
});
