import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from './ai-assistance.js';
const id = '11111111-1111-4111-8111-111111111111';
const entityId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const version = '2026-09-21T01:00:00.123456+00:00';
const input = () => ({ commandId: id, action: 'save_candidate', input: { entityType: 'tasks', entityId, scope: 'personal', expectedSourceUpdatedAt: version, operation: 'draft', instruction: '자료를 정리', output: '저장된 근거의 초안', client: 'claude' } });

test('assistance validates commands and preserves unknown baseline', () => {
  assert.equal(typeof api.normalizeAssistanceCommand, 'function');
  assert.equal(api.normalizeAssistanceCommand(input()).action, 'save_candidate');
  assert.throws(() => api.normalizeAssistanceCommand({ ...input(), workspaceId }));
  assert.throws(() => api.normalizeAssistanceCommand({ ...input(), input: { ...input().input, scope: 'all' } }));
  const review = api.normalizeAssistanceCommand({ commandId: id, action: 'review_candidate', input: { candidateId: entityId, expectedRevision: 1, outcome: 'accepted', baselineMinutes: null, reviewMinutes: 4, actualMinutes: 12 } });
  assert.equal(api.assistanceTimeSaved(review.input), null);
  assert.equal(api.assistanceTimeSaved({ baselineMinutes: 30, reviewMinutes: 4, actualMinutes: 12 }), 14);
});

test('generation requires exact source scope/revision and only one durable claim invokes provider', async () => {
  assert.equal(typeof api.createAssistanceService, 'function');
  let calls = 0, saved;
  const service = api.createAssistanceService({
    read: async () => ({ rows: [{ id: entityId, workspace_id: workspaceId, title: '할 일', description: '근거', updated_at: version }], error: null }),
    resolveScope: async () => ({ scope: 'personal' }),
    rpc: async (name, args) => {
      if (name.includes('receipt')) return saved || { status: 'unknown', persisted: null };
      if (name.includes('finish')) { saved = { status: 'generated', persisted: true, candidate: { id, output: args.p_result.output } }; return saved; }
      return { status: 'running', persisted: true, claimed: true, candidate: { id } };
    },
    generate: async () => { calls++; return { status: 'generated', output: '근거 기반 답변', provider: 'gemini', model: 'selected', usage: null }; },
  });
  const cmd = { ...input(), action: 'generate', input: { ...input().input } }; delete cmd.input.output; delete cmd.input.client;
  const context = { workspaceId, actorId: 'operator' };
  assert.equal((await service.execute({ ...cmd, input: { ...cmd.input, scope: 'company' } }, context)).error, 'scope-mismatch');
  assert.equal((await service.execute({ ...cmd, input: { ...cmd.input, expectedSourceUpdatedAt: '2026-09-20T00:00:00Z' } }, context)).error, 'source-conflict');
  assert.equal((await service.execute(cmd, context)).status, 'generated');
  assert.equal((await service.execute(cmd, context)).persisted, true);
  assert.equal(calls, 1);
});

test('unknown claim never calls a paid provider and failed reads stay errors', async () => {
  assert.equal(typeof api.createAssistanceService, 'function');
  let calls = 0;
  const service = api.createAssistanceService({ read: async () => ({ rows: [], error: { message: 'unavailable' } }), resolveScope: async () => ({ scope: 'personal' }), rpc: async () => ({ status: 'unknown', persisted: null }), generate: async () => { calls++; } });
  assert.equal((await service.context({ entityType: 'tasks', entityId, scope: 'personal' }, { workspaceId })).status, 'error');
  assert.equal(calls, 0);
});

test('context includes bounded linked goal evidence and small candidate projection', async () => {
  let candidateQuery;
  const service = api.createAssistanceService({
    read: async (table, query) => {
      if (table === 'operating_ai_candidates') { candidateQuery = query; return { rows: [], error: null }; }
      return { rows: [{ id: entityId, workspace_id: workspaceId, title: '원문', updated_at: version }], error: null };
    },
    resolveScope: async () => ({ scope: 'personal' }),
    goals: async (query, context) => { assert.equal(context.workspaceId, workspaceId); assert.equal(query.entityId, entityId); return { status: 'partial', objectives: [{ id, title: '실제 목표' }], metrics: [{ id: entityId, objectiveId: id, name: '고객 반응', measurement: { value: null, coverage: 'unmeasured' }, progress: { status: 'unmeasured' } }] }; },
  });
  const result = await service.context({ entityType: 'tasks', entityId, scope: 'personal' }, { workspaceId });
  assert.equal(result.status, 'partial'); assert.equal(result.goals.metrics[0].measurement.value, null);
  assert.deepEqual(result.missing, ['goals-incomplete']); assert.equal(candidateQuery.limit, 3);
  assert.ok(!candidateQuery.select.includes('source_snapshot'));
});

