import assert from 'node:assert/strict';
import test from 'node:test';
import { agentHash } from '@com-moon/agent-contracts';
import { parseOfficeWorkflowRequest, OFFICE_WORKFLOW_VERSION } from '@com-moon/agent-contracts/office-workflow';
import { createOfficeWorkflowService } from './office/workflow-service.js';
import { scheduledWeeklyCaptures } from './reports-schedule.js';
let prepareWeeklyReport, runReportsSweep;
try { ({ prepareWeeklyReport, runReportsSweep } = await import('./reports-generation.js')); } catch {}
const W = '11111111-1111-4111-8111-111111111111';
const identity = { workspaceId: W, actorId: 'operator' };
const now = new Date('2026-10-01T00:00:00Z');
const command = scheduledWeeklyCaptures(now)[0];
const snapshot = { status: 'saved', reportId: W, revision: 1 };
const context = input => ({ status: 'ready', scope: input.scope, originRef: input.originRef, originKey: 'weekly:company',
  facts: { stats: { contacts: null, movedDeals: 0 } }, sourceRefs: [], missing: [], asOf: now.toISOString(),
  contextHash: 'a'.repeat(64), capabilities: { generate: true, applyTask: true } });

function officeHarness({ missing = [] } = {}) {
  const rows = new Map(), counts = { context: 0, paid: 0, tasks: 0 }, calls = [];
  const envelope = (row, claimed = false) => ({ status: row.state, request: structuredClone(row), persisted: true, claimed });
  const service = createOfficeWorkflowService({
    recoverySecret: 'test-only-signing-key', engineConfigured: () => true, now: () => now.getTime(),
    readContext: async input => { counts.context++; return { ...context(input), missing }; },
    apply: async () => { counts.tasks++; throw Error('automatic task creation forbidden'); },
    generate: async (request, resolved) => { counts.paid++; return {
      version: OFFICE_WORKFLOW_VERSION, requestId: request.requestId, ownerId: request.ownerId, mode: request.mode,
      participants: [], scope: request.scope, status: 'generated', resultRevision: 1,
      summary: '주간 해석', artifact: { kind: 'text', body: 'private generated report body' }, evidence: [],
      uncertainties: [], dissent: [], nextStep: null,
      context: { asOf: resolved.asOf, contextHash: resolved.contextHash, missing: resolved.missing },
      generation: { policyVersion: OFFICE_WORKFLOW_VERSION, promptHash: 'b'.repeat(64), model: 'configured-model',
        usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 }, elapsedMs: 8 },
    }; },
    rpc: async (name, params) => {
      calls.push({ name, params });
      const id = params.p_request_id || params.p_request?.requestId, row = rows.get(id);
      if (name === 'office_request_receipt_v1') {
        if (!row) return { status: 'not-found', persisted: false };
        if (params.p_request && row.request_hash !== agentHash(params.p_request)) return { status: 'conflict', persisted: false };
        return envelope(row);
      }
      if (name === 'office_request_list_v1') return { status: 'ready', items: [] };
      if (name === 'office_request_claim_v1') {
        if (row) return envelope(row);
        const r = params.p_request;
        const inserted = { id, actor_id: params.p_actor_id, workspace_id: params.p_workspace_id, state: 'running',
          attempt_token: W, request_hash: agentHash(r), intent: r.intent, scope: r.scope, owner_id: r.ownerId,
          mode: r.mode, participants: [], origin_ref: r.originRef, input_snapshot: r, context_snapshot: params.p_context,
          created_at: now.toISOString(), result_revision: null, application: null };
        rows.set(id, inserted); return envelope(inserted, true);
      }
      if (name === 'office_request_finish_v1') { row.state = params.p_result.status; row.result = params.p_result; row.result_revision = 1; return envelope(row); }
      if (name === 'office_request_log_v1') return envelope(row);
      throw Error(`unexpected RPC ${name}`);
    },
  });
  return { service, rows, counts, calls };
}

test('disabled automatic AI still captures measured facts and never contacts Office', async () => {
  assert.equal(typeof prepareWeeklyReport, 'function'); let captures = 0;
  const result = await prepareWeeklyReport(command, { identity, now, enabled: false,
    capture: async () => { captures++; return snapshot; }, office: new Proxy({}, { get: () => assert.fail('Office disabled') }) });
  assert.equal(captures, 1); assert.equal(result.status, 'live'); assert.equal(result.ai.status, 'disabled');
});

test('same period concurrent sweeps claim one paid Vaporeon generation and never create tasks', async () => {
  assert.equal(typeof prepareWeeklyReport, 'function'); const h = officeHarness();
  const deps = { identity, now, enabled: true, capture: async input => { assert.deepEqual(input, command); return snapshot; }, office: h.service };
  const answers = await Promise.all([prepareWeeklyReport(command, deps), prepareWeeklyReport(command, deps)]);
  assert.equal(h.counts.paid, 1); assert.equal(h.counts.tasks, 0);
  assert.ok(answers.every(answer => ['generated', 'running'].includes(answer.ai.status)));
  const id = answers.find(answer => answer.ai.status === 'generated').ai.requestId;
  assert.notEqual(id, command.requestId);
  const request = h.rows.get(id).input_snapshot;
  assert.deepEqual(parseOfficeWorkflowRequest(request), request);
  assert.equal(request.ownerId, 'vaporeon'); assert.equal(request.mode, 'draft'); assert.equal(request.scope, 'classin');
  assert.deepEqual(request.originRef, { periodStart: command.periodStart, periodEnd: command.periodEnd, timezone: 'Asia/Seoul' });
  const before = h.counts.context;
  const replay = await prepareWeeklyReport(command, { ...deps, capture: async () => ({ ...snapshot, status: 'duplicate' }) });
  assert.equal(replay.ai.status, 'generated'); assert.equal(replay.ai.replayed, true);
  assert.equal(h.counts.context, before); assert.equal(h.counts.paid, 1);
});

