import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMultimodalIntake } from "./multimodal-intake.ts";

test("extractMultimodalIntake rejects empty input", async () => {
  const res = await extractMultimodalIntake({ kind: "auto" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("extractMultimodalIntake parses structured JSON from generateFn", async () => {
  const mockPayload = {
    title: "화이트보드 전략 회의",
    summary: "2026 하반기 신규 론칭 일정 논의",
    transcription: "10월 오픈 전까지 베타 테스트 완료할 것",
    actionItems: [
      { task: "베타 신청 페이지 배포", suggestedDue: "2026-09-30", priority: "high" },
    ],
    keyDecisions: ["A안 대신 B안 채택"],
    suggestedTags: ["전략", "베타", "출시"],
    detectedEntities: {
      projects: ["문라이트"],
      peopleOrCompanies: ["클래스인"],
    },
  };

  const fakeGenerate = async (input) => {
    assert.equal(input.responseJsonSchema.type, "object");
    assert.equal(input.responseJsonSchema.properties.title.type, "string");
    assert.equal(input.responseJsonSchema.properties.actionItems.type, "array");
    assert.match(input.prompt, /입력 형식: image/);
    assert.equal(input.media?.length, 1);
    assert.equal(input.media[0].mimeType, "image/jpeg");
    return {
      ok: true,
      status: 200,
      reason: "ok",
      text: JSON.stringify(mockPayload),
    };
  };

  const res = await extractMultimodalIntake(
    {
      kind: "image",
      media: [{ mimeType: "image/jpeg", base64: "dGVzdA==" }],
      text: "화이트보드 사진",
    },
    fakeGenerate,
  );

  assert.equal(res.ok, true);
  assert.equal(res.data.title, "화이트보드 전략 회의");
  assert.equal(res.data.actionItems.length, 1);
  assert.equal(res.data.actionItems[0].task, "베타 신청 페이지 배포");
  assert.deepEqual(res.data.suggestedTags, ["전략", "베타", "출시"]);
  assert.deepEqual(res.data.detectedEntities.projects, ["문라이트"]);
});

test("intake rejects malformed inputs and media without generating", async () => {
  for (const input of [
    null, [], { kind: "auto", text: 12 }, { kind: "unknown", text: "memo" },
    { kind: "auto", text: "memo", instruction: {} },
    { kind: "auto", text: "memo", scope: "unknown" },
    { kind: "image", media: [null] },
    { kind: "image", media: [{ mimeType: "image/jpeg", base64: "not base64" }] },
    { kind: "image", media: [{ mimeType: "text/html", base64: "aGVsbG8=" }] },
    { kind: "text", text: "x".repeat(20001) },
  ]) {
    const result = await extractMultimodalIntake(input, async () => { assert.fail("invalid input must not generate"); });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
});

test("intake rejects malformed model field types instead of reporting success", async () => {
  const valid = {
    title: "메모", summary: "요약", transcription: "본문", actionItems: [],
    keyDecisions: [], suggestedTags: [], detectedEntities: { projects: [], peopleOrCompanies: [] },
  };
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
    const result = await extractMultimodalIntake({ kind: "text", text: "메모" }, async () => ({ ok: true, status: 200, reason: "ok", text: JSON.stringify(payload) }));
    assert.equal(result.ok, false);
    assert.equal(result.data, null);
    assert.equal(typeof result.error, "string");
  }
});

test("intake preserves valid field limits and bounds aggregate decoded media", async () => {
  const data = {
    title: "한".repeat(200), summary: "요약", transcription: "본문",
    actionItems: [{ task: "일".repeat(300), priority: "medium", suggestedDue: "2028-02-29" }],
    keyDecisions: [], suggestedTags: Array(8).fill("가".repeat(32)), detectedEntities: { projects: [], peopleOrCompanies: [] },
  };
  const generated = { ok: true, status: 200, reason: "ok", text: JSON.stringify(data) };
  const accepted = await extractMultimodalIntake({ kind: "audio", media: [{ mimeType: "audio/mp4", base64: Buffer.alloc(14 * 1024 * 1024).toString("base64") }] }, async (input) => {
    assert.equal(input.media[0].mimeType, "audio/m4a");
    return generated;
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.data, data);
  const rejected = await extractMultimodalIntake({ kind: "audio", media: [
    { mimeType: "audio/mp3", base64: Buffer.alloc(7 * 1024 * 1024).toString("base64") },
    { mimeType: "audio/mp3", base64: Buffer.alloc(7 * 1024 * 1024 + 1).toString("base64") },
  ] }, async () => { assert.fail("oversized media must not generate"); });
  assert.equal(rejected.status, 413);
  const failure = await extractMultimodalIntake({ kind: "text", text: "메모" }, async () => { throw new Error("offline"); });
  assert.equal(failure.ok, false);
  assert.equal(failure.status, 502);
});

test("extractMultimodalIntake handles upstream generation failure gracefully", async () => {
  const fakeFailGenerate = async () => ({
    ok: false,
    status: 429,
    reason: "quota-exceeded",
    text: "",
  });

  const res = await extractMultimodalIntake(
    {
      kind: "audio",
      media: [{ mimeType: "audio/mp3", base64: "YXVkaW8=" }],
    },
    fakeFailGenerate,
  );

  assert.equal(res.ok, false);
  assert.equal(res.status, 429);
  assert.equal(res.error, "quota-exceeded");
});
