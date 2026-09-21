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
