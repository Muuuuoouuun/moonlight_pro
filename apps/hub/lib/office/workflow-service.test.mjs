import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { agentHash } from '@com-moon/agent-contracts';
import { OFFICE_WORKFLOW_VERSION } from '@com-moon/agent-contracts/office-workflow';
import { OFFICE_DISCUSSION_VERSION, parseOfficeDeliberation } from '@com-moon/agent-contracts/office';
import { createOfficeWorkflowService, projectOfficeReceipt } from './workflow-service.js';
import { createOfficeWorkflowHandler } from './workflow-http.js';
import { readOfficeTaskTargets } from './workflow-runtime.js';
import { callOfficeWorkflowEngine } from './workflow-engine-client.js';
import { resolveRouteAccess } from '../route-access.js';

const identity = () => ({ workspaceId: randomUUID(), actorId: 'operator' });
const request = () => ({ requestId: randomUUID(), intent: 'weekly_report', scope: 'personal', ownerId: 'vaporeon', mode: 'draft', participants: [], originRef: { periodStart: '2026-09-14', periodEnd: '2026-09-20', timezone: 'Asia/Seoul' }, expectedContextHash: 'a'.repeat(64), message: '이번 주를 정리해 주세요.', boundedHistory: [] });
const resolved = r => ({ status: 'ready', scope: r.scope, originRef: r.originRef, originKey: 'weekly:personal:2026-09-14', sourceRefs: [], facts: {}, missing: [], asOf: '2026-09-21T00:00:00Z', contextHash: r.expectedContextHash, capabilities: { generate: true, applyTask: true } });
const generated = (r, c) => ({ version: OFFICE_WORKFLOW_VERSION, requestId: r.requestId, resultRevision: 1, status: 'generated', ownerId: r.ownerId, mode: r.mode, participants: r.participants, scope: r.scope, summary: '확인한 주간 업무입니다.', artifact: { kind: 'text', body: '이번 주 확인된 업무를 정리했습니다.' }, evidence: [], uncertainties: [], dissent: [], nextStep: null, context: { asOf: c.asOf, contextHash: c.contextHash, missing: c.missing }, generation: { policyVersion: OFFICE_WORKFLOW_VERSION, promptHash: 'b'.repeat(64), model: 'configured-model', usage: null, elapsedMs: 100 } });

function harness(overrides = {}) {
  const rows = new Map(), calls = [], counts = { context: 0, generation: 0, run: 0 };
  let clock = Date.parse('2026-09-21T00:00:00Z');
  const envelope = (row, claimed = false) => ({ status: row.state, request: structuredClone(row), persisted: true, claimed });
  const deps = {
    now: () => clock, recoverySecret: 'test-only-recovery-signing-key', engineConfigured: () => true,
    readContext: async r => { counts.context++; return resolved({ ...r, expectedContextHash: 'a'.repeat(64) }); },
    generate: async (r, c) => { counts.generation++; return generated(r, c); },
    recordRun: async () => { counts.run++; return { persisted: true, id: randomUUID() }; },
    rpc: async (name, params) => {
      calls.push({ name, params });
      const id = params.p_request_id || params.p_request?.requestId, row = rows.get(id);
      if (name === 'office_request_receipt_v1') {
        if (!row || row.actor_id !== params.p_actor_id || row.workspace_id !== params.p_workspace_id) return { status: 'not-found', persisted: false };
        if (params.p_request && row.request_hash !== agentHash(params.p_request)) return { status: 'conflict', error: 'request-id-reuse', persisted: false };
        return envelope(row);
      }
      if (name === 'office_request_claim_v1') {
        if (row) return envelope(row);
        const r = params.p_request;
        const inserted = { id, workspace_id: params.p_workspace_id, actor_id: params.p_actor_id, request_hash: agentHash(r), attempt_token: randomUUID(), state: 'running', input_snapshot: r, context_snapshot: params.p_context, context_hash: r.expectedContextHash, origin_ref: r.originRef, owner_id: r.ownerId, intent: r.intent, scope: r.scope, mode: r.mode, participants: r.participants, created_at: new Date(clock).toISOString(), application: null };
        rows.set(id, inserted); return envelope(inserted, true);
      }
      if (name === 'office_request_finish_v1') {
        if (!row || row.attempt_token !== params.p_attempt_token) return { status: 'conflict', persisted: false };
        row.state = params.p_result.status; row.result = params.p_result; row.result_revision = params.p_result.status === 'generated' ? 1 : null;
        return envelope(row);
      }
      if (name === 'office_application_refresh_v1') return envelope(row);
      if (name === 'office_request_log_v1') { row.log_state = params.p_log_state; row.run_id = params.p_run_id; return envelope(row); }
      if (name === 'office_request_list_v1') return { status: 'ready', items: [] };
      throw new Error(`unexpected RPC: ${name}`);
    },
  };
  Object.assign(deps, overrides);
  return { deps, rows, calls, counts, service: createOfficeWorkflowService(deps), setClock: value => { clock = value; } };
}

