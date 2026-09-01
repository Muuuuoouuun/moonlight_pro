import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { countCustomerReferences, describeReferences, isCustomerTable } from "./customer-delete.js";
import { UNREFERENCED_GUARD } from "./customer-delete-contract.js";
import { buildLeadWrite, persistRevenueRecord } from "./revenue-write.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

let calls;

// rowsFor: (table, url) → 배열(성공) 또는 null(읽기 실패 시뮬레이션)
function installFetch(rowsFor) {
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });

    if (method === "GET") {
      const table = /\/rest\/v1\/([^?]+)/.exec(url)?.[1] || "";
      const rows = rowsFor(table, url);
      if (rows === null) return jsonResponse([], 500);
      // { status, body } 형태면 PostgREST 오류 응답(컬럼 없음 등)을 흉내낸다.
      if (rows && !Array.isArray(rows) && typeof rows === "object" && "status" in rows) {
        return jsonResponse(rows.body ?? {}, rows.status);
      }
      return jsonResponse(rows);
    }
    if (method === "DELETE") return jsonResponse([{ id: "lead-1" }]);
    return jsonResponse([], 400);
  };
}

function jsonResponse(rows, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rows,
    text: async () => JSON.stringify(rows),
    headers: { get: () => null },
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

test("isCustomerTable only recognises the two customer ledgers", () => {
  assert.equal(isCustomerTable("leads"), true);
  assert.equal(isCustomerTable("customer_accounts"), true);
  assert.equal(isCustomerTable("deals"), false);
});

test("a customer with nothing attached counts zero references", async () => {
  installFetch(() => []);
  const refs = await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  assert.equal(refs.ok, true);
  assert.equal(refs.total, 0);
  assert.deepEqual(refs.counts, {});
});

// 라이브 원장의 실제 모양: 활동·딜이 lead_id가 아니라 company_id로만 붙어 있다.
// lead_id만 세면 이력이 가득한 고객이 "참조 0"으로 읽혀 그대로 지워진다.
test("references attached only by company_id are still counted", async () => {
  installFetch((table, url) => {
    if (url.includes("lead_id=eq.")) return [];
    if (table === "crm_activities" && url.includes("company_id=eq.co-1")) return [{ id: "a1" }, { id: "a2" }];
    if (table === "deals" && url.includes("company_id=eq.co-1")) return [{ id: "d1" }];
    return [];
  });
  const refs = await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  assert.equal(refs.ok, true);
  assert.equal(refs.total, 3);
  assert.deepEqual(refs.counts, { deals: 1, activities: 2 });
});

// 같은 딜이 lead_id와 company_id 양쪽 조회에 걸린다 — 합치면 1건이지 2건이 아니다.
test("a record matched by both join keys is counted once", async () => {
  installFetch((table) => (table === "deals" ? [{ id: "d1" }] : []));
  const refs = await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  assert.deepEqual(refs.counts, { deals: 1 });
  assert.equal(refs.total, 1);
});

test("a customer with no company skips the company-scoped probes entirely", async () => {
  installFetch(() => []);
  await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: null, workspaceId: WORKSPACE_ID,
  });
  assert.equal(calls.some(c => c.url.includes("company_id=eq.")), false);
});

