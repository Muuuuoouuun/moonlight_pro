import assert from "node:assert/strict";
import { test } from "node:test";
import { getVisionStatus, extractBusinessCard } from "./google-vision.js";

test("getVisionStatus recognizes GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY alias", () => {
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    assert.equal(getVisionStatus().configured, false);

    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google-key";
    assert.equal(getVisionStatus().configured, true);
    assert.equal(getVisionStatus().apiKey, "test-google-key");

    process.env.GEMINI_API_KEY = "test-gemini-key";
    assert.equal(getVisionStatus().configured, true);
    assert.equal(getVisionStatus().apiKey, "test-gemini-key");
  } finally {
    if (originalGemini !== undefined) process.env.GEMINI_API_KEY = originalGemini;
    else delete process.env.GEMINI_API_KEY;
    if (originalGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogle;
    else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
});

test("extractBusinessCard sends 2048 token headroom and parses JSON response", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "mock-key";

  let capturedBody = null;
  let capturedHeaders = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              name: "홍길동",
              company: "문라이트 학원",
              phone: "010-1234-5678",
              email: "hong@moonlight.kr",
              title: "원장",
              address: "서울시 강남구",
            }),
          }],
        },
      }],
    }), { status: 200 });
  };

  try {
    const res = await extractBusinessCard("fakeBase64Data");
    assert.equal(res.ok, true);
    assert.equal(res.fields.name, "홍길동");
    assert.equal(res.fields.company, "문라이트 학원");
    assert.equal(capturedHeaders["x-goog-api-key"], "mock-key");
    assert.equal(capturedBody.generationConfig.maxOutputTokens, 2048);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
    else delete process.env.GEMINI_API_KEY;
  }
});
