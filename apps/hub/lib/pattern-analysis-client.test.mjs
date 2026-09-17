import test from "node:test";
import assert from "node:assert/strict";
import { forwardPatternAnalysis } from "./pattern-analysis-client.js";

test("forwardPatternAnalysis returns preview mode when engine is not configured", async () => {
  const result = await forwardPatternAnalysis(
    {
      requestId: "11111111-1111-4111-8111-111111111111",
      goal: "sales_insight",
      records: [{ id: "r1", body: "고객 메모", occurredAt: "2026-09-10" }],
    },
    { env: {} }
  );

  assert.equal(result.httpStatus, 202);
  assert.equal(result.data.status, "preview");
  assert.ok(result.data.patterns.length >= 1);
  assert.equal(result.data.patterns[0].evidenceQuotes[0].journalId, "r1");
});

test("forwardPatternAnalysis forwards valid payload to engine endpoint with secret header", async () => {
  let capturedUrl = "";
  let capturedHeaders = {};
  let capturedBody = {};

  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    capturedBody = JSON.parse(options.body);

    return {
      status: 200,
      json: async () => ({
        status: "succeeded",
        requestId: capturedBody.requestId,
        patterns: [{ id: "p1", title: "성공 패턴" }],
      }),
    };
  };

  const result = await forwardPatternAnalysis(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      goal: "content_hook",
      records: [{ id: "r2", body: "콘텐츠 메모" }],
    },
    {
      env: {
        COM_MOON_ENGINE_URL: "https://engine.test",
        COM_MOON_SHARED_WEBHOOK_SECRET: "test-secret-123",
      },
      fetchImpl: fakeFetch,
    }
  );

  assert.equal(result.httpStatus, 200);
  assert.equal(capturedUrl, "https://engine.test/api/ai/pattern-analyze");
  assert.equal(capturedHeaders["x-com-moon-shared-secret"], "test-secret-123");
  assert.equal(result.data.status, "succeeded");
  assert.equal(result.data.patterns[0].title, "성공 패턴");
});
