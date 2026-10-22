import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_MODEL_PRICING, AI_PRICING_SOURCE, USD_KRW, estimateCallCostUsd, modelPricing, usdToKrw } from "./ai-pricing.js";

test("price table names its source and check date", () => {
  assert.match(AI_PRICING_SOURCE.url, /^https:\/\/ai\.google\.dev\//);
  assert.match(AI_PRICING_SOURCE.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(USD_KRW.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(AI_MODEL_PRICING["gemini-3.6-flash"], "the default model is priced");
  assert.equal(AI_PRICING_SOURCE.checkedAt, "2026-09-26", "older prices were not reverified");
  assert.equal(AI_PRICING_SOURCE.modelCheckedAt["gemini-3.6-flash"], "2026-10-23");
  assert.deepEqual(USD_KRW, { rate: 1334.03, observedAt: "2026-10-16", releasedAt: "2026-10-19", checkedAt: "2026-10-23", source: "https://www.federalreserve.gov/releases/h10/current/" });
});

test("cost = prompt × input price + (answer + thinking) × output price", () => {
  // gemini-3.5-flash: $1.50 in / $9.00 out per 1M.
  const usd = estimateCallCostUsd({ model: "gemini-3.5-flash", promptTokens: 1_000_000, outputTokens: 500_000, thinkingTokens: 500_000 });
  assert.equal(usd, 1.5 + 9);
  assert.equal(estimateCallCostUsd({ model: "models/Gemini-3.5-Flash", promptTokens: 2_000_000 }), 3);
  assert.equal(estimateCallCostUsd({ model: "gemini-3.5-flash" }), 0);
});

test("pro models switch to the long-prompt tier per call above 200k prompt tokens", () => {
  assert.equal(estimateCallCostUsd({ model: "gemini-3.1-pro-preview", promptTokens: 200_000, outputTokens: 0 }), 0.4);
  assert.equal(estimateCallCostUsd({ model: "gemini-3.1-pro-preview", promptTokens: 250_000, outputTokens: 100_000 }), (250_000 * 4 + 100_000 * 18) / 1_000_000);
});

test("unknown models are not priced and KRW is a rounded conversion", () => {
  assert.equal(modelPricing("some-new-model"), null);
  assert.equal(estimateCallCostUsd({ model: "some-new-model", promptTokens: 10 }), null);
  assert.equal(usdToKrw(1), 1334);
  assert.equal(usdToKrw(10), 13340);
  assert.equal(usdToKrw(null), null);
});

test("3.6 Flash promotion ends at the UTC 2027 boundary and includes thinking", () => {
  const call = { model: "models/Gemini-3.6-Flash", promptTokens: 1_000_000, outputTokens: 500_000, thinkingTokens: 500_000 };
  assert.equal(estimateCallCostUsd({ ...call, at: "2026-12-31T23:59:59.999Z" }), 4.5);
  assert.equal(estimateCallCostUsd({ ...call, at: "2027-01-01T00:00:00.000Z" }), 9);
  assert.equal(estimateCallCostUsd({ ...call, at: "2027-01-01T09:00:00+09:00" }), 9);
  assert.equal(estimateCallCostUsd({ ...call, at: new Date("2027-06-01T00:00:00Z") }), 9);
  for (const at of [null, "not-a-date", new Date(NaN)]) assert.equal(estimateCallCostUsd({ ...call, at }), null);
  for (const at of ["2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z"]) {
    assert.equal(estimateCallCostUsd({ ...call, model: "gemini-3.5-flash", at }), 10.5, "legacy 3.5 rates are not changed retroactively");
  }
});

test("omitted price time follows the clock rather than retaining promotional rates", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-12-31T23:59:59.999Z") });
  const call = { model: "gemini-3.6-flash", promptTokens: 1_000_000 };
  assert.equal(estimateCallCostUsd(call), 0.75);
  t.mock.timers.tick(1);
  assert.equal(estimateCallCostUsd(call), 1.5);
});
