import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formToProductInput,
  formatPricing,
  gateSentence,
  linesToItems,
  nextProductStage,
  productBlocker,
  productChecklist,
  productNextAction,
  productStageGate,
  productToForm,
  toggleFeatureVerified,
} from "./product-catalog.js";

const product = (over = {}) => ({
  id: "p1",
  name: "OMR 메이커",
  summary: "시험지 자동 채점",
  stage: "idea",
  details: {},
  ...over,
});

test("gates accumulate forward and never block maintain/sunset beyond a reason", () => {
  assert.deepEqual(productStageGate(product(), "idea").missing, []);
  const validation = productStageGate(product(), "validation");
  assert.deepEqual(validation.missing.map((m) => m.key), ["problem", "target"]);
  const launch = productStageGate(product({ details: { problem: "수기 채점", domain: "교육", capabilities: [{ id: "c1", text: "PDF 채점", verifiedAt: null }] } }), "launch", { repositories: 1, projects: 0 });
  assert.deepEqual(launch.missing.map((m) => m.key), ["project", "capabilities", "deployUrl"]);
  assert.deepEqual(launch.unknown.map((m) => m.key), ["launchChecklist"], "원천이 없는 조건은 확인 필요로만");
  assert.deepEqual(productStageGate(product(), "sunset"), { target: "sunset", missing: [], unknown: [], needsReason: true });
});

test("next action prefers the operator's words, then the first missing field", () => {
  assert.equal(productNextAction(product({ details: { nextAction: "결제 테스트" } })).text, "결제 테스트");
  const derived = productNextAction(product());
  assert.equal(derived.text, "검증으로 올리려면 해결하는 문제가 필요해요");
  assert.equal(gateSentence("launch", { label: "배포 URL" }), "출시로 올리려면 배포 URL이 필요해요");
  assert.equal(gateSentence("mvp", { label: "저장소 1개 연결" }), "MVP로 올리려면 저장소 1개 연결이 필요해요");
  assert.equal(gateSentence("growth", { label: "확정 매출 1건" }), "성장으로 올리려면 확정 매출 1건이 필요해요");
  assert.equal(derived.missing.field, "problem");
  assert.equal(productNextAction(product({ stage: "growth" })), null);
  assert.equal(nextProductStage("maintain"), null);
});

test("blocker picks a failing CI before a failed sync and skips disabled repos", () => {
  assert.equal(productBlocker(product({ repositories: [] })), null);
  const repos = [
    { id: "r1", fullName: "o/a", status: "error", summary: {} },
    { id: "r2", fullName: "o/b", status: "connected", summary: { ci: { state: "failure", url: "https://x" } } },
    { id: "r3", fullName: "o/c", status: "disabled", summary: { ci: { state: "failure" } } },
  ];
  assert.deepEqual(productBlocker(product({ repositories: repos })), { kind: "ci", label: "CI 실패 · o/b", repositoryId: "r2", url: "https://x" });
  assert.equal(productBlocker(product({ repositories: [repos[0], repos[2]] })).kind, "sync");
});

test("capability lines keep ids and verification dates for unchanged sentences", () => {
  let n = 0;
  const newId = () => `new-${++n}`;
  const existing = [{ id: "c1", text: "PDF 채점", verifiedAt: "2026-09-01" }];
  const items = linesToItems("- PDF 채점\n성적표 출력\n성적표 출력\n", existing, newId, "2026-09-25");
  assert.deepEqual(items, [
    { id: "c1", text: "PDF 채점", verifiedAt: "2026-09-01" },
    { id: "new-1", text: "성적표 출력", verifiedAt: "2026-09-25" },
  ]);
  assert.deepEqual(linesToItems("스캐너 보유", [], newId), [{ id: "new-2", text: "스캐너 보유" }], "필수 조건에는 확인일이 없다");
});

