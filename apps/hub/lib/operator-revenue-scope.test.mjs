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

// 같은 회사의 리드가 여럿이면 첫 화면 「집중 고객」이 같은 이름을 반복 렌더하며 칸을 소모했다
// (윤유경플러스학원 ×2 · Studysync ×3 실측). 슬롯 단위는 고객 — 회사당 최고 우선순위 1건.
test("focus leads collapse to one entry per company, keeping the highest-priority lead", () => {
  assert.ok(revenueScope, "operator-revenue-scope.js must exist");

  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "yy-1", owner: "Me", companyId: "co-yy", priorityLane: "customer_success", score: 95, nextAction: "갱신 확인" },
      { id: "yy-2", owner: "Me", companyId: "co-yy", priorityLane: "customer_success", score: 90, nextAction: "갱신 확인" },
      { id: "ss-1", owner: "Me", companyName: "Studysync", priorityLane: "customer_success", score: 88, nextAction: "업셀" },
      { id: "ss-2", owner: "Me", companyName: "Studysync", priorityLane: "customer_success", score: 85, nextAction: "업셀" },
      { id: "solo", owner: "Me", priorityLane: "customer_success", score: 80, nextAction: "연락" },
    ],
  }, { limit: 5 });

  assert.deepEqual(selected.map((item) => item.id), ["yy-1", "ss-1", "solo"]);
});

test("company dedupe applies before the limit so distinct customers are not crowded out", () => {
  assert.ok(revenueScope, "operator-revenue-scope.js must exist");

  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "a-1", owner: "Me", companyId: "co-a", priorityLane: "customer_success", score: 99, nextAction: "후속" },
      { id: "a-2", owner: "Me", companyId: "co-a", priorityLane: "customer_success", score: 98, nextAction: "후속" },
      { id: "a-3", owner: "Me", companyId: "co-a", priorityLane: "customer_success", score: 97, nextAction: "후속" },
      { id: "b-1", owner: "Me", companyId: "co-b", priorityLane: "customer_success", score: 60, nextAction: "후속" },
      { id: "c-1", owner: "Me", companyId: "co-c", priorityLane: "customer_success", score: 50, nextAction: "후속" },
    ],
  }, { limit: 3 });

  // 중복을 limit 뒤에 자르면 co-a 3건이 정원을 먹고 co-c가 밀린다 — 반드시 [a-1, b-1, c-1].
  assert.deepEqual(selected.map((item) => item.id), ["a-1", "b-1", "c-1"]);
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
