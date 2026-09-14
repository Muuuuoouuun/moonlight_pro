import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { getDailyReviewMonthRange, isDailyReviewDate, validateDailyReviewInput } from "../daily-review.js";
import { resolveRhythmTimeZone, toZonedDateKey } from "../rhythm-calendar.js";
import { isCanonicalUuid } from "../uuid.js";

const REVIEW_SELECT = "id,workspace_id,entry_kind,review_date,review_timezone,focus_target,review_data,body,review_revision,updated_at";
const CONFLICT_ERRORS = new Set(["stale-revision", "date-exists", "revision-without-review", "request-id-reused"]);

function baseEnvelope(configured = false, timezone = resolveRhythmTimeZone(null)) {
  return { configured, timezone, review: null, entries: [] };
}

function readError(base, error = "read-failed", message = "하루 리뷰를 불러오지 못했어요. 다시 시도해 주세요.") {
  return { ...base, status: "error", review: null, entries: [], error, message };
}

async function resolveReviewContext() {
  const workspaceId = resolveDefaultWorkspaceId();
  const configured = Boolean(resolveSupabaseConfig() && workspaceId);
  const base = baseEnvelope(configured);
  if (!configured) return { ...base, status: "preview" };
  if (!isCanonicalUuid(workspaceId)) return readError(base, "invalid-workspace-config");

  const rows = await fetchSupabaseRows("workspaces", {
    select: "id,timezone,meta", filters: [["id", eqFilter(workspaceId)]], limit: 1,
  });
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== workspaceId) {
    return readError(base, "workspace-unavailable");
  }
  const configuredTimezone = typeof rows[0].timezone === "string" && rows[0].timezone.trim()
    ? rows[0].timezone : rows[0].meta?.timezone;
  return { ...base, status: "live", workspaceId, timezone: resolveRhythmTimeZone(configuredTimezone) };
}

function reviewFromRow(row, workspaceId) {
  if (!row || row.workspace_id !== workspaceId || row.entry_kind !== "daily_review" || !isCanonicalUuid(row.id)) return null;
  if (!Number.isSafeInteger(row.review_revision) || row.review_revision < 1) return null;
  if (typeof row.review_timezone !== "string" || resolveRhythmTimeZone(row.review_timezone) !== row.review_timezone) return null;
  if (typeof row.updated_at !== "string" || Number.isNaN(new Date(row.updated_at).getTime())) return null;
  const answer = validateDailyReviewInput({
    reviewDate: row.review_date, energy: row.review_data?.energy,
    focus: row.focus_target, progress: row.review_data?.progress, note: row.body,
    expectedRevision: row.review_revision, requestId: row.id,
  });
  if (!answer.ok) return null;
  return {
    id: row.id, reviewDate: row.review_date, timezone: row.review_timezone,
    energy: answer.value.energy, focus: answer.value.focus, progress: answer.value.progress,
    note: answer.value.note, revision: row.review_revision, updatedAt: row.updated_at,
  };
}

