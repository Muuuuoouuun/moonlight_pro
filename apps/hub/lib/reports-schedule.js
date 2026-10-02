import { createHash } from 'node:crypto';
import { defaultReportPeriod } from './reports-contract.js';
import { toZonedDateKey } from './rhythm-calendar.js';
export function scheduledWeeklyCaptures(now = new Date()) {
  const today = toZonedDateKey(now, 'Asia/Seoul');
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const scope = day === 1 ? 'personal' : day === 4 ? 'company' : null;
  if (!scope || hour < 8) return [];
  const period = defaultReportPeriod(scope, now), bytes = createHash('sha256').update(`report-schedule:${scope}:${period.periodStart}:${period.periodEnd}`).digest();
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex');
  return [{ requestId: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`, action: 'capture-weekly', scope, ...period }];
}
