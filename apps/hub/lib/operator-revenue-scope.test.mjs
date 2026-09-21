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

// ── 0c: 집중 고객 후보 조건 ────────────────────────────────────────────────────
// 이전 조건(priorityLane === "customer_success")은 lead-enrichment가 status === "won"일 때만
// 붙이는 lane이라, 진행 중인 리드는 구조적으로 집중 고객이 될 수 없었다 — 프로필 §8의
// 정의("전환 가능성이 높아 지금 연락해야 하는 고객")와 정반대다.
const NOW = new Date("2026-09-21T03:00:00Z"); // KST 12:00
const day = (offset) => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);

test("in-progress leads can be focus customers — the won-only lane gate is gone", () => {
  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "in-progress", owner: "Me", stage: "Qualified", score: 50, nextAction: "견적서 발송" },
      { id: "customer", owner: "Me", stage: "Customer", priorityLane: "customer_success", score: 90, nextAction: "갱신 확인" },
    ],
  }, { limit: 5, now: NOW });

  assert.deepEqual(selected.map((item) => item.id).sort(), ["customer", "in-progress"]);
});

test("import-template next actions never count as a promise", () => {
  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "template", owner: "Me", score: 99, nextAction: "고객 활성 상태 확인 → 갱신·휴면 여부 정리" },
      { id: "template-2", owner: "Me", score: 98, nextAction: "공식 계정 확인 → 첫 접촉 목적과 채널 결정" },
      { id: "real", owner: "Me", score: 10, nextAction: "원장님 통화" },
    ],
  }, { limit: 5, now: NOW });

  assert.deepEqual(selected.map((item) => item.id), ["real"]);
});

test("a promise coming due outranks a higher score with no date", () => {
  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "no-date", owner: "Me", score: 99, nextAction: "언젠가 연락" },
      { id: "due", owner: "Me", score: 10, nextAction: "견적서 발송", nextActionAt: day(1) },
      { id: "overdue", owner: "Me", score: 5, nextAction: "자료 전달", nextActionAt: day(-2) },
      { id: "far", owner: "Me", score: 80, nextAction: "다음 달 확인", nextActionAt: day(30) },
    ],
  }, { limit: 4, now: NOW });

  // 임박·지남이 먼저, 그 안에서는 점수순. 먼 약속은 날짜 없는 건과 같은 칸에서 점수로 겨룬다.
  assert.deepEqual(selected.map((item) => item.id), ["due", "overdue", "no-date", "far"]);
});

test("dormant and lost customers stay out of the focus slots", () => {
  const selected = revenueScope.selectOperatorFocusLeads({
    leads: [
      { id: "dormant", owner: "Me", score: 99, nextAction: "나중에", dormant: true },
      { id: "lost", owner: "Me", stage: "Lost", score: 98, nextAction: "재접촉" },
      { id: "live", owner: "Me", score: 10, nextAction: "통화" },
    ],
  }, { limit: 5, now: NOW });

  assert.deepEqual(selected.map((item) => item.id), ["live"]);
});