export async function getDailyReviewLedger({ date = null, month = null, now = new Date() } = {}) {
  let base = baseEnvelope(Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()));
  if (date !== null && !isDailyReviewDate(date)) return readError(base, "invalid-date", "올바른 날짜를 선택해 주세요.");
  if (month !== null && !getDailyReviewMonthRange(month)) return readError(base, "invalid-month", "올바른 월을 선택해 주세요.");
  try {
    const context = await resolveReviewContext();
    base = baseEnvelope(context.configured, context.timezone);
    const reviewDate = date ?? toZonedDateKey(now, context.timezone);
    const selectedMonth = month ?? reviewDate.slice(0, 7);
    base = { ...base, reviewDate, month: selectedMonth };
    if (context.status !== "live") {
      return { ...base, status: context.status, ...(context.error ? { error: context.error, message: context.message } : {}) };
    }
    const range = getDailyReviewMonthRange(selectedMonth);
    if (!isDailyReviewDate(reviewDate) || !range) return readError(base, "invalid-date");
    const filters = [["workspace_id", eqFilter(context.workspaceId)], ["entry_kind", eqFilter("daily_review")]];
    const [selectedRows, monthRows] = await Promise.all([
      fetchSupabaseRows("journal_entries", {
        select: REVIEW_SELECT, filters: [...filters, ["review_date", eqFilter(reviewDate)]], limit: 2,
      }),
      fetchSupabaseRows("journal_entries", {
        select: REVIEW_SELECT, filters: [...filters, ["review_date", `gte.${range.start}`], ["review_date", `lte.${range.end}`]],
        order: "review_date.desc", limit: 31,
      }),
    ]);
    if (!Array.isArray(selectedRows) || selectedRows.length > 1 || !Array.isArray(monthRows) || monthRows.length > 31) return readError(base);
    const review = selectedRows.length ? reviewFromRow(selectedRows[0], context.workspaceId) : null;
    if (selectedRows.length && (!review || review.reviewDate !== reviewDate)) return readError(base);
    const summaries = monthRows.map((row) => reviewFromRow(row, context.workspaceId));
    if (summaries.some((entry) => !entry || entry.reviewDate < range.start || entry.reviewDate > range.end)
      || new Set(summaries.map((entry) => entry.reviewDate)).size !== summaries.length) return readError(base);
    const entries = summaries.map(({ note, ...entry }) => ({ ...entry, excerpt: note.slice(0, 180) }));
    return { ...base, status: "live", review, entries };
  } catch {
    return readError(base);
  }
}

function writeError(base, httpStatus = 502, error = "save-failed") {
  return {
    ...base, status: "error", httpStatus, review: null, error, retryable: true,
    message: httpStatus === 503 ? "저장 연결이 준비되지 않았어요. 입력은 그대로 남아 있어요." : "저장을 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.",
  };
}

export async function saveDailyReview(payload) {
  const validation = validateDailyReviewInput(payload);
  if (!validation.ok) {
    return { status: "invalid-input", httpStatus: 400, review: null, error: validation.error, message: validation.message, retryable: false };
  }
  let base = baseEnvelope(Boolean(resolveSupabaseConfig() && resolveDefaultWorkspaceId()));
  try {
    const context = await resolveReviewContext();
    base = baseEnvelope(context.configured, context.timezone);
    if (context.status === "preview") return writeError(base, 503, "missing-persistence");
    if (context.status !== "live") return writeError(base, 502, "workspace-unavailable");
    const value = validation.value;
    const result = await invokeSupabaseRpc("save_daily_review_v1", {
      p_workspace_id: context.workspaceId, p_review_date: value.reviewDate, p_timezone: context.timezone,
      p_energy: value.energy, p_focus: value.focus, p_progress: value.progress, p_note: value.note,
      p_expected_revision: value.expectedRevision, p_request_id: value.requestId,
    });
    if (!result.ok) return writeError(base, result.error === "missing-config" ? 503 : 502);
    const data = result.data;
    if (!data || !["saved", "duplicate", "conflict", "invalid-input"].includes(data.status)) return writeError(base);
    if (data.status === "invalid-input") {
      return { ...base, status: "invalid-input", httpStatus: 400, error: "invalid-input", message: "하루 리뷰 입력을 확인해 주세요.", retryable: false };
    }
    const review = data.review === null ? null : reviewFromRow(data.review, context.workspaceId);
    if ((data.review !== null && !review) || (review && review.reviewDate !== value.reviewDate)) return writeError(base);
    if (data.status === "conflict") {
      return {
        ...base, status: "conflict", httpStatus: 409, review, retryable: false,
        error: CONFLICT_ERRORS.has(data.error) ? data.error : "revision-conflict",
        message: "다른 저장 내용이 있어요. 현재 기록을 확인한 뒤 다시 저장해 주세요.",
      };
    }
    if (!review) return writeError(base);
    return { ...base, status: data.status, review };
  } catch {
    return writeError(base);
  }
}
