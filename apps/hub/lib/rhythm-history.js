import { isCalendarDateKey, shiftDateKey } from "./rhythm-calendar.js";
import { defaultTargetPerWeek, normalizeTargetPerWeek } from "./rhythm-ui.js";

// 리듬 기록 — 주·월·분기·연 단위로 "내 루틴을 어떻게 해 왔는지"를 보는 뷰 모델.
//
// 입력은 루틴 정의와 루틴별 완료 날짜(워크스페이스 현지 날짜 키) 집합뿐이다. 할 일은 섞지 않는다
// (2026-09-23 Rhythm 분리 결정). 기간은 달력 기준이다 — 주는 월요일 시작, 분기는 1·4·7·10월 시작.
// offset 0이 지금 기간, -1이 직전 기간이다. 미래 기간은 없다(offset > 0은 0으로 접는다).
//
// 기대 횟수는 "지난 날 수 × 주간 목표 / 7"의 올림이다. 루틴이 만들어진 날(activeFrom) 이전과 오늘 이후는
// 세지 않는다 — 9월 20일에 만든 루틴이 9월 달성률 10%로 보이지 않게.

export const RHYTHM_HISTORY_RANGES = ["week", "month", "quarter", "year"];

export const RHYTHM_HISTORY_RANGE_LABELS = {
  week: "주",
  month: "월",
  quarter: "분기",
  year: "연",
};

const MIN_OFFSET = -120;

export function normalizeHistoryRange(value) {
  const range = typeof value === "string" ? value.trim().toLowerCase() : "";
  return RHYTHM_HISTORY_RANGES.includes(range) ? range : "week";
}

export function normalizeHistoryOffset(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n > 0) return 0;
  return Math.max(MIN_OFFSET, n);
}

function parts(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { y, m, d };
}

