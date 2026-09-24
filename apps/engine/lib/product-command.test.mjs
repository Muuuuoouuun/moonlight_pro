import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCT_TARGET_SUBJECTS,
  executeProductCommand,
  normalizeProductCommand,
  normalizeRepositoryName,
} from "./product-command.ts";
import { LEAD_SUBJECTS } from "../../hub/lib/sales-os/lead-labels.js";

const WS = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const REPO = "33333333-3333-4333-8333-333333333333";
const CAP = "44444444-4444-4444-8444-444444444444";
const REQ = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-25T01:00:00.000Z";
const ctx = { workspaceId: WS, now: NOW };

function fakeDeps(tables = {}) {
  const calls = { insert: [], update: [], remove: [] };
  return {
    calls,
    deps: {
      insert: async (table, record) => {
        calls.insert.push({ table, record });
        return tables.insertResult?.(table, record) ?? { persisted: true, reason: "ok", record };
      },
      update: async (table, filters, patch) => {
        calls.update.push({ table, filters, patch });
        return tables.updateResult?.(table, filters, patch) ?? { persisted: true, reason: "ok", records: [{ id: PRODUCT, ...patch }] };
      },
      remove: async (table, filters) => {
        calls.remove.push({ table, filters });
        return tables.removeResult?.(table, filters) ?? { persisted: true, reason: "ok", records: [{ id: REPO }] };
      },
      fetchRows: async (table, options) => (tables[table] ? tables[table](options) : []),
    },
  };
}

test("target subjects stay the lead-label 12-key vocabulary", () => {
  assert.deepEqual(PRODUCT_TARGET_SUBJECTS, LEAD_SUBJECTS.map((s) => s.key));
});

test("create_product requires only name, one-line summary and scope", () => {
  const result = normalizeProductCommand({ action: "create_product", id: PRODUCT, name: " OMR 메이커 ", summary: "시험지 자동 채점", orgScope: "personal" }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.record.name, "OMR 메이커");
  assert.equal(result.record.stage, "idea");
  assert.equal(result.record.version, 1);
  assert.deepEqual(result.record.stage_history, [{ at: NOW, from: null, to: "idea", reason: "제품 등록" }]);
  assert.equal(result.record.details.pricing.model, "undecided");

  for (const [patch, reason] of [
    [{ name: "" }, "missing-name"],
    [{ summary: "" }, "missing-summary"],
    [{ orgScope: "company" }, "invalid-org-scope"],
    [{ stage: "beta" }, "invalid-stage"],
  ]) {
    const bad = normalizeProductCommand({ action: "create_product", id: PRODUCT, name: "x", summary: "y", orgScope: "personal", ...patch }, ctx);
    assert.deepEqual(bad, { ok: false, reason });
  }
});

test("details validate target subjects, capabilities, pricing and urls", () => {
  const base = { action: "update_product", id: PRODUCT };
  const ok = normalizeProductCommand({ ...base, details: {
    target: { orgTypes: ["학원"], subjects: ["math", "english"], regions: [], size: "1~3관" },
    capabilities: [{ id: CAP, text: "PDF 채점", verifiedAt: "2026-09-20" }],
    requirements: [{ id: REQ, text: "스캐너 보유" }],
    pricing: { model: "monthly", amount: 29000 },
    deployUrl: "https://omr.example.com",
  } }, ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.patch.details.pricing, { model: "monthly", amount: 29000, currency: "KRW" });

  for (const [details, reason] of [
    [{ target: { subjects: ["physics"] } }, "invalid-target-subject"],
    [{ capabilities: [{ id: CAP, text: "x", verifiedAt: "2026-02-30" }] }, "invalid-capability-date"],
    [{ capabilities: [{ id: CAP, text: "x" }, { id: CAP, text: "y" }] }, "invalid-capability"],
    [{ pricing: { model: "yearly" } }, "invalid-pricing-model"],
    [{ pricing: { model: "monthly", amount: -1 } }, "invalid-pricing-amount"],
    [{ deployUrl: "javascript:alert(1)" }, "invalid-deploy-url"],
  ]) {
    assert.deepEqual(normalizeProductCommand({ ...base, details }, ctx), { ok: false, reason });
  }
  assert.deepEqual(normalizeProductCommand({ ...base, orgScope: "classin" }, ctx), { ok: false, reason: "unsupported-org-scope-update" });
});

test("repository names normalize to lowercase owner/repo", () => {
  assert.equal(normalizeRepositoryName("https://github.com/Muuuuoouuun/OMR_Maker.git"), "muuuuoouuun/omr_maker");
  assert.equal(normalizeRepositoryName("owner/repo/"), "owner/repo");
  assert.equal(normalizeRepositoryName("not a repo"), null);
  assert.equal(normalizeRepositoryName("a/b/c"), null);
});

