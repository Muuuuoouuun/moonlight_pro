const METRIC_KEYS = ['views', 'shares', 'replies'];
const seoulFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function seoulDate(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(seoulFormatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function performancePeriods(now = new Date()) {
  const today = seoulDate(now);
  if (!today) throw new TypeError('집계 시각이 올바르지 않습니다.');
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return { today, weekStart: monday.toISOString().slice(0, 10), month: today.slice(0, 7), year: Number(today.slice(0, 4)) };
}

export function summarizePublications(rows) {
  const summary = { published: rows.length, views: null, shares: null, replies: null, coverage: { views: 0, shares: 0, replies: 0 }, lastCapturedAt: null };
  for (const row of rows) {
    for (const key of METRIC_KEYS) {
      const value = row.metrics?.[key];
      if (Number.isSafeInteger(value) && value >= 0) {
        summary[key] = (summary[key] ?? 0) + value;
        summary.coverage[key] += 1;
      }
    }
    const capturedAt = row.metrics?.capturedAt;
    const time = capturedAt ? new Date(capturedAt).getTime() : NaN;
    if (Number.isFinite(time) && (!summary.lastCapturedAt || time > new Date(summary.lastCapturedAt).getTime())) {
      summary.lastCapturedAt = new Date(time).toISOString();
    }
  }
  return summary;
}
