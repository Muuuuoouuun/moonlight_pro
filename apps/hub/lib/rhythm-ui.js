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

export function buildRhythmDefinePayload(draft) {
  const name = cleanString(draft?.name);
  const idSuffix = cleanString(draft?.id).replace(/-/g, "").slice(0, 8) || "seed";
  return {
    ritualKey: `${slugifyRitualName(name)}-${idSuffix}`,
    name,
    checkType: cleanString(draft?.checkType).toLowerCase() || "morning",
    projectId: cleanString(draft?.projectId) || null,
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

  return payload;
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
