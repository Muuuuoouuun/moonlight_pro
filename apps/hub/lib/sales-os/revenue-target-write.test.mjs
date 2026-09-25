import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { saveRevenueTarget } from "./revenue-target-write.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

function jsonResponse(rows, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rows,
    text: async () => JSON.stringify(rows),
    headers: { get: () => null },
  };
}

let calls;
function installSupabaseFetch({ existingMeta } = {}) {
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (method === "GET") return jsonResponse([{ meta: existingMeta || {} }]);
    if (method === "PATCH") return jsonResponse([{ id: "workspace-1", meta: init.body ? JSON.parse(init.body).meta : {} }]);
    return jsonResponse([], 400);
  };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("saveRevenueTarget merges the new month into existing revenue_targets without clobbering sibling meta", async () => {
  installSupabaseFetch({ existingMeta: { revenue_targets: { "2026-08": 4000000 }, other_setting: "keep-me" } });
  const result = await saveRevenueTarget({ month: "2026-09", amount: 5000000 });
  assert.equal(result.status, "saved");
  assert.equal(result.month, "2026-09");
  assert.equal(result.amount, 5000000);
  const patch = calls.find((c) => c.method === "PATCH");
  assert.deepEqual(patch.body.meta, {
    other_setting: "keep-me",
    revenue_targets: { "2026-08": 4000000, "2026-09": 5000000 },
  });
});

test("saveRevenueTarget rejects an invalid month key or non-positive amount", async () => {
  installSupabaseFetch();
  assert.equal((await saveRevenueTarget({ month: "2026-13", amount: 5000000 })).status, "error");
  assert.equal((await saveRevenueTarget({ month: "09-2026", amount: 5000000 })).status, "error");
  assert.equal((await saveRevenueTarget({ month: "2026-09", amount: 0 })).status, "error");
  assert.equal((await saveRevenueTarget({ month: "2026-09", amount: -5 })).status, "error");
  assert.deepEqual(calls, [], "invalid input never reaches persistence");
});

test("saveRevenueTarget with amount:null clears that month's target and keeps others", async () => {
  installSupabaseFetch({ existingMeta: { revenue_targets: { "2026-08": 4000000, "2026-09": 5000000 } } });
  const result = await saveRevenueTarget({ month: "2026-09", amount: null });
  assert.equal(result.status, "saved");
  assert.equal(result.amount, null);
  const patch = calls.find((c) => c.method === "PATCH");
  assert.deepEqual(patch.body.meta.revenue_targets, { "2026-08": 4000000 });
});

test("saveRevenueTarget returns preview when the workspace is unset (no persistence attempted)", async () => {
  installSupabaseFetch();
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  const result = await saveRevenueTarget({ month: "2026-09", amount: 5000000 });
  assert.equal(result.status, "preview");
  assert.deepEqual(calls, []);
});

test("saveRevenueTarget aborts instead of wiping meta when the existing row can't be read", async () => {
  calls = [];
  globalThis.fetch = async () => jsonResponse([], 503);
  const result = await saveRevenueTarget({ month: "2026-09", amount: 5000000 });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "meta-read-failed");
});
