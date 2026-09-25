import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export function inFilter(values) { return \`in.(\${values.join(",")})\`; }
export function withWorkspaceFilter(filters = []) {
  const workspaceId = globalThis.__automationsLedgerTestState.workspaceId;
  return workspaceId ? [["workspace_id", eqFilter(workspaceId)], ...filters] : filters;
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__automationsLedgerTestState;
  state.calls.push({ table, options });
  return Object.hasOwn(state.rows, table) ? state.rows[table] : [];
}
`;

const serverWriteStub = `
export function resolveDefaultWorkspaceId() {
  return globalThis.__automationsLedgerTestState.workspaceId;
}
export function resolveSupabaseConfig() {
  return globalThis.__automationsLedgerTestState.config;
}
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server-read") {
      return {
        url: `data:text/javascript,${encodeURIComponent(serverReadStub)}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/server-write") {
      return {
        url: `data:text/javascript,${encodeURIComponent(serverWriteStub)}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__automationsLedgerTestState = {
  calls: [],
  config: { url: "https://supabase.example.com", apiKey: "test-key" },
  rows: {},
  workspaceId: "workspace-1",
};

const automationsLedger = await import("./automations-ledger.js?automations-ledger-test");

const RUN_SELECT = "id,automation_id,status,correlation_id,provider_event_id,output_payload,error_message,created_at,finished_at";
const WEBHOOK_EVENT_SELECT = "id,event_type,source,status,correlation_id,provider_event_id,error_message,received_at,processed_at";
const INTEGRATION_SELECT = "id,provider,status,external_account_id,last_synced_at";
const ERROR_LOG_SELECT = "id,context,level,source,resolved,timestamp,correlation_id,automation_run_id";

beforeEach(() => {
  globalThis.__automationsLedgerTestState = {
    calls: [],
    config: { url: "https://supabase.example.com", apiKey: "test-key" },
    workspaceId: "workspace-1",
    rows: {
      automations: [],
      triggers: [],
      automation_runs: [],
      webhook_events: [],
      integration_connections: [],
      error_logs: [],
    },
  };
});

test("narrows automation_runs, webhook_events, integration_connections and error_logs reads to their mappers' fields", async () => {
  const state = globalThis.__automationsLedgerTestState;

  await automationsLedger.getAutomationsLedger();

  const EXPECTED_SELECT = {
    automation_runs: RUN_SELECT,
    webhook_events: WEBHOOK_EVENT_SELECT,
    integration_connections: INTEGRATION_SELECT,
    error_logs: ERROR_LOG_SELECT,
  };

  for (const [table, select] of Object.entries(EXPECTED_SELECT)) {
    const calls = state.calls.filter((call) => call.table === table);
    assert.equal(calls.length, 1, `${table} must be fetched exactly once`);
    assert.equal(calls[0].options.select, select);
    assert.ok(!calls[0].options.select.includes("input_payload"), `${table} select must not read input_payload`);
    assert.ok(!calls[0].options.select.includes("config"), `${table} select must not read config`);
    assert.ok(!calls[0].options.select.includes("trace"), `${table} select must not read trace`);
  }

  // webhook_events and error_logs drop their raw `payload` column; automation_runs keeps
  // only its output side (the detail source) and drops input_payload (asserted above).
  assert.ok(!EXPECTED_SELECT.webhook_events.split(",").includes("payload"));
  assert.ok(!EXPECTED_SELECT.error_logs.split(",").includes("payload"));
  assert.ok(EXPECTED_SELECT.automation_runs.split(",").includes("output_payload"));

  // automations and triggers stay unrestricted — triggers.config still drives resolveTriggerLabel.
  const automationsCall = state.calls.find((call) => call.table === "automations");
  const triggersCall = state.calls.find((call) => call.table === "triggers");
  assert.equal(automationsCall.options.select, undefined);
  assert.equal(triggersCall.options.select, undefined);
});

test("maps run detail from output_payload and surfaces integration identity fields", async () => {
  const state = globalThis.__automationsLedgerTestState;
  state.rows.automations = [{
    id: "automation-1",
    name: "리드 알림",
    status: "active",
    trigger_id: "trigger-1",
    last_run_at: "2026-09-24T09:00:00.000Z",
  }];
  state.rows.triggers = [{
    id: "trigger-1",
    trigger_type: "webhook",
    config: { label: "리드 webhook" },
  }];
  state.rows.automation_runs = [{
    id: "run-1",
    automation_id: "automation-1",
    status: "success",
    correlation_id: "corr-1",
    provider_event_id: "provider-1",
    output_payload: { summary: "완료됨" },
    error_message: null,
    created_at: "2026-09-24T09:00:01.000Z",
    finished_at: "2026-09-24T09:00:02.000Z",
  }];
  state.rows.webhook_events = [{
    id: "event-1",
    event_type: "lead.created",
    source: "classin",
    status: "processed",
    correlation_id: "corr-1",
    provider_event_id: "provider-1",
    error_message: null,
    received_at: "2026-09-24T09:00:00.500Z",
    processed_at: "2026-09-24T09:00:01.500Z",
  }];
  state.rows.integration_connections = [{
    id: "integration-1",
    provider: "google-calendar",
    status: "connected",
    external_account_id: "account-1",
    last_synced_at: "2026-09-24T08:00:00.000Z",
  }];
  state.rows.error_logs = [{
    id: "error-1",
    context: "webhook.process",
    level: "error",
    source: "engine",
    resolved: false,
    timestamp: "2026-09-24T09:00:03.000Z",
    correlation_id: "corr-1",
    automation_run_id: "run-1",
  }];

  const ledger = await automationsLedger.getAutomationsLedger();

  assert.equal(ledger.source, "supabase");
  assert.equal(ledger.runs[0].detail, "완료됨", "run detail must come from output_payload, not a dropped input_payload");
  assert.equal(ledger.runs[0].flow, "리드 알림");
  assert.equal(ledger.integrations[0].id, "integration-1");
  assert.equal(ledger.integrations[0].provider, "google-calendar");
  assert.equal(ledger.integrations[0].status, "connected");
  assert.equal(ledger.integrations[0].lastSyncedAt, "2026-09-24T08:00:00.000Z");
  assert.equal(ledger.integrations[0].externalAccountId, "account-1");
  assert.equal(ledger.errors[0].automationRunId, "run-1");
  assert.equal(ledger.webhookEvents[0].eventType, "lead.created");
});
