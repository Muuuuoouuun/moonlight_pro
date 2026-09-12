import assert from "node:assert/strict";
import { test } from "node:test";

const review = await import("./daily-review.js");
const REQUEST_ID = "41c50d17-85b5-4672-8d05-408fa5a1bf8a";
const base = {
  reviewDate: "2026-09-12", energy: null, focus: "", progress: null,
  note: "", expectedRevision: 0, requestId: REQUEST_ID,
};

test("daily review input helpers are available", () => {
  assert.equal(typeof review.validateDailyReviewInput, "function");
  assert.equal(typeof review.isDailyReviewDate, "function");
  assert.equal(typeof review.getDailyReviewMonthRange, "function");
});

test("each real partial answer can be saved, including zero progress", () => {
  for (const answer of [
    { energy: 2 }, { focus: "개요 작성" }, { progress: "not_applicable" },
    { note: "오늘의 한 줄" }, { focus: "개요 작성", progress: 0 },
  ]) {
    const result = review.validateDailyReviewInput({ ...base, ...answer });
    assert.equal(result.ok, true, JSON.stringify(answer));
    assert.deepEqual(result.value, { ...base, ...answer });
  }
});

test("null, zero and target not applicable retain their different meanings", () => {
  for (const progress of [null, 0, 1, 2, "not_applicable"]) {
    const result = review.validateDailyReviewInput({ ...base, focus: "목표", progress });
    assert.equal(result.ok, true);
    assert.equal(result.value.progress, progress);
  }
  assert.equal(review.validateDailyReviewInput(base).ok, false);
  assert.equal(review.validateDailyReviewInput({ ...base, focus: " \n", note: "\t " }).ok, false);
  assert.equal(review.validateDailyReviewInput({ ...base, progress: 0 }).ok, false);
});

test("full snapshots require all fields and reject coercible or out of range inputs", () => {
  for (const field of Object.keys(base)) {
    const input = { ...base, energy: 2 };
    delete input[field];
    assert.equal(review.validateDailyReviewInput(input).ok, false, field);
  }
  for (const invalid of [
    null, [], "hello", { energy: "2" }, { energy: 0 }, { energy: 6 },
    { energy: 1.5 }, { energy: true }, { energy: NaN },
    { progress: "0" }, { progress: false }, { progress: 3 }, { progress: {} },
    { focus: null }, { focus: [] }, { note: 2 }, { note: false },
    { focus: "x".repeat(501) }, { note: "x".repeat(4001) },
    { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: "0" },
    { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { requestId: "anything" },
  ]) {
    const input = invalid && !Array.isArray(invalid) && typeof invalid === "object"
      ? { ...base, energy: 2, ...invalid } : invalid;
    assert.equal(review.validateDailyReviewInput(input).ok, false, JSON.stringify(invalid));
  }
});

test("input retains the user's text and ignores client workspace, timezone and arbitrary fields", () => {
  const input = {
    ...base, focus: "  첫 단락\n", note: "\n  원문  ", expectedRevision: 3,
    workspaceId: "foreign", workspace_id: "foreign", timezone: "UTC",
    review_revision: 99, scope: "brand", council: { secret: true },
  };
  const result = review.validateDailyReviewInput(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { ...base, focus: input.focus, note: input.note, expectedRevision: 3 });
});

test("calendar keys reject invalid dates and derive inclusive month boundaries", () => {
  for (const date of ["2024-02-29", "2026-09-12", "0001-01-01", "9999-12-31"]) {
    assert.equal(review.isDailyReviewDate(date), true, date);
  }
  for (const date of ["2026-02-29", "2026-09-31", "2026-1-01", "0000-01-01", "2026-09-12T00:00:00Z", null, 20260912]) {
    assert.equal(review.isDailyReviewDate(date), false, String(date));
    assert.equal(review.validateDailyReviewInput({ ...base, energy: 2, reviewDate: date }).ok, false);
  }
  assert.deepEqual(review.getDailyReviewMonthRange("2024-02"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(review.getDailyReviewMonthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(review.getDailyReviewMonthRange("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
  assert.deepEqual(review.getDailyReviewMonthRange("9999-12"), { start: "9999-12-01", end: "9999-12-31" });
  for (const month of ["2026-00", "2026-13", "2026-2", "2026-02-01", "0000-01", null]) {
    assert.equal(review.getDailyReviewMonthRange(month), null);
  }
});
