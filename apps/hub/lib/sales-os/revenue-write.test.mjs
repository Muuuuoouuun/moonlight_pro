import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildAccountWrite,
  buildCaseWrite,
  buildDealWrite,
  buildLeadWrite,
  mergeRecordMeta,
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
    phone: " 010-1234-5678 ",
    stage: "Contact",
    source: "Referral",
    type: "company",
    value: "₩1.2M",
    workspace: "classin",
  });
  assert.equal(columns.name, "Studio Park");
  assert.equal(columns.phone, "010-1234-5678");
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

test("buildDealWrite normalizes payments and drops invalid rows (deal-payments.js)", () => {
  const { metaPatch } = buildDealWrite({
    payments: [
      { id: "p1", label: "계약금", expectedAmount: 900000, expectedAt: "2026-09-25" },
      { expectedAmount: 0 }, // 금액 없음 — 버려진다
    ],
  });
  assert.equal(metaPatch.payments.length, 1);
  assert.equal(metaPatch.payments[0].id, "p1");
  assert.equal(metaPatch.payments[0].expectedAmount, 900000);
});

test("buildDealWrite leaves meta.payments untouched when the field is absent (no-payments deals unaffected)", () => {
  const { metaPatch } = buildDealWrite({ name: "이름만 바꿈" });
  assert.equal("payments" in metaPatch, false);
});

test("buildDealWrite carries a valid planBaseline into meta.plan_baseline and drops an invalid one", () => {
  const { metaPatch } = buildDealWrite({ planBaseline: { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: "2026-09-25T01:00:00.000Z" } });
  assert.deepEqual(metaPatch.plan_baseline, { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: "2026-09-25T01:00:00.000Z" });
  assert.equal("plan_baseline" in buildDealWrite({ planBaseline: { amount: 0 } }).metaPatch, false);
  assert.equal("plan_baseline" in buildDealWrite({ planBaseline: null }).metaPatch, false);
  assert.equal("plan_baseline" in buildDealWrite({ name: "x" }).metaPatch, false);
});

test("buildDealWrite keeps each payment's first plan (planned*) and the paid-difference note", () => {
  const { metaPatch } = buildDealWrite({
    payments: [{
      id: "p1", expectedAmount: 1800000, expectedAt: "2026-10-02T03:00:00.000Z",
      plannedAmount: 1800000, plannedAt: "2026-09-15T03:00:00.000Z",
      status: "paid", paidAmount: 1600000, paidAt: "2026-10-01T03:00:00.000Z", paidNote: "첫 달 할인",
    }],
  });
  assert.equal(metaPatch.payments[0].plannedAt, "2026-09-15T03:00:00.000Z");
  assert.equal(metaPatch.payments[0].paidNote, "첫 달 할인");
});

