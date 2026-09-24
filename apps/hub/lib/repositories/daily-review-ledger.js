import { eqFilter, fetchSupabaseRows } from "@/lib/server-read";
import { invokeSupabaseRpc, resolveDefaultWorkspaceId, resolveSupabaseConfig } from "@/lib/server-write";
import { getDailyReviewMonthRange, isDailyReviewDate, validateDailyReviewInput } from "../daily-review.js";
import { resolveRhythmTimeZone, toZonedDateKey } from "../rhythm-calendar.js";
import { isCanonicalUuid } from "../uuid.js";
import { isContactActivity } from "../contact-activity.js";
import { MAX_FOCUS_PER_DAY } from "../task-today.js";
import { REVIEW_RECENT_DAYS, recentRange } from "../daily-review-rhythm.js";
import { activityWindow, covers, tallyActivity } from "../review-activity.js";
import { shiftDateKey } from "../rhythm-calendar.js";

const REVIEW_SELECT = "id,workspace_id,entry_kind,review_date,review_timezone,focus_target,review_data,body,review_revision,updated_at";
// 저녁 리뷰의 "연락 N건"이 훑는 crm_activities 행 수 상한(리뷰 날짜 ±1일).
export const ACTIVITY_SCAN_LIMIT = 200;
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

// 저녁 리뷰 팝업의 읽기 전용 두 줄 — 그날 오늘 3개(k/n)와 연락 기록 수. 원천은 주간 카드와 같다
// (tasks.meta.focus_dates·completed_at, crm_activities.occurred_at — 2026-09-20 §6.3). 어느 기록이든
// 못 읽으면 null — 팝업은 줄을 숨기고, 리뷰 저장 자체는 영향받지 않는다.
export async function readTodaySignals({ workspaceId, timezone, reviewDate }) {
  const dayStart = new Date(`${reviewDate}T00:00:00Z`);
  if (Number.isNaN(dayStart.getTime())) return null;
  // 시간대 오프셋을 계산하지 않고 UTC 기준 ±1일을 읽은 뒤 운영자 시간대 날짜로 거른다.
  const since = new Date(dayStart.getTime() - 86400e3).toISOString();
  const until = new Date(dayStart.getTime() + 2 * 86400e3).toISOString();
  const workspace = ["workspace_id", eqFilter(workspaceId)];
  const [taskRows, activityRows] = await Promise.all([
    fetchSupabaseRows("tasks", {
      select: "id,title,status,completed_at,meta",
      filters: [workspace, ["meta->focus_dates", `cs.${JSON.stringify([reviewDate])}`]],
      limit: 20,
    }),
    fetchSupabaseRows("crm_activities", {
      select: "id,kind,occurred_at",
      filters: [workspace, ["occurred_at", `gte.${since}`], ["occurred_at", `lte.${until}`]],
      // 상한보다 하나 더 읽어 잘림을 감지한다 — 잘린 줄 모르고 세면 "연락 12건"처럼 사실보다
      // 적은 수를 확신에 차서 말한다(허브 read 계약: 읽기 결손을 작은 값으로 위장하지 않는다).
      limit: ACTIVITY_SCAN_LIMIT + 1,
    }),
  ]);
  if (!Array.isArray(taskRows) || !Array.isArray(activityRows)) return null;
  const sameDay = (value) => Boolean(value) && toZonedDateKey(new Date(value), timezone) === reviewDate;
  const picked = taskRows.filter((row) => Array.isArray(row?.meta?.focus_dates) && row.meta.focus_dates.includes(reviewDate));
  const done = picked.filter((row) => row.status === "done" && sameDay(row.completed_at));
  const contacts = activityRows.filter((row) => isContactActivity(row) && sameDay(row.occurred_at));
  return {
    date: reviewDate,
    focusPicked: picked.length,
    focusDone: done.length,
    focusLimit: MAX_FOCUS_PER_DAY,
    // 저녁 리뷰의 "오늘 3개" 권장 카드가 목표 문구로 쓴다(2026-09-23 §4.4). 제목 없는 행은 뺀다.
    focusTitles: picked.map((row) => (typeof row.title === "string" ? row.title.trim() : "")).filter(Boolean).slice(0, MAX_FOCUS_PER_DAY),
    // 잘렸으면 숫자 대신 null — 팝업이 연락 줄만 빼고 오늘 3개는 그대로 말한다.
    contacts: activityRows.length > ACTIVITY_SCAN_LIMIT ? null : contacts.length,
  };
}

// 활동 흐름(2026-09-23 §12) — 원천별 행 상한. 넘으면 그 원천은 잘린 것이라 missing으로 돌린다.
export const ACTIVITY_ROW_LIMIT = 2000;

async function readCapped(table, options) {
  const rows = await fetchSupabaseRows(table, { ...options, limit: ACTIVITY_ROW_LIMIT + 1 }).catch(() => null);
  return Array.isArray(rows) && rows.length <= ACTIVITY_ROW_LIMIT ? rows : null;
}