test('a generated but unsaved result is signed and recoverable without another model call', async () => {
  let calls = 0, failFinish = true;
  const service = api.createAssistanceService({
    recoverySecret: 'test-only-recovery-secret',
    read: async () => ({ rows: [{ id: entityId, workspace_id: workspaceId, title: '원문', updated_at: version }], error: null }),
    resolveScope: async () => ({ scope: 'personal' }),
    rpc: async (name, args) => {
      if (name.includes('receipt')) return { status: 'unknown', persisted: null, error: 'receipt-not-found' };
      if (name.includes('finish')) { if (failFinish) throw new Error('unavailable'); return { status: 'generated', persisted: true, candidate: { id, output: args.p_result.output } }; }
      return { status: 'running', persisted: true, claimed: true, candidate: { id } };
    },
    generate: async () => { calls++; return { status: 'generated', output: '생성 비용을 사용한 결과', model: 'selected', usage: { totalTokenCount: 30 } }; },
  });
  const context = { workspaceId, actorId: 'operator' };
  const command = { ...input(), action: 'generate', input: { ...input().input } }; delete command.input.output; delete command.input.client;
  const first = await service.execute(command, context);
  assert.equal(first.status, 'unsaved'); assert.ok(first.recoveryToken); assert.ok(first.output);
  failFinish = false;
  const recovery = { commandId: id, action: 'recover_candidate', input: { recoveryToken: first.recoveryToken } };
  assert.equal((await service.execute(recovery, context)).candidate.output, first.output);
  assert.equal(calls, 1);
  assert.equal((await service.execute(recovery, { ...context, actorId: 'other' })).error, 'invalid-recovery-token');
  const tampered = first.recoveryToken.slice(0, -2) + 'xx';
  assert.equal((await service.execute({ ...recovery, input: { recoveryToken: tampered } }, context)).error, 'invalid-recovery-token');
});

test('escaped output obeys serialized context budget and full candidate pages reconstruct exactly', async () => {
  const text = String.fromCharCode(1).repeat(24000);
  const row = { id, workspace_id: workspaceId, entity_type: 'tasks', entity_id: entityId, scope: 'personal', output: text, status: 'saved', source_updated_at: version, revision: 1 };
  const service = api.createAssistanceService({
    read: async table => table === 'tasks' ? { rows: [{ id: entityId, workspace_id: workspaceId, title: '원문', updated_at: version }] } : { rows: [row, { ...row, id: entityId }, { ...row, id: workspaceId }] },
    resolveScope: async () => ({ scope: 'personal' }),
  });
  const data = await service.context({ entityType: 'tasks', entityId, scope: 'personal' }, { workspaceId });
  assert.ok(Buffer.byteLength(JSON.stringify(data)) <= 96000);
  assert.equal(data.candidates[0].outputTruncated, true);
  let offset = 0, outputHash, restored = '';
  do {
    const page = await service.candidate({ candidateId: id, offset, outputHash }, { workspaceId });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 32768);
    restored += page.candidate.output; offset = page.nextOffset; outputHash = page.outputHash;
  } while (offset !== null);
  assert.equal(restored, text);
  assert.equal((await service.candidate({ candidateId: id, offset: 3, outputHash: 'wrong' }, { workspaceId })).status, 'conflict');
});

test('recovery preserves heavily escaped generated output within transport and token limits', async () => {
  for (const output of ['"'.repeat(24000), String.fromCharCode(1).repeat(24000)]) {
    let failFinish = true, recoveredOutput;
    const service = api.createAssistanceService({
      recoverySecret: 'test-only-recovery-secret',
      read: async () => ({ rows: [{ id: entityId, workspace_id: workspaceId, title: '원문', updated_at: version }], error: null }),
      resolveScope: async () => ({ scope: 'personal' }),
      rpc: async (name, args) => {
        if (name.includes('receipt')) return { status: 'unknown', persisted: null, error: 'receipt-not-found' };
        if (name.includes('finish')) { if (failFinish) throw new Error('unavailable'); recoveredOutput = args.p_result.output; return { status: 'generated', persisted: true, candidate: { id, output: recoveredOutput } }; }
        return { status: 'running', persisted: true, claimed: true, candidate: { id } };
      },
      generate: async () => ({ status: 'generated', output, model: 'selected', usage: null }),
    });
    const cmd = { ...input(), action: 'generate', input: { ...input().input } }; delete cmd.input.output; delete cmd.input.client;
    const context = { workspaceId, actorId: 'operator' };
    const first = await service.execute(cmd, context);
    assert.ok(Buffer.byteLength(JSON.stringify(first)) <= 96000);
    assert.ok(Buffer.byteLength(first.recoveryToken) <= 60000);
    failFinish = false;
    assert.equal((await service.execute({ commandId: id, action: 'recover_candidate', input: { recoveryToken: first.recoveryToken } }, context)).persisted, true);
    assert.equal(recoveredOutput, output);
  }
});
