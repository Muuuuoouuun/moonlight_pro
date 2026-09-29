import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMultimodalIntakeHub, formatMeetingBriefForShare, getMultimodalStatus } from "./multimodal-intake-core.js";

test("getMultimodalStatus checks GEMINI_API_KEY", () => {
  const orig = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    assert.equal(getMultimodalStatus().configured, false);
    process.env.GEMINI_API_KEY = "test-key";
    assert.equal(getMultimodalStatus().configured, true);
  } finally {
    if (orig !== undefined) process.env.GEMINI_API_KEY = orig;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("extractMultimodalIntakeHub parses photo and audio response properly", async () => {
  const orig = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  const extractedData = {
    title: "음성 녹음 회의",
    summary: "신규 기능 릴리즈 검토",
    transcription: "금요일까지 프로토타입 완료 예정",
    actionItems: [{ task: "QA 테스트 진행", suggestedDue: "2026-09-26", priority: "high" }],
    keyDecisions: ["금요일 배포 확정"],
    suggestedTags: ["회의", "릴리즈"],
    detectedEntities: {
      projects: ["Moonlight"],
      peopleOrCompanies: [],
    },
  };

  const fakeFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseJsonSchema.type, "object");
    assert.equal(body.generationConfig.responseJsonSchema.properties.title.type, "string");
    assert.equal(body.generationConfig.responseJsonSchema.properties.actionItems.type, "array");
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, "audio/mp3");
    assert.equal(body.contents[0].parts[1].inlineData.data, "bXAzZGF0YQ==");
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(extractedData) }] } }],
      }),
      { status: 200 },
    );
  };

  try {
    const res = await extractMultimodalIntakeHub({
      mediaBase64: "bXAzZGF0YQ==",
      mimeType: "audio/mp3",
      instruction: "회의록 추출",
      fetchImpl: fakeFetch,
    });

    assert.equal(res.ok, true);
    assert.equal(res.data.title, "음성 녹음 회의");
    assert.equal(res.data.actionItems.length, 1);
    assert.equal(res.data.actionItems[0].task, "QA 테스트 진행");
  } finally {
    if (orig !== undefined) process.env.GEMINI_API_KEY = orig;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("intake rejects invalid input before calling Gemini", async () => {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    for (const input of [
      null, [], { text: 12 }, { text: [] }, { text: "memo", instruction: {} },
      { mediaBase64: 123, mimeType: "image/jpeg" },
      { mediaBase64: "not base64", mimeType: "image/jpeg" },
      { mediaBase64: "aGVsbG8=", mimeType: "text/html" },
      { mediaBase64: "aGVsbG8=", mimeType: {} },
      { text: "x".repeat(20001) },
    ]) {
      const result = await extractMultimodalIntakeHub(input === null || Array.isArray(input) ? input : {
        ...input, fetchImpl: async () => { assert.fail("invalid input must not call Gemini"); },
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.equal(result.data, null);
    }
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  }
});

test("intake rejects model fields that would break memo rendering", async () => {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const valid = {
    title: "메모", summary: "요약", transcription: "본문", actionItems: [],
    keyDecisions: [], suggestedTags: [], detectedEntities: { projects: [], peopleOrCompanies: [] },
  };
  try {
    for (const payload of [
      [], {}, { ...valid, title: {} }, { ...valid, summary: 42 },
      { ...valid, transcription: [] }, { ...valid, keyDecisions: [{}] },
      { ...valid, suggestedTags: [null] }, { ...valid, actionItems: [null] },
      { ...valid, actionItems: [{ task: {}, priority: "high" }] },
      { ...valid, actionItems: [{ task: "작업", priority: "urgent" }] },
      { ...valid, actionItems: [{ task: "작업", priority: "high", suggestedDue: {} }] },
      { ...valid, detectedEntities: { projects: [12], peopleOrCompanies: [] } },
      { ...valid, title: "x".repeat(201) }, { ...valid, transcription: "x".repeat(20001) },
      { ...valid, summary: "x".repeat(19995) },
      { ...valid, keyDecisions: ["x".repeat(1001)] }, { ...valid, keyDecisions: Array(21).fill("결정") },
      { ...valid, suggestedTags: Array(9).fill("태그") }, { ...valid, suggestedTags: ["한".repeat(33)] },
      { ...valid, suggestedTags: ["하나,둘"] },
      { ...valid, actionItems: [{ task: "x".repeat(301), priority: "high" }] },
      { ...valid, actionItems: Array(21).fill({ task: "작업", priority: "high" }) },
      ...["내일", "2026-02-29", "2026-04-31", "2026-09-22T00:00:00Z"].map((suggestedDue) => ({ ...valid, actionItems: [{ task: "작업", priority: "high", suggestedDue }] })),
    ]) {
      const result = await extractMultimodalIntakeHub({
        text: "메모",
        fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] })),
      });
      assert.equal(result.ok, false);
      assert.equal(result.data, null);
      assert.equal(typeof result.error, "string");
    }
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  }
});

