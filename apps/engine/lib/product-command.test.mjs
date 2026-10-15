import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeProductCommand,
  normalizeProductCommand,
  normalizeRepositoryName,
} from "./product-command.ts";

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

test("details are free-text domain/audience/notes plus features, pricing and urls", () => {
  const base = { action: "update_product", id: PRODUCT };
  const ok = normalizeProductCommand({ ...base, details: {
    domain: " 교육 ",
    audience: "학원 원장",
    notes: "수학·영어 학원 우선, 1~3관 규모",
    capabilities: [{ id: CAP, text: "PDF 채점", verifiedAt: "2026-09-20" }],
    requirements: [{ id: REQ, text: "스캐너 보유" }],
    pricing: { model: "monthly", amount: 29000 },
    deployUrl: "https://omr.example.com",
  } }, ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.patch.details.pricing, { model: "monthly", amount: 29000, currency: "KRW" });
  assert.equal(ok.patch.details.domain, "교육");
  assert.equal("target" in ok.patch.details, false, "과목·지역 같은 분야 전용 구조는 없다");

  for (const [details, reason] of [
    [{ domain: "가".repeat(41) }, "invalid-domain"],
    [{ notes: "가".repeat(2001) }, "invalid-notes"],
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

test("an inquiry links to one product; relinking moves it and unlinking is idempotent", async () => {
  const INQUIRY = "88888888-8888-4888-8888-888888888888";
  const OTHER = "99999999-9999-4999-8999-999999999999";
  const current = [{ inquiry_id: INQUIRY, product_id: OTHER }];
  const { deps, calls } = fakeDeps({
    products: () => [{ id: PRODUCT }],
    inquiries: () => [{ id: INQUIRY }],
    product_inquiry_links: () => current,
  });
  const moved = await executeProductCommand({ action: "link_inquiry", inquiryId: INQUIRY, productId: PRODUCT }, ctx, deps);
  assert.equal(moved.status, "saved");
  assert.deepEqual(calls.remove[0].filters, [["workspace_id", `eq.${WS}`], ["inquiry_id", `eq.${INQUIRY}`]]);
  assert.deepEqual(calls.insert[0].record, { workspace_id: WS, inquiry_id: INQUIRY, product_id: PRODUCT, project_id: null, linked_at: NOW });

  const same = await executeProductCommand({ action: "link_inquiry", inquiryId: INQUIRY, productId: OTHER }, ctx, deps);
  assert.equal(same.status, "duplicate");

  const missing = await executeProductCommand({ action: "link_inquiry", inquiryId: INQUIRY, productId: PRODUCT }, ctx,
    fakeDeps({ products: () => [{ id: PRODUCT }], inquiries: () => [] }).deps);
  assert.equal(missing.error, "invalid-inquiry-reference");

  const unlinked = await executeProductCommand({ action: "unlink_inquiry", inquiryId: INQUIRY }, ctx,
    fakeDeps({ removeResult: () => ({ persisted: false, reason: "no-matching-row", records: [] }) }).deps);
  assert.equal(unlinked.status, "saved");
  assert.deepEqual(normalizeProductCommand({ action: "link_inquiry", inquiryId: "x", productId: PRODUCT }, ctx), { ok: false, reason: "invalid-inquiry-id" });
});


test("ops status: paused/ended need a note and the change is kept in history", async () => {
  const current = { id: PRODUCT, stage: "mvp", ops_status: "live", updated_at: "2026-09-24T00:00:00Z", details: {}, stage_history: [] };
  const blocked = await executeProductCommand({ action: "update_product", id: PRODUCT, opsStatus: "paused" }, ctx, fakeDeps({ products: () => [current] }).deps);
  assert.equal(blocked.error, "ops-note-required");
  const { deps, calls } = fakeDeps({ products: () => [current] });
  const saved = await executeProductCommand({ action: "update_product", id: PRODUCT, opsStatus: "paused", opsNote: "비용 대비 사용 적음" }, ctx, deps);
  assert.equal(saved.status, "saved");
  assert.equal(calls.update[0].patch.ops_status, "paused");
  assert.equal(calls.update[0].patch.ops_note, "비용 대비 사용 적음");
  assert.deepEqual(calls.update[0].patch.stage_history.at(-1), { at: NOW, kind: "ops", from: "live", to: "paused", reason: "비용 대비 사용 적음" });
  assert.deepEqual(normalizeProductCommand({ action: "update_product", id: PRODUCT, opsStatus: "beta" }, ctx), { ok: false, reason: "invalid-ops-status" });
  const created = normalizeProductCommand({ action: "create_product", id: PRODUCT, name: "x", summary: "y", orgScope: "personal" }, ctx);
  assert.equal(created.record.ops_status, "dev");
});

test("record_month upserts only the numbers given; null means unknown", async () => {
  const base = { action: "record_month", productId: PRODUCT, month: "2026-09" };
  const fresh = fakeDeps({ products: () => [{ id: PRODUCT }], product_monthly_metrics: () => [] });
  const inserted = await executeProductCommand({ ...base, activeUsers: 18, revenue: "190000" }, ctx, fresh.deps);
  assert.equal(inserted.status, "saved");
  assert.deepEqual(fresh.calls.insert[0].record, { workspace_id: WS, product_id: PRODUCT, month: "2026-09", updated_at: NOW, active_users: 18, revenue: 190000 });

  const existing = fakeDeps({ products: () => [{ id: PRODUCT }], product_monthly_metrics: () => [{ month: "2026-09", active_users: 18 }] });
  await executeProductCommand({ ...base, cost: 68000, revenue: null }, ctx, existing.deps);
  assert.deepEqual(existing.calls.update[0].patch, { updated_at: NOW, cost: 68000, revenue: null });

  for (const [patch, reason] of [[{ month: "2026-13", cost: 1 }, "invalid-month"], [{ cost: -1 }, "invalid-cost"], [{ activeUsers: 1.5 }, "invalid-active-users"], [{}, "empty-patch"]]) {
    assert.deepEqual(normalizeProductCommand({ ...base, ...patch }, ctx), { ok: false, reason });
  }
});

test("an inquiry can attach to one of the product's projects, never another product's", async () => {
  const INQUIRY = "88888888-8888-4888-8888-888888888888";
  const PROJECT = "99999999-9999-4999-8999-999999999999";
  const deps = (projectProduct) => fakeDeps({
    products: () => [{ id: PRODUCT }],
    inquiries: () => [{ id: INQUIRY }],
    projects: () => [{ id: PROJECT, product_id: projectProduct }],
    product_inquiry_links: () => [],
  });
  const ok = deps(PRODUCT);
  const saved = await executeProductCommand({ action: "link_inquiry", inquiryId: INQUIRY, productId: PRODUCT, projectId: PROJECT }, ctx, ok.deps);
  assert.equal(saved.status, "saved");
  assert.equal(ok.calls.insert[0].record.project_id, PROJECT);
  const other = await executeProductCommand({ action: "link_inquiry", inquiryId: INQUIRY, productId: PRODUCT, projectId: PROJECT }, ctx, deps("33333333-3333-4333-8333-333333333399").deps);
  assert.equal(other.error, "project-product-mismatch");
});

test("focus cap: a fourth product cannot enter MVP·출시·성장 (2026-09-30 확정 — 3개)", async () => {
  const focus = [
    { id: "a0000000-0000-4000-8000-000000000001", name: "가", stage: "mvp", ops_status: "dev" },
    { id: "a0000000-0000-4000-8000-000000000002", name: "나", stage: "launch", ops_status: "live" },
    { id: "a0000000-0000-4000-8000-000000000003", name: "다", stage: "growth", ops_status: "paused" },
  ];
  const current = { id: PRODUCT, name: "OMR", stage: "validation", ops_status: "dev", version: 1, updated_at: "2026-09-24T00:00:00Z", details: {}, stage_history: [] };
  const { deps, calls } = fakeDeps({
    products: (options) => (options?.select === "id,name,stage,ops_status" ? [...focus, current]
      : options?.filters?.some(([key, value]) => key === "id" && value === `eq.${PRODUCT}`) ? [current] : []),
  });

  const blocked = await executeProductCommand({ action: "update_product", id: PRODUCT, stage: "mvp" }, ctx, deps);
  assert.equal(blocked.status, "invalid-input");
  assert.equal(blocked.error, "focus-cap-reached");
  assert.equal(blocked.limit, 3);
  assert.deepEqual(blocked.focus.map((row) => row.name), ["가", "나", "다"], "일시 중지도 집중 칸을 차지한다");
  assert.equal(calls.update.length, 0, "거절하면 쓰지 않는다");

  const created = await executeProductCommand({ action: "create_product", id: REPO, name: "새 제품", summary: "한 줄", orgScope: "personal", stage: "launch" }, ctx, deps);
  assert.equal(created.error, "focus-cap-reached", "처음부터 집중 단계로 만들 때도 같다");
  assert.equal(calls.insert.length, 0);

  // 아이디어·검증은 막지 않는다.
  const idea = await executeProductCommand({ action: "create_product", id: REPO, name: "새 제품", summary: "한 줄", orgScope: "personal" }, ctx, deps);
  assert.equal(idea.status, "saved");
});

test("focus cap never blocks products already inside, or after one leaves", async () => {
  const inside = { id: PRODUCT, name: "OMR", stage: "mvp", ops_status: "dev", version: 1, updated_at: "2026-09-24T00:00:00Z", details: {}, stage_history: [] };
  const others = [
    { id: "a0000000-0000-4000-8000-000000000001", name: "가", stage: "mvp", ops_status: "dev" },
    { id: "a0000000-0000-4000-8000-000000000002", name: "나", stage: "launch", ops_status: "live" },
    { id: "a0000000-0000-4000-8000-000000000003", name: "다", stage: "growth", ops_status: "live" },
  ];
  const { deps, calls } = fakeDeps({
    products: (options) => (options?.select === "id,name,stage,ops_status" ? [...others, inside] : [inside]),
  });
  // 이미 집중 구간 안에서 단계를 옮기거나 카드를 고치는 것은 상한과 무관하다(옛 데이터가 넘쳐 있어도).
  const moved = await executeProductCommand({ action: "update_product", id: PRODUCT, stage: "launch", name: "OMR 2" }, ctx, deps);
  assert.equal(moved.status, "saved");
  assert.equal(calls.update.length, 1);

  // 종료한 제품은 세지 않는다 — 종료에서 다시 살릴 때만 검사한다.
  const ended = { ...inside, stage: "growth", ops_status: "ended" };
  const revive = fakeDeps({
    products: (options) => (options?.select === "id,name,stage,ops_status" ? [others[0], others[1], { ...others[2], ops_status: "ended" }] : [ended]),
  });
  const revived = await executeProductCommand({ action: "update_product", id: PRODUCT, opsStatus: "live" }, ctx, revive.deps);
  assert.equal(revived.error, undefined);
  assert.equal(revived.status, "saved", "종료한 제품은 칸을 차지하지 않으므로 3번째 칸이 빈다");
});

test("create_product replay confirms the stored receipt before a full or unavailable focus read", async () => {
  const input = { action: "create_product", id: PRODUCT, name: "OMR", summary: "채점", orgScope: "personal", stage: "mvp" };
  // The original product has since left focus and three other products filled its slot.
  const stored = { id: PRODUCT, workspace_id: WS, name: input.name, summary: input.summary, org_scope: input.orgScope, stage: "maintain", ops_status: "live" };
  const focus = [1, 2, 3].map((n) => ({ id: `other-${n}`, name: `집중 ${n}`, stage: "mvp", ops_status: "dev" }));
  for (const focusRows of [focus, null]) {
    let focusReads = 0;
    const { deps, calls } = fakeDeps({
      products: (options) => {
        if (options?.select === "id,name,stage,ops_status") { focusReads += 1; return focusRows; }
        assert.deepEqual(options.filters, [["id", `eq.${PRODUCT}`], ["workspace_id", `eq.${WS}`]]);
        return [stored];
      },
      insertResult: () => ({ persisted: false, reason: "duplicate" }),
    });
    const result = await executeProductCommand(input, ctx, deps);
    assert.deepEqual(result, { status: "duplicate", action: input.action, entity: stored });
    assert.equal(focusReads, 0, "a receipt replay never enters focus again");
    assert.equal(calls.insert.length, 0);
  }
});

test("create_product ID reuse retains its payload conflict without checking focus or writing", async () => {
  const stored = { id: PRODUCT, name: "OMR", summary: "채점", org_scope: "personal", stage: "mvp", ops_status: "dev" };
  const { deps, calls } = fakeDeps({
    products: (options) => {
      assert.notEqual(options?.select, "id,name,stage,ops_status", "ID reuse is not a new focus entry");
      return [stored];
    },
    insertResult: () => ({ persisted: false, reason: "duplicate" }),
  });
  const result = await executeProductCommand({ action: "create_product", id: PRODUCT, name: "다른 제품", summary: stored.summary, orgScope: "personal", stage: "mvp" }, ctx, deps);
  assert.deepEqual(result, { status: "conflict", action: "create_product", error: "id-reuse-payload-mismatch", retryable: false, entity: stored });
  assert.equal(calls.insert.length, 0);
});

test("create_product does not insert when its ID lookup or a new focus check fails", async () => {
  const input = { action: "create_product", id: PRODUCT, name: "OMR", summary: "채점", orgScope: "personal", stage: "mvp" };
  const unreadable = fakeDeps({ products: () => null });
  const idFailure = await executeProductCommand(input, ctx, unreadable.deps);
  assert.equal(idFailure.error, "current-entity-read-failed");
  assert.equal(unreadable.calls.insert.length, 0);

  const newProduct = fakeDeps({ products: (options) => options?.select === "id,name,stage,ops_status" ? null : [] });
  const focusFailure = await executeProductCommand(input, ctx, newProduct.deps);
  assert.equal(focusFailure.error, "focus-check-failed");
  assert.equal(newProduct.calls.insert.length, 0);
});
