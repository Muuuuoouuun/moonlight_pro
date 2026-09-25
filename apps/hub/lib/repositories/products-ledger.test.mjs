import assert from "node:assert/strict";
import { test } from "node:test";

import { getProductLedger } from "./products-ledger.js";

const WS = "11111111-1111-4111-8111-111111111111";
process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WS;
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-25T03:00:00Z");

const rows = {
  products: [{ id: PRODUCT, name: "OMR 메이커", summary: "자동 채점", org_scope: "personal", stage: "mvp", ops_status: "live", details: { problem: "채점" }, version: 2, stage_history: [], updated_at: "2026-09-25T00:00:00Z" }],
  product_repositories: [{ id: "r1", product_id: PRODUCT, full_name: "owner/omr", status: "connected", last_summary: { ci: { state: "failure" } } }],
  projects: [
    { id: "p1", name: "엑셀 내보내기", status: "active", product_id: PRODUCT, area_id: "a1", meta: { org_scope: "personal", work_type: "feature" } },
    { id: "p2", name: "성적표 v2", status: "draft", product_id: null, meta: { org_scope: "personal" } },
    { id: "p3", name: "지난 일", status: "completed", product_id: null, meta: {} },
  ],
  tasks: [{ id: "t1", project_id: "p1", status: "done" }, { id: "t2", project_id: "p1", status: "doing" }],
  project_updates: [{ id: "u1", product_id: PRODUCT, event_type: "github.ci_failed", status: "blocked", title: "CI 실패 · owner/omr", payload: { url: "https://x" } }],
  product_inquiry_links: [{ inquiry_id: "q-old", product_id: PRODUCT, project_id: "p1", linked_at: "2026-09-20T00:00:00Z" }],
  product_monthly_metrics: [{ product_id: PRODUCT, month: "2026-09", active_users: 18, revenue: "190000", cost: "68000" }],
  areas: [{ id: "a1", name: "개인 사업" }],
};
const INQUIRIES = [
  { id: "q-old", subject: "채점 문의", status: "in_progress", received_at: "2026-08-01T00:00:00Z" },
  { id: "q-new", subject: "새 문의", status: "new", received_at: "2026-09-24T00:00:00Z" },
];

function reader(overrides = {}) {
  const seen = [];
  return {
    seen,
    fetchRows: async (table, options) => {
      seen.push({ table, options });
      if (table in overrides) return overrides[table];
      if (table === "inquiries") {
        const byId = options.filters.find(([k]) => k === "id");
        return { rows: byId ? INQUIRIES.filter((q) => byId[1].includes(q.id)) : INQUIRIES.filter((q) => q.id !== "q-old"), error: null };
      }
      return { rows: rows[table], configured: true, error: null };
    },
  };
}

test("each product carries ops status, month numbers, work with task counts and request counts, and its inquiries", async () => {
  const r = reader();
  const ledger = await getProductLedger({ fetchRows: r.fetchRows, configured: true, now: NOW });
  assert.equal(ledger.status, "live");
  assert.equal(ledger.month, "2026-09");
  const [product] = ledger.products;
  assert.equal(product.opsStatus, "live");
  assert.deepEqual(product.metrics, [{ month: "2026-09", activeUsers: 18, revenue: 190000, cost: 68000, note: null, updatedAt: null }]);
  assert.deepEqual(product.projects.map((p) => [p.id, p.workType, p.tasks, p.tasksDone, p.requests]), [["p1", "feature", 2, 1, 1]]);
  assert.deepEqual(product.inquiries.map((q) => [q.id, q.projectId]), [["q-old", "p1"]], "최근 목록 밖의 연결 문의도 읽는다");
  assert.deepEqual(ledger.inquiries.map((q) => [q.id, q.productId]), [["q-new", null], ["q-old", PRODUCT]]);
  assert.deepEqual(ledger.inquiryCandidates.map((q) => q.id), ["q-new"]);
  assert.deepEqual(ledger.candidates.map((p) => p.id), ["p2"]);
  assert.deepEqual(ledger.areas, [{ id: "a1", name: "개인 사업" }]);
  const monthRead = r.seen.find((s) => s.table === "product_monthly_metrics");
  assert.ok(monthRead.options.filters.some(([k, v]) => k === "month" && v === "in.(2026-09,2026-08)"));
  assert.ok(r.seen.every(({ options }) => options.filters.some(([k, v]) => k === "workspace_id" && v === `eq.${WS}`)));
});

test("a failed products read is an error envelope, and a missing table says so", async () => {
  const failed = await getProductLedger({ fetchRows: reader({ products: { rows: null, error: { reason: "timeout" } } }).fetchRows, configured: true, now: NOW });
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "products-read-failed");
  const missing = await getProductLedger({ fetchRows: reader({ products: { rows: null, error: { reason: "http-404", detail: '{"code":"PGRST205"}' } } }).fetchRows, configured: true, now: NOW });
  assert.equal(missing.error, "products-table-missing");
  assert.equal(missing.retryable, false);
});

test("secondary read failures degrade to partial with named sources", async () => {
  const ledger = await getProductLedger({ fetchRows: reader({ product_monthly_metrics: { rows: null, error: { reason: "http-404" } }, product_inquiry_links: { rows: null, error: { reason: "timeout" } } }).fetchRows, configured: true, now: NOW });
  assert.equal(ledger.status, "partial");
  assert.deepEqual(ledger.missing, ["metrics", "inquiries"]);
  assert.deepEqual(ledger.products[0].metrics, []);
  assert.deepEqual(ledger.products[0].inquiries, []);
});

test("unconfigured storage is preview, not an empty live list", async () => {
  const ledger = await getProductLedger({ fetchRows: async () => assert.fail("no read"), configured: false });
  assert.equal(ledger.status, "preview");
});
