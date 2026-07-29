import assert from "node:assert/strict";
import { test } from "node:test";

import { getRevenueViewNeeds, projectRevenueLedger } from "./revenue-ledger-view.js";

const ledger = {
  source: "supabase",
  configured: true,
  workspaceId: "workspace-1",
  leads: [{ id: "lead-1" }],
  deals: [{ id: "deal-1" }],
  stages: [{ key: "new" }],
  accounts: [{ id: "account-1" }],
  cases: [{ id: "case-1" }],
  contacts: [{ id: "contact-1" }],
  companies: [{ id: "company-1" }],
  summary: { pipeline: 10 },
};

test("projects only the rows needed by a revenue subview", () => {
  assert.deepEqual(projectRevenueLedger(ledger, "deals"), {
    source: "supabase",
    configured: true,
    workspaceId: "workspace-1",
    deals: ledger.deals,
    stages: ledger.stages,
  });
  assert.deepEqual(projectRevenueLedger(ledger, "accounts"), {
    source: "supabase",
    configured: true,
    workspaceId: "workspace-1",
    accounts: ledger.accounts,
  });
});

test("keeps the full ledger for unknown or absent views", () => {
  assert.equal(projectRevenueLedger(ledger), ledger);
  assert.equal(projectRevenueLedger(ledger, "unknown"), ledger);
});

test("limits source reads to the relationships required by each view", () => {
  assert.deepEqual([...getRevenueViewNeeds("deals")], ["deals", "companies"]);
  assert.deepEqual([...getRevenueViewNeeds("accounts")], ["accounts", "deals"]);
  assert.equal(getRevenueViewNeeds("cases").has("leads"), false);
  assert.equal(getRevenueViewNeeds().size, 6);
});
