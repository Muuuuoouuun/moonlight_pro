import { createHash } from 'node:crypto';
import { normalizeReportCommand } from './reports-contract.js';
import { getWeeklyReport } from './repositories/weekly-report.js';
import { invokeSupabaseRpc, resolveDefaultWorkspaceId } from './server-write.js';
import { isCanonicalUuid } from './uuid.js';

export async function runReportCommand(input, { workspaceId = resolveDefaultWorkspaceId(), now = new Date(), getWeekly = getWeeklyReport, invokeRpc = invokeSupabaseRpc } = {}) {
  const command = normalizeReportCommand(input, { now });
  if (!command) return { status: 'invalid-input', error: 'invalid-report-command', httpStatus: 400 };
  if (!isCanonicalUuid(workspaceId)) return { status: 'preview', error: 'missing-workspace', httpStatus: 503 };
  const { requestId, ...wire } = command;
  const hash = createHash('sha256').update(JSON.stringify(wire)).digest('hex');
  let payload = wire;
  try {
    // A prior save remains confirmable even when its source ledger is down.
    const receipt = await invokeRpc('report_receipt_v1', { p_workspace_id: workspaceId, p_request_id: requestId, p_request_hash: hash });
    if (!receipt.ok || !receipt.data) return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 };
    if (receipt.data.status === 'duplicate') return { ...receipt.data, httpStatus: 200 };
    if (receipt.data.status === 'conflict') return { ...receipt.data, httpStatus: 409 };
    if (receipt.data.status !== 'not-found') return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 };
    if (command.action === 'capture-weekly') {
      const report = await getWeekly({ scope: command.scope, periodStart: command.periodStart, periodEnd: command.periodEnd, includeGoals: false, workspaceId, now });
      if (!report || ['error', 'preview'].includes(report.source) || !report.stats) return { status: 'error', error: 'weekly-facts-unavailable', httpStatus: 502 };
      payload = { action: command.action, kind: 'weekly', scope: command.scope, periodStart: command.periodStart, periodEnd: command.periodEnd,
        title: `${command.scope === 'company' ? '회사' : '개인'} 주간 리포트 · ${command.periodStart} — ${command.periodEnd}`,
        sourceKey: `weekly:${command.scope}:${command.periodStart}:${command.periodEnd}`,
        payload: { facts: report, summary: `${command.periodStart} — ${command.periodEnd} 실제 원장 집계`, status: report.partial ? 'partial' : 'live', sourceRefs: [{ type: 'weekly_report', label: '선택 기간의 실제 원장' }] } };
    } else if (command.action === 'save-document') {
      payload = { action: command.action, kind: command.kind, scope: command.scope, title: command.title,
        sourceKey: `document:${requestId}`, payload: { facts: { body: command.body }, summary: command.body.slice(0, 240), sourceRefs: command.sourceRefs, status: 'live' } };
    }
    const result = await invokeRpc('report_command_v1', { p_workspace_id: workspaceId, p_request_id: requestId, p_request_hash: hash, p_command: payload }, { timeoutMs: 15000 });
    if (!result.ok || !result.data || typeof result.data !== 'object') return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 };
    const answer = result.data;
    if (['saved', 'duplicate', 'conflict', 'invalid-input', 'not-found'].includes(answer.status)) return { ...answer, httpStatus: answer.status === 'conflict' ? 409 : answer.status === 'invalid-input' ? 400 : answer.status === 'not-found' ? 404 : 200 };
  } catch { /* Upstream details remain private. */ }
  return { status: 'error', error: 'save-unconfirmed', httpStatus: 502 };
}
