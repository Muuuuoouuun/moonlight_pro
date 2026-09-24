import assert from "node:assert/strict";
import { test } from "node:test";

import { getProductLedger } from "./products-ledger.js";

const WS = "11111111-1111-4111-8111-111111111111";
process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WS;
const PRODUCT = "22222222-2222-4222-8222-222222222222";

const rows = {
  products: [{ id: PRODUCT, name: "OMR 메이커", summary: "자동 채점", org_scope: "personal", stage: "mvp", details: { problem: "채점" }, version: 2, stage_history: [], updated_at: "2026-09-25T00:00:00Z" }],
  product_repositories: [{ id: "r1", product_id: PRODUCT, full_name: "owner/omr", status: "connected", last_summary: { ci: { state: "failure" } } }],
  projects: [
    { id: "p1", name: "결제 붙이기", status: "active", product_id: PRODUCT, meta: { org_scope: "personal" } },
    { id: "p2", name: "성적표 v2", status: "draft", product_id: null, meta: { org_scope: "personal" } },
    { id: "p3", name: "지난 일", status: "completed", product_id: null, meta: {} },
  ],
  project_updates: [{ id: "u1", product_id: PRODUCT, event_type: "github.ci_failed", status: "blocked", title: "CI 실패 · owner/omr", payload: { url: "https://x" } }],
};

function reader(overrides = {}) {
  const seen = [];
  return {
    seen,
    fetchRows: async (table, options) => {
      seen.push({ table, options });
      if (table in overrides) return overrides[table];
      return { rows: rows[table], configured: true, error: null };
    },
  };
}

test("attaches repositories, projects and signals to each product and lists link candidates", async () => {
  const r = reader();
  const ledger = await getProductLedger({ fetchRows: r.fetchRows, configured: true });
  assert.equal(ledger.status, "live");
  const [product] = ledger.products;
  assert.equal(product.orgScope, "personal");
  assert.equal(product.repositories[0].summary.ci.state, "failure");
  assert.deepEqual(product.projects.map((p) => p.id), ["p1"]);
  assert.equal(product.signals[0].url, "https://x");
  assert.deepEqual(ledger.candidates.map((p) => p.id), ["p2"], "완료 프로젝트와 이미 연결된 프로젝트는 후보가 아니다");
  assert.ok(r.seen.every(({ options }) => options.filters.some(([k, v]) => k === "workspace_id" && v === `eq.${WS}`)));
});

test("a failed products read is an error envelope, and a missing table says so", async () => {
  const failed = await getProductLedger({ fetchRows: reader({ products: { rows: null, error: { reason: "timeout" } } }).fetchRows, configured: true });
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "products-read-failed");
  const missing = await getProductLedger({ fetchRows: reader({ products: { rows: null, error: { reason: "http-404", detail: '{"code":"PGRST205","message":"Could not find the table public.products"}' } } }).fetchRows, configured: true });
  assert.equal(missing.error, "products-table-missing");
  assert.equal(missing.retryable, false);
});

test("secondary read failures degrade to partial with named sources", async () => {
  const ledger = await getProductLedger({ fetchRows: reader({ project_updates: { rows: null, error: { reason: "timeout" } } }).fetchRows, configured: true });
  assert.equal(ledger.status, "partial");
  assert.deepEqual(ledger.missing, ["signals"]);
  assert.deepEqual(ledger.products[0].signals, []);
});

test("unconfigured storage is preview, not an empty live list", async () => {
  const ledger = await getProductLedger({ fetchRows: async () => assert.fail("no read"), configured: false });
  assert.equal(ledger.status, "preview");
});