test('existing running or failed generation is inspected without repeating context or model calls', async () => {
  assert.equal(typeof prepareWeeklyReport, 'function');
  for (const status of ['running', 'error', 'expired', 'unknown']) {
    const result = await prepareWeeklyReport(command, { identity, now, enabled: true, capture: async () => snapshot,
      office: { receipt: async () => ({ status, persistence: { persisted: status !== 'unknown' }, error: status === 'error' ? 'office-generation-failed' : undefined }),
        context: () => assert.fail('receipt must precede expensive read'), execute: () => assert.fail('no paid retry') } });
    assert.equal(result.ai.status, status); assert.equal(result.status, 'partial');
  }
});

test('snapshot failure stops paid preparation and context/configuration errors keep the saved facts visible', async () => {
  assert.equal(typeof prepareWeeklyReport, 'function');
  const failed = await prepareWeeklyReport(command, { identity, now, enabled: true, capture: async () => ({ status: 'error', error: 'weekly-facts-unavailable' }),
    office: { receipt: () => assert.fail('snapshot required first') } });
  assert.equal(failed.status, 'error');
  for (const status of ['error', 'preview']) {
    const result = await prepareWeeklyReport(command, { identity, now, enabled: true, capture: async () => snapshot,
      office: { receipt: async () => ({ status: 'not-found' }), context: async () => ({ status, error: 'office-context-unavailable' }), execute: () => assert.fail('context unavailable') } });
    assert.equal(result.status, 'partial'); assert.equal(result.snapshot.reportId, W); assert.equal(result.ai.status, status);
  }
});

test('partial source evidence and model usage survive automation metadata without private report body', async () => {
  assert.equal(typeof prepareWeeklyReport, 'function'); const h = officeHarness({ missing: ['contacts_recorded'] });
  const result = await prepareWeeklyReport(command, { identity, now, enabled: true, capture: async () => snapshot, office: h.service });
  assert.equal(result.status, 'partial'); assert.deepEqual(result.ai.missing, ['contacts_recorded']);
  assert.deepEqual(result.ai.usage, { promptTokens: 10, outputTokens: 5, totalTokens: 15 });
  assert.equal(JSON.stringify(result).includes('private generated report body'), false);
  assert.equal(JSON.stringify(result).includes('attempt_token'), false);
  const replay = await prepareWeeklyReport(command, { identity, now, enabled: true, capture: async () => ({ ...snapshot, status: 'duplicate' }), office: h.service });
  assert.equal(replay.status, 'partial'); assert.deepEqual(replay.ai.missing, ['contacts_recorded']);
});

test('sweep uses personal Monday and company Thursday completed periods and does nothing on other days', async () => {
  assert.equal(typeof runReportsSweep, 'function'); const seen = [];
  const deps = { identity, enabled: false, capture: async input => { seen.push(input); return snapshot; } };
  await runReportsSweep({ ...deps, now: new Date('2026-09-27T23:30:00Z') });
  await runReportsSweep({ ...deps, now });
  assert.deepEqual(seen.map(input => [input.scope, input.periodStart, input.periodEnd]), [
    ['personal', '2026-09-21', '2026-09-27'], ['company', '2026-09-24', '2026-09-30']]);
  const quiet = await runReportsSweep({ ...deps, now: new Date('2026-09-29T00:00:00Z') });
  assert.deepEqual(quiet.results, []); assert.equal(seen.length, 2);
});

test('run cost includes thinking from aggregate totals and remains unpriced when counts or model are unknown', async () => {
  const receipt = generation => ({ status: 'generated', result: { generation, context: { missing: [] } } });
  const prepare = generation => prepareWeeklyReport(command, { identity, now, enabled: true,
    capture: async () => snapshot, office: { receipt: async () => receipt(generation) } });
  const priced = await prepare({ model: 'gemini-2.5-flash', usage: { promptTokens: 100, outputTokens: 50, totalTokens: 250 } });
  assert.equal(priced.ai.estimatedCostUsd, 0.000405);
  assert.equal(priced.ai.costBasis, 'aggregate-total-minus-prompt');
  for (const generation of [{ model: 'unknown', usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 } },
    { model: 'gemini-2.5-flash', usage: null },
    { model: 'gemini-2.5-flash', usage: { promptTokens: 100, outputTokens: 50, totalTokens: 120 } },
    { model: 'gemini-2.5-pro', usage: { promptTokens: 200001, outputTokens: 50, totalTokens: 200051 } }]) {
    assert.equal((await prepare(generation)).ai.estimatedCostUsd, null);
  }
});

test('Monday sweep includes the news roundup independently of personal AI and exposes save failures', async () => {
  let calls=0;
  const result=await runReportsSweep({identity,enabled:false,env:{COM_MOON_RESEARCH_ENABLED:'true'},now:new Date('2026-10-05T08:30:00+09:00'),
    capture:async()=>snapshot,newsRoundup:async input=>{calls++;assert.equal(input.workspaceId,W);assert.equal(input.enabled,true);return {status:'saved',reportId:W};}});
  assert.equal(calls,1);assert.equal(result.news.status,'saved');assert.equal(result.results[0].scope,'personal');
  const failed=await runReportsSweep({identity,enabled:false,now:new Date('2026-10-05T08:30:00+09:00'),capture:async()=>snapshot,newsRoundup:async()=>({status:'error'})});
  assert.equal(failed.status,'partial');assert.equal(failed.results[0].snapshot.status,'saved');
});
