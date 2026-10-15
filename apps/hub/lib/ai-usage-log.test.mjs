import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AI_USAGE_TABLE, buildAiUsageRow, recordAiUsage } from "./ai-usage-log.js";
import { extractMeetingReviewText } from "./meeting-review-extractor.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const USAGE = { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 6, totalTokenCount: 20 };

test("hub usage rows match the engine shape and hold no free text", () => {
  const row = buildAiUsageRow({ surface: "hub-meeting-review", model: "gemini-3.5-flash", usageMetadata: USAGE, text: "회의 원문" }, WORKSPACE);
  assert.deepEqual(row, { workspace_id: WORKSPACE, surface: "hub-meeting-review", model: "gemini-3.5-flash", prompt_tokens: 10, output_tokens: 4, thinking_tokens: 6, total_tokens: 20 });
  assert.equal(buildAiUsageRow({ surface: "고객 이름", model: "x", usageMetadata: USAGE }, WORKSPACE).surface, "unknown");
  assert.equal(buildAiUsageRow({ surface: "x", model: "x", usageMetadata: {} }, WORKSPACE), null);
});

test("hub recording never throws, skips without storage and swallows write failures", async () => {
  assert.equal(recordAiUsage({ surface: "x", model: "m", usageMetadata: USAGE }, { configured: false, workspaceId: WORKSPACE }), null);
  assert.equal(await recordAiUsage({ surface: "x", model: "m", usageMetadata: USAGE }, { configured: true, workspaceId: WORKSPACE, insert: () => { throw new Error("sync"); } }), null);
  assert.equal(await recordAiUsage({ surface: "x", model: "m", usageMetadata: USAGE }, { configured: true, workspaceId: WORKSPACE, insert: async () => { throw new Error("db"); } }), null);
  let seen;
  await recordAiUsage({ surface: "x", model: "m", usageMetadata: USAGE }, { configured: true, workspaceId: WORKSPACE, insert: async (table, row, options) => { seen = { table, row, options }; } });
  assert.equal(seen.table, AI_USAGE_TABLE);
  assert.ok(seen.options.timeoutMs <= 5000);
});

test("meeting review answers even when the usage write hangs, and the log gets counts only", async () => {
  const names = ["GEMINI_API_KEY", "GEMINI_MODEL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "COM_MOON_DEFAULT_WORKSPACE_ID"];
  const before = { fetch: globalThis.fetch, env: Object.fromEntries(names.map((name) => [name, process.env[name]])) };
  Object.assign(process.env, { GEMINI_API_KEY: "local-test-key", GEMINI_MODEL: "gemini-3.5-flash", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "db-test", COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE });
  const writes = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    globalThis.fetch = async (url, init) => { writes.push({ url: String(url), body: init.body }); await gate; return new Response(null, { status: 201 }); };
    const provider = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "요약", proposals: [] }) }] } }],
      usageMetadata: USAGE,
    }));
    const result = await extractMeetingReviewText({ text: "김철수 대표와 가격 협의", fetchImpl: provider });
    assert.equal(result.ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(writes.length, 1);
    assert.match(writes[0].url, /\/rest\/v1\/ai_usage_log/);
    assert.equal(JSON.parse(writes[0].body).surface, "hub-meeting-review");
    assert.doesNotMatch(writes[0].body, /김철수|가격|요약/);
  } finally {
    release();
    globalThis.fetch = before.fetch;
    for (const [name, value] of Object.entries(before.env)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test("each Hub path that calls Gemini directly records its usage", async () => {
  const expected = { "./multimodal-intake-core.js": "hub-multimodal-intake", "./meeting-review-extractor.js": "hub-meeting-review", "./google-vision.js": "hub-business-card" };
  for (const [file, surface] of Object.entries(expected)) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /:generateContent/);
    assert.match(source, new RegExp(`surface: "${surface}"`), file);
  }
  // A client page imports multimodal-intake-core; the Supabase writer stays out of its static graph.
  const multimodal = await readFile(new URL("./multimodal-intake-core.js", import.meta.url), "utf8");
  assert.doesNotMatch(multimodal, /^import .*ai-usage-log/m);
});
