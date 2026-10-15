// Office 사용 요약 — agent_runs의 office.* 행만 읽는다(요청 원문·답변은 읽지 않는다).
// 2026-09-23 운영자 확정: Office 하단 한 줄 요약(요청·할 일 연결·평균 지연·실패 원인).
import { fetchSupabaseRowsDetailed, withWorkspaceFilter } from '@/lib/server-read';

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFICE_USAGE_ROW_LIMIT = 1000;

export function summarizeOfficeRuns(rows) {
  const requests = rows.filter(row => row.mode !== 'apply');
  const failures = requests.filter(row => row.result === 'error');
  const failureCategories = {};
  for (const row of failures) {
    const category = row.recommendation?.failure?.category || 'unknown';
    failureCategories[category] = (failureCategories[category] || 0) + 1;
  }
  // 성공한 요청만 평균한다 — 48초 제한에 걸린 실패가 평균을 왜곡하지 않게 한다.
  const elapsed = requests.filter(row => row.result === 'ok').map(row => row.recommendation?.elapsedMs).filter(ms => Number.isFinite(ms) && ms >= 0);
  return {
    requests: requests.length,
    applied: rows.filter(row => row.mode === 'apply' && row.result === 'ok').length,
    failed: failures.length,
    failureCategories,
    averageElapsedMs: elapsed.length ? Math.round(elapsed.reduce((sum, ms) => sum + ms, 0) / elapsed.length) : null,
  };
}

export async function readOfficeUsage({ days = 7, now = Date.now(), fetchRows = fetchSupabaseRowsDetailed } = {}) {
  const since = new Date(now - days * DAY_MS).toISOString();
  const options = {
    select: 'mode,result,recommendation',
    filters: withWorkspaceFilter([['agent', 'like.office.*'], ['ran_at', `gte.${since}`]]),
    order: 'ran_at.desc',
    // One extra row distinguishes a complete available-log window from truncation.
    limit: OFFICE_USAGE_ROW_LIMIT + 1,
  };
  const answer = await fetchRows('agent_runs', options);
  if (answer?.configured === false) return { status: 'preview', windowDays: days };
  if (answer?.error || !Array.isArray(answer?.rows)) return { status: 'error', source: 'error', error: 'office-usage-read-failed', windowDays: days };
  let truncated = answer.rows.length > OFFICE_USAGE_ROW_LIMIT;
  if (answer.rows.length === OFFICE_USAGE_ROW_LIMIT) {
    // A server-side 1000-row cap can suppress the requested lookahead row.
    // Probe only the boundary, with the same window/scope and no recommendation.
    const next = await fetchRows('agent_runs', { ...options, select: 'mode', offset: OFFICE_USAGE_ROW_LIMIT, limit: 1 });
    if (next?.configured === false || next?.error || !Array.isArray(next?.rows)) {
      return { status: 'error', source: 'error', error: 'office-usage-read-failed', windowDays: days };
    }
    truncated = next.rows.length > 0;
  }
  // These are available logs, never a guarantee that every request was logged.
  return { status: 'live', windowDays: days, rowLimit: OFFICE_USAGE_ROW_LIMIT,
    truncated,
    ...summarizeOfficeRuns(answer.rows.slice(0, OFFICE_USAGE_ROW_LIMIT)) };
}
