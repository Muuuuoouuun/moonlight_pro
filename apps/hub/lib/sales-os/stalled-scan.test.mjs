import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { scanStalledDeals } from "./stalled-scan.js";
import { STALLED_DAYS, dealStageLabel, isDealStalled } from "@/lib/deal-stages";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

// scanStalledDeals only touches the network for work_orders (its own deal ledger is
// injected via `ledger`), so the mock only needs to answer that table.
let orderRows;

function installWorkOrdersFetch() {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.pathname.split("/").pop(), "work_orders");
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      const record = { id: `order-${orderRows.length + 1}`, status: "proposed", ...body };
      orderRows.push(record);
      return new Response(JSON.stringify([record]), { status: 201, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(orderRows), { status: 200, headers: { "content-type": "application/json" } });
  };
}

function ledgerWith(deals) {
  return { source: "supabase", deals };
}

function deal(overrides) {
  return { id: "deal-1", name: "샘플 딜", stage: "quote", age: 0, value: 1_000_000, trackingEligible: true, ...overrides };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    SUPABASE_URL: "https://supabase.example.com",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE_ID,
  };
  orderRows = [];
  installWorkOrdersFetch();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

// Regression for the dead "won" comparison — resolveDealStage() never returns "won",
// it normalizes to "closing" (deal-stages.js STAGE_ALIASES), so a stage!=="won" filter
// silently let already-closed deals through and proposed follow-ups for them.
test("closing과 lost 딜은 아무리 나이가 많아도 정체로 잡히지 않는다", async () => {
  const ledger = ledgerWith([
    deal({ id: "deal-closing", stage: "closing", age: 999 }),
    deal({ id: "deal-lost", stage: "lost", age: 999 }),
  ]);
  const result = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger, dryRun: true });
  assert.equal(result.stalled, 0);
  assert.deepEqual(result.proposals, []);
});

// The default threshold reads the same STALLED_DAYS — and the same inclusive isDealStalled()
// verdict — as the Deals kanban rail and the attention ledger, so the boundary day agrees.
test("기본 임계값은 STALLED_DAYS(14일)와 같다 — 경계일(=14일)부터 정체(칸반·attention과 같은 >=)", async () => {
  const belowThreshold = ledgerWith([deal({ age: STALLED_DAYS - 1 })]);
  const below = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger: belowThreshold, dryRun: true });
  assert.equal(below.stalled, 0, "STALLED_DAYS보다 하루 어린 딜은 아직 정체가 아니다");

  const atCanonicalThreshold = ledgerWith([deal({ age: STALLED_DAYS })]);
  const atThreshold = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger: atCanonicalThreshold, dryRun: true });
  assert.equal(atThreshold.stalled, 1, "STALLED_DAYS와 같은 나이는 정체다 — 칸반 레일·attention 기록과 같은 판정");
});

test("isDealStalled는 경계 포함(>=)이고 closing·lost는 정체가 아니다", () => {
  assert.equal(isDealStalled({ stage: "quote", age: STALLED_DAYS }), true);
  assert.equal(isDealStalled({ stage: "quote", age: STALLED_DAYS - 1 }), false);
  assert.equal(isDealStalled({ stage: "closing", age: 999 }), false);
  assert.equal(isDealStalled({ stage: "lost", age: 999 }), false);
  assert.equal(isDealStalled({ stage: "quote", age: "n/a" }), false);
  assert.equal(isDealStalled(null), false);
});

test("lost 단계도 한국어 라벨 조회에서 원시 키로 새지 않는다", () => {
  assert.equal(dealStageLabel("lost"), "Lost");
  assert.equal(dealStageLabel("quote"), "견적");
  assert.equal(dealStageLabel("quote", [{ key: "quote", label: "견적 단계" }]), "견적 단계");
  assert.equal(dealStageLabel("unknown-key"), "unknown-key");
});

test("기록 read 실패는 preview가 아니라 status error로 드러난다", async () => {
  const result = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger: { source: "error", deals: [] }, dryRun: true });
  assert.equal(result.status, "error");
  assert.equal(result.reason, "ledger-read-failed");
});

test("trackingEligible=false 딜은 정체 스캔에서 제외된다", async () => {
  const ledger = ledgerWith([deal({ age: STALLED_DAYS + 5, trackingEligible: false })]);
  const result = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger, dryRun: true });
  assert.equal(result.stalled, 0);
});

test("이미 열린 followup work_order가 있는 딜은 중복 제안하지 않는다", async () => {
  orderRows = [{
    id: "existing-order", workspace_id: WORKSPACE_ID, deal_id: "deal-1", kind: "followup", status: "proposed",
  }];
  const ledger = ledgerWith([deal({ age: STALLED_DAYS + 5 })]);
  const result = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger });
  assert.equal(result.stalled, 1);
  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
});

test("정체 딜은 followup work_order로 제안되고 가치 내림차순으로 정렬된다", async () => {
  const ledger = ledgerWith([
    deal({ id: "deal-small", age: STALLED_DAYS + 5, value: 500_000 }),
    deal({ id: "deal-big", age: STALLED_DAYS + 5, value: 5_000_000 }),
  ]);
  const result = await scanStalledDeals({ workspaceId: WORKSPACE_ID, ledger });
  assert.equal(result.created, 2);
  assert.deepEqual(result.proposals.map((p) => p.dealId), ["deal-big", "deal-small"]);
  assert.equal(orderRows.every((o) => o.kind === "followup" && o.persona === "guru"), true);
});
