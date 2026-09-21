import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildAccountWrite,
  buildCaseWrite,
  buildDealWrite,
  buildLeadWrite,
  parseMoneyLabel,
  persistRevenueRecord,
} from "./revenue-write.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

// ---- pure inverse-mapper tests (the lossy core) ----

test("parseMoneyLabel reverses the display money projection", () => {
  assert.equal(parseMoneyLabel("₩1.2M"), 1_200_000);
  assert.equal(parseMoneyLabel("₩900K"), 900_000);
  assert.equal(parseMoneyLabel("₩0"), 0);
  assert.equal(parseMoneyLabel("—"), 0);
  assert.equal(parseMoneyLabel(""), 0);
  assert.equal(parseMoneyLabel(4_200_000), 4_200_000);
  assert.equal(parseMoneyLabel("3,500,000"), 3_500_000);
  assert.equal(parseMoneyLabel("garbage"), 0);
});

test("buildLeadWrite maps display label → status and splits meta", () => {
  const { columns, metaPatch } = buildLeadWrite({
    name: "  Studio Park  ",
    stage: "Contact",
    source: "Referral",
    type: "company",
    value: "₩1.2M",
    workspace: "classin",
  });
  assert.equal(columns.name, "Studio Park");
  assert.equal(columns.status, "nurturing"); // Contact → nurturing
  assert.equal(columns.source, "Referral");
  assert.deepEqual(metaPatch, { account_kind: "company", value: 1_200_000, workspace: "classin" });
});

test("buildLeadWrite drops unknown stages and never emits owner/last", () => {
  const { columns, metaPatch } = buildLeadWrite({ stage: "Bogus", owner: "Me", last: "오늘" });
  assert.equal("status" in columns, false);
  assert.equal("owner_id" in columns, false);
  assert.deepEqual(metaPatch, {});
});

test("buildDealWrite maps canonical display stage to the constrained DB stage", () => {
  const { columns, metaPatch } = buildDealWrite({
    name: "베어브릭 콜라보",
    stage: "final",
    value: 7_800_000,
    type: "personal",
    close: "5월 12일", // best-effort: not reversed
  });
  assert.equal(columns.title, "베어브릭 콜라보");
  assert.equal(columns.stage, "negotiation");
  assert.equal(columns.amount, 7_800_000);
  assert.equal("expected_close_at" in columns, false);
  assert.deepEqual(metaPatch, { stage_detail: "final", account_kind: "personal" });
});

test("buildDealWrite rejects non-canonical stage values", () => {
  const { columns } = buildDealWrite({ stage: "negotiation" });
  assert.equal("stage" in columns, false); // only lead/qual/prop/neg/won/lost pass through
});

test("buildCaseWrite maps display status/priority labels back to DB enums", () => {
  const { columns, metaPatch } = buildCaseWrite({
    title: "결제 영수증 재발행",
    status: "Resolved",
    priority: "med",
    type: "personal",
    account: "이재민",
  });
  assert.equal(columns.title, "결제 영수증 재발행");
  assert.equal(columns.status, "closed"); // Resolved → closed
  assert.equal(columns.priority, "medium"); // med → medium
  assert.deepEqual(metaPatch, { account_kind: "personal", account_label: "이재민" });
});

test("buildAccountWrite reverses the health band to a representative score", () => {
  assert.equal(buildAccountWrite({ health: "ok" }).columns.health_score, 80);
  assert.equal(buildAccountWrite({ health: "warning" }).columns.health_score, 55);
  assert.equal(buildAccountWrite({ health: "risk" }).columns.health_score, 20);
  const { columns, metaPatch } = buildAccountWrite({ name: "Studio Park", type: "company", note: "  킥오프 예정  " });
  assert.equal(columns.name, "Studio Park");
  assert.equal("owner_id" in columns, false); // owner is best-effort, never reversed
  assert.deepEqual(metaPatch, { account_kind: "company", note: "킥오프 예정" });
});

test("buildLeadWrite maps next_action to a column and snooze_until into meta", () => {
  const { columns, metaPatch } = buildLeadWrite({ next_action: "전화 재시도", snooze_until: "2026-07-10" });
  assert.equal(columns.next_action, "전화 재시도");
  assert.equal(metaPatch.snooze_until, "2026-07-10");
});

test("buildLeadWrite: next_action/snooze empty string clears, undefined leaves untouched", () => {
  assert.equal(buildLeadWrite({ next_action: "" }).columns.next_action, null);
  assert.equal("next_action" in buildLeadWrite({ name: "x" }).columns, false);
  assert.equal("snooze_until" in buildLeadWrite({ name: "x" }).metaPatch, false);
});

