import { isCanonicalUuid } from './uuid.js';
import { isCalendarDateKey, toZonedDateKey } from './rhythm-calendar.js';
import { weeklyPeriods } from './weekly-report-fields.js';

const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && !value.includes('\0') && (!required || value.trim()) ? value.trim() : null;
const SCOPES = new Set(['personal', 'company', 'content']);
export function defaultReportPeriod(scope, now = new Date()) {
  const period = weeklyPeriods({ scope, today: toZonedDateKey(now, 'Asia/Seoul'), count: 1 }).find(row => !row.current);
  return period ? { periodStart: period.periodStart, periodEnd: period.periodEnd } : null;
}
export function normalizeReportCommand(input, { now = new Date() } = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || !isCanonicalUuid(input.requestId)) return null;
  const requestId = input.requestId.toLowerCase();
  if (input.action === 'capture-weekly') {
    if (!['personal', 'company'].includes(input.scope)) return null;
    const { periodStart, periodEnd } = input;
    if (!isCalendarDateKey(periodStart) || !isCalendarDateKey(periodEnd)) return null;
    const days = (Date.parse(periodEnd) - Date.parse(periodStart)) / 86400000 + 1;
    if (days !== 7 || periodEnd >= toZonedDateKey(now, 'Asia/Seoul')) return null;
    return { requestId, action: input.action, scope: input.scope, periodStart, periodEnd };
  }
  if (input.action === 'record-decision') {
    const decision = text(input.decision, 5000);
    return isCanonicalUuid(input.reportId) && Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 1 && decision !== null
      ? { requestId, action: input.action, reportId: input.reportId.toLowerCase(), expectedRevision: input.expectedRevision, decision } : null;
  }
  if (input.action !== 'save-document' || !['qa', 'evaluation'].includes(input.kind) || !SCOPES.has(input.scope)) return null;
  const title = text(input.title, 180, true), body = text(input.body, 40000, true);
  if (!title || !body || (input.sourceRefs !== undefined && !Array.isArray(input.sourceRefs)) || (input.sourceRefs?.length || 0) > 16) return null;
  const sourceRefs = (input.sourceRefs || []).map(ref => {
    if (!ref || typeof ref !== 'object') return null;
    try {
      const url = new URL(ref.url), label = text(ref.label || ref.url, 240, true);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && label && url.toString().length <= 2000 ? { url: url.toString(), label } : null;
    } catch { return null; }
  });
  if (sourceRefs.some(ref => !ref)) return null;
  return { requestId, action: input.action, kind: input.kind, scope: input.scope, title, body, sourceRefs };
}