test("form round-trips product details", () => {
  const source = product({
    details: {
      domain: "교육",
      audience: "학원 원장",
      problem: "수기 채점에 주 5시간",
      notes: "수학·영어, 서울, 1~3관",
      capabilities: [{ id: "c1", text: "PDF 채점", verifiedAt: "2026-09-01" }],
      requirements: [{ id: "r1", text: "스캐너 보유" }],
      pricing: { model: "monthly", amount: 29000, currency: "KRW" },
      deployUrl: "https://omr.example.com",
      links: [{ label: "문서", url: "https://docs.example.com" }],
      nextAction: "",
    },
  });
  const form = productToForm(source);
  assert.equal(form.domain, "교육");
  assert.equal(form.links, "문서 | https://docs.example.com");
  const input = formToProductInput({ ...form, capabilities: `${form.capabilities}\n성적표 출력`, pricingAmount: "29,000원" }, source, { newId: () => "x" });
  assert.equal(input.details.notes, "수학·영어, 서울, 1~3관");
  assert.equal("target" in input.details, false);
  assert.deepEqual(input.details.capabilities[1], { verifiedAt: null, id: "x", text: "성적표 출력" }, "새 기능은 점검 전으로 들어간다");
  input.details.capabilities.pop();
  assert.deepEqual(input.details.capabilities, source.details.capabilities);
  assert.deepEqual(input.details.pricing, { model: "monthly", amount: 29000 });
  assert.deepEqual(input.details.links, source.details.links);
  assert.equal(formToProductInput({ ...form, pricingModel: "free", pricingAmount: "" }, source, { newId: () => "x" }).details.pricing.amount, 0);
});

test("pricing reads as one short phrase", () => {
  assert.equal(formatPricing({ model: "monthly", amount: 29000 }), "월 구독 29,000원");
  assert.equal(formatPricing({ model: "undecided" }), "가격 미정");
  assert.equal(formatPricing({ model: "per_use", amount: null }), "건당 금액 미정");
});

test("list order puts money-near stages first and retired ones last", async () => {
  const { productStageOrder } = await import("./product-catalog.js");
  const sorted = ["idea", "sunset", "growth", "mvp", "maintain", "launch", "validation"].sort((a, b) => productStageOrder(a) - productStageOrder(b));
  assert.deepEqual(sorted, ["growth", "launch", "mvp", "validation", "idea", "maintain", "sunset"]);
});

test("checklist runs plan → features → dev → launch → operate and counts only actionable items", () => {
  const empty = productChecklist(product());
  assert.deepEqual(empty.groups.map((g) => g.label), ["기획", "기능", "개발", "출시", "운영"]);
  assert.equal(empty.total, 10, "에러 수집(도구 미정)·CI(원천 없음)·문의(현황)는 분모에서 뺀다");
  assert.equal(empty.done, 1, "한 줄 설명은 필수라 늘 완료");
  const errors = empty.groups.at(-1).items.find((i) => i.key === "errors");
  assert.equal(errors.state, "unknown");

  const full = productChecklist(product({
    details: {
      domain: "교육", audience: "학원", problem: "채점",
      capabilities: [{ id: "c1", text: "채점", verifiedAt: "2026-09-25" }, { id: "c2", text: "성적표", verifiedAt: null }],
      pricing: { model: "monthly", amount: 1 }, deployUrl: "https://x",
    },
    repositories: [{ id: "r", status: "connected", summary: { ci: { state: "success" } } }],
    projects: [{ id: "p" }],
    inquiries: [{ id: "i1" }, { id: "i2" }],
  }));
  const byKey = Object.fromEntries(full.groups.flatMap((g) => g.items).map((i) => [i.key, i]));
  assert.equal(byKey.featuresVerified.state, "todo");
  assert.equal(byKey.featuresVerified.detail, "1/2");
  assert.equal(byKey.ci.state, "done");
  assert.equal(byKey.inquiries.detail, "2건");
  assert.equal(full.total, 11);
  assert.equal(full.done, 10);
  assert.equal(full.percent, 91);
});

test("feature check toggles one feature's verification date", () => {
  const p = product({ details: { capabilities: [{ id: "a", text: "A", verifiedAt: null }, { id: "b", text: "B", verifiedAt: "2026-09-01" }] } });
  assert.deepEqual(toggleFeatureVerified(p, "a", true, "2026-09-25"), [{ id: "a", text: "A", verifiedAt: "2026-09-25" }, { id: "b", text: "B", verifiedAt: "2026-09-01" }]);
  assert.equal(toggleFeatureVerified(p, "b", false, "2026-09-25")[1].verifiedAt, null);
});


