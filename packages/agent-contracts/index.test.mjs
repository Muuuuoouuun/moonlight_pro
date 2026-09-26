import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as contracts from './index.js';
import {
  parseAgentQuery, parseAgentEntityQuery, sealAgentCursor, openAgentCursor,
  stableStringify, AGENT_RESPONSE_LIMITS,
} from './index.js';

const id = '11111111-1111-4111-8111-111111111111';

test('query defaults are bounded and preserve the version fields even for narrow projection', () => {
  const query = parseAgentQuery({ resource: 'tasks', fields: ['title'], filters: { status: ['todo', 'doing'] } });
  assert.equal(query.limit, 20);
  assert.equal(query.detail, 'rows');
  assert.deepEqual(query.fields, ['id', 'status', 'updatedAt', 'title']);
  assert.deepEqual(query.filters.status, ['doing', 'todo']);
});

test('query rejects SQL-like resources, arbitrary properties, fields, filters and malformed bounds', () => {
  for (const input of [
    { resource: 'tasks;drop table tasks' }, { resource: 'tasks', workspaceId: id },
    { resource: 'tasks', fields: ['meta'] }, { resource: 'tasks', filters: { or: '(true)' } },
    { resource: 'tasks', filters: { status: 'todo,or=(id.not.is.null)' } },
    { resource: 'tasks', filters: { projectId: 'other-workspace' } },
    { resource: 'tasks', limit: 0 }, { resource: 'tasks', limit: 101 },
    { resource: 'tasks', limit: '20' }, { resource: 'tasks', fresh: 'false' },
    { resource: 'tasks', fields: [] }, { resource: 'projects', filters: { status: 'doing' } },
  ]) assert.throws(() => parseAgentQuery(input), { name: 'AgentInputError' });
});

test('entity URL inputs are validated and full detail is the default', () => {
  const query = parseAgentEntityQuery('tasks', id, { fresh: 'true' });
  assert.equal(query.fresh, true);
  assert.equal(query.detail, 'full');
  assert.throws(() => parseAgentEntityQuery('tasks', '../other', {}), { name: 'AgentInputError' });
  assert.throws(() => parseAgentEntityQuery('followups', id, {}), { name: 'AgentInputError' });
  assert.throws(() => parseAgentEntityQuery('tasks', id, { fresh: 'no' }), { name: 'AgentInputError' });
});

test('cursor signature binds workspace, actor, scopes, fields, filters, order and limit', () => {
  const binding = { workspaceId: id, actorId: 'codex', scopes: ['read'], query: { fields: ['title'], filters: {}, order: 'created_at.asc,id.asc', limit: 20 } };
  const payload = { id, createdAt: '2026-09-13T01:00:00.123456Z' };
  const token = sealAgentCursor(payload, binding, 'private-secret', { now: 1000 });
  assert.deepEqual(openAgentCursor(token, binding, 'private-secret', { now: 1001 }), payload);
  for (const changed of [
    { ...binding, workspaceId: 'other' }, { ...binding, actorId: 'other' },
    { ...binding, scopes: ['read', 'tasks:write'] },
    { ...binding, query: { ...binding.query, fields: ['description'] } },
    { ...binding, query: { ...binding.query, filters: { status: ['done'] } } },
    { ...binding, query: { ...binding.query, limit: 100 } },
    { ...binding, query: { ...binding.query, order: 'id.desc' } },
  ]) assert.throws(() => openAgentCursor(token, changed, 'private-secret', { now: 1001 }), { name: 'AgentInputError' });
  assert.throws(() => openAgentCursor(token, binding, 'different-secret', { now: 1001 }), { name: 'AgentInputError' });
  assert.throws(() => openAgentCursor(token.slice(0, -4) + 'AAAA', binding, 'private-secret', { now: 1001 }), { name: 'AgentInputError' });
  assert.throws(() => openAgentCursor(token, binding, 'private-secret', { now: 4000000 }), { name: 'AgentInputError' });
});

test('canonical binding is key-order independent and byte limits are explicit', () => {
  assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
  assert.deepEqual(AGENT_RESPONSE_LIMITS, { summary: 2048, rows: 16384, full: 32768 });
});

