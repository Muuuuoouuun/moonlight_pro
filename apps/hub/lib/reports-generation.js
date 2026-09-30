import { createHash } from 'node:crypto';
import { officeOperatorIdentity, officeWorkflowService } from './office/workflow-runtime.js';
import { assertHubWriteAllowed } from './hub-write-guard.js';
import { recordAutomationRun } from './automation-runs.js';
import { estimateCallCostUsd } from './ai-pricing.js';
import { runReportCommand } from './reports-service.js';
import { scheduledWeeklyCaptures } from './reports-schedule.js';
import { resolveDefaultWorkspaceId } from './server-write.js';

function officeRequestId(command, identity) {
  const bytes = createHash('sha256').update(JSON.stringify(['report-office-weekly:v1', identity.workspaceId,
    identity.actorId, command.scope, command.periodStart, command.periodEnd])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function generationMetadata(result, requestId, { missing = [], replayed = false, attempted = false } = {}) {
  const generation = result?.result?.generation;
  const absent = result?.result?.context?.missing || missing;
  const usage = generation?.usage;
  // Office sums draft/review counts. Total minus prompt includes thinking;
  // per-call long-context tiers cannot be reconstructed above 200k tokens.
  const known = usage && ['promptTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)
    && usage.totalTokens >= usage.promptTokens + usage.outputTokens && usage.promptTokens <= 200000;
  const estimatedCostUsd = known ? estimateCallCostUsd({ model: generation.model, promptTokens: usage.promptTokens,
    outputTokens: usage.totalTokens - usage.promptTokens }) : null;
  return { status: result?.status || 'unknown', requestId, replayed, attempted,
    missing: Array.isArray(absent) ? absent.filter(item => typeof item === 'string') : [],
    usage: generation?.usage ?? null, model: generation?.model ?? null, elapsedMs: generation?.elapsedMs ?? null,
    estimatedCostUsd, costBasis: estimatedCostUsd === null ? null : 'aggregate-total-minus-prompt',
    ...(result?.error ? { error: result.error } : {}) };
}

export async function prepareWeeklyReport(command, {
  now = new Date(), identity = { workspaceId: resolveDefaultWorkspaceId(), actorId: 'operator' },
  enabled = process.env.COM_MOON_REPORTS_AI_ENABLED === 'true', capture = runReportCommand, office = officeWorkflowService,
} = {}) {
  let saved;
  try { saved = await capture(command, { workspaceId: identity.workspaceId, now }); }
  catch { saved = { status: 'error', error: 'report-capture-unavailable' }; }
  const snapshot = { status: saved?.status || 'error', reportId: saved?.reportId ?? null, revision: saved?.revision ?? null,
    ...(saved?.error ? { error: saved.error } : {}) };
  const base = { scope: command.scope, periodStart: command.periodStart, periodEnd: command.periodEnd, snapshot };
  if (!['saved', 'duplicate'].includes(snapshot.status)) {
    return { ...base, status: snapshot.status === 'preview' ? 'partial' : 'error', ai: { status: 'blocked', attempted: false, replayed: false }, failedSources: ['snapshot'] };
  }
  if (!enabled) return { ...base, status: 'live', ai: { status: 'disabled', attempted: false, replayed: false }, failedSources: [] };

  const requestId = officeRequestId(command, identity);
  let ai;
  try {
    // Checking the durable receipt before context avoids repeated source reads
    // and preserves failed/running outcomes without another paid generation.
    const prior = await office.receipt(requestId, identity);
    if (prior?.status !== 'not-found') ai = generationMetadata(prior, requestId, { replayed: true });
    else {
      const input = { intent: 'weekly_report', scope: command.scope === 'company' ? 'classin' : 'personal',
        originRef: { periodStart: command.periodStart, periodEnd: command.periodEnd, timezone: 'Asia/Seoul' } };
      const context = await office.context(input, identity);
      if (context?.status !== 'ready' || context.capabilities?.generate !== true) {
        ai = generationMetadata(context, requestId);
      } else {
        const request = { ...input, requestId, ownerId: 'vaporeon', mode: 'draft', participants: [],
          expectedContextHash: context.contextHash, boundedHistory: [],
          message: '선택한 완료 주간의 실제 기록으로 주간 보고서를 작성해 주세요. 확인한 사실, 원인을 해석한 내용, 아직 모르는 것을 구분하고 미측정 값은 0으로 쓰지 마세요. 회사 보고서에는 개인 기록을 넣지 마세요. 다음 행동은 제안만 하고 업무 생성이나 외부 전송은 실행하지 마세요.' };
        try { ai = generationMetadata(await office.execute(request, identity), requestId, { missing: context.missing, attempted: true }); }
        catch { ai = generationMetadata({ status: 'unknown', error: 'office-generation-outcome-unknown' }, requestId, { missing: context.missing, attempted: true }); }
      }
    }
  } catch { ai = generationMetadata({ status: 'error', error: 'office-preparation-unavailable' }, requestId); }
  const complete = ai.status === 'generated';
  return { ...base, status: complete && !ai.missing.length ? 'live' : 'partial', ai,
    failedSources: complete ? [...ai.missing] : ['office', ...ai.missing] };
}

export async function runReportsSweep({ now = new Date(), ...deps } = {}) {
  const results = [];
  for (const command of scheduledWeeklyCaptures(now)) results.push(await prepareWeeklyReport(command, { ...deps, now }));
  const status = results.length && results.every(row => row.status === 'error') ? 'error'
    : results.some(row => row.status !== 'live') ? 'partial' : 'live';
  return { status, results };
}

export function createReportsSweepHandler({ guard = assertHubWriteAllowed, run = runReportsSweep,
  identity = officeOperatorIdentity, record = recordAutomationRun, clock = () => new Date() } = {}) {
  return async req => {
    const denied = guard(req);
    if (denied) return denied;
    const now = clock(), actor = identity(req);
    let output;
    try { output = await run({ identity: actor, now }); }
    catch { output = { status: 'error', results: [], error: 'report-sweep-unavailable' }; }
    let automationLog = 'not-needed';
    const changed = output.error || output.results.some(row => row.snapshot?.status !== 'duplicate'
      || row.ai?.attempted === true || (row.ai?.replayed !== true && row.ai?.status !== 'disabled'));
    if (changed) {
      const saved = output.results.filter(row => row.snapshot?.status === 'saved').length;
      const generated = output.results.filter(row => row.ai?.status === 'generated' && row.ai?.replayed !== true).length;
      try {
        const receipt = await record({ workspaceId: actor.workspaceId, key: 'reports-sweep', name: '주간 보고서 준비',
          startedAt: now.toISOString(), status: output.status === 'live' ? 'success' : 'failure', input: {},
          output: { ...output, summary: `주간 보고서 ${saved}건 보관 · AI ${generated}건 작성` },
          errorMessage: output.status === 'live' ? null : output.status === 'partial' ? 'report-preparation-incomplete' : 'report-preparation-failed' });
        automationLog = receipt?.persisted === true ? 'saved' : 'error';
      } catch { automationLog = 'error'; }
    }
    return Response.json({ ...output, automationLog }, { status: output.status === 'error' ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' } });
  };
}
