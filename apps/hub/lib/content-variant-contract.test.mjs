import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CANONICAL_CONTENT_VARIANT_TYPES,
  normalizeContentVariantType,
} from "./content-variant-contract.js";
import { callSupabaseRpc } from "./server-write.js";

test("content variants use the five DB canonical types", () => {
  assert.deepEqual(CANONICAL_CONTENT_VARIANT_TYPES, [
    "newsletter",
    "blog_insight",
    "card_news",
    "x_thread",
    "reels_script",
  ]);
});

test("legacy UI aliases normalize toward the DB contract", () => {
  assert.equal(normalizeContentVariantType("blog"), "blog_insight");
  assert.equal(normalizeContentVariantType("social_post"), "x_thread");
  assert.equal(normalizeContentVariantType("landing_copy"), "blog_insight");
  assert.equal(normalizeContentVariantType("thread"), "x_thread");
});

test("Supabase RPC helper posts parameters and returns the function result", async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;
  let request = null;

  process.env.SUPABASE_URL = "https://moonlight.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ status: "approved", variant_id: "variant-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await callSupabaseRpc("approve_content_draft_work_order", {
      p_workspace_id: "workspace-1",
      p_work_order_id: "order-1",
    });

    assert.deepEqual(result, {
      persisted: true,
      reason: "ok",
      data: { status: "approved", variant_id: "variant-1" },
    });
    assert.equal(request.url, "https://moonlight.supabase.co/rest/v1/rpc/approve_content_draft_work_order");
    assert.equal(request.options.method, "POST");
    assert.deepEqual(JSON.parse(request.options.body), {
      p_workspace_id: "workspace-1",
      p_work_order_id: "order-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  }
});

test("content draft approval materializes through the atomic RPC", () => {
  const workOrders = readFileSync(
    new URL("./sales-os/work-orders.js", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(workOrders, /callSupabaseRpc\("approve_content_draft_work_order"/);
  assert.doesNotMatch(workOrders, /insertSupabaseRecord\("content_variants"/);
  assert.doesNotMatch(workOrders, /variant_type:\s*"blog"/);
  assert.match(
    workOrders,
    /if \(status === "approved"\)[\s\S]*?if \(!order\) return \{ persisted: false, reason: "not-found" \};[\s\S]*?approveContentDraft/,
  );
  assert.match(migration, /create or replace function public\.approve_content_draft_work_order/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /'blog_insight'/);

  const variantInsert = migration.indexOf("insert into public.content_variants");
  const itemUpdate = migration.indexOf("update public.content_items", variantInsert);
  const approvalUpdate = migration.indexOf("update public.work_orders", itemUpdate);

  assert.ok(variantInsert >= 0, "RPC inserts the destination variant");
  assert.ok(itemUpdate > variantInsert, "RPC updates the content item after the destination insert");
  assert.ok(approvalUpdate > itemUpdate, "RPC approves the work order last");
});

test("content draft approval only materializes a locked idea once", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const existingVariantStart = migration.indexOf("if v_variant_id is not null then");
  const recoverableGuardStart = migration.indexOf(
    "if v_order.status not in ('proposed', 'approved') then",
  );
  const existingVariantBranch = migration.slice(existingVariantStart, recoverableGuardStart);
  const ideaStatusGuard = migration.indexOf("if v_content_status <> 'idea' then");
  const variantInsert = migration.indexOf("insert into public.content_variants");
  const itemUpdate = migration.indexOf("update public.content_items", variantInsert);
  const approvalUpdate = migration.indexOf("update public.work_orders", itemUpdate);
  const guardedItemUpdate = migration.slice(itemUpdate, approvalUpdate);

  assert.match(migration, /select ci\.id, ci\.status\s+into v_content_id, v_content_status[\s\S]*?for update/i);
  assert.ok(existingVariantStart >= 0, "RPC keeps the same-work-order idempotency branch");
  assert.doesNotMatch(existingVariantBranch, /update public\.content_items/i);
  assert.ok(ideaStatusGuard > recoverableGuardStart, "RPC validates content status after idempotency checks");
  assert.ok(ideaStatusGuard < variantInsert, "RPC rejects non-idea content before inserting a variant");
  assert.match(guardedItemUpdate, /and status = 'idea'/i);
});

test("approved unmaterialized content drafts recover without admitting terminal decisions", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const recoverableGuard = migration.indexOf(
    "if v_order.status not in ('proposed', 'approved') then",
  );
  const variantInsert = migration.indexOf("insert into public.content_variants");
  const approvalUpdate = migration.indexOf("update public.work_orders", variantInsert);
  const approvalBlock = migration.slice(approvalUpdate, migration.indexOf("return jsonb_build_object", approvalUpdate));

  assert.ok(recoverableGuard >= 0, "RPC explicitly limits materialization to proposed or approved");
  assert.ok(recoverableGuard < variantInsert, "terminal decisions return before variant insertion");
  assert.match(approvalBlock, /status in \('proposed', 'approved'\)/i);
  assert.match(migration, /when v_order\.status = 'approved' then 'recovered'/i);
});

test("an existing work-order variant must belong to the locked content item", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const lookup = migration.indexOf("select cv.id, cv.content_id");
  const mismatchGuard = migration.indexOf("v_variant_content_id <> v_content_id");
  const idempotentBranch = migration.indexOf("if v_variant_id is not null then");

  assert.ok(lookup >= 0, "RPC reads the existing variant content id");
  assert.match(migration, /into v_variant_id, v_variant_content_id/i);
  assert.ok(mismatchGuard > lookup, "RPC validates the existing variant after lookup");
  assert.ok(mismatchGuard < idempotentBranch, "corrupt cross-content metadata fails before idempotency return");
  assert.match(
    migration.slice(mismatchGuard, idempotentBranch),
    /raise exception 'content draft variant points to a different content item'/i,
  );
});

test("atomic content approval runs with caller privileges and service-role-only execute", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(
    migration,
    /revoke all on function public\.approve_content_draft_work_order\(uuid, uuid\)\s+from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.approve_content_draft_work_order\(uuid, uuid\)\s+to service_role;/i,
  );
});

test("migration repairs approved unmaterialized ideas through the guarded RPC", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const repairStart = migration.indexOf("do $repair$");
  const repairEnd = migration.indexOf("$repair$;", repairStart + 1);
  const repair = migration.slice(repairStart, repairEnd);

  assert.ok(repairStart > migration.indexOf("create or replace function"), "repair runs after the RPC exists");
  assert.ok(repairEnd > repairStart, "repair block is complete");
  assert.match(repair, /from public\.work_orders wo\s+join public\.content_items ci/i);
  assert.match(repair, /ci\.workspace_id = wo\.workspace_id/i);
  assert.match(repair, /ci\.id::text = wo\.asset_id/i);
  assert.match(repair, /wo\.kind = 'content-draft'/i);
  assert.match(repair, /wo\.status = 'approved'/i);
  assert.match(repair, /ci\.status = 'idea'/i);
  assert.match(
    repair,
    /not exists[\s\S]*?cv\.workspace_id = wo\.workspace_id[\s\S]*?cv\.content_id = ci\.id[\s\S]*?cv\.meta ->> 'work_order_id' = wo\.id::text/i,
  );
  assert.match(
    repair,
    /repair_result := public\.approve_content_draft_work_order\([\s\S]*?repair_order\.workspace_id,[\s\S]*?repair_order\.id[\s\S]*?\)/i,
  );
  assert.match(repair, /repair_result ->> 'materialized'/i);
  assert.match(repair, /raise exception 'approved content draft repair did not materialize'/i);
  assert.doesNotMatch(repair, /exception\s+when/i);
  assert.ok(migration.indexOf("begin;") < repairStart, "repair stays inside the migration transaction");
  assert.ok(migration.indexOf("commit;") > repairEnd, "repair failure rolls back the migration transaction");
});

