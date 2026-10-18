import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_GEMINI_MODEL, geminiGenerationConfig, resolveGeminiModel } from "./gemini-model.js";

test("the hub defaults to Gemini 4 and still honors GEMINI_MODEL", () => {
  const before = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_MODEL;
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-4-argon");
    assert.equal(resolveGeminiModel(), "gemini-4-argon");
    process.env.GEMINI_MODEL = "  gemini-3.5-flash ";
    assert.equal(resolveGeminiModel(), "gemini-3.5-flash");
  } finally {
    if (before === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = before;
  }
});

test("Gemini 4 drops sampling knobs and thinkingBudget; 3 drops thinkingBudget; 2.5 keeps both", () => {
  const config = { responseMimeType: "application/json", temperature: 0.1, topP: 0.9, topK: 40, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } };
  assert.deepEqual(geminiGenerationConfig("gemini-4-argon", config), { responseMimeType: "application/json", maxOutputTokens: 8192 });
  assert.deepEqual(geminiGenerationConfig("gemini-3.5-flash", config), { responseMimeType: "application/json", temperature: 0.1, topP: 0.9, topK: 40, maxOutputTokens: 8192 });
  assert.deepEqual(geminiGenerationConfig("gemini-2.5-flash", config), config);
  assert.deepEqual(geminiGenerationConfig("gemini-4-argon", { thinkingConfig: { thinkingBudget: 1, thinkingLevel: "low" } }), { thinkingConfig: { thinkingLevel: "low" } });
  assert.equal(config.temperature, 0.1, "the caller's object is not mutated");
  assert.deepEqual(config.thinkingConfig, { thinkingBudget: 1024 });
});
