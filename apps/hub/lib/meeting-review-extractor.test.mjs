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

test("meeting review separates my action, explicit deadline, method and ordered checklist by exact source spans", async () => withGeminiKey(async () => {
  const quote = "내 할 일: 2026년 10월 2일까지 고객에게 이메일로 견적을 보내기. 체크: 가격 확인, PDF 만들기, 발송.";
  const source = `😀 미팅 메모. ${quote}`;
  const result = await extractMeetingReviewText({
    text: source,
    fetchImpl: async () => providerReply({ summary: "견적 발송을 논의했다.", proposals: [{
      kind: "action", text: "고객에게 이메일로 견적을 보낸다", quote, certainty: "stated", suggestedDue: "2026-10-02",
      actionScope: "mine", relationQuote: "내 할 일",
      dateMentions: [{ quote: "2026년 10월 2일까지", role: "deadline", date: "2026-10-02" }],
      methodQuote: "이메일로", checklistQuotes: ["가격 확인", "PDF 만들기", "발송"],
    }] }),
  });
  assert.equal(result.ok, true);
  const [proposal] = result.data.proposals;
  assert.equal(proposal.actionScope, "mine");
  assert.equal(proposal.suggestedDue, "2026-10-02");
  assert.equal(proposal.methodQuote, "이메일로");
  assert.equal(source.slice(proposal.relation.start, proposal.relation.end), "내 할 일");
  assert.deepEqual(proposal.dateMentions.map(({ quote: item, role, date }) => ({ quote: item, role, date })), [
    { quote: "2026년 10월 2일까지", role: "deadline", date: "2026-10-02" },
  ]);
  assert.deepEqual(proposal.checklist.map(({ quote: item }) => item), ["가격 확인", "PDF 만들기", "발송"]);
  for (const item of [...proposal.dateMentions, ...proposal.checklist]) {
    assert.equal(source.slice(item.start, item.end), item.quote);
    assert.ok(item.start >= proposal.start && item.end <= proposal.end);
  }
}));

test("meeting review keeps related watchpoint distinct from my task and a scheduled visit distinct from its deadline", async () => withGeminiKey(async () => {
  const quote = "영업팀은 2026년 10월 3일 고객을 방문하고 결과를 운영자에게 공유한다.";
  const result = await extractMeetingReviewText({
    text: quote,
    fetchImpl: async () => providerReply({ summary: "방문 결과 공유를 논의했다.", proposals: [{
      kind: "action", text: "영업팀 방문 결과를 확인", quote, certainty: "stated", suggestedDue: "2026-10-03",
      actionScope: "related", relationQuote: "운영자에게 공유",
      dateMentions: [{ quote: "2026년 10월 3일 고객을 방문", role: "scheduled", date: "2026-10-03" }],
      methodQuote: null, checklistQuotes: [],
    }] }),
  });
  assert.equal(result.ok, true);
  const [proposal] = result.data.proposals;
  assert.equal(proposal.actionScope, "related");
  assert.equal(proposal.suggestedDue, undefined);
  assert.equal(proposal.dateMentions[0].role, "scheduled");
  assert.equal(proposal.dateMentions[0].date, "2026-10-03");
  assert.deepEqual(proposal.checklist, []);
}));

test("meeting review does not borrow a second date's deadline wording for a scheduled date", async () => withGeminiKey(async () => {
  const quote = "2026년 10월 3일 고객 방문, 2026년 10월 5일까지 방문 결과 보고.";
  const result = await extractMeetingReviewText({
    text: quote,
    fetchImpl: async () => providerReply({ summary: "방문과 보고 일정이 있다.", proposals: [{
      kind: "action", text: "고객 방문 후 결과 보고", quote, certainty: "stated", suggestedDue: "2026-10-03",
      dateMentions: [
        { quote: "2026년 10월 3일 고객 방문", role: "deadline", date: "2026-10-03" },
        { quote: "2026년 10월 5일까지", role: "deadline", date: "2026-10-05" },
      ],
    }] }),
  });
  assert.equal(result.ok, true);
  const [proposal] = result.data.proposals;
  assert.equal(proposal.suggestedDue, undefined);
  assert.deepEqual(proposal.dateMentions.map(({ role, date }) => ({ role, date })), [
    { role: "reference", date: "2026-10-03" },
    { role: "deadline", date: "2026-10-05" },
  ]);
}));

