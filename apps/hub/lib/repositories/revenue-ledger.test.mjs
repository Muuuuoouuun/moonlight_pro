import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

// getRevenueLedger's projection coverage (below) needs @/lib/server-read and @/lib/server-write
// mocked before revenue-ledger.js (and the @/lib/sales-os/contact-tracking chain it pulls in)
// is ever loaded — Node's ESM module cache is keyed by resolved URL and is process-global, so a
// prior *unhooked* static import of this module would permanently bind its dependency graph to
// the real (network-backed) server-read.js, and a later hook-registered dynamic import of the
// same URL would just return that already-instantiated, unhooked module instead of a fresh one.
// Registering the hook first and loading everything (including the plain mapper exports used by
// the pure-function tests below) through one dynamic import avoids that trap.
const readStub = `
export function eqFilter(value) { return "eq." + value; }
export function inFilter(values) { return "in.(" + values.join(",") + ")"; }
export function withWorkspaceFilter(filters = []) {
  return [["workspace_id", "eq.workspace-1"], ...filters];
}
export async function fetchSupabaseRows(table, options = {}) {
  const state = globalThis.__revenueLedgerTest;
  state.calls.push({ table, options });
  return state.rows[table] || [];
}
`;
const writeStub = `
export function resolveDefaultWorkspaceId() { return "workspace-1"; }
export function resolveSupabaseConfig() { return { url: "https://example.test", apiKey: "test" }; }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server-read") {
      return { url: `data:text/javascript,${encodeURIComponent(readStub)}`, shortCircuit: true };
    }
    if (specifier === "@/lib/server-write") {
      return { url: `data:text/javascript,${encodeURIComponent(writeStub)}`, shortCircuit: true };
    }
    // contact-tracking.js's own relative import of the same read helper — keep it on the same
    // stub so getContactTrackingStartedAt's "workspaces" read is counted too (real full-ledger
    // wiring, not a bypass).
    if (specifier === "../server-read.js" && context.parentURL.includes("/sales-os/contact-tracking.js")) {
      return { url: `data:text/javascript,${encodeURIComponent(readStub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const state = (globalThis.__revenueLedgerTest = {});
const { mapAccount, mapDeal, mapLead, getRevenueLedger } = await import("./revenue-ledger.js");

beforeEach(() => {
  state.calls = [];
  state.rows = {
    leads: [{ id: "lead-1", score: "87.5", name: "Lead", meta: {} }],
    deals: [{ id: "deal-1", title: "Deal", stage: "proposal", amount: 1000, meta: {} }],
    customer_accounts: [{ id: "account-1", name: "Account", status: "active", meta: {} }],
    operation_cases: [{ id: "case-1", title: "Case", meta: {} }],
    companies: [{ id: "company-1", name: "Company", meta: {} }],
    contacts: [{ id: "contact-1", name: "Contact", meta: {} }],
    workspaces: [{ id: "workspace-1", meta: { revenue_targets: { "2026-09": 5000000 } } }],
  };
});

test("mapDeal reads back the implicit payment's first plan (meta.plan_baseline) and rejects a non-object", () => {
  const baseline = { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: "2026-09-20T00:00:00.000Z" };
  assert.deepEqual(mapDeal({ id: "deal-1", title: "x", meta: { plan_baseline: baseline } }, new Map()).planBaseline, baseline);
  assert.equal(mapDeal({ id: "deal-2", title: "x", meta: {} }, new Map()).planBaseline, null);
  assert.equal(mapDeal({ id: "deal-3", title: "x", meta: { plan_baseline: "2026-09-15" } }, new Map()).planBaseline, null);
});

test("mapDeal reads back the next-meeting breadcrumb and rejects a non-object", () => {
  const breadcrumb = {
    eventId: "evt-1",
    summary: "갈무리학원 미팅",
    startAt: "2026-08-15T05:00:00.000Z",
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
  };

  assert.deepEqual(
    mapDeal({ id: "deal-1", title: "갈무리 SW", meta: { next_meeting: breadcrumb } }, new Map()).nextMeeting,
    breadcrumb,
  );
  assert.equal(mapDeal({ id: "deal-2", title: "미예약", meta: {} }, new Map()).nextMeeting, null);
  // 과거 문자열 값이 남아 있어도 UI가 .startAt을 읽다 깨지지 않게 막는다.
  assert.equal(
    mapDeal({ id: "deal-3", title: "구형", meta: { next_meeting: "2026-08-15" } }, new Map()).nextMeeting,
    null,
  );
});

test("mapLead: meta.subjects 우선, enrichment 태그 흡수 폴백, 출처 구분", () => {
  // 운영자 정본(meta.subjects) — 미등재 키는 걸러진다
  const withMeta = mapLead(
    { id: "l1", name: "A학원", meta: { subjects: ["math", "bogus"], label_source: { subjects: "operator" } } },
    new Map(), new Map(),
  );
  assert.deepEqual(withMeta.subjects, ["math"]);
  assert.equal(withMeta.labelSource.subjects, "operator");

  // meta.subjects 부재 → 태그 흡수 폴백, 출처 derived
  const fromTags = mapLead(
    { id: "l2", name: "B학원", meta: { enrichment: { tags: ["subject:ai", "subject:math"] } } },
    new Map(), new Map(),
  );
  assert.deepEqual(fromTags.subjects, ["math", "coding"]);
  assert.equal(fromTags.labelSource.subjects, "derived");

  // 아무것도 없음 → 빈 배열 + null 출처 (마커 없이 — 렌더)
  const none = mapLead({ id: "l3", name: "C", meta: {} }, new Map(), new Map());
  assert.deepEqual(none.subjects, []);
  assert.equal(none.labelSource.subjects, null);
  assert.equal(none.labelSource.region, null);

  // region 출처는 명시된 label_source만 신뢰 (기존 51건 무출처 값은 plain 렌더)
  const searchedRegion = mapLead(
    { id: "l4", name: "D", meta: { region: "경기-안양", label_source: { region: "searched" } } },
    new Map(), new Map(),
  );
  assert.equal(searchedRegion.labelSource.region, "searched");
});

test('account labels use account values and company region only as a fallback', () => {
  const companies = new Map([['company-1', { meta: { region: '경기-안양' } }]]);
  const fallback = mapAccount({ id: 'account-1', name: '학원', company_id: 'company-1', meta: {} }, new Map(), companies);
  assert.equal(fallback.region, '경기-안양');
  assert.equal(fallback.labelSource.region, 'derived');
  const explicit = mapAccount({
    id: 'account-1', name: '학원', company_id: 'company-1',
    meta: { region: '서울-강남', subjects: ['math', 'bogus'], genres: ['입시'], label_source: { region: 'operator' } },
  }, new Map(), companies);
  assert.equal(explicit.region, '서울-강남');
  assert.deepEqual(explicit.subjects, ['math']);
  assert.deepEqual(explicit.genres, ['입시']);
  assert.equal(explicit.labelSource.region, 'operator');
  assert.equal(mapAccount({ id: 'account-1', name: '학원', company_id: 'company-1', meta: { region: null } }, new Map(), companies).region, '');
});
test('account projection retains explicit workspace and brand scope for contact joins', () => {
  const account = mapAccount({
    id: 'account-personal', company_id: 'shared-company',
    meta: { workspace: 'brand', brand: 'sinabro', type: 'company' },
  }, new Map());
  assert.equal(account.workspace, 'brand');
  assert.equal(account.brand, 'sinabro');
});

// --- getRevenueLedger projection coverage (2026-09-25 db optimization) ---

test('projection defaults to "full" and reads all 8 tables (leads/deals/accounts/cases/companies/contacts/workspaces×2)', async () => {
  const full = await getRevenueLedger();
  assert.deepEqual(
    state.calls.map((call) => call.table),
    ["leads", "deals", "customer_accounts", "operation_cases", "companies", "contacts", "workspaces", "workspaces"],
  );
  assert.equal(full.accounts.length, 1);
  assert.equal(full.cases.length, 1);
});

test('projection:"brief" skips customer_accounts/operation_cases and leaves accounts/cases empty while keeping leads/deals/companies/contacts/revenueTargets', async () => {
  const full = await getRevenueLedger();
  state.calls = [];

  const brief = await getRevenueLedger({ projection: "brief" });
  assert.deepEqual(
    state.calls.map((call) => call.table),
    ["leads", "deals", "companies", "contacts", "workspaces", "workspaces"],
  );
  assert.deepEqual(brief.accounts, []);
  assert.deepEqual(brief.cases, []);
  assert.equal(brief.leads.length, 1);
  assert.equal(brief.deals.length, 1);
  assert.equal(brief.companies.length, 1);
  assert.equal(brief.contacts.length, 1);
  assert.deepEqual(brief.revenueTargets, full.revenueTargets);
  assert.deepEqual(brief.revenueTargets, { "2026-09": 5000000 });
});