test("flow buckets: blocked/overdue/today → 오늘, 7 days → 이번 주, later → 다음, no due → 언젠가, done → 지난", async () => {
  const { productFlow } = await import("./product-catalog.js");
  const p = {
    repositories: [{ id: "r", fullName: "o/r", status: "connected", summary: { ci: { state: "failure" } } }],
    projects: [
      { id: "a", name: "막힌 일", status: "blocked" },
      { id: "b", name: "지난 기한", status: "active", dueAt: "2026-09-20T00:00:00Z" },
      { id: "c", name: "이번 주", status: "active", dueAt: "2026-09-28T00:00:00Z" },
      { id: "d", name: "다음", status: "draft", dueAt: "2026-10-20T00:00:00Z" },
      { id: "e", name: "언젠가", status: "draft" },
      { id: "f", name: "끝", status: "completed" },
    ],
    inquiries: [{ id: "q1", subject: "새", status: "new" }, { id: "q2", subject: "대기", status: "waiting", receivedAt: "2026-09-29T00:00:00Z" }, { id: "q3", subject: "끝", status: "closed" }, { id: "q4", subject: "제외", status: "ignored" }],
  };
  const flow = Object.fromEntries(productFlow(p, { today: "2026-09-25" }).map((b) => [b.key, b.items.map((i) => i.title)]));
  assert.deepEqual(flow.today, ["CI 실패 · o/r", "막힌 일", "지난 기한", "새"]);
  assert.deepEqual(flow.week, ["이번 주", "대기"]);
  assert.deepEqual(flow.next, ["다음"]);
  assert.deepEqual(flow.someday, ["언젠가"]);
  assert.deepEqual(flow.past, ["끝", "끝"]);
});

test("month numbers keep unknown as null and portfolio sums only what is known", async () => {
  const { monthNumbers, portfolioSummary, portfolioAttention, previousMonth } = await import("./product-catalog.js");
  const a = { id: "a", name: "A", opsStatus: "live", metrics: [{ month: "2026-09", activeUsers: 18, revenue: 190000, cost: 68000 }] };
  const b = { id: "b", name: "B", opsStatus: "dev", metrics: [{ month: "2026-09", activeUsers: null, revenue: null, cost: 15000 }] };
  const c = { id: "c", name: "C", opsStatus: "paused", metrics: [] };
  assert.deepEqual(monthNumbers(a, "2026-09"), { month: "2026-09", activeUsers: 18, revenue: 190000, cost: 68000, net: 122000, known: true });
  assert.equal(monthNumbers(b, "2026-09").net, -15000);
  assert.equal(monthNumbers(c, "2026-09").net, null);
  const inquiries = [{ status: "new" }, { status: "new", productId: "a" }, { status: "waiting", productId: "a" }, { status: "closed" }];
  const s = portfolioSummary([a, b, c], inquiries, "2026-09");
  assert.deepEqual([s.byOps.live, s.users, s.usersMissing, s.net, s.openInquiries, s.newInquiries, s.unassignedInquiries], [1, 18, 2, 107000, 3, 2, 1]);
  const attention = portfolioAttention([{ ...a, projects: [{ id: "x", name: "키 교체", status: "active", dueAt: "2026-09-20" }] }], inquiries, { today: "2026-09-25" });
  assert.deepEqual(attention.map((i) => i.text), ["기한 지남 · 키 교체", "새 문의 2건 · 제품 미정 1건"]);
  assert.equal(previousMonth("2026-01"), "2025-12");
});

test("next step reads broken → urgent work → operator note → nearest work → stage gate", async () => {
  const { productNextStep } = await import("./product-catalog.js");
  const today = "2026-09-25";
  assert.equal(productNextStep({ repositories: [{ id: "r", fullName: "o/r", status: "connected", summary: { ci: { state: "failure" } } }] }, { today }), "CI 실패 · o/r");
  assert.equal(productNextStep({ projects: [{ id: "a", name: "키 교체", status: "active", dueAt: "2026-09-20" }] }, { today }), "기한 지남 · 키 교체");
  assert.equal(productNextStep({ details: { nextAction: "결제 테스트" }, projects: [{ id: "b", name: "요금제", status: "draft", dueAt: "2026-09-28" }] }, { today }), "결제 테스트");
  assert.equal(productNextStep({ projects: [{ id: "b", name: "요금제", status: "draft", dueAt: "2026-09-28" }] }, { today }), "요금제");
  assert.equal(productNextStep({ name: "A", summary: "B", stage: "idea", details: {} }, { today }), "검증으로 올리려면 해결하는 문제가 필요해요");
});
