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
  return { source: "supabase", projects: [], todos: globalThis.__attentionReadState.todos || [] };
}
`;
const calendarStub = `
export async function readCombinedGoogleCalendarEvents() { return { ok: true, items: [] }; }
`;
const inquiriesStub = `
export async function getInquiriesLedger() { return { status: "live", rows: [], unreadCount: 0 }; }
`;
const deadlineStub = `
export async function getDeadlineAlertSettings() { return { status: "live", reset: globalThis.__attentionReadState.deadlineReset || null }; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "@/lib/server-read": readStub,
      "@/lib/server-write": writeStub,
      "./operating-ledger.js": operatingStub,
      "../google-calendar.js": calendarStub,
      "./inquiries-ledger.js": inquiriesStub,
      "./deadline-alert-settings.js": deadlineStub,
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
  state.deadlineReset = null;
  state.todos = [];
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

test("an acknowledged old deal deadline remains visible without an overdue alert", async () => {
  const dueAt = "2026-08-26T16:00:00+00:00";
  state.rows.deals[0].expected_close_at = dueAt;
  state.deadlineReset = {
    resetAt: "2026-09-22T03:00:00Z", beforeDay: "2026-09-21",
    items: [{ kind: "deal", id: "deal-1", dueAt }],
  };
  const cleared = await getAttentionLedger();
  const deal = cleared.items.find((item) => item.entityId === "deal-1");
  assert.equal(deal.whenAt, dueAt);
  assert.equal(deal.bucket, "later");
  assert.equal(deal.deadlineAlertSuppressed, true);
  assert.equal(deal.priorityReason, "이전 기한 · 알림 해제");
  assert.equal(deal.priorityScore, 900);

  state.rows.deals[0].expected_close_at = "2026-09-20T16:00:00+00:00";
  const changed = await getAttentionLedger();
  assert.equal(changed.items.find((item) => item.entityId === "deal-1").bucket, "overdue");
});

test("an acknowledged old task deadline keeps a deliberate today focus without restoring its alert", async () => {
  const dueAt = "2026-08-26T16:00:00+00:00";
  state.todos = [{
    id: "task-1", title: "Chosen task", dueAt, status: "todo", done: false,
    focusDates: ["2026-09-22"],
  }];
  state.deadlineReset = {
    resetAt: "2026-09-22T03:00:00Z", beforeDay: "2026-09-21",
    items: [{ kind: "task", id: "task-1", dueAt }],
  };

  const focused = (await getAttentionLedger()).items.find((item) => item.entityId === "task-1");
  assert.equal(focused.bucket, "focus");
  assert.equal(focused.dueBucket, "overdue");
  assert.equal(focused.deadlineAlertSuppressed, true);
  assert.equal(focused.priorityScore, 6000);
  assert.equal(focused.priorityReason, "오늘 3개");

  state.todos[0].focusDates = [];
  const unfocused = (await getAttentionLedger()).items.find((item) => item.entityId === "task-1");
  assert.equal(unfocused.bucket, "later");
  assert.equal(unfocused.priorityReason, "이전 기한 · 알림 해제");
});

test("standalone task action, checklist and database version reach My Work detail", async () => {
  const checklist = [{ id: "22222222-2222-4222-8222-222222222222", title: "후속 연락", done: false, note: "", dueAt: "2026-09-30" }];
  state.todos = [{ id: "11111111-1111-4111-8111-111111111111", title: "회의 후속", status: "todo", done: false,
    nextAction: "자료를 보내고 수신 여부 확인", checklist, updatedAt: "2026-09-23T02:10:11.123456Z" }];
  const result = await getAttentionLedger();
  const task = result.items.find((item) => item.lane === "task");
  assert.equal(task.projectId, null);
  assert.equal(task.nextAction, state.todos[0].nextAction);
  assert.deepEqual(task.checklist, checklist);
  assert.equal(task.updatedAt, state.todos[0].updatedAt);
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
