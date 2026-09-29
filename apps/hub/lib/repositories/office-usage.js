// Office 사용 요약 — agent_runs의 office.* 행만 읽는다(요청 원문·답변은 읽지 않는다).
// 2026-09-23 운영자 확정: Office 하단 한 줄 요약(요청·할 일 연결·평균 지연·실패 원인).
import { fetchSupabaseRowsDetailed, withWorkspaceFilter } from '@/lib/server-read';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const answer = await fetchRows('agent_runs', {
    select: 'mode,result,recommendation',
    filters: withWorkspaceFilter([['agent', 'like.office.*'], ['ran_at', `gte.${since}`]]),
    order: 'ran_at.desc',
    limit: 1000,
  });
  if (answer?.configured === false) return { status: 'preview', windowDays: days };
  if (!Array.isArray(answer?.rows)) return { status: 'error', source: 'error', error: 'office-usage-read-failed', windowDays: days };
  return { status: 'live', windowDays: days, ...summarizeOfficeRuns(answer.rows) };
}
