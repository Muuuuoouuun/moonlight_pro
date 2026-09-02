import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLabelApplyPatch } from "./lead-label-apply-core.mjs";

test("결측 필드에만 제안을 쓰고 label_source를 남긴다 (meta 병합, 무클로버)", () => {
  const { patch, skipped } = buildLabelApplyPatch(
    { intake: "keep-me", enrichment: { tags: ["subject:math"] } },
    { proposedSubjects: ["math"], subjectsSource: "derived", proposedRegion: "경기-안양", regionSource: "searched" },
  );
  assert.deepEqual(skipped, []);
  assert.equal(patch.intake, "keep-me"); // 기존 meta 보존
  assert.deepEqual(patch.enrichment, { tags: ["subject:math"] }); // enrichment 불변
  assert.deepEqual(patch.subjects, ["math"]);
  assert.equal(patch.region, "경기-안양");
  assert.deepEqual(patch.label_source, { subjects: "derived", region: "searched" });
});

test("operator 출처 필드는 절대 덮지 않는다 (재실행 안전)", () => {
  const { patch, skipped } = buildLabelApplyPatch(
    { subjects: ["english"], label_source: { subjects: "operator" } },
    { proposedSubjects: ["math"], subjectsSource: "derived", proposedRegion: "서울-강남", regionSource: "searched" },
  );
  assert.deepEqual(skipped, ["subjects"]);
  assert.deepEqual(patch.subjects, ["english"]); // 불변
  assert.equal(patch.region, "서울-강남"); // region은 결측이었으므로 적용
  assert.equal(patch.label_source.subjects, "operator"); // 출처도 불변
});

test("이미 값이 있는 필드는 출처 무관 스킵, 적용할 것이 없으면 patch=null", () => {
  const locked = buildLabelApplyPatch(
    { subjects: ["korean"], region: "부산" },
    { proposedSubjects: ["math"], subjectsSource: "derived", proposedRegion: "서울", regionSource: "searched" },
  );
  assert.deepEqual(locked.skipped, ["subjects", "region"]);
  assert.equal(locked.patch, null);

  const empty = buildLabelApplyPatch({}, { proposedSubjects: [], proposedRegion: null });
  assert.equal(empty.patch, null);
  assert.deepEqual(empty.skipped, []);
});
