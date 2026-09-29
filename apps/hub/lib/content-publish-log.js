// 발행 로그 — 예약(content_schedules)과 발행 기록(publish_logs)을 결과물 단위로 합친다. 순수 함수.
// 상태: scheduled(예약됨) · due(올릴 차례) · missed(놓침) · published(발행됨) · cancelled(예약 해제).
// 발행 기록이 있으면 예약 상태와 무관하게 발행됨이다(놓친 뒤 늦게 올려도 사실은 발행).
import { deriveScheduleState, formatKstShort } from './content-schedule.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LATE_MS = 60 * 60 * 1000;
export const LOG_FILTERS = [
  { key: 'all', label: '전체' }, { key: 'action', label: '올릴 차례' }, { key: 'scheduled', label: '예약' }, { key: 'published', label: '발행됨' },
];
const timeOf = (value) => { const t = Date.parse(value); return Number.isFinite(t) ? t : null; };

/** KST 날짜 키 'YYYY-MM-DD'. */
export const kstDateKey = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

/** 예약 행과 발행 기록 → 로그 행(최근 것이 위). metricsById는 성과 화면이 소유한 직접 기록 수치(읽기만). */
export function buildPublishLog({ schedules = [], publishLogs = [], metricsById = {} } = {}, now = Date.now()) {
  const published = new Map();
  for (const log of publishLogs) {
    if (log?.status !== 'published' || !log.variantId || timeOf(log.publishedAt) === null) continue;
    const previous = published.get(log.variantId);
    if (!previous || timeOf(log.publishedAt) > timeOf(previous.publishedAt)) published.set(log.variantId, log);
  }
  const scheduleBy = new Map(schedules.map((row) => [row.variantId, row]));
  const ids = new Set([...scheduleBy.keys(), ...published.keys()]);
  const rows = [];
  for (const variantId of ids) {
    const schedule = scheduleBy.get(variantId) || null;
    const publish = published.get(variantId) || null;
    const scheduledMs = schedule ? timeOf(schedule.scheduledAt) : null;
    const publishedMs = publish ? timeOf(publish.publishedAt) : null;
    const scheduleState = schedule ? deriveScheduleState({ status: schedule.status, scheduled_at: schedule.scheduledAt }, now) : null;
    const state = publish ? 'published' : scheduleState;
    if (!state) continue;
    const atMs = publish ? publishedMs : scheduledMs;
    if (atMs === null) continue;
    const usedSchedule = Boolean(schedule && schedule.status !== 'cancelled');
    const events = [];
    if (schedule?.createdAt && timeOf(schedule.createdAt) !== null) events.push({ atMs: timeOf(schedule.createdAt), kind: 'created', label: `예약 만듦 · ${formatKstShort(schedule.scheduledAt)}에 올리기` });
    if (schedule?.missedAt && timeOf(schedule.missedAt) !== null) events.push({ atMs: timeOf(schedule.missedAt), kind: 'missed', label: '놓침으로 정리됨 (밤 정리)' });
    if (schedule?.status === 'cancelled' && timeOf(schedule.updatedAt) !== null) events.push({ atMs: timeOf(schedule.updatedAt), kind: 'cancelled', label: '예약 해제' });
    if (publish) events.push({ atMs: publishedMs, kind: 'published', label: publish.provenance === 'operator_confirmed' ? '발행 기록 · 운영자 확인' : '발행 기록', url: publish.targetUrl || null });
    events.sort((a, b) => a.atMs - b.atMs);
    rows.push({
      variantId, contentId: schedule?.contentId || publish?.contentId || null,
      title: schedule?.title || publish?.title || '', channel: schedule?.channel || publish?.channel || '',
      state, atMs, at: new Date(atMs).toISOString(), method: usedSchedule ? 'notify' : 'manual',
      lateMinutes: publish && usedSchedule && scheduledMs !== null && publishedMs - scheduledMs > LATE_MS ? Math.round((publishedMs - scheduledMs) / 60000) : 0,
      url: publish?.targetUrl || null, metrics: metricsById[variantId] || null, events,
      revision: schedule?.revision ?? null,
    });
  }
  return rows.sort((a, b) => b.atMs - a.atMs || a.variantId.localeCompare(b.variantId));
}

export function filterLog(rows, filter) {
  if (filter === 'action') return rows.filter((row) => row.state === 'due' || row.state === 'missed');
  if (filter === 'scheduled') return rows.filter((row) => row.state === 'scheduled');
  if (filter === 'published') return rows.filter((row) => row.state === 'published');
  return rows;
}

export const countLog = (rows) => Object.fromEntries(LOG_FILTERS.map(({ key }) => [key, filterLog(rows, key).length]));

/** 이번 주(월~일, KST) 7칸. 각 칸에 그날의 행을 시간순으로 담는다. */
export function weekStrip(rows, now = Date.now()) {
  const todayKey = kstDateKey(now);
  const kst = new Date(now + KST_OFFSET_MS);
  const mondayOffset = (kst.getUTCDay() + 6) % 7;
  const mondayMs = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - mondayOffset) - KST_OFFSET_MS;
  return Array.from({ length: 7 }, (_, index) => {
    const dayMs = mondayMs + index * DAY_MS;
    const key = kstDateKey(dayMs);
    return {
      key, label: ['월', '화', '수', '목', '금', '토', '일'][index], dayOfMonth: Number(key.slice(8)),
      isToday: key === todayKey, isFuture: key > todayKey,
      items: rows.filter((row) => kstDateKey(row.atMs) === key).sort((a, b) => a.atMs - b.atMs),
    };
  });
}