test("migration repairs only one approved work order per content item", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const repairStart = migration.indexOf("do $repair$");
  const repairEnd = migration.indexOf("$repair$;", repairStart + 1);
  const repair = migration.slice(repairStart, repairEnd);

  assert.match(
    repair,
    /select distinct on\s*\(wo\.workspace_id, ci\.id\)[\s\S]*?wo\.workspace_id,[\s\S]*?ci\.id as content_id,[\s\S]*?wo\.id/i,
  );
  assert.match(
    repair,
    /order by\s+wo\.workspace_id,\s*ci\.id,\s*wo\.decided_at desc nulls last,\s*wo\.proposed_at desc,\s*wo\.id desc/i,
  );
  assert.doesNotMatch(repair, /update\s+public\.work_orders/i);
  assert.doesNotMatch(repair, /set\s+status\s*=\s*'dismissed'/i);
});

test("apply-pending describes and mirrors its included atomic approval migration", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260713_0014_atomic_content_draft_approval.sql",
      import.meta.url,
    ),
    "utf8",
  ).trim();
  const applyPending = readFileSync(
    new URL("../../../supabase/apply-pending.sql", import.meta.url),
    "utf8",
  );
  const bundledMigration = applyPending
    .slice(applyPending.indexOf("-- Materialize internal content-draft approvals atomically"))
    .replace(/\n-- end of apply-pending\.sql[\s\S]*$/, "")
    .trim();

  assert.match(applyPending, /적용 대기 마이그레이션 묶음 \(0003~0011 \+ 0014, 시점순\)/);
  assert.equal(bundledMigration, migration);
});