test("buildDealWrite maps next_action and snooze_until into meta (deals has no next_action column)", () => {
  const { metaPatch } = buildDealWrite({ next_action: "견적 발송", snooze_until: "2026-07-11" });
  assert.equal(metaPatch.next_action, "견적 발송");
  assert.equal(metaPatch.snooze_until, "2026-07-11");
});

test("buildDealWrite carries the next-meeting breadcrumb into meta untouched", () => {
  const breadcrumb = {
    eventId: "evt-1",
    summary: "갈무리학원 미팅",
    startAt: "2026-08-15T05:00:00.000Z",
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
  };
  assert.deepEqual(buildDealWrite({ next_meeting: breadcrumb }).metaPatch.next_meeting, breadcrumb);
  assert.equal(buildDealWrite({ next_meeting: null }).metaPatch.next_meeting, null);
  assert.equal("next_meeting" in buildDealWrite({ name: "x" }).metaPatch, false);
});

// ---- persistRevenueRecord with a mocked Supabase REST surface ----

let calls;

function installSupabaseFetch({ existingMeta, deleteReturnsRows = true } = {}) {
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });

    if (method === "GET") {
      // meta read for the merge step
      return jsonResponse([{ meta: existingMeta || {} }]);
    }
    if (method === "POST") {
      return jsonResponse([{ id: "real-id-123", ...(init.body ? JSON.parse(init.body) : {}) }]);
    }
    if (method === "PATCH") {
      return jsonResponse([{ id: "existing-id", ...(init.body ? JSON.parse(init.body) : {}) }]);
    }
    if (method === "DELETE") {
      // return=representation — PostgREST가 삭제된 행을 되돌려준다. 빈 배열은 "지울 행이
      // 없었다"(RLS 거부·이미 삭제됨)는 뜻이라 성공 mock으로 쓰면 안 된다.
      return jsonResponse(deleteReturnsRows === false ? [] : [{ id: "deal-9" }]);
    }
    return jsonResponse([], 400);
  };
}