test("update_product merges details, bumps version on contract change and records stage history", async () => {
  const current = {
    id: PRODUCT, workspace_id: WS, name: "OMR", summary: "채점", stage: "mvp", version: 2,
    updated_at: "2026-09-24T00:00:00.123456+00:00",
    details: { problem: "수기 채점", capabilities: [{ id: CAP, text: "PDF 채점", verifiedAt: null }], requirements: [] },
    stage_history: [],
  };
  const { deps, calls } = fakeDeps({ products: () => [current] });

  // 확인일만 바뀌면 약속(무엇이 되는가)은 같다 — 버전 유지.
  await executeProductCommand({ action: "update_product", id: PRODUCT, details: { capabilities: [{ id: CAP, text: "PDF 채점", verifiedAt: "2026-09-25" }] } }, ctx, deps);
  assert.equal(calls.update[0].patch.version, undefined);
  assert.equal(calls.update[0].patch.details.problem, "수기 채점", "다른 details 키는 보존된다");
  assert.deepEqual(calls.update[0].filters.at(-1), ["updated_at", `eq.${current.updated_at}`], "읽은 버전으로 가드한다");

  await executeProductCommand({ action: "update_product", id: PRODUCT, stage: "launch", details: { requirements: [{ id: REQ, text: "월 결제 가능" }] } }, ctx, deps);
  const patch = calls.update[1].patch;
  assert.equal(patch.version, 3);
  assert.deepEqual(patch.stage_history, [{ at: NOW, from: "mvp", to: "launch", reason: null }]);
});

test("maintain and sunset need a one-line reason; other gates never block", async () => {
  const current = { id: PRODUCT, stage: "growth", version: 1, updated_at: "2026-09-24T00:00:00Z", details: {}, stage_history: [] };
  const { deps, calls } = fakeDeps({ products: () => [current] });
  const blocked = await executeProductCommand({ action: "update_product", id: PRODUCT, stage: "sunset" }, ctx, deps);
  assert.equal(blocked.error, "stage-reason-required");
  assert.equal(calls.update.length, 0);

  const saved = await executeProductCommand({ action: "update_product", id: PRODUCT, stage: "sunset", stageReason: "수요 없음" }, ctx, deps);
  assert.equal(saved.status, "saved");
  // 아이디어에서 곧장 출시로 올려도 서버는 막지 않는다 — 빠진 칸 안내는 화면 몫(§4.1).
  const jump = await executeProductCommand({ action: "update_product", id: PRODUCT, stage: "launch" }, ctx, fakeDeps({ products: () => [{ ...current, stage: "idea" }] }).deps);
  assert.equal(jump.status, "saved");
});

test("stale expectedUpdatedAt returns conflict without writing", async () => {
  const current = { id: PRODUCT, stage: "idea", updated_at: "2026-09-24T00:00:00Z", details: {} };
  const { deps, calls } = fakeDeps({ products: () => [current] });
  const result = await executeProductCommand({ action: "update_product", id: PRODUCT, name: "새 이름", expectedUpdatedAt: "2026-09-23T00:00:00Z" }, ctx, deps);
  assert.equal(result.status, "conflict");
  assert.equal(calls.update.length, 0);
});

test("a repository belongs to one product only", async () => {
  const other = "66666666-6666-4666-8666-666666666666";
  const input = { action: "connect_repository", id: REPO, productId: PRODUCT, fullName: "Owner/Repo" };
  const { deps } = fakeDeps({
    products: () => [{ id: PRODUCT }],
    product_repositories: (options) => options.filters.some(([k]) => k === "full_name")
      ? [{ id: "77777777-7777-4777-8777-777777777777", product_id: other, full_name: "owner/repo" }]
      : [],
    insertResult: () => ({ persisted: false, reason: "duplicate" }),
  });
  const result = await executeProductCommand(input, ctx, deps);
  assert.equal(result.status, "conflict");
  assert.equal(result.error, "repository-owned-by-other-product");

  const missingProduct = await executeProductCommand(input, ctx, fakeDeps({ products: () => [] }).deps);
  assert.equal(missingProduct.error, "invalid-product-reference");

  const saved = await executeProductCommand(input, ctx, fakeDeps({ products: () => [{ id: PRODUCT }] }).deps);
  assert.equal(saved.status, "saved");
  assert.equal(saved.entity.full_name, "owner/repo");
});

test("disconnect removes only the link row and reports not-found", async () => {
  const { deps, calls } = fakeDeps();
  const saved = await executeProductCommand({ action: "disconnect_repository", id: REPO }, ctx, deps);
  assert.equal(saved.status, "saved");
  assert.deepEqual(calls.remove[0].filters, [["id", `eq.${REPO}`], ["workspace_id", `eq.${WS}`]]);

  const missing = await executeProductCommand({ action: "disconnect_repository", id: REPO }, ctx,
    fakeDeps({ removeResult: () => ({ persisted: false, reason: "no-matching-row", records: [] }) }).deps);
  assert.equal(missing.error, "not-found");
});
