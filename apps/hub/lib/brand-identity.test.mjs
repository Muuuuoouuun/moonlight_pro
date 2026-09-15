import assert from "node:assert/strict";
import { test } from "node:test";
import { mapBrandIdentity, brandIdentityDraft, brandIdentityPayload } from "./brand-identity.js";
import { normalizePmsCommand } from "../../engine/lib/pms-command.ts";
import { executePmsCommand } from "../../engine/lib/pms-command-service.ts";
import { getBrandLedger } from "./repositories/brand-ledger.js";

const id = "11111111-1111-4111-8111-111111111111";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const before = "2026-09-11T00:00:00.123456+00:00";
const now = "2026-09-14T00:00:00.000Z";
const row = { id, workspace_id: workspaceId, name: "Brand", slug: "brand", updated_at: before,
  meta: { category: "sns-channel", org_scope: "personal", channels: ["Threads"], source_links: ["https://example.com"], custom: { preserve: true } } };
function payload() {
  const draft = brandIdentityDraft(mapBrandIdentity(row));
  draft.promise = "A useful promise";
  draft.keywords = "One\nTwo";
  draft.confirmation = "confirmed";
  return { action: "update_brand_identity", ...brandIdentityPayload(draft) };
}

test("blank brand criteria stay blank and drafts require explicit fresh confirmation", () => {
  const brand = mapBrandIdentity({ ...row, meta: { identity_confirmed_at: before } });
  assert.equal(brand.voice, "");
  assert.deepEqual(brand.rules, []);
  assert.equal(brandIdentityPayload(brandIdentityDraft(brand)).confirmIdentity, false);
});

test("identity writes preserve unrelated metadata and round-trip durable fields", async () => {
  let saved;
  const result = await executePmsCommand(payload(), { workspaceId, now }, {
    fetchRows: async () => [row], insert: async () => assert.fail("must not create a new brand"),
    update: async (table, filters, patch) => {
      assert.equal(table, "brands");
      assert.deepEqual(filters.find(([key]) => key === "updated_at"), ["updated_at", `eq.${before}`]);
      saved = { ...row, ...patch };
      return { persisted: true, reason: "ok", records: [saved] };
    },
  });
  assert.equal(result.status, "saved");
  assert.equal(saved.slug, row.slug);
  assert.deepEqual(saved.meta.custom, { preserve: true });
  assert.deepEqual(saved.meta.channels, ["Threads"]);
  assert.deepEqual(saved.meta.source_links, ["https://example.com"]);
  assert.equal(saved.meta.category, "sns-channel");
  const reopened = mapBrandIdentity(saved);
  assert.equal(reopened.promise, "A useful promise");
  assert.deepEqual(reopened.keywords, ["One", "Two"]);
  assert.equal(reopened.identityConfirmedAt, now);
});

test("stale or unreadable brand metadata never gets overwritten", async () => {
  for (const current of [null, [{ ...row, updated_at: now }]]) {
    const result = await executePmsCommand(payload(), { workspaceId, now }, {
      fetchRows: async () => current,
      update: async () => assert.fail("must not write"), insert: async () => assert.fail("must not insert"),
    });
    assert.equal(result.status, current === null ? "error" : "conflict");
  }
});

test("identity validation rejects unsafe shapes and keeps database timestamp precision", () => {
  const command = normalizePmsCommand(payload(), { workspaceId, now });
  assert.equal(command.ok, true);
  assert.equal(command.filters.at(-1)[1], `eq.${before}`);
  assert.equal(normalizePmsCommand({ ...payload(), operatingState: "invented" }, { workspaceId, now }).ok, false);
  assert.equal(normalizePmsCommand({ ...payload(), expectedUpdatedAt: null }, { workspaceId, now }).ok, false);
  assert.equal(normalizePmsCommand({ ...payload(), identity: { ...payload().identity, keywords: "bad" } }, { workspaceId, now }).ok, false);
});

test("legacy container rename preserves existing identity metadata", async () => {
  let saved;
  const result = await executePmsCommand({ action: "update_brand", id, name: "Renamed", category: "general", orgScope: "personal" }, { workspaceId, now }, {
    fetchRows: async () => [{ ...row, meta: { ...row.meta, philosophy: "Keep this" } }],
    update: async (_table, _filters, patch) => { saved = patch; return { persisted: true, reason: "ok" }; },
    insert: async () => assert.fail("must not insert"),
  });
  assert.equal(result.status, "saved");
  assert.equal(saved.meta.philosophy, "Keep this");
  assert.equal(saved.name, "Renamed");
});

test("brand read is independent from all content tables", async () => {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "COM_MOON_DEFAULT_WORKSPACE_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only", COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId });
  try {
    const result = await getBrandLedger({ fetchRows: async (table) => { assert.equal(table, "brands"); return [row]; } });
    assert.equal(result.source, "supabase");
    assert.equal(result.metricsAvailable, false);
    assert.equal(result.brands[0].id, id);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
