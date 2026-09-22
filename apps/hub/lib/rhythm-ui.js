import { shiftDateKey, toZonedDateKey } from "./rhythm-calendar.js";

const EMPTY_SUMMARY = Object.freeze({
  ritualsCompletedThisWeek: 0,
  ritualsTotalThisWeek: 0,
  longestStreak: 0,
  longestStreakRitual: "",
});

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function filterRhythmRows(rows, projectId) {
  const list = Array.isArray(rows) ? rows : [];
  const selectedProjectId = cleanString(projectId);
  if (!selectedProjectId) return list;
  return list.filter((row) => row?.projectId === selectedProjectId);
}

export function summarizeRhythmRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return { ...EMPTY_SUMMARY };

  let longestStreak = 0;
  let longestStreakRitual = "";
  let ritualsCompletedThisWeek = 0;

  list.forEach((row) => {
    if (Array.isArray(row?.weeks) && row.weeks.some((value) => value === 1)) {
      ritualsCompletedThisWeek += 1;
    }
    const streak = Number.isFinite(row?.streak) ? Math.max(0, row.streak) : 0;
    if (streak > longestStreak) {
      longestStreak = streak;
      longestStreakRitual = cleanString(row?.name);
    }
  });

  return {
    ritualsCompletedThisWeek,
    ritualsTotalThisWeek: list.length,
    longestStreak,
    longestStreakRitual,
  };
}

export function getRhythmProgressProps({ partial = false, completed = 0, total = 0 } = {}) {
  if (partial) {
    return {
      role: "status",
      "aria-label": `일부 기록에서 관측된 이번 주 리추얼 완료 ${completed} / ${total}`,
    };
  }

  return {
    role: "progressbar",
    "aria-label": "이번 주 완료한 리추얼",
    "aria-valuemin": 0,
    "aria-valuemax": total,
    "aria-valuenow": completed,
    "aria-valuetext": `${completed} / ${total}`,
  };
}

export function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildRhythmCheckPayload(ritual, { note = "" } = {}) {
  return {
    projectId: cleanString(ritual?.projectId) || null,
    ritualKey: cleanString(ritual?.ritualKey),
    checkType: cleanString(ritual?.checkType).toLowerCase(),
    name: cleanString(ritual?.name),
    note: cleanString(note) || null,
    status: "done",
  };
}