function keyOf(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 0=월 … 6=일
function weekdayIndex(dateKey) {
  const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
  return (day + 6) % 7;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonths(y, m, delta) {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

export function dayKeysBetween(startKey, endKey) {
  const out = [];
  if (!isCalendarDateKey(startKey) || !isCalendarDateKey(endKey) || startKey > endKey) return out;
  let cursor = startKey;
  while (cursor <= endKey && out.length < 400) {
    out.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return out;
}

export function resolveHistoryWindow({ range, offset = 0, todayKey }) {
  const r = normalizeHistoryRange(range);
  const o = normalizeHistoryOffset(offset);
  const { y, m } = parts(todayKey);
  let startKey;
  let endKey;
  let label;

  if (r === "week") {
    const monday = shiftDateKey(todayKey, -weekdayIndex(todayKey) + o * 7);
    startKey = monday;
    endKey = shiftDateKey(monday, 6);
    const s = parts(startKey);
    const e = parts(endKey);
    label = o === 0
      ? "이번 주"
      : o === -1
        ? "지난주"
        : s.m === e.m
          ? `${s.m}월 ${s.d}일 – ${e.d}일`
          : `${s.m}월 ${s.d}일 – ${e.m}월 ${e.d}일`;
  } else if (r === "month") {
    const t = addMonths(y, m, o);
    startKey = keyOf(t.y, t.m, 1);
    endKey = keyOf(t.y, t.m, daysInMonth(t.y, t.m));
    label = o === 0 ? "이번 달" : `${t.y}년 ${t.m}월`;
  } else if (r === "quarter") {
    const q0 = Math.floor((m - 1) / 3);
    const t = addMonths(y, q0 * 3 + 1, o * 3);
    startKey = keyOf(t.y, t.m, 1);
    const last = addMonths(t.y, t.m, 2);
    endKey = keyOf(last.y, last.m, daysInMonth(last.y, last.m));
    const q = Math.floor((t.m - 1) / 3) + 1;
    label = o === 0 ? `이번 분기 · ${q}분기` : `${t.y}년 ${q}분기`;
  } else {
    const ty = y + o;
    startKey = keyOf(ty, 1, 1);
    endKey = keyOf(ty, 12, 31);
    label = o === 0 ? `올해 · ${ty}년` : `${ty}년`;
  }

  return {
    range: r,
    offset: o,
    startKey,
    endKey,
    label,
    isCurrent: o === 0,
    elapsedEndKey: endKey < todayKey ? endKey : todayKey,
  };
}

// 창 안에서 가장 긴 연속 완료 일수.
function longestRun(dayKeys, doneSet) {
  let best = 0;
  let run = 0;
  for (const key of dayKeys) {
    if (doneSet.has(key)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function dayLevel(done, due) {
  if (done <= 0) return 0;
  if (due <= 0) return 2;
  const ratio = done / due;
  if (ratio >= 1) return 4;
  if (ratio >= 0.67) return 3;
  if (ratio >= 0.34) return 2;
  return 1;
}

/**
 * rituals: [{ id, name, category, checkType, targetPerWeek, activeFrom? }]
 * doneByRitual: Map<id, Set<dateKey>> (또는 { [id]: dateKey[] })
 */
export function buildRhythmHistory({ rituals = [], doneByRitual = new Map(), window, todayKey }) {
  const allDays = dayKeysBetween(window.startKey, window.endKey);
  const pastDays = allDays.filter((key) => key <= todayKey);
  const getDone = (id) => {
    const raw = doneByRitual instanceof Map ? doneByRitual.get(id) : doneByRitual?.[id];
    return raw instanceof Set ? raw : new Set(Array.isArray(raw) ? raw : []);
  };

  const items = (Array.isArray(rituals) ? rituals : []).map((r) => {
    const target = normalizeTargetPerWeek(r?.targetPerWeek) || defaultTargetPerWeek(r?.checkType);
    const done = getDone(r.id);
    const activeFrom = isCalendarDateKey(r?.activeFrom) ? r.activeFrom : null;
    const activeDays = pastDays.filter((key) => !activeFrom || key >= activeFrom);
    const doneCount = activeDays.filter((key) => done.has(key)).length
      // 만든 날 이전에 남은 체크(옛 기록)도 실제로 한 것이므로 센다.
      + pastDays.filter((key) => activeFrom && key < activeFrom && done.has(key)).length;
    // 기간 중간이면 기대치를 올림한다 — 주 3회 루틴의 3일째에 1회 한 것을 "1/1 달성"이 아니라
    // "1/2"로 읽게(주 전체로는 3회). 매일 루틴은 정확히 지난 날 수다.
    const expected = activeDays.length > 0 ? Math.ceil((activeDays.length * target) / 7) : 0;
    return {
      id: r.id,
      name: r.name || "",
      category: r.category || "general",
      checkType: r.checkType || "midday",
      target,
      daily: target >= 7,
      activeFrom,
      done,
      doneCount,
      expected,
      rate: expected > 0 ? Math.min(100, Math.round((doneCount / expected) * 100)) : null,
      bestRun: longestRun(pastDays, done),
    };
  });

  const days = allDays.map((dateKey) => {
    const future = dateKey > todayKey;
    const active = items.filter((i) => !i.activeFrom || dateKey >= i.activeFrom);
    const dailyActive = active.filter((i) => i.daily);
    const basis = dailyActive.length > 0 ? dailyActive : active;
    const due = basis.length;
    const done = future ? 0 : items.filter((i) => i.done.has(dateKey)).length;
    // 진하기는 "매일 루틴을 얼마나 채웠나"만 본다 — 주 N회 루틴 체크가 다 해낸 날을 부풀리지 않게.
    const basisDone = future ? 0 : basis.filter((i) => i.done.has(dateKey)).length;
    return {
      dateKey,
      future,
      isToday: dateKey === todayKey,
      weekday: weekdayIndex(dateKey),
      done,
      due,
      dueDone: basisDone,
      level: future ? 0 : dayLevel(basisDone, due) || (done > 0 ? 1 : 0),
    };
  });

  // 달력 격자 — 월요일 시작 주 단위. 창 밖 칸은 null.
  const weeks = [];
  let row = new Array(7).fill(null);
  days.forEach((day) => {
    row[day.weekday] = day;
    if (day.weekday === 6) {
      weeks.push(row);
      row = new Array(7).fill(null);
    }
  });
  if (row.some(Boolean)) weeks.push(row);

  const totalDone = items.reduce((a, i) => a + i.doneCount, 0);
  const totalExpected = items.reduce((a, i) => a + i.expected, 0);
  const past = days.filter((d) => !d.future);
  const perfectDays = past.filter((d) => d.due > 0 && d.level === 4).length;
  const activeDays = past.filter((d) => d.done > 0).length;
  const best = items.reduce((b, i) => (i.bestRun > b.days ? { days: i.bestRun, name: i.name } : b), { days: 0, name: "" });
  const steady = items
    .filter((i) => i.rate !== null)
    .sort((a, b) => b.rate - a.rate || b.doneCount - a.doneCount)[0] || null;

  return {
    window,
    days,
    weeks,
    rituals: items
      .map(({ done, ...rest }) => ({ ...rest, doneKeys: allDays.filter((key) => done.has(key)) }))
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.doneCount - a.doneCount),
    summary: {
      totalDone,
      totalExpected,
      rate: totalExpected > 0 ? Math.min(100, Math.round((totalDone / totalExpected) * 100)) : null,
      perfectDays,
      activeDays,
      pastDays: past.length,
      bestRun: best,
      steadiest: steady ? { name: steady.name, rate: steady.rate } : null,
    },
  };
}

// 막대 차트 버킷 — 연은 월, 분기는 주(월요일 시작). 값은 "매일 루틴을 채운 칸 / 채워야 했던 칸".
// 미래만 있는 버킷은 future(막대 없음), 오늘이 든 버킷은 current. 평균은 지난 버킷 전체의
// 칸 합으로 낸다(버킷 비율의 평균이 아니라 — 반쯤 지난 이번 달이 평균을 왜곡하지 않게).
function finishBuckets(buckets) {
  const list = buckets.map((b) => ({
    ...b,
    rate: !b.future && b.due > 0 ? Math.min(100, Math.round((b.done / b.due) * 100)) : null,
  }));
  const past = list.filter((b) => b.rate !== null);
  const done = past.reduce((a, b) => a + b.done, 0);
  const due = past.reduce((a, b) => a + b.due, 0);
  const best = past.reduce((top, b) => (!top || b.rate > top.rate ? b : top), null);
  return {
    buckets: list.map((b) => ({ ...b, isBest: Boolean(best && best.key === b.key && past.length > 1) })),
    average: due > 0 ? Math.round((done / due) * 100) : null,
  };
}

function bucketDay(entry, day) {
  if (day.isToday) entry.current = true;
  if (!day.future) {
    entry.done += day.dueDone;
    entry.due += day.due;
    entry.future = false;
  }
}

export function summarizeByMonth(history) {
  const byMonth = new Map();
  for (const day of history.days) {
    const key = day.dateKey.slice(0, 7);
    const m = Number(key.slice(5, 7));
    const entry = byMonth.get(key) || { key, month: key, label: `${m}월`, longLabel: `${Number(key.slice(0, 4))}년 ${m}월`, done: 0, due: 0, future: true, current: false };
    bucketDay(entry, day);
    byMonth.set(key, entry);
  }
  return finishBuckets([...byMonth.values()]).buckets;
}

export function summarizeByWeek(history) {
  return finishBuckets(history.weeks.map((week) => {
    const days = week.filter(Boolean);
    const first = days[0];
    const last = days[days.length - 1];
    const [fm, fd] = [Number(first.dateKey.slice(5, 7)), Number(first.dateKey.slice(8))];
    const [lm, ld] = [Number(last.dateKey.slice(5, 7)), Number(last.dateKey.slice(8))];
    const entry = {
      key: first.dateKey,
      label: `${fm}/${fd}`,
      longLabel: fm === lm ? `${fm}월 ${fd}일 – ${ld}일` : `${fm}월 ${fd}일 – ${lm}월 ${ld}일`,
      done: 0,
      due: 0,
      future: true,
      current: false,
    };
    days.forEach((day) => bucketDay(entry, day));
    return entry;
  }));
}

// 차트용: 기간 단위에 맞는 버킷과 평균.
export function buildRhythmBars(history) {
  if (history.window.range === "year") return finishBuckets(summarizeByMonth(history));
  if (history.window.range === "quarter") return summarizeByWeek(history);
  return { buckets: [], average: null };
}