test('concurrent submissions start one generation and all later replays bypass changed source context', async () => {
  const h = harness(), r = request(), actor = identity();
  const results = await Promise.all([h.service.execute(r, actor), h.service.execute(r, actor)]);
  assert.equal(h.counts.generation, 1); assert.ok(results.every(item => ['running', 'generated'].includes(item.status)));
  h.deps.readContext = () => { throw new Error('source changed'); };
  assert.equal((await h.service.execute(r, actor)).status, 'generated');
  assert.equal((await h.service.execute({ ...r, message: '다른 입력' }, actor)).status, 'conflict');
  assert.equal(h.counts.generation, 1);
  const body = JSON.stringify(await h.service.receipt(r.requestId, actor));
  assert.ok(!body.includes('attempt_token') && !body.includes('input_snapshot') && !body.includes('workspace_id'));
});

test('council settings survive receipt and signed recovery; changing them cannot replay the same request ID', async () => {
  const h = harness(), r = { ...request(), mode: 'council', participants: ['vaporeon', 'eevee'], deliberation: { profile: 'urgent', influence: { eevee: 3 } } }, actor = identity();
  h.deps.generate = async (input, c) => {
    h.counts.generation++;
    return { ...generated(input, c), council: { perspectives: input.participants.map(ownerId => ({ ownerId, judgment: '기한 내 최소 범위', tradeoff: '추가 항목 보류' })), recommendation: '현재 약속부터 정리' }, discussion: {
      version: OFFICE_DISCUSSION_VERSION, settings: input.deliberation, modelCalls: 3,
      turns: input.participants.map(ownerId => ({ ownerId, round: 'position', position: '확인한 기간만 정리한다.', evidence: [], objection: '', revisionCondition: '새 기한이 확인되면 바꾼다.', changed: false, replyTo: [], changeReason: '' })),
    } };
  };
  const original = h.deps.rpc;
  h.deps.rpc = (name, params) => name === 'office_request_finish_v1' ? Promise.reject(new Error('unavailable')) : original(name, params);
  const unsaved = await h.service.execute(r, actor);
  assert.equal(unsaved.status, 'unsaved');
  const pending = await h.service.receipt(r.requestId, actor);
  assert.deepEqual(pending.deliberation, parseOfficeDeliberation(r.deliberation, r.participants));
  assert.equal((await h.service.execute({ ...r, deliberation: { ...r.deliberation, warmth: 3 } }, actor)).status, 'conflict');
  h.deps.rpc = original;
  const saved = await h.service.recover(r.requestId, { recoveryToken: unsaved.recoveryToken }, actor);
  assert.equal(saved.status, 'generated');
  assert.deepEqual(saved.deliberation, saved.result.discussion.settings);
  assert.equal(h.counts.generation, 1);
  assert.ok(!JSON.stringify(saved).includes('input_snapshot'));
  const row = h.rows.get(r.requestId);
  const malformed = projectOfficeReceipt({ status: 'error', request: { ...row, input_snapshot: { deliberation: { ...row.input_snapshot.deliberation, injected: 'secret' } } } });
  assert.equal(malformed.deliberation, undefined);
  assert.ok(!JSON.stringify(malformed).includes('secret'));
});

test('a committed claim with a lost response never authorizes generation or takeover', async () => {
  const h = harness(), original = h.deps.rpc, r = request(), actor = identity();
  h.deps.rpc = async (name, params) => { const result = await original(name, params); if (name === 'office_request_claim_v1') throw new Error('connection lost'); return result; };
  assert.equal((await h.service.execute(r, actor)).status, 'unknown');
  assert.equal((await h.service.execute(r, actor)).status, 'running');
  assert.equal(h.counts.generation, 0);
});

test('finish response loss is resolved by receipt, without regenerating or exposing a recovery token', async () => {
  const h = harness(), original = h.deps.rpc, r = request(), actor = identity();
  h.deps.rpc = async (name, params) => { const result = await original(name, params); if (name === 'office_request_finish_v1') throw new Error('response lost'); return result; };
  const result = await h.service.execute(r, actor);
  assert.equal(result.status, 'generated'); assert.equal(result.recoveryToken, undefined); assert.equal(h.counts.generation, 1);
});