test('command receipts expose a bounded public entity without changing versions or field names', () => {
  assert.equal(typeof contracts.projectAgentCommandResponse, 'function');
  const updatedAt = '2026-09-13T01:00:00.123456+00:00';
  const changedFields = ['status', 'completed_at', 'updated_at'];
  const raw = { status: 'saved', persisted: true, commandId: id, action: 'complete_task', updatedAt, changedFields, replayed: false, entity: { id, title: '한'.repeat(300), status: 'done', updated_at: updatedAt, description: 'body'.repeat(30000), meta: { private_note: '원문'.repeat(100000) }, workspace_id: id } };
  const result = contracts.projectAgentCommandResponse(raw);
  assert.equal(result.updatedAt, updatedAt);
  assert.equal(result.entity.updatedAt, updatedAt);
  assert.deepEqual(result.changedFields, changedFields);
  assert.equal(result.entity.title.length, 200);
  assert.equal(result.entity.summaryTruncated, true);
  assert.equal(result.entity.meta, undefined);
  assert.equal(result.entity.description, undefined);
  assert.equal(result.entity.workspace_id, undefined);
  assert.deepEqual(result.entityRef, { type: 'tasks', id, detailAvailable: true, href: `/api/agent/v1/entities/tasks/${id}` });
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2048);
  assert.deepEqual(contracts.projectAgentCommandResponse(result), result);
});

test('legacy conflict and contact outcome projections do not invent unsupported detail routes', () => {
  assert.equal(typeof contracts.projectAgentCommandResponse, 'function');
  const updatedAt = '2026-09-13T01:00:00.123456Z';
  const conflict = contracts.projectAgentCommandResponse({ status: 'error', code: 'conflict', error: 'stale-update', updatedAt, entity: { id, status: 'doing', title: '업무', updated_at: updatedAt, meta: { raw: 'private' } } }, { action: 'update_task' });
  assert.equal(conflict.entity.updatedAt, updatedAt);
  assert.equal(conflict.entityRef.type, 'tasks');
  assert.equal(conflict.entity.meta, undefined);
  const contact = contracts.projectAgentCommandResponse({ status: 'saved', action: 'record_contact_outcome', updatedAt, entity: { id, name: '담당자', status: 'qualified', updated_at: updatedAt, email: 'private@example.test', meta: { raw: 'private' } }, outcome: { status: 'saved', entityType: 'lead', entityId: id, activityId: id, dormant: false, privateField: 'hidden' } });
  assert.deepEqual(contact.entityRef, { type: 'leads', id, detailAvailable: false, href: null });
  assert.equal(contact.entity.name, '담당자');
  assert.equal(contact.entity.email, undefined);
  assert.equal(contact.outcome.activityId, id);
  assert.equal(contact.outcome.privateField, undefined);
});

test('client token hashes: unset means none, a complete list parses, anything malformed fails closed', () => {
  const { parseAgentClientTokenHashes: parse, agentClientTokenDigest: digest } = contracts;
  const a = digest('claude-code-token'); const b = digest('desktop-token');
  assert.match(a, /^[0-9a-f]{64}$/);
  for (const unset of [undefined, null, '', '  ']) assert.deepEqual(parse(unset), { ok: true, entries: [] });
  assert.deepEqual(parse(`claude-code:${a}, codex:local/operator:${b}`), { ok: true, entries: [{ actorId: 'claude-code', digest: a }, { actorId: 'codex:local/operator', digest: b }] });
  const reason = (value, options) => parse(value, options).reason;
  for (const value of [`claude-code:${a},`, `,claude-code:${a}`, `claude-code ${a}`, `:${a}`, 'claude-code:', `claude code:${a}`, `${'x'.repeat(129)}:${a}`,
    `claude-code:${a.toUpperCase()}`, `claude-code:${a.slice(1)}`, `claude-code:${a}0`, `claude-code:${a};codex:${b}`]) assert.equal(reason(value), 'invalid-entry', value);
  assert.equal(reason(42), 'invalid-value');
  assert.equal(reason(`claude-code:${a},claude-code:${b}`), 'duplicate-actor');
  assert.equal(reason(`claude-code:${a},codex:${a}`), 'duplicate-digest');
  assert.equal(reason(`claude-code:${digest('shared')}`, { sharedToken: 'shared' }), 'shared-token-digest');
  assert.equal(parse(`claude-code:${a}`, { sharedToken: 'shared' }).ok, true);
  assert.equal(contracts.AGENT_ACTOR_PATTERN.test('codex:local/operator'), true);
  assert.equal(contracts.AGENT_ACTOR_PATTERN.test('actor with spaces'), false);
});
