import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSkillRequestService, validateSkillReceipt, validateSkillRequest } from './skill-requests.js';
import { createAgentSkillRequestHandler, createHubSkillRequestHandler } from './skill-requests-http.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const commandId = '44444444-4444-4444-8444-444444444444';
const request = { requestId, taskId, scope: 'personal', instruction: '영수증 폴더를 정리', expectedEvidence: '정리 결과 경로와 검토 메모' };
const receipt = { state: 'completed', summary: '정리를 마쳤다', evidence: [{ kind: 'path', value: '/local/receipts' }] };

test('skill request and receipt contracts reject cross-lane and unbounded payloads', () => {
  assert.deepEqual(validateSkillRequest(request), request);
  for (const invalid of [{ ...request, taskId: null }, { ...request, scope: 'all' }, { ...request, instruction: '' },
    { ...request, expectedEvidence: 'x'.repeat(501) }, { ...request, workspaceId }]) {
    assert.equal(validateSkillRequest(invalid), null);
  }
  assert.deepEqual(validateSkillReceipt({ ...receipt, commandId }), { ...receipt, commandId });
  for (const invalid of [{ ...receipt, evidence: [] }, { ...receipt, state: 'done' },
    { ...receipt, commandId: 'not-uuid' }, { ...receipt, evidence: [{ kind: 'file-content', value: 'secret' }] },
    { ...receipt, state: 'failed', commandId }]) assert.equal(validateSkillReceipt(invalid), null);
});

test('service uses fixed operator owner and scoped Agent actor only for receipt recording', async () => {
  const calls = [];
  const service = createSkillRequestService({ workspace: () => workspaceId, rpc: async (name, params) => {
    calls.push({ name, params });
    return { ok: true, data: { status: 'ready', persisted: true, request: { ...request, state: 'requested' } } };
  } });
  assert.equal((await service.create(request)).data.persisted, true);
  assert.equal(calls[0].name, 'local_skill_request_create_v1');
  assert.equal(calls[0].params.p_operator_id, 'operator');
  await service.get(requestId, { workspaceId, actorId: 'codex' });
  assert.equal(calls[1].params.p_operator_id, 'operator');
  await service.record(requestId, receipt, { workspaceId, actorId: 'codex' });
  assert.equal(calls[2].params.p_agent_actor_id, 'codex');
  assert.equal(calls[2].params.p_operator_id, 'operator');
  assert.equal(calls[2].params.p_receipt.commandId, undefined);
  assert.equal((await service.record(requestId, receipt, { workspaceId, actorId: '' })).httpStatus, 400);
  assert.equal(calls.length, 3);
});

test('unconfigured storage cannot put an unsaved request in the execution queue', async () => {
  const service = createSkillRequestService({ workspace: () => workspaceId,
    rpc: async () => ({ ok: false, error: 'missing-config' }) });
  const created = await service.create(request);
  assert.deepEqual([created.httpStatus, created.data.status, created.data.persisted], [202, 'preview', false]);
  const read = await service.get(requestId);
  assert.deepEqual([read.httpStatus, read.data.status, read.data.source], [200, 'error', 'error']);
});

test('Hub POST is guarded before parsing and read errors keep HTTP 200 envelope', async () => {
  let called = 0;
  const service = { create: async () => { called++; return { httpStatus: 200, data: { status: 'ready', persisted: true } }; },
    list: async () => ({ httpStatus: 200, data: { status: 'error', source: 'error', error: 'db-down' } }) };
  const denied = createHubSkillRequestHandler('create', { service, guard: () => Response.json({ status: 'forbidden' }, { status: 403 }) });
  assert.equal((await denied(new Request('http://localhost/api/hub/skill-requests', { method: 'POST', body: '{bad' }))).status, 403);
  assert.equal(called, 0);
  const allowed = createHubSkillRequestHandler('create', { service, guard: () => null });
  const response = await allowed(new Request('http://localhost/api/hub/skill-requests', { method: 'POST', body: JSON.stringify(request) }));
  assert.equal(response.status, 200); assert.equal(called, 1);
  const read = await createHubSkillRequestHandler('list', { service })(new Request('http://localhost/api/hub/skill-requests'));
  assert.equal(read.status, 200); assert.equal((await read.json()).source, 'error');
});

test('Agent exact request and receipt routes authenticate before reading or writing', async () => {
  let called = 0;
  const service = { get: async () => { called++; return { httpStatus: 200, data: { status: 'ready' } }; },
    record: async (_id, _receipt, context) => { called++; assert.equal(context.actorId, 'codex');
      return { httpStatus: 200, data: { status: 'ready', persisted: true } }; } };
  const denied = () => ({ ok: false, httpStatus: 401, data: { status: 'error', error: 'agent-auth-required' } });
  const get = createAgentSkillRequestHandler('get', { service, authorize: denied });
  const post = createAgentSkillRequestHandler('record', { service, authorize: denied });
  assert.equal((await get(new Request('http://localhost/api/agent/v1/skill-requests/x'), { params: { id: requestId } })).status, 401);
  assert.equal((await post(new Request('http://localhost/api/agent/v1/skill-requests/x/receipts', { method: 'POST', body: '{bad' }), { params: { id: requestId } })).status, 401);
  assert.equal(called, 0);
  const scopes = [];
  const authorize = (_req, { scope }) => { scopes.push(scope); return { ok: true, context: { workspaceId, actorId: 'codex', scopes: ['read', 'tasks:write'] } }; };
  assert.equal((await createAgentSkillRequestHandler('get', { service, authorize })(new Request('http://localhost/api/agent/v1/skill-requests/x'), { params: { id: requestId } })).status, 200);
  assert.equal((await createAgentSkillRequestHandler('record', { service, authorize })(new Request('http://localhost/api/agent/v1/skill-requests/x/receipts', { method: 'POST', body: JSON.stringify(receipt) }), { params: { id: requestId } })).status, 200);
  assert.deepEqual(scopes, ['read', 'tasks:write']);
  assert.equal(called, 2);
});