test("intake preserves valid boundary fields and validates actual dates", async () => {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    for (const suggestedDue of [undefined, null, "", "2028-02-29"]) {
      const data = {
        title: "한".repeat(200), summary: "요약", transcription: "본문",
        actionItems: [{ task: "일".repeat(300), priority: "medium", ...(suggestedDue === undefined ? {} : { suggestedDue }) }],
        keyDecisions: [], suggestedTags: Array(8).fill("가".repeat(32)), detectedEntities: { projects: [], peopleOrCompanies: [] },
      };
      const result = await extractMultimodalIntakeHub({
        mediaBase64: "aGVsbG8=", mimeType: "audio/mp4",
        fetchImpl: async (_url, options) => {
          assert.equal(JSON.parse(options.body).contents[0].parts[1].inlineData.mimeType, "audio/m4a");
          assert.ok(options.signal instanceof AbortSignal);
          return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }));
        },
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, data);
    }
    const failure = await extractMultimodalIntakeHub({ text: "메모", fetchImpl: async () => { throw new Error("offline"); } });
    assert.equal(failure.ok, false);
    assert.equal(failure.data, null);
    const malformedError = await extractMultimodalIntakeHub({ text: "메모", fetchImpl: async () => new Response(JSON.stringify({ error: { message: { nested: true } } }), { status: 429 }) });
    assert.equal(typeof malformedError.error, "string");
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  }
});

test("formatMeetingBriefForShare formats structured data into ready-to-share text", () => {
  const data = {
    title: "10월 마케팅 전략 회의",
    summary: "신규 고객 획득 채널 다변화 논의",
    keyDecisions: ["인스타그램 릴스 2회 발행"],
    openIssues: ["외부 인플루언서 섭외 예산 확정 필요"],
    actionItems: [{ task: "릴스 콘티 작성", suggestedDue: "2026-09-30", priority: "high" }],
    detectedEntities: { projects: ["Moonlight"], peopleOrCompanies: ["홍길동 팀장"] },
  };

  const text = formatMeetingBriefForShare(data);
  assert.match(text, /📌 \[회의\/메모\] 10월 마케팅 전략 회의/);
  assert.match(text, /■ 핵심 요약\n신규 고객 획득 채널 다변화 논의/);
  assert.match(text, /■ 합의 및 결정사항\n• 인스타그램 릴스 2회 발행/);
  assert.match(text, /■ 미결\/후속 논의 안건\n• 외부 인플루언서 섭외 예산 확정 필요/);
  assert.match(text, /■ 후속 실행 과제 \(Action Items\)\n□ 릴스 콘티 작성 \(기한: 2026-09-30\)/);
  assert.match(text, /■ 관련자: 홍길동 팀장/);
  assert.equal(formatMeetingBriefForShare(null), "");
});

test("extractMultimodalIntakeHub supports thinkingBudget and parses meeting minutes with usage", async () => {
  const orig = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  const extracted = {
    title: "주간 운영 회의",
    summary: "운영 현안 및 일정 점검",
    meetingMinutes: "1. 릴리즈 일정 논의 - 10월 초 목표\n2. 예산 점검",
    transcription: "전체 녹음 전사 내용",
    actionItems: [{ task: "배포 파이프라인 확인", priority: "high", suggestedDue: "2026-10-01" }],
    keyDecisions: ["10월 첫째주 릴리즈"],
    openIssues: ["서버 증설 여부"],
    suggestedTags: ["운영", "회의"],
    detectedEntities: { projects: ["Office"], peopleOrCompanies: ["김대표"] },
  };

  try {
    const res = await extractMultimodalIntakeHub({
      text: "회의 녹취록",
      thinkingBudget: 1024,
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 1024);
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(extracted) }] } }],
          usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 80, totalTokenCount: 230 },
        }));
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.data.title, "주간 운영 회의");
    assert.equal(res.data.meetingMinutes, extracted.meetingMinutes);
    assert.deepEqual(res.data.openIssues, ["서버 증설 여부"]);
    assert.deepEqual(res.usage, { promptTokens: 150, candidatesTokens: 80, totalTokens: 230 });
  } finally {
    if (orig !== undefined) process.env.GEMINI_API_KEY = orig;
    else delete process.env.GEMINI_API_KEY;
  }
});
