import { WEEKLY_STAT_FIELDS, weeklyStatValue } from '../../../lib/weekly-report-fields.js';
import { reportScopeForWorkspace } from '../workspace-map.js';
import { isCalendarDateKey, shiftDateKey } from '../../../lib/rhythm-calendar.js';

export const REPORT_KINDS = [{ key: 'all', label: '전체' }, { key: 'weekly', label: '주간' }, { key: 'research', label: '리서치' }, { key: 'evaluation', label: '평가' }, { key: 'qa', label: 'QA' }];
export const REPORT_SCOPES = [{ value: 'all', label: '모든 범위' }, { value: 'personal', label: '개인' }, { value: 'company', label: '회사' }, { value: 'content', label: '콘텐츠' }];
export const reportKindLabel = kind => REPORT_KINDS.find(entry => entry.key === kind)?.label || kind;
export const reportScopeLabel = scope => REPORT_SCOPES.find(entry => entry.value === scope)?.label || '범위 미확인';

export function reportFiltersFromSearch(params) {
  const kind = params.get('kind'), week = params.get('week');
  return { kind: REPORT_KINDS.some(entry => entry.key === kind) ? kind : 'all', scope: reportScopeForWorkspace(params.get('scope')), week: isCalendarDateKey(week) ? week : 'all' };
}
export function reportsReadState(data) {
  const validReports = Array.isArray(data?.reports) && data.reports.every(report => report && typeof report.id === 'string' && report.id.trim());
  const status = data?.source !== 'error' && validReports && ['live', 'partial', 'preview', 'error'].includes(data?.status) ? data.status : 'error';
  return { status, reports: ['live', 'partial'].includes(status) ? data.reports : [], failedSources: Array.isArray(data?.failedSources) ? data.failedSources : [], ...(data?.nextCursor !== undefined ? { nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null } : {}) };
}
let reportDateFormatter;
export function reportWeek(report) {
  let date = report.periodStart;
  if (!date && report.createdAt) {
    const instant = new Date(report.createdAt);
    if (!Number.isFinite(instant.getTime())) return null;
    reportDateFormatter ||= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
    date = reportDateFormatter.format(instant);
  }
  if (!isCalendarDateKey(date)) return null;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDateKey(date, -((day + 6) % 7));
}
export function reportWeekOptions(reports) {
  return [...new Set(reports.map(reportWeek).filter(Boolean))].sort().reverse().map(week => ({ value: week, label: `${week} 주` }));
}
export function filterReports(reports, { kind = 'all', scope = 'all', week = 'all' } = {}) {
  return reports.filter(report => (kind === 'all' || report.kind === kind) && (scope === 'all' || report.scope === scope) && (week === 'all' || reportWeek(report) === week));
}
export function mergeReportPages(previous, incoming) {
  const unique = new Map(previous.map(report => [report.id, report]));
  for (const report of incoming) {
    const current = unique.get(report.id);
    if (Number.isFinite(current?.revision) && Number.isFinite(report.revision) && current.revision > report.revision) continue;
    unique.set(report.id, report);
  }
  return [...unique.values()];
}
export function groupReportsByWeek(reports) {
  const groups = new Map();
  for (const report of reports) {
    const week = reportWeek(report);
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(report);
  }
  return [...groups.entries()].sort(([a], [b]) => String(b || '').localeCompare(String(a || ''))).map(([week, reports]) => ({ week, reports }));
}
export function weeklyReportFacts(report) {
  return (WEEKLY_STAT_FIELDS[report.scope] || []).map(field => ({ ...field, ...weeklyStatValue(field, report.facts?.stats) }));
}
export function weeklyCaptureError({ periodStart, periodEnd }, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })) {
  return isCalendarDateKey(periodStart) && isCalendarDateKey(periodEnd) && shiftDateKey(periodStart, 6) === periodEnd && periodEnd < today
    ? null : '주간 보고서는 완료된 7일 기간으로 저장해 주세요.';
}
export function reportHref(id, { kind = 'all', scope = 'all', week = 'all' } = {}) {
  const params = new URLSearchParams();
  if (id) params.set('report', id);
  if (kind !== 'all') params.set('kind', kind);
  if (scope !== 'all') params.set('scope', scope);
  if (week !== 'all') params.set('week', week);
  return `/dashboard/reports${params.size ? `?${params}` : ''}`;
}
export function safeReportLink(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('/dashboard/') && !value.includes('\\')) return value;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function createReportWriter({ fetch: fetcher = globalThis.fetch, uuid = () => globalThis.crypto.randomUUID() } = {}) {
  const pending = new Map();
  return async command => {
    const key = JSON.stringify(command);
    if (!pending.has(key)) pending.set(key, uuid());
    const response = await fetcher('/api/hub/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...command, requestId: pending.get(key) }), cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const result = await response.json().catch(() => ({ status: 'error' }));
    if (response.ok && ['saved', 'duplicate'].includes(result?.status)) pending.delete(key);
    return response.ok || !['saved', 'duplicate'].includes(result?.status) ? result : { status: 'error' };
  };
}
export const reportWriteMessage = result => ({ preview: '보고서 저장소 연결이 필요합니다. 입력은 유지했습니다.', conflict: '다른 변경이 먼저 저장됐습니다. 최신 판단을 확인하고 다시 저장해 주세요.', 'invalid-input': '범위, 기간 또는 문서 내용을 확인해 주세요.', error: '저장 여부를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.' })[result?.status] || '저장되지 않았습니다. 입력을 확인하고 다시 시도해 주세요.';