test("mergeRecordMeta writes a deal's plan_baseline once — an existing baseline always wins", () => {
  const existing = { brand: "sinabro", payments: [{ id: "p1" }], plan_baseline: { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z" } };
  const merged = mergeRecordMeta({ table: "deals", existingMeta: existing, metaPatch: { plan_baseline: { amount: 999, closeAt: "2026-12-01" }, next_action: "회신" } });
  assert.deepEqual(merged.plan_baseline, existing.plan_baseline);
  assert.equal(merged.brand, "sinabro");
  assert.deepEqual(merged.payments, [{ id: "p1" }]);
  assert.equal(merged.next_action, "회신");
  const first = mergeRecordMeta({ table: "deals", existingMeta: { brand: "sinabro" }, metaPatch: { plan_baseline: { amount: 5, closeAt: null } } });
  assert.deepEqual(first, { brand: "sinabro", plan_baseline: { amount: 5, closeAt: null } });
  // 잘못 저장된 옛 값(금액 없음)은 기준선이 아니다 — 새 값이 들어간다.
  const repaired = mergeRecordMeta({ table: "deals", existingMeta: { plan_baseline: { amount: 0 } }, metaPatch: { plan_baseline: { amount: 7 } } });
  assert.deepEqual(repaired.plan_baseline, { amount: 7 });
  // 딜이 아닌 표는 평범한 얕은 병합 그대로
  assert.deepEqual(mergeRecordMeta({ table: "leads", existingMeta: { a: 1 }, metaPatch: { b: 2 } }), { a: 1, b: 2 });
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

test("customer label writes support lead genres and account region, subjects and genres", () => {
  const lead = buildLeadWrite({ genres: [' 음악 ', '음악'], region: '경기-안양' }).metaPatch;
  assert.deepEqual(lead.genres, ['음악']);
  assert.equal(lead.region, '경기-안양');

  const account = buildAccountWrite({
    region: ' 서울-강남 ', subjects: ['math', 'bogus', 'english', 'math'], genres: ['국악', '국악'],
    labelSource: { region: 'operator', subjects: 'operator' },
  }).metaPatch;
  assert.equal(account.region, '서울-강남');
  assert.deepEqual(account.subjects, ['math', 'english']);
  assert.deepEqual(account.genres, ['국악']);
  assert.deepEqual(account.label_source, { region: 'operator', subjects: 'operator' });
  assert.deepEqual(buildAccountWrite({ region: '', subjects: [], genres: [] }).metaPatch, {
    region: null, subjects: [], genres: [],
  });
  assert.deepEqual(buildAccountWrite({ name: 'Only name' }).metaPatch, {});
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

function installSupabaseFetch({ existingMeta, existingStage, deleteReturnsRows = true } = {}) {
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });

    if (method === "GET") {
      // meta read for the merge step
      return jsonResponse([{ meta: existingMeta || {}, ...(existingStage ? { stage: existingStage } : {}) }]);
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

test("persistRevenueRecord keeps an existing deal plan_baseline and sibling meta when a later save carries another one", async () => {
  const baseline = { amount: 1800000, closeAt: "2026-09-15T03:00:00.000Z", at: "2026-09-20T00:00:00.000Z" };
  installSupabaseFetch({ existingMeta: { brand: "sinabro", payments: [], plan_baseline: baseline }, existingStage: "proposal" });
  const result = await persistRevenueRecord({
    table: "deals",
    op: "update",
    id: "existing-id",
    payload: { closeAt: "2026-11-02T03:00:00.000Z", planBaseline: { amount: 2000000, closeAt: "2026-10-02T03:00:00.000Z" } },
    build: buildDealWrite,
  });
  assert.equal(result.status, "saved");
  const patch = calls.find(c => c.method === "PATCH");
  assert.equal(patch.body.expected_close_at, "2026-11-02T03:00:00.000Z");
  assert.deepEqual(patch.body.meta, { brand: "sinabro", payments: [], plan_baseline: baseline });
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
  // `lost`는 DEAL_STAGES 밖이라 dealStageLabel만 라벨을 안다 — 기록 본문이 원시 키로 떨어지면
  // 같은 이동의 화면 토스트("Lost(으)로 이동됨")와 영구 기록이 갈린다.
  assert.deepEqual(
    dealStageMove({ table: "deals", existingMeta: { stage_detail: "quote" }, metaPatch: { stage_detail: "lost" } }),
    { from: "quote", to: "lost", body: "단계: 견적 → Lost" },
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

// ---- 성사 시각 won_at — 주간 회사 리포트 "성사일 확인된 딜"의 유일한 원천 ----

import { dealWonAtPatch } from "./revenue-write.js";

test("dealWonAtPatch stamps won_at only on a known move into closing and clears it on a known move out", () => {
  const now = new Date("2026-09-23T05:00:00.000Z");
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: { stage_detail: "final" }, metaPatch: { stage_detail: "closing" }, now }), { won_at: "2026-09-23T05:00:00.000Z" });
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: { stage_detail: "closing" }, metaPatch: { stage_detail: "quote" }, now }), { won_at: null });
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: { stage_detail: "closing" }, metaPatch: { stage_detail: "closing" }, now }), {}, "재저장은 성사 시각을 새로 찍지 않는다");
  // 이전 단계를 모르는 레거시 딜은 이미 성사였을 수 있다 — 지금 시각을 찍으면 옛 성사가 이번 주 성사로 둔갑한다.
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: {}, metaPatch: { stage_detail: "closing" }, now }), {});
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: { stage_detail: "final" }, metaPatch: { next_action: "x" }, now }), {});
  assert.deepEqual(dealWonAtPatch({ table: "leads", existingMeta: { stage_detail: "final" }, metaPatch: { stage_detail: "closing" }, now }), {});
});

