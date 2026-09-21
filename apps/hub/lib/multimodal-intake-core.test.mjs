import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMultimodalIntakeHub, getMultimodalStatus } from "./multimodal-intake-core.js";

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
