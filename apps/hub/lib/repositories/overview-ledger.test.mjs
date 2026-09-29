import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(filters = []) {
  return [["workspace_id", "eq.workspace-1"], ...filters];
}
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__overviewLedgerState.calls.push({ kind: "fetch", table, options });
  return globalThis.__overviewLedgerState.rows[table];
}
export async function fetchSupabaseRowsDetailed(table, options = {}) {
  globalThis.__overviewLedgerState.calls.push({ kind: "detailed", table, options });
  const rows = globalThis.__overviewLedgerState.rows[table];
  const count = globalThis.__overviewLedgerState.counts[table];
  return { rows, count, configured: true, error: rows === null ? { reason: "test" } : null };
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "workspace-1"; }
export function resolveSupabaseConfig() {
  return globalThis.__overviewLedgerState.configured
    ? { url: "https://example.supabase.co", apiKey: "test" }
    : null;
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server-read") {
      return { url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-write") {
      return { url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__overviewLedgerState = { configured: true, calls: [], rows: {}, counts: {} };
const { getOverviewLedger } = await import("./overview-ledger.js?overview-lean-contract");

function resetState() {
  state.configured = true;
  state.calls = [];
  state.rows = {
    brands: [{ id: "brand-1", slug: "moon", name: "Moon", meta: { glyph: "◐", tone: "moon" } }],
    projects: [{ id: "project-1", brand_id: "brand-1", name: "Project", status: "active" }],
    tasks: [{ id: "task-1", status: "todo", due_at: "2026-09-02T01:00:00.000Z" }],
    project_updates: [{
      id: "update-1",
      project_id: "project-1",
      title: "Progress",
      summary: "Moved",
      happened_at: "2026-09-02T01:00:00.000Z",
      created_at: "2026-09-02T01:00:00.000Z",
    }],
    decisions: [{
      id: "decision-1",
      project_id: "project-1",
      title: "Choose",
      summary: "Because",
      decided_at: "2026-09-02T02:00:00.000Z",
      created_at: "2026-09-02T02:00:00.000Z",
    }],
    content_items: [{ id: "content-1", status: "draft" }],
    publish_logs: [{
      id: "publish-1",
      variant_id: "variant-1",
      channel: "Web",
      status: "published",
      payload: { title: "Published" },
      published_at: "2026-09-02T03:00:00.000Z",
      created_at: "2026-09-02T03:00:00.000Z",
    }],
    leads: [{ id: "lead-1", status: "new" }],
    deals: [{ id: "deal-1", amount: 1200000, stage: "proposal", meta: { stage_detail: "consult" } }],
    automations: [{ id: "automation-1", name: "Daily", status: "active" }],
    automation_runs: [{
      id: "run-1",
      automation_id: "automation-1",
      status: "success",
      output_payload: { summary: "done" },
      created_at: "2026-09-02T04:00:00.000Z",
    }],
    webhook_events: [{ id: "webhook-1" }],
    integration_connections: [{ id: "integration-1", status: "connected" }],
    routine_checks: [{
      id: "routine-1",
      project_id: "project-1",
      check_type: "morning",
      status: "done",
      meta: { local_date: "2026-09-02" },
      checked_at: "2026-09-02T00:00:00.000Z",
      created_at: "2026-09-02T00:00:00.000Z",
    }],
    workspaces: [{ id: "workspace-1", timezone: "Asia/Seoul" }],
  };
  state.counts = { tasks: 1, content_items: 1, webhook_events: 1 };
}

beforeEach(resetState);

test("Overview lean projection reads 15 bounded field lists and skips full-ledger tables", async () => {
  const snapshot = await getOverviewLedger({ now: new Date("2026-09-02T05:00:00.000Z") });

  assert.equal(state.calls.length, 15);
  assert.deepEqual(
    state.calls.map((call) => call.table),
    [
      "brands", "projects", "tasks", "project_updates", "decisions", "content_items",
      "publish_logs", "leads", "deals", "automations", "automation_runs",
      "webhook_events", "integration_connections", "routine_checks", "workspaces",
    ],
  );
  assert.equal(state.calls.every((call) => call.options.select && call.options.select !== "*"), true);
  assert.equal(state.calls.some((call) => ["notes", "milestones", "content_variants", "content_assets", "customer_accounts", "operation_cases"].includes(call.table)), false);
  assert.equal(state.calls.find((call) => call.table === "tasks").options.count, "exact");
  assert.equal(state.calls.find((call) => call.table === "content_items").options.count, "exact");
  assert.equal(state.calls.find((call) => call.table === "webhook_events").options.count, "exact");

  assert.equal(snapshot.projects.source, "supabase");
  assert.equal(snapshot.projects.projects[0].status, "In progress");
  assert.equal(snapshot.projects.projects[0].brand, "moon");
  assert.equal(snapshot.content.items[0].statusKey, "draft");
  assert.equal(snapshot.revenue.deals[0].stage, "consult");
  assert.equal(snapshot.revenue.summary.leadsCount, 1);
  assert.equal(snapshot.automations.summary.runsToday, 1);
  assert.equal(snapshot.automations.summary.integrationsConnected, 1);
  assert.equal(snapshot.automations.summary.webhookEventsToday, 1);
  assert.equal(snapshot.work.rhythm.state, "live");
  assert.equal(snapshot.work.rituals[0].streak, 1);
});

test("Overview projection preserves usable content while naming a failed publish slice", async () => {
  state.rows.publish_logs = null;

  const snapshot = await getOverviewLedger({ now: new Date("2026-09-02T05:00:00.000Z") });

  assert.equal(snapshot.content.source, "supabase");
  assert.equal(snapshot.content.partial, true);
  assert.deepEqual(snapshot.content.failedSources, ["publish_logs"]);
  assert.equal(snapshot.content.items.length, 1);
  assert.deepEqual(snapshot.content.publishLogs, []);
});

test("Overview projection does not report capped deal totals as complete", async () => {
  state.rows.deals = Array.from({ length: 121 }, (_, index) => ({
    id: `deal-${index}`,
    amount: 1,
    stage: "prospect",
    meta: {},
  }));

  const snapshot = await getOverviewLedger({ now: new Date("2026-09-02T05:00:00.000Z") });

  assert.equal(snapshot.revenue.deals.length, 120);
  assert.equal(snapshot.revenue.partial, true);
  assert.deepEqual(snapshot.revenue.partialSources, ["deals"]);
});

test("Overview projection performs no reads without Supabase configuration", async () => {
  state.configured = false;

  const snapshot = await getOverviewLedger();

  assert.deepEqual(state.calls, []);
  assert.deepEqual(Object.values(snapshot).map((domain) => domain.source), [
    "preview", "preview", "preview", "preview", "preview",
  ]);
});

test('overview preserves retired orphan run names and excludes retired active rows', async () => {
  state.rows.automations = [{id:'retired',name:'Guru Autopilot',status:'active',meta:{key:'followup-autopilot'}}];
  state.rows.automation_runs = [{id:'orphan',automation_id:null,status:'failure',output_payload:{key:'followup-autopilot'},created_at:'2026-09-26T02:00:00Z'}];
  const snapshot=await getOverviewLedger({now:new Date('2026-09-26T12:00:00Z')});
  assert.equal(snapshot.automations.summary.activeAutomations,0);
  assert.equal(snapshot.automations.runs[0].flow,'Guru Autopilot');
});