test("meeting review does not assign an undiarized first-person promise or invent method and checklist", async () => withGeminiKey(async () => {
  const quote = "제가 내일 고객에게 연락하겠습니다.";
  const result = await extractMeetingReviewText({
    text: quote,
    fetchImpl: async () => providerReply({ summary: "후속 연락 언급이 있었다.", proposals: [{
      kind: "action", text: "고객에게 연락", quote, certainty: "stated", suggestedDue: null,
      actionScope: "mine", relationQuote: "제가", dateMentions: [{ quote: "내일", role: "deadline", date: "2026-09-24" }],
      methodQuote: "전화로", checklistQuotes: ["자료 준비", "전화 걸기"],
    }] }),
  });
  assert.equal(result.ok, true);
  const [proposal] = result.data.proposals;
  assert.equal(proposal.actionScope, "unknown");
  assert.equal(proposal.relation, undefined);
  assert.equal(proposal.dateMentions[0].quote, "내일");
  assert.equal(proposal.dateMentions[0].date, null);
  assert.equal(proposal.methodQuote, undefined);
  assert.deepEqual(proposal.checklist, []);
}));

test("meeting review does not promote a negated responsibility or sharing relation from a short positive substring", async () => withGeminiKey(async () => {
  const cases = [
    { quote: "내 할 일은 아니다. 영업팀이 연락한다.", scope: "mine", relationQuote: "내 할 일" },
    { quote: "내 할 일은 보류됐다. 영업팀이 연락한다.", scope: "mine", relationQuote: "내 할 일" },
    { quote: "운영자에게 공유하지 않는다. 영업팀이 확인한다.", scope: "related", relationQuote: "운영자에게 공유" },
    { quote: "운영자에게 공유는 취소됐다. 영업팀이 확인한다.", scope: "related", relationQuote: "운영자에게 공유" },
  ];
  for (const item of cases) {
    const result = await extractMeetingReviewText({
      text: item.quote,
      fetchImpl: async () => providerReply({ summary: "업무 담당을 논의했다.", proposals: [{
        kind: "action", text: item.quote, quote: item.quote, certainty: "stated",
        actionScope: item.scope, relationQuote: item.relationQuote,
      }] }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.proposals.length, 1);
    assert.equal(result.data.proposals[0].actionScope, "unknown", item.quote);
    assert.equal(result.data.proposals[0].relation, undefined);
  }
  const positive = "내 할 일: 영업팀에 연락한다.";
  const accepted = await extractMeetingReviewText({
    text: positive,
    fetchImpl: async () => providerReply({ summary: "연락할 일을 논의했다.", proposals: [{
      kind: "action", text: "영업팀에 연락한다", quote: positive, certainty: "stated",
      actionScope: "mine", relationQuote: "내 할 일",
    }] }),
  });
  assert.equal(accepted.data.proposals[0].actionScope, "mine");
}));

test("meeting review removes an unsupported suggested date without hiding its grounded action", async () => withGeminiKey(async () => {
  const quote = "내 할 일: 견적을 보낸다.";
  const result = await extractMeetingReviewText({
    text: quote,
    fetchImpl: async () => providerReply({ summary: "견적 발송을 논의했다.", proposals: [{
      kind: "action", text: "견적을 보낸다", quote, certainty: "stated", suggestedDue: "2026-10-01",
      actionScope: "mine", relationQuote: "내 할 일", dateMentions: [],
    }] }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.proposals.length, 1);
  assert.equal(result.data.proposals[0].actionScope, "mine");
  assert.equal(result.data.proposals[0].suggestedDue, undefined);
}));

test("meeting review discards repeated or reordered checklist excerpts instead of fabricating execution order", async () => withGeminiKey(async () => {
  const quote = "초안 작성, 검토, 초안 작성, 발송.";
  const result = await extractMeetingReviewText({
    text: quote,
    fetchImpl: async () => providerReply({ summary: "초안과 발송을 논의했다.", proposals: [{
      kind: "action", text: "초안 작업", quote, certainty: "stated",
      checklistQuotes: ["발송", "검토", "초안 작성"], methodQuote: null,
    }] }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.proposals[0].checklist, []);
}));

test("meeting review drops fabricated, repeated and contradictory candidates but strips unsupported dates", async () => withGeminiKey(async () => {
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
  assert.deepEqual(result.data.proposals.map((proposal) => proposal.text), ["내일 연락", "20개를 검토했다"]);
  assert.equal(result.data.proposals[0].suggestedDue, undefined);
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
