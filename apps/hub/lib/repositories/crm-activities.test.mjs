import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const serverReadStub = `
export function eqFilter(value) { return \`eq.\${value}\`; }
export async function fetchSupabaseRows(table, options = {}) {
  globalThis.__crmActState.calls.push({ table, options });
  return globalThis.__crmActState.rows[table];
}
`;
const serverWriteStub = `
export function resolveDefaultWorkspaceId() { return "ws-1"; }
export function resolveSupabaseConfig() { return { url: "https://example.test", key: "k" }; }
export async function insertSupabaseRecord() { return { persisted: false, reason: "stub" }; }
export async function updateSupabaseRecord() { return { persisted: false, reason: "stub" }; }
export async function deleteSupabaseRecord() { return { persisted: false, reason: "stub" }; }
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

const state = globalThis.__crmActState = { calls: [], rows: {} };
const { listRecentActivities, getRecentContactActivities, ACTIVITY_KINDS } = await import("./crm-activities.js?recent-activities");

beforeEach(() => {
  state.calls = [];
  state.rows = {
    crm_activities: [
      { id: "a1", kind: "call", reaction: "concern", body: "단가 문의", lead_id: null, deal_id: null, account_id: null, company_id: "co-1", contact_id: null, occurred_at: "2026-09-20T02:00:00Z", created_at: "2026-09-20T02:00:00Z" },
      { id: "a2", kind: "note", reaction: null, body: "메모", lead_id: "lead-1", deal_id: null, account_id: null, company_id: "co-1", contact_id: null, occurred_at: "2026-09-19T02:00:00Z", created_at: "2026-09-19T02:00:00Z" },
      { id: "a3", kind: "kakao", reaction: null, body: "자료 전달", lead_id: "lead-1", deal_id: null, account_id: null, company_id: null, contact_id: null, occurred_at: null, created_at: "2026-09-18T02:00:00Z" },
    ],
  };
});

test("ACTIVITY_KINDS matches the 0016 CHECK vocabulary (kakao/quote/ai no longer fold into update)", () => {
  for (const kind of ["call", "meeting", "info_session", "demo", "visit", "email", "update", "note", "deal", "kakao", "quote", "ai"]) {
    assert.ok(ACTIVITY_KINDS.has(kind), kind);
  }
});

test("listRecentActivities projects camelCase fields and passes the since window", async () => {
  const rows = await listRecentActivities({ since: "2026-09-14T00:00:00Z", limit: 50 });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].table, "crm_activities");
  assert.deepEqual(state.calls[0].options.filters, [["workspace_id", "eq.ws-1"], ["occurred_at", "gte.2026-09-14T00:00:00Z"]]);
  assert.equal(state.calls[0].options.order, "occurred_at.desc");
  assert.equal(state.calls[0].options.limit, 50);
  assert.deepEqual(rows[0], {
    id: "a1", kind: "call", reaction: "concern", body: "단가 문의",
    leadId: null, dealId: null, accountId: null, companyId: "co-1", contactId: null,
    occurredAt: "2026-09-20T02:00:00Z",
  });
  // occurred_at이 비면 created_at으로 폴백한다.
  assert.equal(rows[2].occurredAt, "2026-09-18T02:00:00Z");
});

test("listRecentActivities without a since window sends only the workspace filter", async () => {
  await listRecentActivities({});
  assert.deepEqual(state.calls[0].options.filters, [["workspace_id", "eq.ws-1"]]);
});

test("read failure surfaces as null, never as an empty list", async () => {
  state.rows.crm_activities = null;
  assert.equal(await listRecentActivities({}), null);
});

test("getRecentContactActivities keeps the outcomes envelope, drops non-contact kinds, folds action", async () => {
  state.rows.crm_activities[0].account_id = 'account-1';
  const res = await getRecentContactActivities({ limit: 30 });
  assert.equal(res.source, "supabase");
  assert.deepEqual(res.outcomes.map((o) => o.id), ["a1", "a3"]);
  assert.equal(res.outcomes[0].action, "replied");
  assert.equal(res.outcomes[0].channel, "call");
  assert.equal(res.outcomes[0].accountId, 'account-1');
  assert.deepEqual(res.outcomes[0].meta, { reaction: "concern" });
  assert.equal(res.outcomes[1].action, "sent");
  // read 실패는 error 봉투 — preview로 위장하지 않는다.
  state.rows.crm_activities = null;
  const failed = await getRecentContactActivities({});
  assert.equal(failed.source, "error");
  assert.deepEqual(failed.outcomes, []);
});
