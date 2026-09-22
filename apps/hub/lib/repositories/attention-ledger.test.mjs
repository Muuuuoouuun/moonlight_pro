import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const readStub = `
export function eqFilter(value) { return "eq." + value; }
export function inFilter(values) { return "in.(" + values.join(",") + ")"; }
export function withWorkspaceFilter(filters = []) {
  return [["workspace_id", "eq.workspace-1"], ...filters];
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__attentionReadState;
  state.calls.push({ table, options });
  if (state.gate) await state.gate;
  const rows = state.rows[table];
  if (!rows || !options.select) return rows;
  return rows.map(row => Object.fromEntries(options.select.split(",").map(key => [key, row[key]])));
}
`;
const writeStub = `
export function resolveDefaultWorkspaceId() { return "workspace-1"; }
export function resolveSupabaseConfig() {
  return globalThis.__attentionReadState.configured ? { url: "https://example.test", apiKey: "test" } : null;
}
`;
const operatingStub = `
export async function getTaskLedger() {
  return { source: "supabase", projects: [], todos: [] };
}
`;
const calendarStub = `
export async function readCombinedGoogleCalendarEvents() { return { ok: true, items: [] }; }
`;
const inquiriesStub = `
export async function getInquiriesLedger() { return { status: "live", rows: [], unreadCount: 0 }; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/server-read": readStub,
      "@/lib/server-write": writeStub,
      "./operating-ledger.js": operatingStub,
      "../google-calendar.js": calendarStub,
      "./inquiries-ledger.js": inquiriesStub,
    };
    // The real contact-tracking reader uses a relative import. Keep it in the
    // query-count baseline so the full ledger's workspace read is measured too.
    const stub = specifier === "../server-read.js" && context.parentURL.includes("/sales-os/contact-tracking.js")
      ? readStub
      : stubs[specifier];
    if (stub) return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const state = globalThis.__attentionReadState = {};
const { getAttentionLedger } = await import("./attention-ledger.js?lean-revenue-contract");
const { getRevenueLedger } = await import("./revenue-ledger.js");

beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-22T03:00:00.000Z") });
  state.configured = true;
  state.calls = [];
  state.gate = null;
  state.rows = {
    leads: [{ id: "lead-1", score: "87.5", name: "Lead", meta: {} }],
    deals: [
      {
        id: "deal-1", lead_id: "lead-1", company_id: "company-1", title: "",
        stage: "proposal", amount: "1250000", expected_close_at: "2026-09-23T03:00:00.000Z",
        last_activity_at: "2026-09-01T03:00:00.000Z", created_at: "2026-08-01T03:00:00.000Z",
        meta: { stage_detail: "quote", workspace: "classin" },
      },
      {
        id: "deal-2", title: "Follow-up", stage: "prospect", amount: 0,
        updated_at: "2026-09-22T00:00:00.000Z", meta: { stage_detail: "contact" },
      },
      { id: "deal-closed", title: "Closed", stage: "won", amount: 1000, meta: {} },
      { id: "deal-lost", title: "Lost", stage: "lost", amount: 1000, meta: {} },
    ],
    customer_accounts: [{ id: "account-1", name: "Account", status: "active" }],
    operation_cases: [{ id: "case-1", title: "Case" }],
    companies: [{ id: "company-1", name: "Company fallback", meta: { region: "Seoul" } }],
    contacts: [{ id: "contact-1", name: "Contact" }],
    workspaces: [{ id: "workspace-1", meta: { contact_tracking_started_at: "2026-09-20T00:00:00.000Z" } }],
  };
});

test("attention returns the same items and scoring with three revenue reads instead of seven", async () => {
  const { raw, ...full } = await getAttentionLedger({ includeRaw: true });
  const fullCalls = state.calls;
  assert.deepEqual(fullCalls.map(call => call.table), [
    "leads", "deals", "customer_accounts", "operation_cases", "companies", "contacts", "workspaces",
  ]);
  assert.equal(raw.revenue.accounts.length, 1);
  assert.equal(raw.revenue.cases.length, 1);
  assert.equal(raw.revenue.contacts.length, 1);
  assert.equal(raw.revenue.deals[0].trackingEligible, false);

  state.calls = [];
  const lean = await getAttentionLedger();
  assert.deepEqual(lean, full);
  assert.deepEqual(state.calls.map(call => call.table), ["leads", "deals", "companies"]);
  assert.equal(lean.items.length, 2);
  assert.equal(lean.items[0].title, "Company fallback");
  assert.equal(lean.items[0].priorityScore, 3488);
  assert.equal(lean.items[0].status, "quote");
  assert.equal(lean.items[0].stalled, true);
  for (const call of state.calls) {
    assert.ok(call.options.select && call.options.select !== "*");
    const { select, ...options } = call.options;
    assert.deepEqual(options, fullCalls.find(fullCall => fullCall.table === call.table).options);
  }
});

test("attention starts all three independent reads together and re-reads on the next request", async () => {
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  const pending = getAttentionLedger();
  try {
    assert.deepEqual(state.calls.map(call => call.table), ["leads", "deals", "companies"]);
  } finally {
    release();
  }
  await pending;
  state.gate = null;
  state.rows.deals[0].title = "Saved title";
  const next = await getAttentionLedger();
  assert.equal(state.calls.length, 6);
  assert.equal(next.items[0].title, "Saved title");
});

test("attention names lead/deal read failures and keeps its other lanes readable", async () => {
  for (const table of ["leads", "deals"]) {
    const rows = state.rows[table];
    state.rows[table] = null;
    const lean = await getAttentionLedger();
    const { raw, ...full } = await getAttentionLedger({ includeRaw: true });
    assert.deepEqual(lean, full);
    assert.equal(lean.sources.deals, "error");
    assert.equal(lean.sources.tasks, "live");
    assert.equal(lean.sources.calendar, "live");
    assert.equal(lean.items.length, 0);
    assert.deepEqual(lean.sourceFailures, [{
      source: "deals", error: "revenue-ledger-core-read-failed", failedSources: [table],
    }]);
    state.rows[table] = rows;
  }
});

test("company enrichment failure retains the existing fallback and partial metadata", async () => {
  state.rows.companies = null;
  const lean = await getAttentionLedger();
  const { raw, ...full } = await getAttentionLedger({ includeRaw: true });
  assert.deepEqual(lean, full);
  assert.equal(lean.items[0].title, "Untitled deal");
  const revenue = await getRevenueLedger({ projection: "attention" });
  assert.equal(revenue.partial, true);
  assert.deepEqual(revenue.failedSources, ["companies"]);
});

test("unrelated account, case, contact and tracking failures do not block attention", async () => {
  for (const table of ["customer_accounts", "operation_cases", "contacts", "workspaces"]) {
    state.rows[table] = null;
  }
  const lean = await getAttentionLedger();
  assert.equal(lean.sources.deals, "live");
  assert.equal(lean.items.length, 2);
  assert.deepEqual(state.calls.map(call => call.table), ["leads", "deals", "companies"]);
});

test("unconfigured attention remains preview and performs no revenue reads", async () => {
  state.configured = false;
  const lean = await getAttentionLedger();
  const { raw, ...full } = await getAttentionLedger({ includeRaw: true });
  assert.deepEqual(lean, full);
  assert.equal(lean.sources.deals, "preview");
  assert.deepEqual(state.calls, []);
});
