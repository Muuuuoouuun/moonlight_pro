import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formToProductInput,
  formatPricing,
  gateSentence,
  linesToItems,
  nextProductStage,
  productBlocker,
  productNextAction,
  productStageGate,
  productToForm,
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
  const launch = productStageGate(product({ details: { problem: "수기 채점", target: { subjects: ["math"] } } }), "launch", { repositories: 1, projects: 0 });
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
      problem: "수기 채점에 주 5시간",
      target: { orgTypes: ["학원", "교습소"], subjects: ["math"], regions: ["서울"], size: "1~3관" },
      capabilities: [{ id: "c1", text: "PDF 채점", verifiedAt: "2026-09-01" }],
      requirements: [{ id: "r1", text: "스캐너 보유" }],
      pricing: { model: "monthly", amount: 29000, currency: "KRW" },
      deployUrl: "https://omr.example.com",
      links: [{ label: "문서", url: "https://docs.example.com" }],
      nextAction: "",
    },
  });
  const form = productToForm(source);
  assert.equal(form.orgTypes, "학원, 교습소");
  assert.equal(form.links, "문서 | https://docs.example.com");
  const input = formToProductInput({ ...form, pricingAmount: "29,000원" }, source, { newId: () => "x", today: "2026-09-25" });
  assert.deepEqual(input.details.target, source.details.target);
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
