import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_USAGE_MAX_PAGES, AI_USAGE_PAGE_SIZE, kstMonthWindows, readAiUsage, summarizeAiUsage } from "./ai-usage-ledger.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-26T03:00:00Z");

test("month windows follow the KST calendar, including the first hours of a month", () => {
  assert.deepEqual(kstMonthWindows(NOW), {
    previous: { key: "2026-08", from: "2026-07-31T15:00:00.000Z", to: "2026-08-31T15:00:00.000Z" },
    current: { key: "2026-09", from: "2026-08-31T15:00:00.000Z", to: "2026-09-30T15:00:00.000Z" },
  });
  // 2026-10-01 01:00 KST is still UTC September, but it is October for the operator.
  assert.equal(kstMonthWindows(new Date("2026-09-30T16:00:00Z")).current.key, "2026-10");
  assert.equal(kstMonthWindows(new Date("2026-01-10T00:00:00Z")).previous.key, "2025-12");
});

test("summaries split months, group by model and leave unknown prices out of the estimate", () => {
  const windows = kstMonthWindows(NOW);
  const rows = [
    { occurred_at: "2026-09-02T00:00:00Z", model: "gemini-3.5-flash", prompt_tokens: 1_000_000, output_tokens: 100_000, thinking_tokens: 100_000, total_tokens: 1_200_000 },
    { occurred_at: "2026-09-03T00:00:00Z", model: "gemini-3.5-flash", prompt_tokens: 0, output_tokens: 0, thinking_tokens: 0, total_tokens: 10 },
    { occurred_at: "2026-09-04T00:00:00Z", model: "mystery-model", prompt_tokens: 50, output_tokens: 5, thinking_tokens: 0, total_tokens: 55 },
    { occurred_at: "2026-08-20T00:00:00Z", model: "gemini-3.1-pro-preview", prompt_tokens: 1000, output_tokens: 1000, thinking_tokens: 0, total_tokens: 2000 },
    { occurred_at: "2026-07-20T00:00:00Z", model: "gemini-3.5-flash", prompt_tokens: 9, output_tokens: 9, thinking_tokens: 9, total_tokens: 27 },
    { occurred_at: "not-a-date", model: "gemini-3.5-flash", total_tokens: 1 },
  ];
  const { current, previous } = summarizeAiUsage(rows, windows);
  assert.equal(current.calls, 3);
  assert.equal(current.totalTokens, 1_200_065);
  assert.equal(current.unpricedCalls, 1);
  assert.equal(current.estimatedUsd, 1.5 + 0.2 * 9);
  assert.equal(current.estimatedKrw, Math.round((1.5 + 0.2 * 9) * 1360));
  assert.deepEqual(current.models.map((m) => [m.model, m.calls, m.priced]), [["gemini-3.5-flash", 2, true], ["mystery-model", 1, false]]);
  assert.equal(current.models[1].estimatedUsd, null);
  assert.equal(previous.calls, 1);
  assert.equal(previous.estimatedUsd, (1000 * 2 + 1000 * 12) / 1_000_000);
  const empty = summarizeAiUsage([], windows).current;
  assert.equal(empty.calls, 0);
  assert.deepEqual(empty.models, []);
});

test("reads the two-month window for the workspace with numeric columns only", async () => {
  const seen = [];
  const live = await readAiUsage({
    now: NOW,
    workspaceId: WORKSPACE,
    fetchRows: async (table, options) => { seen.push({ table, options }); return { configured: true, rows: [{ occurred_at: "2026-09-02T00:00:00Z", model: "gemini-3.5-flash", prompt_tokens: 1, output_tokens: 1, thinking_tokens: 0, total_tokens: 2 }] }; },
  });
  assert.equal(live.status, "live");
  assert.equal(live.scope, "moonlight-calls");
  assert.equal(live.current.calls, 1);
  assert.match(live.pricing.url, /ai\.google\.dev/);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].table, "ai_usage_log");
  assert.deepEqual(seen[0].options.filters, [
    ["workspace_id", `eq.${WORKSPACE}`],
    ["occurred_at", "gte.2026-07-31T15:00:00.000Z"],
    ["occurred_at", "lt.2026-09-30T15:00:00.000Z"],
  ]);
  assert.doesNotMatch(seen[0].options.select, /\*|surface|prompt(?!_tokens)/);
});

test("keeps the Hub read envelope: preview, error and partial are explicit", async () => {
  assert.equal((await readAiUsage({ workspaceId: "", fetchRows: async () => { throw new Error("no read"); } })).status, "preview");
  assert.equal((await readAiUsage({ workspaceId: WORKSPACE, fetchRows: async () => ({ configured: false, rows: null }) })).status, "preview");
  const failed = await readAiUsage({ workspaceId: WORKSPACE, fetchRows: async () => ({ configured: true, rows: null, error: { reason: "http-500" } }) });
  assert.equal(failed.status, "error");
  assert.equal(failed.source, "error");
  let pages = 0;
  const full = Array.from({ length: AI_USAGE_PAGE_SIZE }, () => ({ occurred_at: "2026-09-02T00:00:00Z", model: "gemini-3.5-flash", total_tokens: 1 }));
  const partial = await readAiUsage({ now: NOW, workspaceId: WORKSPACE, fetchRows: async (_table, options) => { assert.equal(options.offset, pages * AI_USAGE_PAGE_SIZE); pages += 1; return { configured: true, rows: full }; } });
  assert.equal(pages, AI_USAGE_MAX_PAGES);
  assert.equal(partial.status, "partial");
  assert.equal(partial.current.calls, AI_USAGE_PAGE_SIZE * AI_USAGE_MAX_PAGES);
});
