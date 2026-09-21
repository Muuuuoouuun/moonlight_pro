import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("memo-capture component includes multimodal photo and audio intake controls", () => {
  const source = readFileSync(new URL("./memo-capture.jsx", import.meta.url), "utf8");

  assert.match(source, /aria-label="사진 또는 음성 AI 분석"/);
  assert.match(source, /accept="image\/\*,audio\/\*/);
  assert.match(source, /\/api\/hub\/intake\/multimodal/);
  assert.match(source, /\/api\/hub\/tasks/);
  assert.match(source, /role="region"\s+aria-label="AI 멀티모달 추출 결과"/);
  assert.match(source, /isMediaFile\(file\)/);
  assert.match(source, /readMediaFileBase64\(file\)/);
});