test('signed recovery binds the actor, workspace, request and attempt; no extra provider call', async () => {
  const h = harness(), original = h.deps.rpc, r = request(), actor = identity();
  h.deps.rpc = (name, params) => name === 'office_request_finish_v1' ? Promise.reject(new Error('unavailable')) : original(name, params);
  const unsaved = await h.service.execute(r, actor);
  assert.equal(unsaved.status, 'unsaved'); assert.equal(unsaved.capabilities.applyTask, false); assert.equal(unsaved.persistence.persisted, null); assert.ok(unsaved.result.artifact.body);
  assert.equal((await h.service.recover(r.requestId, { recoveryToken: unsaved.recoveryToken }, { ...actor, actorId: 'other' })).status, 'invalid-input');
  assert.equal((await h.service.recover(randomUUID(), { recoveryToken: unsaved.recoveryToken }, actor)).status, 'invalid-input');
  assert.equal((await h.service.recover(r.requestId, { recoveryToken: `${unsaved.recoveryToken}x` }, actor)).status, 'invalid-input');
  h.deps.rpc = original;
  assert.equal((await h.service.recover(r.requestId, { recoveryToken: unsaved.recoveryToken }, actor)).status, 'generated');
  assert.equal(h.counts.generation, 1);
  h.setClock(Date.parse('2026-09-23T00:00:00Z'));
  assert.equal((await h.service.recover(r.requestId, { recoveryToken: unsaved.recoveryToken }, actor)).status, 'invalid-input');
});

test('definitive finish rejection and expiry retain the only verified body and recovery token', async () => {
  for (const status of ['invalid-input', 'conflict', 'expired']) {
    const h = harness(), original = h.deps.rpc, r = request(), actor = identity();
    h.deps.rpc = async (name, params) => name === 'office_request_finish_v1' ? { status, persisted: status === 'expired', error: 'storage-rejected' } : original(name, params);
    const response = await h.service.execute(r, actor);
    assert.equal(response.status, 'unsaved', status); assert.ok(response.result.artifact.body); assert.ok(response.recoveryToken);
    assert.equal(response.capabilities.applyTask, false); assert.equal(response.persistence.persisted, false);
    assert.equal(response.error, status === 'expired' ? 'office-result-expired' : 'office-result-storage-rejected');
    const recovered = await h.service.recover(r.requestId, { recoveryToken: response.recoveryToken }, actor);
    assert.equal(recovered.status, 'unsaved'); assert.equal(recovered.recoveryToken, response.recoveryToken); assert.equal(recovered.result.artifact.body, response.result.artifact.body);
    if (status === 'expired') {
      h.deps.rpc = async (name, params) => { const value = await original(name, params); return value.request ? { ...value, status: 'expired', request: { ...value.request, input_snapshot: null, context_snapshot: null } } : value; };
      const expired = await h.service.recover(r.requestId, { recoveryToken: response.recoveryToken }, actor);
      assert.equal(expired.status, 'unsaved'); assert.equal(expired.error, 'office-result-expired'); assert.equal(expired.recoveryToken, response.recoveryToken);
    }
    assert.equal(h.counts.generation, 1);
  }
});

test('context conflict and unavailable receipt both stop before a model call; invalid results never become generated', async () => {
  const h = harness({ readContext: async r => ({ ...resolved(r), contextHash: 'c'.repeat(64) }) }), r = request(), actor = identity();
  assert.equal((await h.service.execute(r, actor)).status, 'conflict'); assert.equal(h.counts.generation, 0);
  h.deps.rpc = async () => { throw new Error('read offline'); };
  assert.equal((await h.service.execute(r, actor)).status, 'unknown'); assert.equal(h.counts.generation, 0);
  const other = harness({ generate: async (r, c) => ({ ...generated(r, c), ownerId: 'umbreon' }) });
  const failed = await other.service.execute(r, actor);
  assert.equal(failed.status, 'error'); assert.equal(failed.result, null);
});

test('existing application is recoverable after expiry and ignores newly edited fields', async () => {
  const h = harness(), r = request(), actor = identity(); await h.service.execute(r, actor);
  const row = h.rows.get(r.requestId), commandId = randomUUID();
  row.application = { state: 'pending', commandId, command: { payload: 'stored private data' }, payloadHash: 'c'.repeat(64) };
  const baseRpc = h.deps.rpc;
  h.deps.rpc = async (name, params) => { const result = await baseRpc(name, params); return result.request ? { ...result, status: 'expired', request: { ...result.request, input_snapshot: null, context_snapshot: null, result: null } } : result; };
  h.deps.readContext = () => { throw new Error('should not reread source'); };
  h.deps.readTargets = () => { throw new Error('should not revalidate new fields'); };
  let sent;
  h.deps.apply = async input => { sent = input; return { status: 'saved', persisted: true, commandId, entity: { id: commandId } }; };
  h.deps.confirmTask = async () => false;
  const result = await h.service.apply(r.requestId, { resultRevision: 999, fields: { title: 'replace' } }, actor);
  assert.deepEqual(sent, { requestId: r.requestId }); assert.equal(result.status, 'saved'); assert.equal(result.application.entityConfirmed, false);
  assert.ok(!JSON.stringify(result).includes('stored private data'));
});

