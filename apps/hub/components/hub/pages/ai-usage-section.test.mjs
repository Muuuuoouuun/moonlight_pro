import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiUsageSection, AiUsageView, aiUsageViewState, formatTokens, formatUsd } from "./ai-usage-section.jsx";

const month = (key, extra = {}) => ({ key, calls: 0, promptTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, estimatedUsd: null, estimatedKrw: null, unpricedCalls: 0, models: [], ...extra });
const pricing = { url: "https://ai.google.dev/gemini-api/docs/pricing", checkedAt: "2026-09-26", usdKrw: 1360, usdKrwCheckedAt: "2026-09-26" };

test("the view state reads the Hub envelope, not just HTTP success", () => {
  assert.equal(aiUsageViewState({ status: "error", source: "error" }), "error");
  assert.equal(aiUsageViewState({ status: "live", source: "error" }), "error");
  assert.equal(aiUsageViewState({ status: "preview" }), "preview");
  assert.equal(aiUsageViewState({ status: "live" }), "error", "a live envelope without months is not an empty month");
  assert.equal(aiUsageViewState({ status: "partial", current: month("2026-09"), previous: month("2026-08") }), "partial");
  assert.equal(aiUsageViewState(null), "error");
});

test("loading is a skeleton; preview and error are truth badges, never empty states", () => {
  const loading = renderToStaticMarkup(React.createElement(AiUsageSection));
  assert.match(loading, /hub-skeleton/);
  assert.doesNotMatch(loading, /data-empty/);
  const preview = renderToStaticMarkup(React.createElement(AiUsageView, { view: "preview", data: { status: "preview" } }));
  assert.match(preview, /data-truth="preview"/);
  assert.doesNotMatch(preview, /hub-skeleton|data-empty/);
  const error = renderToStaticMarkup(React.createElement(AiUsageView, { view: "error", data: null, onRetry() {} }));
  assert.match(error, /data-truth="error"/);
  assert.match(error, /다시 불러오기/);
});

test("live view shows both months, estimated cost as a stat, per-model rows and its scope", () => {
  const data = {
    status: "live",
    pricing,
    current: month("2026-09", { calls: 3, totalTokens: 12_345, promptTokens: 10_000, outputTokens: 1_345, thinkingTokens: 1_000, estimatedUsd: 0.0245, estimatedKrw: 33, unpricedCalls: 1, models: [
      { model: "gemini-3.5-flash", calls: 2, totalTokens: 12_000, estimatedUsd: 0.0245, priced: true },
      { model: "mystery-model", calls: 1, totalTokens: 345, estimatedUsd: null, priced: false },
    ] }),
    previous: month("2026-08"),
  };
  const html = renderToStaticMarkup(React.createElement(AiUsageView, { view: "live", data }));
  assert.match(html, /이번 달 · 9월/);
  assert.match(html, /지난달 · 8월/);
  assert.match(html, /class="stat"[^>]*>\$0\.02</);
  assert.match(html, /≈ ₩33/);
  assert.match(html, /기록된 호출 없음/);
  assert.match(html, /gemini-3\.5-flash/);
  assert.match(html, /단가 미확인/);
  assert.match(html, /Moonlight가 부른 Gemini 호출만/);
  assert.match(html, /추정/);
  assert.doesNotMatch(html, /한도|경고|limit/i, "no budget line or limit is drawn until the operator decides one");
});

test("formatting keeps small costs honest and compacts large token counts", () => {
  assert.equal(formatUsd(0.004), "<$0.01");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(null), "단가 미확인");
  assert.equal(formatTokens(9_999), "9,999");
  assert.equal(formatTokens(12_345), "12K");
  assert.equal(formatTokens(1_250_000), "1.3M");
});

test("the settings page mounts the section once, using tokens only", async () => {
  const settings = await readFile(new URL("./evolution-settings.jsx", import.meta.url), "utf8");
  assert.equal((settings.match(/<AiUsageSection \/>/g) || []).length, 1);
  const source = await readFile(new URL("./ai-usage-section.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.doesNotMatch(source, /onMouseEnter|onMouseLeave/);
  assert.match(source, /\/api\/hub\/ai-usage/);
});