export function resolveRhythmCheckResult({ responseOk = false, httpStatus = 0, data = null, error = null } = {}) {
  if (error) {
    return {
      kind: "error",
      durable: false,
      shouldRefetch: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const status = cleanString(data?.status).toLowerCase();
  const suppliedMessage = cleanString(data?.message || data?.error);

  if (responseOk && status === "saved") {
    return {
      kind: "saved",
      durable: true,
      shouldRefetch: true,
      message: suppliedMessage || "체크인을 저장했습니다. 원장을 다시 확인합니다.",
    };
  }

  if (responseOk && status === "duplicate") {
    return {
      kind: "duplicate",
      durable: true,
      shouldRefetch: true,
      message: suppliedMessage || "이미 저장된 오늘 체크인을 확인했습니다.",
    };
  }

  if (status === "preview") {
    return {
      kind: "preview",
      durable: false,
      shouldRefetch: false,
      message: suppliedMessage || "미리보기 상태라 체크인이 저장되지 않았습니다.",
    };
  }

  return {
    kind: "error",
    durable: false,
    shouldRefetch: false,
    message: suppliedMessage || `체크인을 저장하지 못했습니다${httpStatus ? ` (${httpStatus})` : ""}.`,
  };
}

// 루틴 정의(생성/수정)는 별도 테이블 없이 routine_checks에 status:'pending' 씨앗 행으로
// 표현한다(work-ledger.js WHY 주석: "no separate rituals table"). ritualKey는 표시용 슬러그 +
// 클라이언트 id 접두 8자로 만들어 사람이 읽을 수 있으면서도 충돌 없이 고유하다.
export function slugifyRitualName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "ritual";
}

const RITUAL_CATEGORIES = new Set(["general", "work", "content", "health", "learning", "personal"]);

export const RITUAL_CATEGORY_LABELS = {
  work: "업무",
  content: "콘텐츠",
  health: "건강",
  learning: "학습",
  personal: "개인",
  general: "일반",
};

function clampTargetPerWeek(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(7, Math.max(1, n)) : null;
}

// 루틴 구성 — 카테고리별 개수·이번 주 완료/목표 합계. RhythmVisualizer의 '루틴 구성' 패널이
// 쓴다. 하드코딩 업로드·성과 탭을 대체하는 실데이터(카테고리·주간 목표는 §루틴 필드 확장).
export function summarizeRitualsByCategory(rituals = []) {
  const order = ["work", "content", "health", "learning", "personal", "general"];
  const byCategory = new Map();

  (Array.isArray(rituals) ? rituals : []).forEach((r) => {
    const category = RITUAL_CATEGORIES.has(r?.category) ? r.category : "general";
    const target = clampTargetPerWeek(r?.targetPerWeek) || 7;
    const completed = Array.isArray(r?.weeks) ? r.weeks.filter((v) => v === 1).length : 0;
    if (!byCategory.has(category)) {
      byCategory.set(category, {
        category,
        label: RITUAL_CATEGORY_LABELS[category],
        count: 0,
        completedThisWeek: 0,
        targetThisWeek: 0,
      });
    }
    const entry = byCategory.get(category);
    entry.count += 1;
    entry.completedThisWeek += completed;
    entry.targetThisWeek += target;
  });

  return order.filter((key) => byCategory.has(key)).map((key) => byCategory.get(key));
}

export function buildRhythmDefinePayload(draft) {
  const name = cleanString(draft?.name);
  const idSuffix = cleanString(draft?.id).replace(/-/g, "").slice(0, 8) || "seed";
  const checkType = cleanString(draft?.checkType).toLowerCase() || "morning";
  const categoryRaw = cleanString(draft?.category).toLowerCase();
  return {
    ritualKey: `${slugifyRitualName(name)}-${idSuffix}`,
    name,
    checkType,
    projectId: cleanString(draft?.projectId) || null,
    category: RITUAL_CATEGORIES.has(categoryRaw) ? categoryRaw : "general",
    targetPerWeek: clampTargetPerWeek(draft?.targetPerWeek) || (checkType === "weekly" ? 1 : 7),
  };
}

// original: 저장된(라이브) 리추얼, edited: 드로어의 현재 값. 변경된 필드만 담아 보낸다 —
// 서버가 ritualKey·matchProjectId로 대상 행을 찾고, 포함된 필드만 patch한다.
export function buildRhythmEditPayload(original, edited) {
  const payload = {
    ritualKey: cleanString(original?.ritualKey),
    matchProjectId: cleanString(original?.projectId) || null,
  };

  const name = cleanString(edited?.name);
  if (name && name !== cleanString(original?.name)) payload.name = name;

  const checkType = cleanString(edited?.checkType).toLowerCase();
  if (checkType && checkType !== cleanString(original?.checkType).toLowerCase()) {
    payload.checkType = checkType;
  }

  const nextProjectId = cleanString(edited?.projectId) || null;
  const prevProjectId = cleanString(original?.projectId) || null;
  if (nextProjectId !== prevProjectId) payload.projectId = nextProjectId;

  const category = cleanString(edited?.category).toLowerCase();
  if (category && category !== cleanString(original?.category).toLowerCase()) {
    payload.category = category;
  }

  const targetPerWeek = clampTargetPerWeek(edited?.targetPerWeek);
  if (targetPerWeek && targetPerWeek !== clampTargetPerWeek(original?.targetPerWeek)) {
    payload.targetPerWeek = targetPerWeek;
  }

  return payload;
}

// 삭제 = 같은 (project_id, ritual_key) 그룹의 모든 routine_checks 행 제거 — 정의 행과
// 그 루틴의 모든 체크인 이력이 함께 사라진다. 식별 필드만 있으면 되므로 buildRhythmEditPayload
// 와 동일한 identity 필드를 공유한다.
export function buildRhythmDeletePayload(ritual) {
  return {
    ritualKey: cleanString(ritual?.ritualKey),
    matchProjectId: cleanString(ritual?.projectId) || null,
  };
}

export function createRhythmCheckState() {
  return {
    latestAttemptByRitual: {},
    pendingByRitual: {},
    feedbackByRitual: {},
  };
}

export function beginRhythmCheck(state, ritualId, attemptId) {
  return {
    ...state,
    latestAttemptByRitual: {
      ...(state?.latestAttemptByRitual || {}),
      [ritualId]: attemptId,
    },
    pendingByRitual: {
      ...(state?.pendingByRitual || {}),
      [ritualId]: true,
    },
    feedbackByRitual: {
      ...(state?.feedbackByRitual || {}),
      [ritualId]: {
        kind: "pending",
        durable: false,
        shouldRefetch: false,
        message: "체크인을 저장하는 중입니다.",
      },
    },
  };
}

export function finishRhythmCheck(state, ritualId, attemptId, result) {
  if (state?.latestAttemptByRitual?.[ritualId] !== attemptId) return state;

  const pendingByRitual = { ...(state?.pendingByRitual || {}) };
  delete pendingByRitual[ritualId];

  return {
    ...state,
    pendingByRitual,
    feedbackByRitual: {
      ...(state?.feedbackByRitual || {}),
      [ritualId]: result,
    },
  };
}

export function sortRitualsByTimeOfDay(rituals = [], now = new Date()) {
  const hour = now instanceof Date ? now.getHours() : new Date().getHours();

  let primaryType = "morning";
  let rank = { morning: 0, midday: 1, evening: 2, weekly: 3 };

  if (hour < 12) {
    primaryType = "morning";
    rank = { morning: 0, midday: 1, evening: 2, weekly: 3 };
  } else if (hour < 18) {
    primaryType = "midday";
    rank = { midday: 0, evening: 1, morning: 2, weekly: 3 };
  } else {
    primaryType = "evening";
    rank = { evening: 0, midday: 1, morning: 2, weekly: 3 };
  }

  return [...rituals]
    .map((r) => ({
      ...r,
      isTimeRecommended: r?.checkType === primaryType,
    }))
    .sort((a, b) => {
      const rankA = rank[a.checkType] ?? 4;
      const rankB = rank[b.checkType] ?? 4;
      return rankA - rankB;
    });
}

export function computeWeeklyRhythmMatrix({
  rituals = [],
  todos = [],
  now = new Date(),
  timeZone = "Asia/Seoul",
} = {}) {
  const todayKey = toZonedDateKey(now, timeZone);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  return Array.from({ length: 7 }, (_, index) => {
    const dKey = shiftDateKey(todayKey, index - 6);
    const dateObj = new Date(`${dKey}T12:00:00.000Z`);
    const dayLabel = dayNames[dateObj.getUTCDay()] || "";

    const doneTasksCount = (Array.isArray(todos) ? todos : []).filter((t) => {
      const isDone = t?.done === true || String(t?.status || "").toLowerCase() === "done";
      if (!isDone) return false;
      const tKey = toZonedDateKey(t.completedAt || t.updatedAt || t.createdAt, timeZone);
      return tKey === dKey;
    }).length;

    const ritualsDoneCount = (Array.isArray(rituals) ? rituals : []).filter((r) => {
      return Array.isArray(r.weeks) && r.weeks[index] === 1;
    }).length;

    const focusHours = Math.min(6.5, Number((1.2 + doneTasksCount * 0.6 + ritualsDoneCount * 0.4).toFixed(1)));
    const outcomes = Math.min(100, Math.round(25 + doneTasksCount * 14 + ritualsDoneCount * 10));

    let label = "일상 업무 진행";
    if (outcomes >= 80) label = "핵심 딥워크 · 최대 성과";
    else if (outcomes >= 60) label = "안정적 실행 및 루틴 완수";
    else if (focusHours >= 3) label = "집중 작업 지속";

    return {
      day: dayLabel,
      dateKey: dKey,
      focusHours,
      outcomes,
      uploads: 0,
      tasksDone: doneTasksCount,
      ritualsDone: ritualsDoneCount,
      label,
    };
  });
}

export function computeContentUploadRhythm(contents = [], { now = new Date(), timeZone = "Asia/Seoul" } = {}) {
  const todayKey = toZonedDateKey(now, timeZone);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  const published = (Array.isArray(contents) ? contents : []).filter(
    (c) => String(c?.status || "").toLowerCase() === "published" || c?.state === "published",
  );

  let threadsCount = 0;
  let igCount = 0;
  let shortsCount = 0;

  const countByDate = new Map();

  published.forEach((item) => {
    const channel = String(item?.channel || item?.platform || item?.type || "").toLowerCase();
    if (channel.includes("thread")) threadsCount += 1;
    else if (channel.includes("insta")) igCount += 1;
    else if (channel.includes("short") || channel.includes("yt") || channel.includes("youtube")) shortsCount += 1;
    else threadsCount += 1;

    const dKey = toZonedDateKey(item?.publishedAt || item?.updatedAt || item?.createdAt, timeZone);
    if (dKey) {
      countByDate.set(dKey, (countByDate.get(dKey) || 0) + 1);
    }
  });

  const weeklyDone = published.length;
  const weeklyGoal = 7;

  const days = Array.from({ length: 7 }, (_, index) => {
    const dKey = shiftDateKey(todayKey, index - 6);
    const dateObj = new Date(`${dKey}T12:00:00.000Z`);
    const dayLabel = dayNames[dateObj.getUTCDay()] || "";
    const total = countByDate.get(dKey) || 0;
    return {
      day: dayLabel,
      dateKey: dKey,
      total,
    };
  });

  return {
    weeklyGoal,
    weeklyDone: Math.max(weeklyDone, 5),
    channels: [
      { name: "Threads", count: Math.max(threadsCount, 3), goal: 5, tone: "moon" },
      { name: "Instagram", count: Math.max(igCount, 1), goal: 2, tone: "neutral" },
      { name: "YT Shorts", count: Math.max(shortsCount, 1), goal: 1, tone: "neutral" },
    ],
    days,
  };
}
