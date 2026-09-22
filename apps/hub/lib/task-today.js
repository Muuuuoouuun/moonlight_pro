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
export function dateKeyInZone(value, timeZone = TASK_TIME_ZONE) {
  if (!value) return "";
  if (DATE_KEY.test(String(value))) return String(value);

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
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
    return { streak: 0, todayDoneCount: 0, isBurning: false, recentDays: [0, 0, 0, 0, 0, 0, 0] };
  }

  const doneDateKeys = new Set();
  let todayDoneCount = 0;

  (Array.isArray(todos) ? todos : []).forEach((task) => {
    if (!isDoneTask(task)) return;

    const completionTimestamp = task?.completedAt || task?.updatedAt || task?.createdAt;
    const taskDateKey = dateKeyInZone(completionTimestamp, timeZone);
    if (taskDateKey) {
      doneDateKeys.add(taskDateKey);
      if (taskDateKey === todayKey) {
        todayDoneCount += 1;
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

  const counts = {
    total: candidates.length,
    shown: Math.min(candidates.length, Math.max(0, limit)),
    focus: candidates.filter((task) => task.lane === "focus").length,
    missed: candidates.filter((task) => task.lane === "missed").length,
    today: candidates.filter((task) => task.lane === "today").length,
    waiting: candidates.filter((task) => task.lane === "waiting").length,
    inbox: candidates.filter((task) => task.lane === "inbox").length,
  };

  const streak = computeTaskStreak(todos, { now, timeZone });
  const focus = summarizeFocusDay(todos, { now, timeZone });

  return {
    items: candidates.slice(0, counts.shown),
    counts,
    hiddenCount: counts.total - counts.shown,
    streak,
    // 오늘 고른 항목 전부(표시 limit과 무관) — "오늘 이 3개만" 카드가 이 배열을 1차
    // 소스로 쓴다(§6.2). 비어 있으면 카드가 레인 상위 3개를 dashed 권장으로 보여준다.
    // 완료된 선택은 여기서 빠지므로 분모·분자는 `focus` 요약(summarizeFocusDay)을 쓴다.
    focusItems: candidates.filter((task) => task.lane === "focus"),
    focus,
  };
}

export function isDurableTaskUpdateResult(result) {
  return result?.status === "saved";
}
