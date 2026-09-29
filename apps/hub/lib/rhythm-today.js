import { defaultTargetPerWeek, normalizeTargetPerWeek } from "./rhythm-ui.js";
import { DEFAULT_RHYTHM_TIME_ZONE, shiftDateKey, toZonedDateKey } from "./rhythm-calendar.js";

// 오늘의 리듬 — Rhythm 탭의 "매일 지키는 생활 루틴" 뷰 모델.
//
// 리듬은 오늘 할 일(tasks)과 다른 모집단이다(2026-09-23 운영자: "기도하기·청소하기·운동하기 같은
// 생활 루틴, 오늘 할 일과 별개"). 그래서 이 모듈은 할 일을 전혀 읽지 않고 routine_checks에서
// 온 리추얼 행(work-ledger mapRituals)만 다룬다.
//
// weeks는 [6일 전 … 오늘] 7칸 비트맵이고 weeks[6]이 오늘이다. streak는 오늘까지 이어진 연속이라
// 오늘 아직 체크하지 않았으면 0이다 — 어제까지의 연속은 pendingStreak(오늘 체크하면 이어지는
// 값)로 따로 온다. 화면은 오늘 미완료 루틴에 "N일 연속 · 오늘 체크하면 N+1일"을 보여 준다.

export const RHYTHM_TIME_BLOCKS = [
  { key: "morning", label: "아침" },
  { key: "midday", label: "낮" },
  { key: "evening", label: "저녁" },
  { key: "weekly", label: "이번 주 중" },
];

const BLOCK_KEYS = new Set(RHYTHM_TIME_BLOCKS.map((b) => b.key));

// 빠른 추가 — 새 루틴 드로어를 이 값으로 채워 여는 제안 칩. 레코드가 아니라 입력 도우미다.
export const RHYTHM_QUICK_PRESETS = [
  { label: "기도", category: "spirit", checkType: "morning" },
  { label: "말씀 읽기", category: "spirit", checkType: "morning" },
  { label: "스트레칭", category: "health", checkType: "morning" },
  { label: "운동", category: "health", checkType: "evening" },
  { label: "물 2L", category: "health", checkType: "midday" },
  { label: "청소", category: "home", checkType: "evening" },
  { label: "독서", category: "learning", checkType: "evening" },
  { label: "감사 일기", category: "personal", checkType: "evening" },
];

export function currentTimeBlock(now = new Date(), timeZone = DEFAULT_RHYTHM_TIME_ZONE) {
  const hour = zonedHour(now, timeZone);
  if (hour < 11) return "morning";
  if (hour < 17) return "midday";
  return "evening";
}

function zonedHour(now, timeZone) {
  const date = now instanceof Date ? now : new Date(now);
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    if (Number.isFinite(hour)) return hour;
  } catch {
    // 잘못된 timeZone — 기기 시계로 떨어진다.
  }
  return date.getHours();
}