function jsonResponse(rows, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => rows,
    text: async () => JSON.stringify(rows),
    headers: { get: () => null },
  };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = WORKSPACE_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("persistRevenueRecord create inserts with workspace_id and returns the real id", async () => {
  installSupabaseFetch();
  const result = await persistRevenueRecord({
    table: "leads",
    op: "create",
    payload: { name: "새 리드", stage: "New", type: "company" },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "saved");
  assert.equal(result.id, "real-id-123");
  const post = calls.find(c => c.method === "POST");
  assert.ok(post, "expected an insert");
  assert.equal(post.body.workspace_id, WORKSPACE_ID);
  assert.equal(post.body.status, "new");
  assert.equal(post.body.meta.account_kind, "company");
});

test("persistRevenueRecord update merges meta instead of clobbering provenance", async () => {
  installSupabaseFetch({ existingMeta: { brand: "sinabro", lane: "classin_sales", value: 100 } });
  const result = await persistRevenueRecord({
    table: "leads",
    op: "update",
    id: "existing-id",
    payload: { stage: "Qualified", value: "₩2.0M" },
    build: buildLeadWrite,
  });
  assert.equal(result.status, "saved");
  const patch = calls.find(c => c.method === "PATCH");
  assert.equal(patch.body.status, "qualified");
  // Sibling meta keys survive; only value is overwritten.
  assert.deepEqual(patch.body.meta, { brand: "sinabro", lane: "classin_sales", value: 2_000_000 });
});

test("persistRevenueRecord delete issues a filtered DELETE scoped to the workspace", async () => {
  installSupabaseFetch();
  const result = await persistRevenueRecord({
    table: "deals",
    op: "delete",
    id: "deal-9",
    build: buildDealWrite,
  });
  assert.equal(result.status, "saved");
  const del = calls.find(c => c.method === "DELETE");
  assert.ok(del, "expected a DELETE");
  assert.match(del.url, /id=eq\.deal-9/);
  assert.match(del.url, new RegExp(`workspace_id=eq\\.${WORKSPACE_ID}`));
});

test("persistRevenueRecord delete names a 0-row DELETE instead of reporting saved", async () => {
  // RLS 거부·이미 삭제됨·workspace 불일치는 200 + 빈 표현으로 온다 — saved로 뭉개면
  // "삭제됨" 영수증 뒤 다음 로드에 레코드가 부활한다(8차 안정성 M).
  installSupabaseFetch({ deleteReturnsRows: false });
  const result = await persistRevenueRecord({
    table: "deals",
    op: "delete",
    id: "deal-9",
    build: buildDealWrite,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "no-matching-row");
});

test("persistRevenueRecord delete without id is an error, never an unfiltered wipe", async () => {
  installSupabaseFetch();
  const result = await persistRevenueRecord({ table: "leads", op: "delete", build: buildLeadWrite });
  assert.equal(result.status, "error");
  assert.equal(calls.length, 0);
});

test("persistRevenueRecord returns preview when workspace is unset", async () => {
  installSupabaseFetch();
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  delete process.env.DEFAULT_WORKSPACE_ID;
  const result = await persistRevenueRecord({
    table: "deals",
    op: "create",
    payload: { name: "새 딜", stage: "lead", value: 0 },
    build: buildDealWrite,
  });
  assert.equal(result.status, "preview");
  assert.equal(calls.length, 0); // never hit the network
});

test("buildLeadWrite: subjects는 12키 검증(미등재 드랍)·dedupe, label_source는 유효값만", () => {
  const { metaPatch } = buildLeadWrite({
    subjects: ["math", "essay", "bogus", "math"],
    labelSource: { subjects: "operator", region: "searched" },
  });
  assert.deepEqual(metaPatch.subjects, ["math", "essay"]);
  assert.deepEqual(metaPatch.label_source, { subjects: "operator", region: "searched" });
});

test("buildLeadWrite: subjects []는 명시적 비움, undefined는 미변경, 무효 출처는 드랍", () => {
  assert.deepEqual(buildLeadWrite({ subjects: [] }).metaPatch.subjects, []);
  assert.equal("subjects" in buildLeadWrite({ name: "x" }).metaPatch, false);
  assert.equal("label_source" in buildLeadWrite({ name: "x" }).metaPatch, false);
  assert.deepEqual(buildLeadWrite({ labelSource: { subjects: "guessed" } }).metaPatch.label_source, {});
});

// ---- 딜 단계 이동 → crm_activities(kind='deal') (2026-09-20 세 축·Action KPI 기획 §6.3) ----

import { dealStageMove } from "./revenue-write.js";

test("dealStageMove names the move only when stage_detail actually changes", () => {
  assert.deepEqual(
    dealStageMove({ table: "deals", existingMeta: { stage_detail: "quote" }, metaPatch: { stage_detail: "final" } }),
    { from: "quote", to: "final", body: "단계: 견적 → 최종미팅" },
  );
  assert.equal(dealStageMove({ table: "deals", existingMeta: { stage_detail: "quote" }, metaPatch: { stage_detail: "quote" } }), null, "같은 값 재저장은 이동이 아니다");
  assert.equal(dealStageMove({ table: "deals", existingMeta: {}, metaPatch: { stage_detail: "quote" } }), null, "레거시 딜의 첫 분류는 이동이 아니다");
  assert.equal(dealStageMove({ table: "leads", existingMeta: { stage_detail: "quote" }, metaPatch: { stage_detail: "final" } }), null);
  assert.equal(dealStageMove({ table: "deals", existingMeta: { stage_detail: "quote" }, metaPatch: {} }), null);
});

test("persistRevenueRecord update records a deal stage move as a crm_activities row", async () => {
  installSupabaseFetch({ existingMeta: { stage_detail: "quote", workspace: "classin" } });
  const result = await persistRevenueRecord({
    table: "deals", op: "update", id: "deal-1", payload: { stage: "final" }, build: buildDealWrite,
  });
  assert.equal(result.status, "saved");
  const activity = calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/crm_activities"));
  assert.ok(activity, "단계 이동 활동 행이 기록된다");
  assert.equal(activity.body.kind, "deal");
  assert.equal(activity.body.entity_type, "deal");
  assert.equal(activity.body.deal_id, "deal-1");
  assert.equal(activity.body.body, "단계: 견적 → 최종미팅");
  assert.deepEqual(activity.body.meta, { from: "quote", to: "final" });
  // 딜 PATCH 자체는 여전히 sibling meta를 보존한다.
  const dealPatch = calls.find((c) => c.method === "PATCH");
  assert.deepEqual(dealPatch.body.meta, { stage_detail: "final", workspace: "classin" });
});

test("persistRevenueRecord update does not log a move when the stage is unchanged", async () => {
  installSupabaseFetch({ existingMeta: { stage_detail: "final" } });
  const result = await persistRevenueRecord({
    table: "deals", op: "update", id: "deal-1", payload: { stage: "final", value: "₩1.2M" }, build: buildDealWrite,
  });
  assert.equal(result.status, "saved");
  assert.equal(calls.some((c) => c.url.includes("/rest/v1/crm_activities")), false);
});
