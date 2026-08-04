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

test("timeouts surface as reason timeout instead of hanging", async () => {
  globalThis.fetch = async (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "TimeoutError";
        reject(error);
      });
    });

  const result = await insertSupabaseRecord("leads", { a: 1 }, { timeoutMs: 20 });
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "timeout");
});