// from~to(운영자 시간대 날짜) 사이 날짜별 활동 수. 시간대 오프셋을 계산하지 않고 UTC 기준 ±1일을 읽은 뒤
// tallyActivity가 운영자 날짜로 거른다(readTodaySignals와 같은 방식).
export async function readReviewActivity({ workspaceId, timezone, from, to }) {
  const since = `${shiftDateKey(from, -1)}T00:00:00.000Z`;
  const until = `${shiftDateKey(to, 2)}T00:00:00.000Z`;
  const workspace = ["workspace_id", eqFilter(workspaceId)];
  const [tasks, activities, memos, reviews] = await Promise.all([
    readCapped("tasks", { select: "completed_at", filters: [workspace, ["status", eqFilter("done")], ["completed_at", `gte.${since}`], ["completed_at", `lt.${until}`]] }),
    readCapped("crm_activities", { select: "kind,occurred_at", filters: [workspace, ["occurred_at", `gte.${since}`], ["occurred_at", `lt.${until}`]] }),
    readCapped("journal_entries", { select: "created_at", filters: [workspace, ["entry_kind", eqFilter("note")], ["created_at", `gte.${since}`], ["created_at", `lt.${until}`]] }),
    readCapped("journal_entries", { select: "review_date", filters: [workspace, ["entry_kind", eqFilter("daily_review")], ["review_date", `gte.${from}`], ["review_date", `lte.${to}`]] }),
  ]);
  return tallyActivity({
    from, to, timezone, tasks, memos, reviews,
    contacts: Array.isArray(activities) ? activities.filter(isContactActivity) : null,
  });
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
    // 두 줄 신호(오늘 3개·연락 N건)는 workspaceId·timezone·reviewDate만 쓰고 셋 다 여기서 이미
    // 확정됐으므로 리뷰 읽기와 같은 왕복에 태운다 — 직렬로 두면 단계가 하나 더 생긴다.
    // 최근 8일(실제 오늘 기준)은 선택 날짜와 무관하게 싣는다 — 오늘·홈의 cue와 "이번 주 k/5"가 쓴다
    // (2026-09-23 §4.3·§4.5). 월 경계를 넘는 주도 한 번의 범위 읽기로 끝난다.
    const recent = recentRange(toZonedDateKey(now, context.timezone));
    // 활동 흐름: 최근 16주는 항상, 선택한 달이 그 창 밖이면 그 달을 한 번 더 읽는다(§12).
    const heat = activityWindow(recent.to);
    const monthTo = range.end < recent.to ? range.end : recent.to;
    const activityContext = { workspaceId: context.workspaceId, timezone: context.timezone };
    const [selectedRows, monthRows, today, recentRows, activity, monthActivity] = await Promise.all([
      fetchSupabaseRows("journal_entries", {
        select: REVIEW_SELECT, filters: [...filters, ["review_date", eqFilter(reviewDate)]], limit: 2,
      }),
      fetchSupabaseRows("journal_entries", {
        select: REVIEW_SELECT, filters: [...filters, ["review_date", `gte.${range.start}`], ["review_date", `lte.${range.end}`]],
        order: "review_date.desc", limit: 31,
      }),
      readTodaySignals({ workspaceId: context.workspaceId, timezone: context.timezone, reviewDate }).catch(() => null),
      fetchSupabaseRows("journal_entries", {
        select: "review_date,review_data", filters: [...filters, ["review_date", `gte.${recent.from}`], ["review_date", `lte.${recent.to}`]],
        order: "review_date.desc", limit: REVIEW_RECENT_DAYS,
      }).catch(() => null),
      readReviewActivity({ ...activityContext, ...heat }).catch(() => null),
      range.start <= recent.to && !covers(heat, range.start, monthTo)
        ? readReviewActivity({ ...activityContext, from: range.start, to: monthTo }).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (!Array.isArray(selectedRows) || selectedRows.length > 1 || !Array.isArray(monthRows) || monthRows.length > 31) return readError(base);
    const review = selectedRows.length ? reviewFromRow(selectedRows[0], context.workspaceId) : null;
    if (selectedRows.length && (!review || review.reviewDate !== reviewDate)) return readError(base);
    const summaries = monthRows.map((row) => reviewFromRow(row, context.workspaceId));
    if (summaries.some((entry) => !entry || entry.reviewDate < range.start || entry.reviewDate > range.end)
      || new Set(summaries.map((entry) => entry.reviewDate)).size !== summaries.length) return readError(base);
    const entries = summaries.map(({ note, ...entry }) => ({ ...entry, excerpt: note.slice(0, 180) }));
    // 최근 기록을 못 읽으면 null — cue는 "기록 없음"으로 위장하지 않고 침묵한다.
    const recentEntries = Array.isArray(recentRows) && recentRows.length <= REVIEW_RECENT_DAYS
      ? recentRows.filter((row) => isDailyReviewDate(row?.review_date))
        .map((row) => ({ reviewDate: row.review_date, energy: Number.isInteger(row.review_data?.energy) ? row.review_data.energy : null }))
      : null;
    return { ...base, status: "live", review, entries, today, recent: recentEntries, todayKey: recent.to, activity, monthActivity };
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
