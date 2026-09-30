// 콘텐츠 예약의 시각 규칙 — 순수 함수(서버·화면 공용).
// 운영자 확정 2026-09-29: '놓침'은 그날 밤 정리 때 안 올린 예약. 낮에는 '시각 지남'(중립).
// 밤 정리 시각(KST)은 운영자 미지정이라 상수 하나로 둔다 — 바꾸려면 이 값과 vercel.json 크론(UTC)을 함께 바꾼다.
export const SWEEP_HOUR_KST = 22;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** now 이하에서 가장 최근의 밤 정리 시각(ms). 이 시각 이전의 미발행 예약이 '놓침'이다. */
export function latestSweepBoundary(now = Date.now()) {
  const kst = new Date(now + KST_OFFSET_MS);
  let boundary = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), SWEEP_HOUR_KST) - KST_OFFSET_MS;
  if (boundary > now) boundary -= 24 * HOUR_MS;
  return boundary;
}

/** 저장된 행 → 화면 상태. scheduled(미래) · due(올릴 시각이 됨) · missed · published · cancelled. */
export function deriveScheduleState(row, now = Date.now()) {
  if (!row) return null;
  if (row.status === 'published' || row.status === 'missed' || row.status === 'cancelled') return row.status;
  const at = Date.parse(row.scheduled_at ?? row.scheduledAt);
  if (!Number.isFinite(at)) return null;
  return at > now ? 'scheduled' : 'due';
}

/** 시각이 지난 정도 — 'now'(1시간 이내) | 'late'. 화면에서 "지금"과 "시각 지남"을 가른다. */
export function dueUrgency(row, now = Date.now()) {
  const at = Date.parse(row.scheduled_at ?? row.scheduledAt);
  return Number.isFinite(at) && now - at < HOUR_MS ? 'now' : 'late';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SCHEDULE_LIMITS = { title: 200, channel: 40, pastGraceMs: 5 * 60 * 1000, horizonMs: 366 * 24 * HOUR_MS };

/** 예약 저장 입력 검증. 통과하면 { ok: true, value }, 아니면 { ok: false, reason }. */
export function validateScheduleInput(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid-input' };
  const { variantId, contentId, scheduledAt, title = '', channel = '', expectedRevision } = input;
  if (!UUID.test(String(variantId)) || !UUID.test(String(contentId))) return { ok: false, reason: 'invalid-id' };
  const at = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : NaN;
  if (!Number.isFinite(at)) return { ok: false, reason: 'invalid-time' };
  if (at < now - SCHEDULE_LIMITS.pastGraceMs) return { ok: false, reason: 'time-in-past' };
  if (at > now + SCHEDULE_LIMITS.horizonMs) return { ok: false, reason: 'time-too-far' };
  if (typeof title !== 'string' || title.length > SCHEDULE_LIMITS.title || title.includes('\u0000')) return { ok: false, reason: 'invalid-title' };
  if (typeof channel !== 'string' || channel.length > SCHEDULE_LIMITS.channel) return { ok: false, reason: 'invalid-channel' };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647) return { ok: false, reason: 'invalid-revision' };
  return { ok: true, value: { variantId: String(variantId).toLowerCase(), contentId: String(contentId).toLowerCase(), scheduledAt: new Date(at).toISOString(), title: title.trim(), channel, expectedRevision } };
}

/** 빠른 선택 3개(운영자 미지정 기본값 — 발행 로그가 쌓이면 실제 시간대로 교체한다). KST 기준. */
export function schedulePresets(now = Date.now()) {
  const kst = new Date(now + KST_OFFSET_MS);
  const at = (dayOffset, hour) => Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + dayOffset, hour) - KST_OFFSET_MS;
  const evening = at(0, 19) > now + 10 * 60 * 1000 ? { label: '오늘 저녁 7시', at: at(0, 19) } : { label: '내일 저녁 7시', at: at(1, 19) };
  const morning = at(1, 8) > evening.at ? { label: '내일 아침 8시', at: at(1, 8) } : { label: '모레 아침 8시', at: at(2, 8) };
  return [
    { key: 'in-1h', label: '1시간 뒤', at: new Date(now + HOUR_MS).toISOString() },
    { key: 'evening', label: evening.label, at: new Date(evening.at).toISOString() },
    { key: 'morning', label: morning.label, at: new Date(morning.at).toISOString() },
  ];
}

/** "9/29 19:30" — 한국 시간. */
export function formatKstShort(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t));
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}
