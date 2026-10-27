import { zonedDayKey } from "./kst-day.js";
import { shiftDateKey } from "./rhythm-calendar.js";

export const TASK_TIME_ZONE = "Asia/Seoul";
// 오늘 Top 3 — 하루에 고를 수 있는 할 일 수. Engine pms-command.ts MAX_FOCUS_PER_DAY와 같은 값
// (2026-09-20 세 축·Action KPI 기획 §6.2). 서버가 상한을 강제하고, 클라이언트는 4번째 토글을
// 비활성으로 그린다.
export const MAX_FOCUS_PER_DAY = 3;

// 상한 카피 한 곳 — 내 작업과 첫 화면이 같은 409(focus-limit)에 같은 문장으로 답한다. 다음
// 행동("하나를 빼고 다시 고르세요")까지 말하는 것이 DESIGN.md §11 error 상태 계약이다.
export function focusLimitMessage(limit = MAX_FOCUS_PER_DAY) {
  return `오늘 3개가 이미 찼습니다 (${limit}/${limit}) — 하나를 빼고 다시 고르세요.`;
}

const LANE_RANK = {
  focus: 0,
  missed: 1,
  today: 2,
  waiting: 3,
  inbox: 4,
};

const LANE_LABEL = {
  focus: "오늘 3개",
  missed: "놓침",
  today: "오늘",
  waiting: "대기",
  inbox: "정리 전",
};

