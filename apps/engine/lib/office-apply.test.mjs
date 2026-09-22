import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createOfficeTaskApplyService } from './office-apply.ts';
import { createOfficeApplyHandler } from './office-apply-http.ts';

test('Office task apply uses the PMS normalizer and stores one complete command before dispatch', async () => {
  const requestId = randomUUID(), projectId = randomUUID(), commandId = randomUUID(), context = { workspaceId: randomUUID(), actorId: 'operator' }, calls = [];
  let stored;
  const apply = createOfficeTaskApplyService({ uuid: () => commandId, rpc: async (name, params) => {
    calls.push({ name, params });
    if (name === 'office_request_receipt_v1') return { ok: true, data: { status: 'generated', request: { state: 'generated', result_revision: 1 } } };
    if (name === 'office_application_claim_v1') { stored = params.p_command; return { ok: true, data: { request: { application: { commandId, command: stored } } } }; }
    if (name === 'office_apply_task_v1') return { ok: true, data: { status: 'saved', action: 'create_task', commandId, persisted: true, replayed: false, changedFields: ['title'], updatedAt: '2026-09-21T00:00:00Z', entity: { id: commandId, title: '후속 업무', status: 'todo' } } };
    throw new Error('screen update unavailable');
  } });
  const result = await apply({ requestId, resultRevision: 1, fields: { title: '후속 업무', projectId }, sourceRefs: [{ type: 'projects', id: projectId, updatedAt: '2026-09-21T00:00:00Z' }] }, context);
  assert.equal(result.status, 'saved'); assert.equal(stored.targetId, commandId); assert.equal(stored.payload.project_id, projectId); assert.equal(stored.payload.meta.source, 'agent');
  assert.deepEqual(calls.find(call => call.name === 'office_apply_task_v1').params, { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_request_id: requestId });
});

test('expired pending applications dispatch stored commands, while unknown claim does not dispatch', async () => {
  const requestId = randomUUID(), commandId = randomUUID(), projectId = randomUUID(), context = { workspaceId: randomUUID(), actorId: 'operator' };
  const names = [];
  const recover = createOfficeTaskApplyService({ rpc: async name => {
    names.push(name);
    if (name === 'office_request_receipt_v1') return { ok: true, data: { status: 'expired', request: { application: { commandId } } } };
    return { ok: true, data: { status: 'unknown', persisted: null } };
  } });
  await recover({ requestId, fields: { title: 'ignored changed text' } }, context);
  assert.deepEqual(names, ['office_request_receipt_v1', 'office_apply_task_v1']);
  const create = createOfficeTaskApplyService({ rpc: async name => {
    if (name === 'office_request_receipt_v1') return { ok: true, data: { status: 'generated', request: { state: 'generated', result_revision: 1 } } };
    assert.equal(name, 'office_application_claim_v1'); throw new Error('claim response lost');
  } });
  assert.equal((await create({ requestId, resultRevision: 1, fields: { title: '업무', projectId }, sourceRefs: [{ type: 'projects', id: projectId, updatedAt: '2026-09-21T00:00:00Z' }] }, context)).status, 'unknown');
});

test('Office apply route denies missing shared-secret auth before reading a body', async () => {
  let called = false;
  const handler = createOfficeApplyHandler(() => ({ ok: false }), async () => { called = true; });
  assert.equal((await handler(new Request('http://localhost/api/ai/office-apply', { method: 'POST', body: '{' }))).status, 401); assert.equal(called, false);
});

test('Office apply rejects oversized edited text before PMS normalization can slice it', async () => {
  const context = { workspaceId: randomUUID(), actorId: 'operator' }, requestId = randomUUID(), projectId = randomUUID();
  let writes = 0;
  const apply = createOfficeTaskApplyService({ rpc: async name => {
    if (name === 'office_request_receipt_v1') return { ok: true, data: { status: 'generated', request: { state: 'generated', result_revision: 1 } } };
    writes++; throw new Error('no write should occur');
  } });
  for (const [key, length] of [['title', 301], ['description', 4001], ['nextAction', 1001]]) {
    const result = await apply({ requestId, resultRevision: 1, fields: { title: '업무', projectId, [key]: '가'.repeat(length) }, sourceRefs: [{ type: 'projects', id: projectId, updatedAt: '2026-09-21T00:00:00Z' }] }, context);
    assert.equal(result.status, 'invalid-input'); assert.equal(result.error, `office-task-${key}-too-long`);
  }
  assert.equal(writes, 0);
});
