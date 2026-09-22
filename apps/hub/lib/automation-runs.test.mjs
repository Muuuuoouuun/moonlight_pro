import assert from "node:assert/strict";
import { test } from "node:test";

import { ensureAutomation, recordAutomationRun } from "./automation-runs.js";

const WS = "33333333-3333-4333-8333-333333333333";

function deps({ existing = null, insertOk = true } = {}) {
  const calls = { reads: [], inserts: [], updates: [] };
  return {
    calls,
    fetchSupabaseRows: async (table, options) => {
      calls.reads.push({ table, options });
      if (existing === "fail") return null;
      return existing ? [existing] : [];
    },
    insertSupabaseRecord: async (table, record) => {
      calls.inserts.push({ table, record });
      if (!insertOk) return { persisted: false, reason: "network" };
      return { persisted: true, reason: "ok", id: table === "automations" ? "auto-1" : "run-1" };
    },
    updateSupabaseRecord: async (table, filters, patch) => {
      calls.updates.push({ table, filters, patch });
      return { persisted: true, reason: "ok" };
    },
  };
}

test("ensureAutomation finds the cron's automation row by meta.key and creates it once", async () => {
  const d = deps();
  const id = await ensureAutomation({ workspaceId: WS, key: "followup-autopilot", name: "Guru Autopilot", deps: d });
  assert.equal(id, "auto-1");
  assert.deepEqual(d.calls.reads[0].options.filters, [["workspace_id", `eq.${WS}`], ["meta->>key", "eq.followup-autopilot"]]);
  assert.equal(d.calls.inserts[0].table, "automations");
  assert.deepEqual(d.calls.inserts[0].record.meta, { key: "followup-autopilot", source: "cron" });

  const found = deps({ existing: { id: "auto-9", name: "Guru Autopilot" } });
  assert.equal(await ensureAutomation({ workspaceId: WS, key: "followup-autopilot", deps: found }), "auto-9");
  assert.equal(found.calls.inserts.length, 0, "이미 있으면 만들지 않는다");
});

test("recordAutomationRun writes a failure row the automations page can surface", async () => {
  const d = deps({ existing: { id: "auto-9" } });
  const result = await recordAutomationRun({
    workspaceId: WS,
    key: "followup-autopilot",
    name: "Guru Autopilot",
    status: "failure",
    correlationId: "cron:abc",
    input: { scanned: 3 },
    output: { drafted: 0, errored: 3 },
    errorMessage: new Error("engine 502 · invalid-draft-json"),
    deps: d,
  });

  assert.equal(result.persisted, true);
  assert.equal(result.automationId, "auto-9");
  const run = d.calls.inserts.find((i) => i.table === "automation_runs").record;
  assert.equal(run.status, "failure");
  assert.equal(run.automation_id, "auto-9");
  assert.equal(run.correlation_id, "cron:abc");
  assert.equal(run.error_message, "engine 502 · invalid-draft-json");
  assert.equal(run.output_payload.summary, "Guru Autopilot 실패");
  assert.equal(run.output_payload.errored, 3);
  assert.ok(run.finished_at);
  // 목록의 "마지막 실행"이 갱신된다 — 실패도 실행이다.
  assert.equal(d.calls.updates[0].table, "automations");
  assert.ok(d.calls.updates[0].patch.last_run_at);
});

test("recordAutomationRun still records the run when the automations row cannot be read", async () => {
  const d = deps({ existing: "fail" });
  const result = await recordAutomationRun({ workspaceId: WS, key: "content-flywheel", status: "success", deps: d });
  assert.equal(result.persisted, true);
  assert.equal(result.automationId, null);
  const run = d.calls.inserts.find((i) => i.table === "automation_runs").record;
  assert.equal(run.automation_id, null);
  assert.equal(run.output_payload.summary, "content-flywheel 실행 완료");
  assert.equal(d.calls.updates.length, 0);
});

test("recordAutomationRun normalizes unknown statuses to failure and refuses without a key", async () => {
  const d = deps({ existing: { id: "auto-9" } });
  const result = await recordAutomationRun({ workspaceId: WS, key: "x", status: "weird", deps: d });
  assert.equal(result.status, "failure");
  assert.deepEqual(await recordAutomationRun({ workspaceId: WS, deps: d }), { persisted: false, reason: "missing-key" });
});
