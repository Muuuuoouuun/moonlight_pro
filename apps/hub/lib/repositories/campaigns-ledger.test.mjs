import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function withWorkspaceFilter(filters = []) { return [["workspace_id", "eq.workspace-1"], ...filters]; }
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__campaignLedgerState.reads.push({ table, options });
  return [{ meta: globalThis.__campaignLedgerState.existingMeta }];
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "workspace-1"; }
export function resolveSupabaseConfig() { return { url: "https://example.supabase.co", apiKey: "test" }; }
export async function insertSupabaseRecord(table, record) {
  globalThis.__campaignLedgerState.inserts.push({ table, record });
  return { persisted: true, id: "campaign-new", record: { ...record, id: "campaign-new" } };
}
export async function updateSupabaseRecord(table, filters, patch) {
  globalThis.__campaignLedgerState.updates.push({ table, filters, patch });
  if (globalThis.__campaignLedgerState.updateFailure) {
    return { persisted: false, reason: globalThis.__campaignLedgerState.updateFailure };
  }
  return {
    persisted: true,
    id: "campaign-1",
    record: { id: "campaign-1", name: "Founder OS", status: "active", ...patch },
  };
}
export async function deleteSupabaseRecord() { return { persisted: true }; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "../server-read.js") {
      return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    }
    if (specifier === "../server-write.js") {
      return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__campaignLedgerState = {
  reads: [],
  inserts: [],
  updates: [],
  existingMeta: {},
  updateFailure: null,
};
const { saveCampaign } = await import("./campaigns-ledger.js?business-truth-contract");

beforeEach(() => {
  state.reads = [];
  state.inserts = [];
  state.updates = [];
  state.existingMeta = { origin: "hub-campaigns", channels: ["Email"] };
  state.updateFailure = null;
});

test("strategy update merges business truth into existing campaign metadata", async () => {
  const result = await saveCampaign({
    op: "update",
    id: "campaign-1",
    payload: {
      businessTruth: {
        icp: "1인 사업가",
        problem: "판매 실행이 산발적이다",
        promise: "매주 한 개의 병목을 제거한다",
        offer: "Founder OS 구축",
        priceLabel: "300만원",
        primaryMetric: "유료 진단 예약",
        weeklyTarget: 5,
        weeklyActual: 2,
      },
    },
  });

  assert.equal(result.status, "saved");
  assert.equal(state.reads.length, 1);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].patch.meta.origin, "hub-campaigns");
  assert.deepEqual(state.updates[0].patch.meta.channels, ["Email"]);
  assert.equal(state.updates[0].patch.meta.business_truth.primary_metric, "유료 진단 예약");
  assert.equal(result.campaign.businessTruth.weeklyTarget, 5);
  assert.equal(result.campaign.businessTruth.weeklyActual, 2);
});

test("a configured live write refusal is failed, not preview", async () => {
  state.updateFailure = "http-error";

  const result = await saveCampaign({
    op: "update",
    id: "campaign-1",
    payload: { businessTruth: { primaryMetric: "예약", weeklyTarget: 5 } },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "http-error");
});
