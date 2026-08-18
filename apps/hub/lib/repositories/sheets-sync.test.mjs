import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { getSheetsSyncStatus, promoteStagedLeads } from "./sheets-sync.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stagingRow(id, matchKey, extra = {}) {
  return {
    id,
    workspace_id: WORKSPACE_ID,
    source: "google_sheets",
    source_ref: `Leads!row:${id}`,
    normalized: matchKey
      ? { match_key: matchKey, name: `기관${id}`, phone: `010-${id}`, ...extra }
      : { name: `기관${id}`, ...extra },
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

test("promoteStagedLeads batches per entity and keeps sequential outcome semantics", async () => {
  const calls = [];
  const bodies = {};

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    const table = u.pathname.split("/").pop();
    const key = `${method} ${table}`;
    calls.push(key);
    const body = init.body ? JSON.parse(init.body) : null;

    if (method === "GET" && table === "lead_intake_raw") {
      // r1+r2 share a brand-new match key, r3 hits an existing company, r4 has no key.
      return jsonResponse([
        stagingRow("r1", "K1"),
        stagingRow("r2", "K1"),
        stagingRow("r3", "K2", { contact_name: "김담당", email: "kim@example.com" }),
        stagingRow("r4", null),
      ]);
    }
    if (method === "GET" && table === "companies") {
      return jsonResponse([{ id: "C2", name: "기존기관", phone: "02-000", match_key: "K2" }]);
    }
    if (method === "POST" && table === "companies") {
      bodies.companies = body;
      return jsonResponse(body.map((record, i) => ({ id: `c-new-${i}`, name: record.name, phone: record.phone, match_key: record.match_key })), 201);
    }
    if (method === "GET" && table === "contacts") {
      return jsonResponse([{ id: "ct9", company_id: "C2", name: "김담당" }]);
    }
    if (method === "POST" && table === "leads") {
      bodies.leads = body;
      return jsonResponse(body.map((_, i) => ({ id: `lead-${i}` })), 201);
    }
    if (method === "POST" && table === "lead_intake_raw") {
      bodies.finalize = body;
      return jsonResponse([], 201);
    }
    if (method === "POST" && table === "sync_runs") {
      return jsonResponse([], 201);
    }
    throw new Error(`unexpected call: ${key} ${u.search}`);
  };

  const result = await promoteStagedLeads({ workspaceId: WORKSPACE_ID });

  assert.deepEqual(
    { ok: result.ok, promoted: result.promoted, merged: result.merged, review: result.review, total: result.total },
    { ok: true, promoted: 1, merged: 2, review: 1, total: 4 },
  );

  // One bulk company insert containing exactly one record for the deduped new key.
  assert.equal(bodies.companies.length, 1);
  assert.equal(bodies.companies[0].match_key, "K1");

  // Three leads: r1/r2 on the newly created company, r3 linked to the existing
  // company AND its existing contact.
  assert.equal(bodies.leads.length, 3);
  assert.equal(bodies.leads[0].company_id, "c-new-0");
  assert.equal(bodies.leads[1].company_id, "c-new-0");
  assert.equal(bodies.leads[2].company_id, "C2");
  assert.equal(bodies.leads[2].contact_id, "ct9");

  // Finalize covers all four staging rows with sequential-equivalent outcomes.
  const byId = Object.fromEntries(bodies.finalize.map((row) => [row.id, row]));
  assert.equal(byId.r1.status, "promoted");
  assert.equal(byId.r1.lead_id, "lead-0");
  assert.equal(byId.r2.status, "merged");
  assert.equal(byId.r3.status, "merged");
  assert.equal(byId.r3.lead_id, "lead-2");
  assert.equal(byId.r4.status, "review");
  assert.equal(byId.r4.note, "no match_key");
  assert.ok(byId.r1.promoted_at);
  assert.equal(byId.r4.promoted_at, null);

  // Whole run stays a bounded handful of calls — no per-row fan-out.
  assert.ok(calls.length <= 7, `expected <=7 HTTP calls, saw ${calls.length}: ${calls.join(", ")}`);
});

