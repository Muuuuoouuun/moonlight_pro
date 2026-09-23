import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const readStub = `
export const eqFilter = (value) => "eq." + value;
export async function fetchSupabaseRowsDetailed(table, options) {
  const state = globalThis.__deadlineSettingsTest;
  state.reads.push({ table, options });
  if (state.failedTable === table) return { rows: null, error: { reason: "read-failed" } };
  const rows = state.rows[table] || [];
  return { rows, count: rows.length, error: null };
}
`;
const writeStub = `
export const resolveDefaultWorkspaceId = () => "workspace-1";
export const resolveSupabaseConfig = () => ({ url: "https://example.test", apiKey: "test" });
export async function updateSupabaseRecord(table, filters, patch, options) {
  const state = globalThis.__deadlineSettingsTest;
  state.writes.push({ table, filters, patch, options });
  if (state.conflict) return { persisted: false, reason: "no-matching-row" };
  return { persisted: true, record: { id: "workspace-1", meta: patch.meta } };
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = specifier === "@/lib/server-read" ? readStub
      : specifier === "@/lib/server-write" ? writeStub : null;
    return stub
      ? { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});

const { saveDeadlineAlertReset } = await import("./deadline-alert-settings.js?reset-write-test");
const state = globalThis.__deadlineSettingsTest = {};

beforeEach(() => {
  state.reads = [];
  state.writes = [];
  state.failedTable = "";
  state.conflict = false;
  state.rows = {
    workspaces: [{ id: "workspace-1", updated_at: "2026-09-22T00:00:00Z", meta: { contact_tracking_started_at: "2026-09-01" } }],
    tasks: [],
    deals: [
      { id: "old-deal", stage: "proposal", expected_close_at: "2026-08-26T16:00:00Z" },
      { id: "new-deal", stage: "proposal", expected_close_at: "2026-09-21T16:00:00Z" },
    ],
    projects: [{ id: "old-project", status: "active", due_at: "2026-05-08T07:20:52Z" }],
  };
});

test("reset records only old open deadlines and preserves other workspace settings", async () => {
  const result = await saveDeadlineAlertReset("reset", new Date("2026-09-23T00:00:00Z"));
  assert.equal(result.status, "live");
  assert.deepEqual(result.reset.items.map(({ kind, id }) => `${kind}:${id}`), ["deal:old-deal", "project:old-project"]);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].table, "workspaces");
  assert.equal(state.writes[0].patch.meta.contact_tracking_started_at, "2026-09-01");
  assert.deepEqual(state.writes[0].filters, [
    ["id", "eq.workspace-1"], ["updated_at", "eq.2026-09-22T00:00:00Z"],
  ]);
  assert.equal(state.reads.find((read) => read.table === "deals").options.filters[1][1], "lt.2026-09-21T00:00:00+09:00");
});

test("a failed source read prevents an incomplete reset write", async () => {
  state.failedTable = "deals";
  const result = await saveDeadlineAlertReset("reset", new Date("2026-09-23T00:00:00Z"));
  assert.equal(result.status, "error");
  assert.deepEqual(state.writes, []);
});

test("a concurrent workspace edit is reported instead of overwritten", async () => {
  state.conflict = true;
  const result = await saveDeadlineAlertReset("restore");
  assert.equal(result.status, "conflict");
});

test("restore removes only the reset preference", async () => {
  state.rows.workspaces[0].meta.deadline_alert_reset = {
    resetAt: "2026-09-23T00:00:00Z", beforeDay: "2026-09-21", items: [],
  };
  const result = await saveDeadlineAlertReset("restore");
  assert.equal(result.status, "live");
  assert.equal(result.reset, null);
  assert.equal(state.writes[0].patch.meta.contact_tracking_started_at, "2026-09-01");
  assert.equal("deadline_alert_reset" in state.writes[0].patch.meta, false);
});
