import { performancePeriods, seoulDate } from './content-performance.js';
export function performanceRows(rows, { view, brand = '', channel = '', year, month = '' }, now) {
  const period = performancePeriods(now);
  return rows.filter(row => {
    if (brand && row.brandId !== brand || channel && row.channel !== channel) return false;
    const date = seoulDate(row.publishedAt);
    if (view === 'week') return date >= period.weekStart && date <= period.today;
    if (view === 'monthly') return date.startsWith(`${year}-${month}`);
    return date.startsWith(period.month);
  });
}
export function parsePerformanceMetrics(input) {
  const result = {};
  for (const key of ['views', 'shares', 'replies']) {
    const value = String(input[key] ?? '').trim();
    if (!value) result[key] = null;
    else if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error('수치는 0 이상의 정수로 입력해 주세요.');
    else result[key] = Number(value);
  }
  if (Object.values(result).every(value => value === null)) throw Error('조회수·공유·답글 중 하나 이상 기록해 주세요.');
  return result;
}
