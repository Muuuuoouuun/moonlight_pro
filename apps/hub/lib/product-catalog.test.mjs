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