function weeksOf(ritual) {
  const weeks = Array.isArray(ritual?.weeks) ? ritual.weeks.slice(-7) : [];
  while (weeks.length < 7) weeks.unshift(0);
  return weeks.map((v) => (v === 1 ? 1 : 0));
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

// 낙관적 토글을 한 리추얼에 덮는다. override: true(오늘 체크) · false(오늘 체크 취소) · undefined(서버 값).
export function applyTodayOverride(ritual, override) {
  const weeks = weeksOf(ritual);
  const serverDone = weeks[6] === 1;
  const streak = safeCount(ritual?.streak);
  // 서버가 pendingStreak를 모르는 옛 봉투면: 오늘 완료일 땐 streak-1, 아니면 0으로 둔다.
  const pending = Number.isFinite(ritual?.pendingStreak)
    ? safeCount(ritual.pendingStreak)
    : serverDone ? Math.max(0, streak - 1) : 0;

  if (override === undefined || override === serverDone) {
    return { ...ritual, weeks, streak, pendingStreak: pending };
  }
  const nextWeeks = [...weeks.slice(0, 6), override ? 1 : 0];
  return {
    ...ritual,
    weeks: nextWeeks,
    streak: override ? pending + 1 : 0,
    pendingStreak: pending,
  };
}

// 하나의 오늘 항목. resting = 주 N회 루틴이 최근 7일에 이미 목표를 채워 오늘은 쉬어도 되는 상태.
export function toTodayItem(ritual) {
  const weeks = weeksOf(ritual);
  const doneToday = weeks[6] === 1;
  const target = normalizeTargetPerWeek(ritual?.targetPerWeek) || defaultTargetPerWeek(ritual?.checkType);
  const weekCount = weeks.reduce((a, v) => a + v, 0);
  const resting = !doneToday && target < 7 && weekCount >= target;
  const streak = safeCount(ritual?.streak);
  const pendingStreak = safeCount(ritual?.pendingStreak);
  return {
    ...ritual,
    weeks,
    doneToday,
    target,
    weekCount,
    resting,
    streak,
    pendingStreak,
    // 오늘 체크하지 않으면 끊기는 연속(어제까지 이어졌다) — 동기 부여 문구에만 쓴다. 색 없음.
    streakAtStake: !doneToday && !resting && pendingStreak > 0,
  };
}

export function buildTodayRhythm(rituals, { now = new Date(), timeZone = DEFAULT_RHYTHM_TIME_ZONE, overrides = {} } = {}) {
  const list = Array.isArray(rituals) ? rituals : [];
  const nowBlock = currentTimeBlock(now, timeZone);
  const items = list.map((r) => toTodayItem(applyTodayOverride(r, overrides[r?.id])));

  const groups = RHYTHM_TIME_BLOCKS.map((block) => {
    const blockItems = items.filter((item) => (BLOCK_KEYS.has(item.checkType) ? item.checkType : "midday") === block.key);
    // 그룹 안: 할 것(미완료) → 완료 → 쉬는 날. 같은 층 안에서는 원래 순서를 지킨다.
    const rank = (item) => (item.resting ? 2 : item.doneToday ? 1 : 0);
    const sorted = blockItems
      .map((item, index) => ({ item, index }))
      .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
      .map(({ item }) => item);
    return {
      key: block.key,
      label: block.label,
      isNow: block.key === nowBlock,
      items: sorted,
      done: sorted.filter((i) => i.doneToday).length,
      due: sorted.filter((i) => !i.resting).length,
    };
  }).filter((group) => group.items.length > 0);

  // 지금 시간대를 맨 위로 — 나머지는 하루 순서(아침→낮→저녁→주간)를 지킨다.
  groups.sort((a, b) => Number(b.isNow) - Number(a.isNow));

  const due = items.filter((i) => !i.resting).length;
  const done = items.filter((i) => i.doneToday).length;
  const bestStreak = items.reduce((best, i) => (i.streak > best.streak ? { streak: i.streak, name: i.name || "" } : best), { streak: 0, name: "" });

  return {
    groups,
    total: items.length,
    due,
    done,
    remaining: Math.max(0, due - done),
    resting: items.filter((i) => i.resting).length,
    allDone: due > 0 && done >= due,
    percent: due > 0 ? Math.min(100, Math.round((done / due) * 100)) : 0,
    bestStreak,
  };
}

// 최근 7일 요일 라벨(오늘 포함). 리추얼 weeks 비트맵과 같은 창이다.
export function recentDayLabels(now = new Date(), timeZone = DEFAULT_RHYTHM_TIME_ZONE) {
  const todayKey = toZonedDateKey(now, timeZone);
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = shiftDateKey(todayKey, index - 6);
    const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
    const short = names[day] || "";
    // label은 읽는 이름(오늘/요일), short는 좁은 그리드 머리용 한 글자 요일.
    return { dateKey, label: index === 6 ? "오늘" : short, short, isToday: index === 6 };
  });
}

// 7일 전체 달성률 — 각 루틴의 주간 목표 대비 최근 7일 체크 수(목표를 넘은 체크는 세지 않는다).
export function summarizeRecentWeek(rituals) {
  const items = (Array.isArray(rituals) ? rituals : []).map((r) => toTodayItem(r));
  const target = items.reduce((a, i) => a + i.target, 0);
  const done = items.reduce((a, i) => a + Math.min(i.weekCount, i.target), 0);
  return { done, target, percent: target > 0 ? Math.round((done / target) * 100) : 0 };
}

export function buildRhythmUncheckPayload(ritual) {
  const clean = (v) => (typeof v === "string" ? v.trim() : "");
  return {
    projectId: clean(ritual?.projectId) || null,
    ritualKey: clean(ritual?.ritualKey),
    checkType: clean(ritual?.checkType).toLowerCase(),
  };
}

// DELETE /api/routine/check 봉투 → 체크 취소 결과. not-found는 "이미 취소된 상태"라 실패가
// 아니다 — 기록을 다시 읽어 화면을 서버 값에 맞춘다.
export function resolveRhythmUncheckResult({ responseOk = false, httpStatus = 0, data = null, error = null } = {}) {
  if (error) {
    return { kind: "error", durable: false, shouldRefetch: false, message: error instanceof Error ? error.message : String(error) };
  }
  const status = typeof data?.status === "string" ? data.status.trim().toLowerCase() : "";
  if (responseOk && status === "saved") {
    return { kind: "saved", durable: true, shouldRefetch: true, message: "오늘 체크를 취소했습니다." };
  }
  if (status === "not-found") {
    return { kind: "duplicate", durable: true, shouldRefetch: true, message: "이미 취소된 체크입니다." };
  }
  if (status === "preview") {
    return { kind: "preview", durable: false, shouldRefetch: false, message: "미리보기 상태라 체크 취소가 저장되지 않았습니다." };
  }
  return {
    kind: "error",
    durable: false,
    shouldRefetch: false,
    message: `체크를 취소하지 못했습니다${httpStatus ? ` (${httpStatus})` : ""}.`,
  };
}