const PRIORITY_RANK = {
  critical: 0,
  high: 0,
  medium: 1,
  med: 1,
  low: 2,
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// timestamp | Date | 'YYYY-MM-DD' → 'YYYY-MM-DD' in the given zone ('' when unreadable).
// 구현은 kst-day.js 하나 — 그 모듈이 "세 번째 사본을 만들지 않는다"고 선언한 규칙을 지킨다.
// 여기는 호출처 시그니처(기본 시간대 인자)를 지키는 재수출만 남는다.
export function dateKeyInZone(value, timeZone = TASK_TIME_ZONE) {
  return zonedDayKey(value, timeZone);
}

// 고른 날짜의 이력 — ledger row(meta.focus_dates)와 todo 모델(focusDates) 양쪽을 읽는다.
export function focusDatesOf(task) {
  const raw = Array.isArray(task?.focusDates)
    ? task.focusDates
    : Array.isArray(task?.meta?.focus_dates)
      ? task.meta.focus_dates
      : [];
  return raw.filter((value) => typeof value === "string" && DATE_KEY.test(value));
}

export function isFocusedOn(task, dateKey) {
  return Boolean(dateKey) && focusDatesOf(task).includes(dateKey);
}

function isDoneTask(task) {
  return task?.done === true || String(task?.status || "").toLowerCase() === "done";
}

function laneForTask(task, todayKey, timeZone) {
  if (isDoneTask(task)) return null;

  // 사람이 오늘로 고른 할 일이 시스템 레인(놓침·오늘·대기)보다 앞선다 — 기한이 지났어도
  // 오늘 하기로 한 일이면 "오늘 3개"에서 보인다(§6.2).
  if (isFocusedOn(task, todayKey)) return "focus";

  const status = String(task?.status || "").toLowerCase();
  const dueKey = dateKeyInZone(task?.dueAt, timeZone);
  if (dueKey && dueKey < todayKey) return "missed";
  if (dueKey === todayKey) return "today";
  if (status === "doing") return "today";
  if (status === "blocked") return "waiting";
  if (status === "inbox") return "inbox";
  return null;
}

function descendingTime(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

// 오늘 3개 요약 — 선택 수(분모)는 상태와 무관하게 오늘을 고른 할 일, 완료 수(분자)는 그중
// 오늘(KST) 끝낸 할 일. 저녁 리뷰 팝업과 주간 카드가 같은 정의를 쓴다.
export function summarizeFocusDay(todos = [], { now = new Date(), timeZone = TASK_TIME_ZONE } = {}) {
  const dateKey = dateKeyInZone(now, timeZone);
  const picked = (Array.isArray(todos) ? todos : []).filter((task) => isFocusedOn(task, dateKey));
  const done = picked.filter((task) => isDoneTask(task) && dateKeyInZone(task.completedAt, timeZone) === dateKey);
  return {
    date: dateKey,
    picked: picked.length,
    done: done.length,
    limit: MAX_FOCUS_PER_DAY,
    remaining: Math.max(0, MAX_FOCUS_PER_DAY - picked.length),
  };
}

export function computeTaskStreak(todos = [], { now = new Date(), timeZone = TASK_TIME_ZONE } = {}) {
  const todayKey = dateKeyInZone(now, timeZone);
  if (!todayKey) {
    return { streak: 0, todayDoneCount: 0, todayDoneIds: [], isBurning: false, recentDays: [0, 0, 0, 0, 0, 0, 0] };
  }

  const doneDateKeys = new Set();
  let todayDoneCount = 0;
  const todayDoneIds = [];

  (Array.isArray(todos) ? todos : []).forEach((task) => {
    if (!isDoneTask(task)) return;

    const completionTimestamp = task?.completedAt || task?.updatedAt || task?.createdAt;
    const taskDateKey = dateKeyInZone(completionTimestamp, timeZone);
    if (taskDateKey) {
      doneDateKeys.add(taskDateKey);
      if (taskDateKey === todayKey) {
        todayDoneCount += 1;
        if (task.id) todayDoneIds.push(task.id);
      }
    }
  });

  let streak = 0;
  let cursor = todayKey;

  // 오늘 완료가 아직 없다면 어제부터 연속 streak 확인
  if (!doneDateKeys.has(cursor)) {
    const yesterday = shiftDateKey(cursor, -1);
    if (doneDateKeys.has(yesterday)) {
      cursor = yesterday;
    }
  }

  while (doneDateKeys.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const dKey = shiftDateKey(todayKey, index - 6);
    return doneDateKeys.has(dKey) ? 1 : 0;
  });

  return {
    streak,
    todayDoneCount,
    todayDoneIds,
    isBurning: streak >= 3 || (streak > 0 && todayDoneCount > 0),
    recentDays,
  };
}

export function buildTaskToday(
  todos = [],
  { now = new Date(), timeZone = TASK_TIME_ZONE, limit = 5 } = {},
) {
  const todayKey = dateKeyInZone(now, timeZone);
  const candidates = (Array.isArray(todos) ? todos : [])
    .map((task) => {
      const lane = laneForTask(task, todayKey, timeZone);
      if (!lane) return null;
      return {
        ...task,
        lane,
        laneLabel: LANE_LABEL[lane],
        focusToday: lane === "focus",
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const laneDelta = LANE_RANK[left.lane] - LANE_RANK[right.lane];
      if (laneDelta) return laneDelta;

      const priorityDelta = (PRIORITY_RANK[left.priority] ?? 1) - (PRIORITY_RANK[right.priority] ?? 1);
      if (priorityDelta) return priorityDelta;

      const dueDelta = dateKeyInZone(left.dueAt, timeZone).localeCompare(dateKeyInZone(right.dueAt, timeZone));
      if (dueDelta) return dueDelta;

      const updatedDelta = descendingTime(right.updatedAt) - descendingTime(left.updatedAt);
      if (updatedDelta) return updatedDelta;

      return String(left.id).localeCompare(String(right.id));
    });

  // 오늘 3개는 표시 limit 밖이다 — 고른 일이 목록의 다섯 칸을 먹어 빠른 입력이 밀려나지 않게
  // limit은 나머지 레인에만 건다(2026-10-21: 오늘 3개를 세 자리로 따로 그리면서 목록이 2건으로 줄었다).
  const picked = candidates.filter((task) => task.lane === "focus");
  const rest = candidates.filter((task) => task.lane !== "focus");
  const shownRest = rest.slice(0, Math.max(0, limit));

  // 레인 밖의 열린 할 일(기한 없음·나중 기한) — 레인 집계에는 넣지 않고, 오늘 3개를 고를 후보로만
  // 따로 싣는다. 이게 없으면 기한 없이 만든 할 일이 첫 화면 어디에도 보이지 않았다(2026-10-21).
  const later = (Array.isArray(todos) ? todos : [])
    .filter((task) => !isDoneTask(task) && !laneForTask(task, todayKey, timeZone))
    .sort((left, right) => descendingTime(right.updatedAt) - descendingTime(left.updatedAt)
      || String(left.id).localeCompare(String(right.id)))
    .map((task) => ({ ...task, lane: "later", laneLabel: "나중", focusToday: false }));

  const counts = {
    total: candidates.length,
    shown: picked.length + shownRest.length,
    focus: candidates.filter((task) => task.lane === "focus").length,
    missed: candidates.filter((task) => task.lane === "missed").length,
    today: candidates.filter((task) => task.lane === "today").length,
    waiting: candidates.filter((task) => task.lane === "waiting").length,
    inbox: candidates.filter((task) => task.lane === "inbox").length,
  };

  const streak = computeTaskStreak(todos, { now, timeZone });
  const focus = summarizeFocusDay(todos, { now, timeZone });

  return {
    items: [...picked, ...shownRest],
    counts,
    hiddenCount: counts.total - counts.shown,
    streak,
    // 오늘 고른 항목 전부(표시 limit과 무관) — "오늘 이 3개만" 카드가 이 배열을 1차
    // 소스로 쓴다(§6.2). 비어 있으면 카드가 레인 상위 3개를 dashed 권장으로 보여준다.
    // 완료된 선택은 여기서 빠지므로 분모·분자는 `focus` 요약(summarizeFocusDay)을 쓴다.
    focusItems: candidates.filter((task) => task.lane === "focus"),
    focusCompletedItems: (Array.isArray(todos) ? todos : []).filter((task) => isFocusedOn(task, todayKey) && isDoneTask(task) && dateKeyInZone(task.completedAt, timeZone) === todayKey),
    focus,
    later: later.slice(0, Math.max(0, limit)),
    laterCount: later.length,
  };
}

// Apply an acknowledged row to the currently visible slice. Hidden task counts
// and historical streak evidence remain owned by the read, not this projection.
export function applyTodayTaskRow(previous, row, { now = new Date() } = {}) {
  const known = [...(previous?.items || []), ...(previous?.later || []), ...(previous?.focusItems || []), ...(previous?.focusCompletedItems || [])];
  const byId = new Map(known.map(task => [task.id, task]));
  const priorKnown = buildTaskToday([...byId.values()], { now });
  const before = byId.get(row.id);
  const task = {
    ...before, ...row,
    dueAt: row.due_at !== undefined ? row.due_at : row.dueAt !== undefined ? row.dueAt : before?.dueAt,
    completedAt: row.completed_at !== undefined ? row.completed_at : row.completedAt !== undefined ? row.completedAt : before?.completedAt,
    updatedAt: row.updated_at !== undefined ? row.updated_at : row.updatedAt !== undefined ? row.updatedAt : before?.updatedAt,
    focusDates: Array.isArray(row.meta?.focus_dates) ? row.meta.focus_dates : row.focusDates || before?.focusDates || [],
    done: row.status === 'done',
  };
  byId.set(task.id, task);
  const rebuilt = buildTaskToday([...byId.values()], { now });
  const date = dateKeyInZone(now);
  const delta = Number(isFocusedOn(task, date)) - Number(isFocusedOn(before, date));
  const completed = item => isFocusedOn(item, date) && isDoneTask(item) && dateKeyInZone(item.completedAt) === date;
  const doneDelta = Number(completed(task)) - Number(completed(before));
  const picked = Math.max(0, (previous.focus?.picked || 0) + delta);
  const done = Math.max(0, (previous.focus?.done || 0) + doneDelta);
  const counts = { ...rebuilt.counts };
  for (const key of ['total', 'focus', 'missed', 'today', 'waiting', 'inbox']) {
    if (Number.isInteger(previous.counts?.[key])) counts[key] = previous.counts[key] + rebuilt.counts[key] - priorKnown.counts[key];
    else delete counts[key];
  }
  return {
    ...previous, ...rebuilt,
    counts,
    state: previous.state, stale: previous.stale, observedState: previous.observedState,
    hiddenCount: Number.isInteger(counts.total) ? Math.max(0, counts.total - counts.shown) : previous.hiddenCount || 0,
    laterCount: rebuilt.laterCount + Math.max(0, (previous.laterCount || 0) - (previous.later?.length || 0)),
    focus: { date, picked, done, limit: MAX_FOCUS_PER_DAY, remaining: Math.max(0, MAX_FOCUS_PER_DAY - picked) },
    streak: previous.streak,
  };
}

export function isDurableTaskUpdateResult(result) {
  return result?.status === "saved";
}

// ── 오늘 할 일 목록의 표시 규칙(2026-10-22) ─────────────────────────────
// 행마다 같은 레인 배지("나중"·"나중"·"나중"…)를 되풀이하던 것을 묶음 머리 한 번으로 옮기고,
// 행 메타는 영문 원값(med·low) 대신 운영자가 읽는 말로 쓴다. 보통 우선순위는 말하지 않는다.
const TASK_GROUP = {
  missed: { label: "놓침", hint: "기한 지남" },
  today: { label: "오늘", hint: "오늘 기한 · 진행 중" },
  waiting: { label: "대기", hint: "막힌 일" },
  inbox: { label: "정리 전", hint: "기한을 정하지 않은 새 일" },
  later: { label: "나중", hint: "★로 오늘 3개에 올릴 후보" },
};

const PRIORITY_LABEL = { critical: "긴급", high: "높음", low: "낮음" };

export function taskPriorityLabel(priority) {
  return PRIORITY_LABEL[String(priority || "").toLowerCase()] || "";
}

// 표시 순서를 지킨 채 이어진 같은 레인끼리 묶는다(정렬은 buildTaskToday가 이미 했다).
export function groupTaskRows(rows = []) {
  const groups = [];
  for (const task of Array.isArray(rows) ? rows : []) {
    const lane = task?.lane || "later";
    const last = groups[groups.length - 1];
    if (last && last.lane === lane) last.items.push(task);
    else groups.push({ lane, ...(TASK_GROUP[lane] || { label: task?.laneLabel || lane, hint: "" }), items: [task] });
  }
  return groups;
}

// 기한 → 짧은 상대 표기. 지난 기한만 overdue(빨강은 놓침 한 곳, §5.2). 읽을 수 없으면 null.
export function taskDueLabel(task, { now = new Date(), timeZone = TASK_TIME_ZONE } = {}) {
  const dueKey = dateKeyInZone(task?.dueAt, timeZone);
  const todayKey = dateKeyInZone(now, timeZone);
  if (!dueKey || !todayKey) return null;
  const diff = Math.round((Date.parse(`${dueKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
  if (diff < 0) return { text: `${-diff}일 지남`, overdue: true };
  if (diff === 0) return { text: "오늘까지", overdue: false };
  if (diff === 1) return { text: "내일까지", overdue: false };
  if (diff <= 7) return { text: `D-${diff}`, overdue: false };
  return { text: `${Number(dueKey.slice(5, 7))}/${Number(dueKey.slice(8, 10))}까지`, overdue: false };
}
