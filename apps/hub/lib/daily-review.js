import { isCanonicalUuid } from "./uuid.js";

const INPUT_FIELDS = ["reviewDate", "energy", "focus", "progress", "note", "expectedRevision", "requestId"];

export function isDailyReviewDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Both bounds are inclusive, including December of year 9999.
export function getDailyReviewMonthRange(month) {
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month) || !isDailyReviewDate(`${month}-01`)) return null;
  const end = new Date(`${month}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { start: `${month}-01`, end: end.toISOString().slice(0, 10) };
}

function invalid(error, message) {
  return { ok: false, error, message };
}

export function validateDailyReviewInput(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalid("invalid-input", "하루 리뷰 입력을 확인해 주세요.");
  }
  if (INPUT_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(payload, field))) {
    return invalid("incomplete-snapshot", "날짜와 모든 입력 항목을 함께 보내 주세요.");
  }
  const { reviewDate, energy, focus, progress, note, expectedRevision, requestId } = payload;
  if (!isDailyReviewDate(reviewDate)) return invalid("invalid-date", "올바른 날짜를 선택해 주세요.");
  if (energy !== null && !(Number.isInteger(energy) && energy >= 1 && energy <= 5)) {
    return invalid("invalid-energy", "에너지는 1부터 5까지 선택하거나 비워 둘 수 있어요.");
  }
  if (typeof focus !== "string" || focus.length > 500) return invalid("invalid-focus", "오늘의 목표는 500자 이내로 입력해 주세요.");
  if (![null, 0, 1, 2, "not_applicable"].includes(progress)) return invalid("invalid-progress", "진척 항목을 다시 선택해 주세요.");
  if (typeof note !== "string" || note.length > 4000) return invalid("invalid-note", "메모는 4000자 이내로 입력해 주세요.");
  if (typeof progress === "number" && !focus.trim()) return invalid("missing-focus", "진척을 평가할 오늘의 목표를 입력해 주세요.");
  if (energy === null && !focus.trim() && progress === null && !note.trim()) {
    return invalid("empty-review", "하나 이상의 항목을 기록해 주세요.");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return invalid("invalid-revision", "저장할 기록의 버전을 확인해 주세요.");
  }
  if (!isCanonicalUuid(requestId)) return invalid("invalid-request-id", "저장 요청을 다시 준비해 주세요.");
  return {
    ok: true,
    value: { reviewDate, energy, focus, progress, note, expectedRevision, requestId: requestId.toLowerCase() },
  };
}
