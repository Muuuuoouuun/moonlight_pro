import assert from "node:assert/strict";
import { test } from "node:test";

let revenueScope = null;

try {
  revenueScope = await import("./operator-revenue-scope.js");
} catch {
  // Red phase: the Daily Brief currently consumes the unscoped revenue ledger.
}

test("keeps only explicitly verified operator-owned customer records for home signals", () => {
  assert.ok(revenueScope, "operator-revenue-scope.js must exist");

  const result = revenueScope.filterOperatorOwnedRevenue({
    source: "supabase",
    leads: [
      { id: "lead-me", owner: "Me" },
      { id: "lead-unassigned", owner: "Unassigned" },
      { id: "lead-other", owner: "Other" },
    ],
    deals: [
      { id: "deal-me", owner: "Me" },
      { id: "deal-unassigned", owner: "Unassigned" },
    ],
  });

  assert.deepEqual(result.leads.map((item) => item.id), ["lead-me"]);
  assert.deepEqual(result.deals.map((item) => item.id), ["deal-me"]);
  assert.equal(result.source, "supabase");
});

test("fails closed when customer collections are absent", () => {
  assert.ok(revenueScope, "operator-revenue-scope.js must exist");

  const result = revenueScope.filterOperatorOwnedRevenue({ source: "preview" });

  assert.deepEqual(result.leads, []);
  assert.deepEqual(result.deals, []);
});

test("selects at most three verified customer-success follow-ups deterministically", () => {
  assert.ok(revenueScope, "operator-revenue-scope.js must exist");

  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "lead-b", owner: "Me", priorityLane: "customer_success", score: 93, nextAction: "B 후속" },
      { id: "lead-a", owner: "Me", priorityLane: "customer_success", score: 93, nextAction: "A 후속" },
      { id: "lead-c", owner: "Me", priorityLane: "customer_success", score: 83, nextAction: "C 후속" },
      { id: "lead-d", owner: "Me", priorityLane: "customer_success", score: 81, nextAction: "D 후속" },
      { id: "lead-other", owner: "Unassigned", priorityLane: "customer_success", score: 100, nextAction: "제외" },
      { id: "lead-no-action", owner: "Me", priorityLane: "customer_success", score: 99, nextAction: "" },
    ],
  });

  assert.deepEqual(selected.map((item) => item.id), ["lead-a", "lead-b", "lead-c"]);
});

test("focus override: lower excludes and raise outranks higher raw scores without editing them", () => {
  assert.ok(revenueScope, "operator-revenue-scope.js must exist");

  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "lead-lowered", owner: "Me", priorityLane: "customer_success", score: 99, nextAction: "제외되어야 함", focusOverride: "lower" },
      { id: "lead-raised", owner: "Me", priorityLane: "customer_success", score: 60, nextAction: "올림", focusOverride: "raise" },
      { id: "lead-high", owner: "Me", priorityLane: "customer_success", score: 95, nextAction: "고점" },
      { id: "lead-mid", owner: "Me", priorityLane: "customer_success", score: 90, nextAction: "중간" },
      { id: "lead-low", owner: "Me", priorityLane: "customer_success", score: 70, nextAction: "저점" },
    ],
  });

  assert.deepEqual(selected.map((item) => item.id), ["lead-raised", "lead-high", "lead-mid"]);
});