test("account references use the account columns, not the lead ones", async () => {
  installFetch(() => []);
  await countCustomerReferences({
    table: "customer_accounts", id: "acc-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  const urls = calls.map(c => c.url).join(" ");
  assert.match(urls, /operation_cases\?[^ ]*customer_account_id=eq\.acc-1/);
  assert.match(urls, /projects\?[^ ]*customer_account_id=eq\.acc-1/);
  assert.match(urls, /crm_activities\?[^ ]*account_id=eq\.acc-1/);
  assert.equal(urls.includes("lead_id=eq."), false);
});

// 라이브 DB에 그 컬럼이 없으면(마이그레이션 미적용) 그 참조는 존재할 수 없다 — 0이
// 추측이 아니라 사실이다. 다만 "전부 확인했다"고 말하지 않도록 skipped에 남긴다.
// 실측: 라이브 projects에는 lead_id가 없어(0022 미적용) 이 경로가 항상 탄다.
test("a link the live schema does not have is skipped, not treated as a failure", async () => {
  installFetch((table, url) => {
    if (table === "projects") return { status: 400, body: { code: "42703", message: "column projects.lead_id does not exist" } };
    return [];
  });
  const refs = await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  assert.equal(refs.ok, true);
  assert.equal(refs.total, 0);
  assert.deepEqual(refs.skipped, ["projects.lead_id"]);
});

test("a missing link never masks a real reference found elsewhere", async () => {
  installFetch((table) => {
    if (table === "projects") return { status: 404, body: {} };
    if (table === "deals") return [{ id: "d1" }];
    return [];
  });
  const refs = await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  assert.equal(refs.total, 1);
  assert.deepEqual(refs.counts, { deals: 1 });
  assert.deepEqual(refs.skipped, ["projects.lead_id"]);
});

// 가장 중요한 성질: 전송 실패를 "참조 0"으로 뭉개면 이력이 가득한 고객이 조용히 지워진다.
test("an unreadable reference table fails closed instead of reporting zero", async () => {
  installFetch((table) => (table === "projects" ? null : []));
  const refs = await countCustomerReferences({
    table: "leads", id: "lead-1", companyId: "co-1", workspaceId: WORKSPACE_ID,
  });
  assert.equal(refs.ok, false);
  assert.equal(refs.reason, "reference-read-failed");
  assert.equal(refs.table, "projects");
});

// ---- persistRevenueRecord 통합: 가드가 실제로 DELETE를 막는가 ----

test("the guard blocks the delete and names what is attached", async () => {
  installFetch((table) => (table === "deals" ? [{ id: "d1" }, { id: "d2" }] : []));
  const result = await persistRevenueRecord({
    table: "leads",
    op: "delete",
    id: "lead-1",
    payload: { guard: UNREFERENCED_GUARD, companyId: "co-1" },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "has-references");
  assert.deepEqual(result.references, { deals: 2 });
  assert.equal(calls.some(c => c.method === "DELETE"), false, "must not issue a DELETE when blocked");
});

test("the guard lets an unreferenced customer through to the DELETE", async () => {
  installFetch(() => []);
  const result = await persistRevenueRecord({
    table: "leads",
    op: "delete",
    id: "lead-1",
    payload: { guard: UNREFERENCED_GUARD, companyId: "co-1" },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "saved");
  const del = calls.find(c => c.method === "DELETE");
  assert.ok(del, "expected a DELETE");
  assert.match(del.url, /id=eq\.lead-1/);
  assert.match(del.url, new RegExp(`workspace_id=eq\\.${WORKSPACE_ID}`));
});

test("an unreadable reference table aborts the delete rather than proceeding", async () => {
  installFetch((table) => (table === "crm_activities" ? null : []));
  const result = await persistRevenueRecord({
    table: "leads",
    op: "delete",
    id: "lead-1",
    payload: { guard: UNREFERENCED_GUARD, companyId: "co-1" },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "reference-read-failed");
  assert.equal(calls.some(c => c.method === "DELETE"), false, "must not delete when the check failed");
});

// Leads 화면의 기존 삭제는 guard를 보내지 않는다 — 그 경로의 동작이 바뀌면 안 된다.
test("a delete without the guard flag keeps the previous unguarded behaviour", async () => {
  installFetch((table) => (table === "deals" ? [{ id: "d1" }] : []));
  const result = await persistRevenueRecord({
    table: "leads",
    op: "delete",
    id: "lead-1",
    payload: { companyId: "co-1" },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "saved");
  assert.ok(calls.find(c => c.method === "DELETE"), "unguarded delete still goes through");
  assert.equal(calls.some(c => c.method === "GET"), false, "no reference scan without the guard");
});

test("the guard never applies to non-customer tables", async () => {
  installFetch(() => []);
  const result = await persistRevenueRecord({
    table: "deals",
    op: "delete",
    id: "deal-9",
    payload: { guard: UNREFERENCED_GUARD },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "saved");
  assert.equal(calls.some(c => c.method === "GET"), false);
});

test("describeReferences renders only the non-empty buckets", () => {
  assert.equal(describeReferences({ deals: 2, activities: 5 }), "딜 2건 · 활동 기록 5건");
  assert.equal(describeReferences({ deals: 0, cases: 1 }), "운영 케이스 1건");
  assert.equal(describeReferences({}), "");
});
