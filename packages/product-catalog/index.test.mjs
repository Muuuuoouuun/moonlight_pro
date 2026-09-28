import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FOCUS_STAGES,
  MAX_FOCUS_PRODUCTS,
  PRODUCT_STAGES,
  emptyProduct,
  isFocusStage,
  mergeProductServerFields,
  nextStage,
  normalizeRepo,
  parseProductInput,
  readProduct,
  stageGate,
  stageLabel,
} from "./index.ts";

test("stages run idea → sunset and the focus cap is the operator-confirmed 3", () => {
  assert.deepEqual(PRODUCT_STAGES.map((s) => s.key), ["idea", "validation", "mvp", "launch", "growth", "sunset"]);
  assert.deepEqual([...FOCUS_STAGES], ["mvp", "launch", "growth"]);
  assert.equal(MAX_FOCUS_PRODUCTS, 3);
  assert.equal(isFocusStage("launch"), true);
  assert.equal(isFocusStage("validation"), false);
  assert.equal(stageLabel("sunset"), "유지 · 종료");
  assert.equal(stageLabel("bogus"), "아이디어");
  assert.equal(nextStage("growth"), null, "sunset is a decision, never the automatic next stage");
  assert.equal(nextStage("idea"), "validation");
});

test("readProduct never throws and drops junk to defaults", () => {
  assert.deepEqual(readProduct(null), emptyProduct());
  assert.deepEqual(readProduct([]), emptyProduct());
  const product = readProduct({
    stage: "rocket",
    target: { subjects: ["math", "BAD KEY", 3] },
    pricing: { model: "barter", amount: -5 },
    links: { deployUrl: "javascript:alert(1)", docsUrl: "https://docs.example.com" },
    repos: ["https://github.com/acme/app.git", "not a repo"],
    capabilities: [{ id: "c1", text: "  PDF 채점 " }, { id: "", text: "x" }, "junk"],
  });
  assert.equal(product.stage, "idea");
  assert.deepEqual(product.target.subjects, ["math"]);
  assert.deepEqual(product.pricing, { model: "", amount: null, currency: "KRW" });
  assert.equal(product.links.deployUrl, "");
  assert.equal(product.links.docsUrl, "https://docs.example.com/");
  assert.deepEqual(product.repos, ["acme/app"]);
  assert.deepEqual(product.capabilities, [{ id: "c1", text: "PDF 채점" }]);
});

test("normalizeRepo accepts owner/repo and GitHub URLs only", () => {
  assert.equal(normalizeRepo("acme/app"), "acme/app");
  assert.equal(normalizeRepo("https://github.com/acme/app/"), "acme/app");
  assert.equal(normalizeRepo("acme"), "");
  assert.equal(normalizeRepo("acme/app/extra"), "");
  assert.equal(normalizeRepo(42), "");
});

test("parseProductInput rejects bad shapes with operator-readable Korean errors", () => {
  assert.equal(parseProductInput(null).ok, false);
  assert.match(parseProductInput({ stage: "rocket" }).error, /단계/);
  assert.match(parseProductInput({ repos: ["nope"] }).error, /owner\/repo/);
  assert.match(parseProductInput({ repos: ["acme/app", "ACME/app"] }).error, /두 번/);
  assert.match(parseProductInput({ links: { deployUrl: "ftp://x" } }).error, /http/);
  assert.match(parseProductInput({ pricing: { amount: -1 } }).error, /금액/);
  assert.match(parseProductInput({ capabilities: [{ id: "a", text: "  " }] }).error, /제공 범위/);
  assert.match(parseProductInput({ stage: "sunset" }).error, /이유/);
});

test("parseProductInput strips server-owned fields", () => {
  const parsed = parseProductInput({ stage: "mvp", repos: ["acme/app"], version: 99, stageHistory: [{ at: "x", to: "growth" }] });
  assert.equal(parsed.ok, true);
  assert.equal("version" in parsed.product, false);
  assert.equal("stageHistory" in parsed.product, false);
  assert.equal(parsed.product.stage, "mvp");
});

test("mergeProductServerFields bumps version only when the sales contract text changes", () => {
  const now = "2026-09-28T01:00:00.000Z";
  const first = mergeProductServerFields(undefined, parseProductInput({ stage: "idea" }).product, now);
  assert.equal(first.version, 1);
  assert.deepEqual(first.stageHistory, [{ at: now, from: null, to: "idea" }]);

  const same = mergeProductServerFields(first, parseProductInput({ stage: "idea", problem: "채점이 오래 걸림" }).product, now);
  assert.equal(same.version, 1, "problem text is not the sales contract");
  assert.equal(same.stageHistory.length, 1, "no stage change, no history row");

  const later = "2026-09-29T01:00:00.000Z";
  const moved = mergeProductServerFields(same, parseProductInput({
    stage: "validation", capabilities: [{ id: "c1", text: "PDF 채점" }],
  }).product, later);
  assert.equal(moved.version, 2);
  assert.deepEqual(moved.stageHistory.at(-1), { at: later, from: "idea", to: "validation" });
});

test("stageGate is cumulative and flags what the ledger cannot verify as manual", () => {
  const product = readProduct({ stage: "mvp", repos: ["acme/app"], problem: "p", target: { subjects: ["math"] } });
  const launch = stageGate(product, "launch", { summary: "한 줄", projectCount: 1 });
  assert.deepEqual(launch.filter((item) => !item.done && !item.manual).map((item) => item.key), ["capabilities", "deployUrl"]);
  assert.equal(launch.find((item) => item.key === "launchChecklist").manual, true);
  assert.deepEqual(stageGate(product, "idea", {}).map((item) => item.key), ["summary"]);
  assert.deepEqual(stageGate(product, "sunset", {}), [{ key: "sunsetReason", label: "유지·종료 이유 한 줄", done: false }]);
  const noProject = stageGate(product, "mvp", { summary: "x", projectCount: 0 });
  assert.equal(noProject.find((item) => item.key === "project").done, false);
});