test('result rediscovery is scope/origin bound and independent of source availability', async () => {
  const h = harness({ readContext: () => { throw new Error('never used for listing'); } }), r = request(), actor = identity();
  assert.equal((await h.service.list({ intent: r.intent, scope: r.scope, originRef: r.originRef }, actor)).status, 'ready');
  const params = h.calls.at(-1).params;
  assert.equal(params.p_actor_id, actor.actorId); assert.equal(params.p_workspace_id, actor.workspaceId); assert.deepEqual(params.p_origin_ref, r.originRef);
  assert.equal((await h.service.list({ ...r, cursor: 'not-json' }, actor)).status, 'invalid-input');
  assert.equal((await h.service.context(r, actor)).status, 'error');
});

test('read errors stay HTTP 200 and every mutation passes the write guard', async () => {
  let called = 0;
  const service = { context: async () => ({ status: 'invalid-input', error: 'invalid-query' }), execute: async () => { called++; } };
  const get = createOfficeWorkflowHandler('context', { service, identity: () => identity() });
  const response = await get(new Request('http://localhost/api/hub/office/context'));
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 'error');
  const post = createOfficeWorkflowHandler('execute', { service, identity: () => identity(), guard: () => Response.json({ status: 'forbidden' }, { status: 403 }) });
  assert.equal((await post(new Request('http://localhost/api/hub/office/requests', { method: 'POST', body: '{}' }))).status, 403); assert.equal(called, 0);
});

test('task targets need a project and agree with Hub and metric scope before storing a command', async () => {
  const actor = identity(), projectId = randomUUID(), updatedAt = '2026-09-21T00:00:00Z';
  assert.equal((await readOfficeTaskTargets({ dealId: randomUUID() }, 'classin', actor)).error, 'office-task-project-required');
  const deps = { read: async () => ({ rows: [{ id: projectId, workspace_id: actor.workspaceId, meta: { org_scope: 'classin' }, updated_at: updatedAt }] }), resolveScope: async () => ({ scope: 'personal' }) };
  assert.equal((await readOfficeTaskTargets({ projectId }, 'classin', actor, deps)).error, 'office-project-scope-mismatch');
  deps.resolveScope = async () => ({ scope: 'company' });
  assert.deepEqual((await readOfficeTaskTargets({ projectId }, 'classin', actor, deps)).sourceRefs, [{ type: 'projects', id: projectId, updatedAt }]);
});

test('Engine transport treats network and malformed policy responses as unknown', async () => {
  const r = request(), c = resolved(r), options = { engineUrl: 'https://engine.example.test', secret: 'test-only' };
  assert.equal((await callOfficeWorkflowEngine(r, c, { ...options, fetcher: async () => { throw new Error('timeout'); } })).status, 'unknown');
  assert.equal((await callOfficeWorkflowEngine(r, c, { ...options, fetcher: async () => Response.json({ ...generated(r, c), version: 'old' }) })).status, 'unknown');
  assert.equal(projectOfficeReceipt({ status: 'expired', request: { id: r.requestId, state: 'generated', result: generated(r, c), application: { state: 'pending', command: { secret: true }, commandId: r.requestId } } }).result, null);
});

test('run logging records attribution independently; failure keeps the generated result', async () => {
  const h = harness(), r = request(), actor = identity();
  assert.equal((await h.service.execute(r, actor)).logState, 'saved'); assert.ok(h.rows.get(r.requestId).run_id);
  const failed = harness({ recordRun: async () => ({ persisted: false }) });
  const response = await failed.service.execute(request(), actor);
  assert.equal(response.status, 'generated'); assert.equal(response.logState, 'error'); assert.ok(response.result.artifact.body);
});

test('all Office Hub read and mutation routes remain behind the existing session gate', () => {
  for (const path of ['/api/hub/office/context', '/api/hub/office/requests', `/api/hub/office/requests/${randomUUID()}`, `/api/hub/office/requests/${randomUUID()}/recover`, `/api/hub/office/requests/${randomUUID()}/apply`]) {
    const input = { pathname: path, host: 'hub.example.test', secretConfigured: true, hasSession: false, allowLoopback: false };
    assert.notEqual(resolveRouteAccess(input).action, 'allow', path);
    assert.equal(resolveRouteAccess({ ...input, hasSession: true }).action, 'allow', path);
  }
});
