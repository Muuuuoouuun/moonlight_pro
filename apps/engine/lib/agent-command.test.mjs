import assert from 'node:assert/strict';
import { test } from 'node:test';

let module;
try { module = await import('./agent-command.ts'); } catch {}
const workspaceId = '33333333-3333-4333-8333-333333333333';
const commandId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const context = { workspaceId, actorId: 'codex', scopes: ['read', 'tasks:write', 'contact-outcomes:write'] };
const normalize = (input, ctx = context) => { assert.ok(module, 'Agent command normalizer exists'); return module.normalizeAgentCommand(input, ctx); };

test('create IDs and source belong to the command and canonical payload has no wall-clock timestamp', () => {
  const first = normalize({ commandId, action: 'create_task', input: { title: ' 할 일 ', status: 'done' } });
  assert.equal(first.ok, true);
  assert.equal(first.command.targetId, commandId);
  assert.equal(first.command.payload.title, '할 일');
  assert.equal(first.command.payload.meta.source, 'agent');
  for (const field of ['id', 'workspace_id', 'owner_id', 'updated_at', 'completed_at']) assert.equal(first.command.payload[field], undefined);
  assert.deepEqual(first, normalize({ action: 'create_task', input: { status: 'done', title: '할 일' }, commandId }));
});

test('task validation is the existing PMS contract including checklist and exact versions', () => {
  const version = '2026-09-13T01:00:00.123456Z';
  const result = normalize({ commandId, action: 'update_task', targetId, expectedUpdatedAt: version, input: { status: 'doing', checklist: [] } });
  assert.equal(result.ok, true);
  assert.equal(result.command.expectedUpdatedAt, version);
  assert.deepEqual(result.command.payload, { status: 'doing', meta: { checklist: [] } });
  assert.equal(normalize({ commandId, action: 'update_task', targetId, input: { title: '수정' } }).reason, 'missing-expected-updated-at');
  assert.equal(normalize({ commandId, action: 'complete_task', targetId, input: {} }).reason, 'missing-expected-updated-at');
  assert.equal(normalize({ commandId, action: 'create_task', input: { title: '할 일', status: 'approved' } }).reason, 'invalid-status');
  assert.equal(normalize({ commandId, action: 'update_task', targetId, expectedUpdatedAt: version, input: { checklist: [{ id: targetId, title: 'item', done: 'yes' }] } }).reason, 'invalid-checklist-item');
  assert.deepEqual(normalize({ commandId, action: 'complete_task', targetId, expectedUpdatedAt: version, input: {} }).command.payload, { status: 'done' });
});

test('action scopes and server-owned context reject caller escalation and unknown fields', () => {
  const request = { commandId, action: 'create_task', input: { title: '할 일' } };
  assert.equal(normalize(request, { ...context, scopes: ['read'] }).reason, 'insufficient-scope');
  for (const changes of [{ actorId: 'other' }, { workspaceId: targetId }, { scopes: ['tasks:write'] }, { approved: true }]) assert.equal(normalize({ ...request, ...changes }).reason, 'unknown-command-field');
  for (const input of [{ title: 'a', id: targetId }, { title: 'a', source: 'manual' }, { title: 'a', owner_id: targetId }]) assert.equal(normalize({ ...request, input }).reason, 'unknown-input-field');
  assert.equal(normalize({ ...request, targetId }).reason, 'create-target-must-match-command');
  assert.equal(normalize({ ...request, action: 'delete_task' }).reason, 'unsupported-action');
});

test('contact outcomes use one workspace target and preserve authoritative RPC inputs', () => {
  const request = { commandId, action: 'record_contact_outcome', targetId, input: { entityType: 'lead', summary: '  상담 완료 ', reaction: ' Positive ', nextAction: ' 후속 연락 ', nextActionAt: '2026-09-14T01:00:00Z' } };
  const result = normalize(request);
  assert.equal(result.ok, true);
  assert.deepEqual(result.command.payload, { entityType: 'lead', contactId: null, kind: 'call', summary: '상담 완료', reaction: 'positive', nextAction: '후속 연락', nextActionAt: '2026-09-14T01:00:00Z', dormant: false });
  assert.equal(normalize({ ...request, input: { ...request.input, entityId: commandId } }).reason, 'target-mismatch');
  assert.equal(normalize({ ...request, input: { ...request.input, dormant: 'false' } }).reason, 'invalid-dormant');
  assert.equal(normalize(request, { ...context, scopes: ['tasks:write'] }).reason, 'insufficient-scope');
});