test("persistRevenueRecord writes won_at in the same update as the move into closing", async () => {
  installSupabaseFetch({ existingMeta: { stage_detail: "final", workspace: "classin" } });
  const result = await persistRevenueRecord({
    table: "deals", op: "update", id: "deal-1", payload: { stage: "closing" }, build: buildDealWrite,
  });
  assert.equal(result.status, "saved");
  const patch = calls.find(call => call.method === "PATCH" && call.url.includes("/deals"));
  assert.ok(patch, "deal update must be sent");
  const body = patch.body;
  assert.ok(Number.isFinite(Date.parse(body.won_at)), "won_at must be a timestamp");
  assert.equal(body.meta.stage_detail, "closing");
});

test("a legacy deal without stage_detail uses its stage column as the known previous stage", () => {
  const now = new Date("2026-09-23T05:00:00.000Z");
  // 이관 딜은 stage_detail 없이 stage 컬럼만 가진다. won 컬럼은 closing으로 읽히므로 옛 성사가 다시 찍히지 않는다.
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: {}, existingStage: "negotiation", metaPatch: { stage_detail: "closing" }, now }), { won_at: "2026-09-23T05:00:00.000Z" });
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: {}, existingStage: "won", metaPatch: { stage_detail: "closing" }, now }), {});
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: {}, existingStage: "won", metaPatch: { stage_detail: "final" }, now }), { won_at: null });
  assert.deepEqual(dealWonAtPatch({ table: "deals", existingMeta: {}, existingStage: "mystery", metaPatch: { stage_detail: "closing" }, now }), {}, "모르는 컬럼 값은 이전 단계를 알려주지 않는다");
});

test("persistRevenueRecord reads the legacy stage column so a first move into closing is dated", async () => {
  installSupabaseFetch({ existingMeta: { workspace: "classin" }, existingStage: "negotiation" });
  const result = await persistRevenueRecord({ table: "deals", op: "update", id: "deal-1", payload: { stage: "closing" }, build: buildDealWrite });
  assert.equal(result.status, "saved");
  const read = calls.find(call => call.method === "GET" && call.url.includes("/deals"));
  assert.match(decodeURIComponent(read.url), /select=meta,stage/);
  const patch = calls.find(call => call.method === "PATCH" && call.url.includes("/deals"));
  assert.ok(Number.isFinite(Date.parse(patch.body.won_at)));
});

test("buildDealWrite carries a valid recurring plan into meta.recurring, clears it with null, and drops an invalid one", () => {
  const { metaPatch } = buildDealWrite({ recurring: { amount: "600000", day: 3, startMonth: "2026-10" } });
  assert.deepEqual(metaPatch.recurring, { amount: 600000, day: 3, startMonth: "2026-10", endMonth: null });
  assert.equal(buildDealWrite({ recurring: null }).metaPatch.recurring, null);
  assert.equal("recurring" in buildDealWrite({ recurring: { amount: 0, day: 3, startMonth: "2026-10" } }).metaPatch, false);
  assert.equal("recurring" in buildDealWrite({ name: "x" }).metaPatch, false);
});

test("buildDealWrite keeps a recurring payment's month marker through normalizePayments", () => {
  const { metaPatch } = buildDealWrite({ payments: [{ id: "rec-2026-10", recurringMonth: "2026-10", expectedAmount: 600000, expectedAt: "2026-10-03T03:00:00.000Z", status: "paid", paidAmount: 600000, paidAt: "2026-10-03T03:00:00.000Z" }] });
  assert.equal(metaPatch.payments[0].recurringMonth, "2026-10");
});
