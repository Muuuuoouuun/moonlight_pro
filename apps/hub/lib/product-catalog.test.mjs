import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildProductRows,
  describeSyncResult,
  focusSummary,
  groupSyncByProduct,
  isProductContainer,
  productDraft,
  productPayload,
  productRepositoryPayload,
} from "./product-catalog.js";

const A = "77777777-7777-4777-8777-777777777777";
const B = "88888888-8888-4888-8888-888888888888";
const C = "99999999-9999-4999-8999-999999999999";

function container(overrides) {
  return { key: overrides.id, category: "product", orgScope: "personal", summary: "", updatedAt: "2026-09-27T00:00:00.000Z", ...overrides };
}

test("only product containers become product rows, sorted focus-first", () => {
  const rows = buildProductRows([
    { key: "all", id: "all", category: "product" },
    { key: "chan", id: "c", category: "sns-channel", name: "채널" },
    container({ id: A, name: "나 아이디어", product: { stage: "idea" } }),
    container({ id: B, name: "가 출시", product: { stage: "launch" } }),
    container({ id: C, name: "다 종료", product: { stage: "sunset", sunsetReason: "수요 없음" } }),
  ], {
    projects: [{ brand: B }, { brand: B }, { brand: A }],
    todos: [{ brand: B, done: false }, { brand: B, done: true }],
  });
  assert.deepEqual(rows.map((row) => row.stage), ["launch", "idea", "sunset"]);
  assert.equal(rows[0].focus, true);
  assert.equal(rows[0].projectCount, 2);
  assert.equal(rows[0].openTasks, 1);
  assert.equal(rows[0].nextStage, "growth");
  assert.equal(rows[2].nextStage, null, "sunset has no automatic next stage");
  assert.equal(isProductContainer({ key: "all", category: "product" }), false);
});

test("product rows respect the workspace scope; the focus cap counts the whole workspace", () => {
  const containers = [
    container({ id: A, name: "개인 MVP", product: { stage: "mvp" } }),
    container({ id: B, name: "회사 성장", orgScope: "classin", product: { stage: "growth" } }),
    container({ id: C, name: "개인 출시", product: { stage: "launch" } }),
  ];
  assert.deepEqual(buildProductRows(containers, { scope: "classin" }).map((row) => row.id), [B]);
  assert.equal(buildProductRows(containers, { scope: "personal" }).length, 2);
  assert.deepEqual(focusSummary(containers), { count: 3, limit: 3, full: true, names: ["개인 MVP", "회사 성장", "개인 출시"] });
});

test("the gate names what is missing for the next stage and keeps manual checks separate", () => {
  const [row] = buildProductRows([container({ id: A, name: "OMR", summary: "학원 채점", product: { stage: "validation", problem: "p", target: { subjects: ["math"] } } })]);
  assert.equal(row.nextStage, "mvp");
  assert.deepEqual(row.missing.map((item) => item.key), ["repos", "project"]);
  assert.deepEqual(row.manual, []);
});

test("draft → payload round-trips and keeps line ids for unchanged text", () => {
  const row = container({
    id: A, name: "OMR", summary: "학원 채점",
    product: { stage: "mvp", capabilities: [{ id: "cap-1", text: "PDF 채점" }], repos: ["acme/omr"], pricing: { model: "monthly", amount: 29000 } },
  });
  const draft = productDraft(row);
  assert.equal(draft.capabilities, "PDF 채점");
  assert.equal(draft.repos, "acme/omr");
  assert.equal(draft.amount, 29000);
  assert.equal(draft.expectedUpdatedAt, "2026-09-27T00:00:00.000Z");

  let n = 0;
  const payload = productPayload({ ...draft, capabilities: "PDF 채점\n성적표 출력\n", repos: " acme/omr \n\nacme/api" }, row.product, () => `new-${++n}`);
  assert.deepEqual(payload.product.capabilities, [{ id: "cap-1", text: "PDF 채점" }, { id: "new-1", text: "성적표 출력" }]);
  assert.deepEqual(payload.product.repos, ["acme/omr", "acme/api"]);
  assert.equal(payload.product.pricing.amount, 29000);
  assert.equal(payload.summary, "학원 채점");
  assert.equal(payload.expectedUpdatedAt, "2026-09-27T00:00:00.000Z");
});

test("a non-numeric amount is sent as invalid instead of silently cleared", () => {
  const draft = productDraft(container({ id: A, name: "x" }));
  assert.equal(productPayload({ ...draft, amount: "" }, null).product.pricing.amount, null);
  assert.equal(productPayload({ ...draft, amount: "abc" }, null).product.pricing.amount, -1);
});

test("the sync payload lists each product repo once and skips unsaved previews", () => {
  const rows = buildProductRows([
    container({ id: A, name: "가", product: { repos: ["acme/omr", "acme/api"] } }),
    container({ id: B, name: "나", product: { repos: ["ACME/omr", "acme/word"] } }),
    container({ id: C, name: "다", preview: true, product: { repos: ["acme/draft"] } }),
  ]);
  assert.deepEqual(productRepositoryPayload(rows), [
    { fullName: "acme/omr", productId: A },
    { fullName: "acme/api", productId: A },
    { fullName: "acme/word", productId: B },
  ]);
});

test("sync results read the envelope, not the HTTP status", () => {
  assert.equal(describeSyncResult({ status: "synced", repositories: [{}, {}] }, 200).state, "live");
  assert.equal(describeSyncResult({ status: "partial", repositories: [{}], failures: [{}] }, 200).state, "partial");
  assert.match(describeSyncResult({ status: "preview", configured: false }, 202).label, /저장소가 없습니다/);
  assert.equal(describeSyncResult({ status: "preview", error: "COM_MOON_ENGINE_URL is not configured." }, 202).state, "preview");
  assert.equal(describeSyncResult({ status: "error", error: "boom" }, 502).state, "error");
  assert.equal(describeSyncResult(null, 500).state, "error");

  const grouped = groupSyncByProduct({ repositories: [
    { repository: "acme/omr", productId: A, openIssues: 3, openPullRequests: 1, reviewRequests: 1, blockedIssues: 0 },
    { repository: "acme/legacy", productId: null },
  ] });
  assert.deepEqual([...grouped.keys()], [A]);
  assert.equal(grouped.get(A)[0].openIssues, 3);
});