test("promoteStagedLeads sends failed lead batches to review instead of dropping rows", async () => {
  const bodies = {};

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    const table = u.pathname.split("/").pop();
    const body = init.body ? JSON.parse(init.body) : null;

    if (method === "GET" && table === "lead_intake_raw") {
      return jsonResponse([stagingRow("r1", "K2")]);
    }
    if (method === "GET" && table === "companies") {
      return jsonResponse([{ id: "C2", name: "기존기관", phone: null, match_key: "K2" }]);
    }
    if (method === "GET" && table === "contacts") {
      return jsonResponse([]);
    }
    if (method === "POST" && table === "leads") {
      return jsonResponse({ message: "boom" }, 500);
    }
    if (method === "POST" && table === "lead_intake_raw") {
      bodies.finalize = body;
      return jsonResponse([], 201);
    }
    if (method === "POST" && table === "sync_runs") {
      return jsonResponse([], 201);
    }
    throw new Error(`unexpected call: ${method} ${table}`);
  };

  const result = await promoteStagedLeads({ workspaceId: WORKSPACE_ID });

  assert.equal(result.ok, true);
  assert.equal(result.review, 1);
  assert.equal(result.promoted + result.merged, 0);
  assert.equal(bodies.finalize[0].status, "review");
  assert.equal(bodies.finalize[0].company_id, "C2");
});

// 읽기 실패가 "미연결"로 위장하면 화면이 연결 CTA를 띄워, 이미 연결된 계정에
// 재연결을 지시하게 된다. Phase 0 분류상 preview는 미구성 전용이다.
function statusFetchStub({ connections, runs, staging }) {
  return async (url) => {
    const table = new URL(String(url)).pathname.split("/").pop();
    if (table === "integration_connections") {
      return connections === null ? jsonResponse({ message: "denied" }, 500) : jsonResponse(connections);
    }
    if (table === "sync_runs") {
      return runs === null ? jsonResponse({ message: "denied" }, 500) : jsonResponse(runs);
    }
    if (table === "lead_intake_raw") {
      return staging === null ? jsonResponse({ message: "denied" }, 500) : jsonResponse(staging);
    }
    return jsonResponse([]);
  };
}

test("a failed connection read reports error instead of a fake disconnected state", async () => {
  globalThis.fetch = statusFetchStub({ connections: null, runs: [], staging: [] });

  const status = await getSheetsSyncStatus(WORKSPACE_ID);

  assert.equal(status.source, "error");
  assert.equal(status.error, "sheets-sync-status-read-failed");
  // connected:false는 "미연결 확인"을 뜻한다 — 모를 때는 null이어야 한다.
  assert.equal(status.connected, null);
  assert.deepEqual(status.failedSources, ["integration_connections"]);
  assert.equal(status.staging, null);
});

test("a failed runs read stays partial and never renders an empty history as fact", async () => {
  globalThis.fetch = statusFetchStub({
    connections: [{ id: "conn-1", config: { refreshToken: "r" }, last_synced_at: null }],
    runs: null,
    staging: [],
  });

  const status = await getSheetsSyncStatus(WORKSPACE_ID);

  assert.equal(status.source, "supabase");
  assert.equal(status.connected, true);
  assert.equal(status.partial, true);
  assert.deepEqual(status.failedSources, ["sync_runs"]);
  assert.equal(status.recentRuns, null);
});

test("a failed staging tally is null rather than an all-zero count", async () => {
  globalThis.fetch = statusFetchStub({
    connections: [{ id: "conn-1", config: { refreshToken: "r" }, last_synced_at: null }],
    runs: [],
    staging: null,
  });

  const status = await getSheetsSyncStatus(WORKSPACE_ID);

  assert.equal(status.source, "supabase");
  assert.equal(status.partial, true);
  assert.deepEqual(status.failedSources, ["lead_intake_raw"]);
  assert.equal(status.staging, null);
  assert.deepEqual(status.recentRuns, []);
});
