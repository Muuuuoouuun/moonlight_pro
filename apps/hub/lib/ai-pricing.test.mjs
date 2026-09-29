import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_MODEL_PRICING, AI_PRICING_SOURCE, USD_KRW, estimateCallCostUsd, modelPricing, usdToKrw } from "./ai-pricing.js";

test("price table names its source and check date", () => {
  assert.match(AI_PRICING_SOURCE.url, /^https:\/\/ai\.google\.dev\//);
  assert.match(AI_PRICING_SOURCE.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(USD_KRW.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(AI_MODEL_PRICING["gemini-3.5-flash"], "the default model is priced");
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
  assert.equal(usdToKrw(1), USD_KRW.rate);
  assert.equal(usdToKrw(null), null);
});
