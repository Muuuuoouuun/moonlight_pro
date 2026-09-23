import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMeetingReviewText, MAX_MEETING_REVIEW_TEXT_LENGTH } from "./meeting-review-extractor.js";

async function withGeminiKey(run) {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try { return await run(); } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
}

function providerReply(data, usageMetadata) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }],
    ...(usageMetadata ? { usageMetadata } : {}),
  }));
}

test("meeting review anchors exact UTF-16 source spans and preserves provider usage", async () => withGeminiKey(async () => {
  const source = "😀 고객 미팅. 가격은 100만원으로 합의했다.\n2026년 9월 30일까지 견적을 보낸다.";
  const quoteOne = "가격은 100만원으로 합의했다.";
  const quoteTwo = "2026년 9월 30일까지 견적을 보낸다.";
  const result = await extractMeetingReviewText({
    text: source,
    fetchImpl: async (url, options) => {
      assert.match(url, /\/models\/gemini-3\.5-flash:generateContent$/);
      assert.equal(options.method, "POST");
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      assert.ok(options.signal instanceof AbortSignal);
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(body.generationConfig.responseJsonSchema.properties.proposals.maxItems, 30);
      assert.ok(body.contents[0].parts[0].text.includes(source));
      return providerReply({
        summary: "가격과 견적 기한을 논의했다.",
        proposals: [
          { kind: "value", text: "가격 100만원", quote: quoteOne, certainty: "stated" },
          { kind: "action", text: "2026-09-30까지 견적을 보낸다", quote: quoteTwo, certainty: "stated", suggestedDue: "2026-09-30" },
          { kind: "signal", text: "이모지", quote: "\uDE00", certainty: "stated" },
        ],
      }, { promptTokenCount: 100, candidatesTokenCount: 40, totalTokenCount: 140 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.model, "gemini-3.5-flash");
  assert.deepEqual(result.usage, { promptTokens: 100, candidatesTokens: 40, totalTokens: 140 });
  assert.equal(result.data.proposals.length, 2);
  for (const proposal of result.data.proposals) {
    assert.equal(source.slice(proposal.start, proposal.end), proposal.quote);
  }
  assert.equal(result.data.proposals[0].start, source.indexOf(quoteOne));
  assert.equal(result.data.proposals[1].suggestedDue, "2026-09-30");
}));

test("meeting review drops fabricated, repeated, unsupported-date and mechanically contradictory candidates", async () => withGeminiKey(async () => {
  const source = "예산은 아직 미정이다. 예약은 보류한다. 예약은 보류한다. 20개를 검토했다. 내일 연락하자. 견적은 보내지 말자.";
  const result = await extractMeetingReviewText({
    text: source,
    fetchImpl: async () => providerReply({
      summary: "예산과 예약을 논의했다.",
      proposals: [
        { kind: "decision", text: "예산이 확정됐다", quote: "예산은 아직 미정이다.", certainty: "stated" },
        { kind: "open_issue", text: "예약 보류", quote: "예약은 보류한다.", certainty: "stated" },
        { kind: "value", text: "예산 500만원", quote: "예산 500만원", certainty: "stated" },
        { kind: "value", text: "30개를 검토했다", quote: "20개를 검토했다.", certainty: "stated" },
        { kind: "value", text: "20건을 검토했다", quote: "20개를 검토했다.", certainty: "stated" },
        { kind: "action", text: "내일 연락", quote: "내일 연락하자.", certainty: "derived", suggestedDue: "2026-09-24" },
        { kind: "action", text: "견적을 보낸다", quote: "견적은 보내지 말자.", certainty: "stated" },
        { kind: "value", text: "20개를 검토했다", quote: "20개를 검토했다.", certainty: "stated" },
      ],
    }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.proposals.map((proposal) => proposal.text), ["20개를 검토했다"]);
}));

test("meeting review allows a genuine empty proposal list and does not invent usage", async () => withGeminiKey(async () => {
  const result = await extractMeetingReviewText({
    text: "회의 시작 인사만 있었다.",
    fetchImpl: async () => providerReply({ summary: "회의 시작 인사만 있었다.", proposals: [] }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.proposals, []);
  assert.equal(result.usage, null);
  const partial = await extractMeetingReviewText({
    text: "회의 시작 인사만 있었다.",
    fetchImpl: async () => providerReply({ summary: "회의 시작 인사만 있었다.", proposals: [] }, { promptTokenCount: 10 }),
  });
  assert.deepEqual(partial.usage, { promptTokens: 10, candidatesTokens: null, totalTokens: null });
}));

test("meeting review rejects invalid model schema but drops individual unanchored quotes", async () => withGeminiKey(async () => {
  const source = "다음 주에 다시 논의한다.";
  for (const invalid of [
    {},
    { summary: 123, proposals: [] },
    { summary: "", proposals: [] },
    { summary: "요약", proposals: "행동" },
    { summary: "요약", proposals: [{ kind: "action", text: "논의", quote: "다음 주", certainty: "certain" }] },
    { summary: "요약", proposals: [{ kind: "action", text: "논의", quote: "다음 주", certainty: "stated", suggestedDue: "2026-02-29" }] },
  ]) {
    const result = await extractMeetingReviewText({ text: source, fetchImpl: async () => providerReply(invalid) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid-provider-response");
    assert.equal(result.data, null);
  }
  const result = await extractMeetingReviewText({
    text: source,
    fetchImpl: async () => providerReply({ summary: "다시 논의한다.", proposals: [{ kind: "action", text: "회의", quote: "회의는 없다", certainty: "stated" }] }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.proposals, []);
}));

test("meeting review validates source bounds before a provider call and missing configuration separately", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; assert.fail("Gemini must not be called"); };
  for (const text of ["", "   ", "a\0b", "x".repeat(MAX_MEETING_REVIEW_TEXT_LENGTH + 1), 123]) {
    const result = await extractMeetingReviewText({ text, fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
  assert.equal(calls, 0);
  const previous = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const missing = await extractMeetingReviewText({ text: "원문", fetchImpl });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "gemini-not-configured");
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
  assert.equal(calls, 0);
  await withGeminiKey(async () => {
    const boundary = await extractMeetingReviewText({
      text: "가".repeat(MAX_MEETING_REVIEW_TEXT_LENGTH),
      fetchImpl: async () => providerReply({ summary: "원문 텍스트", proposals: [] }),
    });
    assert.equal(boundary.ok, true);
  });
});

test("meeting review reports provider HTTP, network and malformed JSON failures without fabricated success", async () => withGeminiKey(async () => {
  const cases = [
    { fetchImpl: async () => new Response("down", { status: 503 }), reason: "provider-error" },
    { fetchImpl: async () => { throw new Error("offline"); }, reason: "provider-unavailable" },
    { fetchImpl: async () => new Response("not-json"), reason: "invalid-provider-response" },
  ];
  for (const item of cases) {
    const result = await extractMeetingReviewText({ text: "원문", fetchImpl: item.fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.reason, item.reason);
    assert.equal(result.data, null);
  }
}));
