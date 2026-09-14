import assert from 'node:assert/strict';
import { test } from 'node:test';
let commands;
try { commands = await import('./commands.js'); } catch {}
const workspaceId = '33333333-3333-4333-8333-333333333333';
const commandId = '11111111-1111-4111-8111-111111111111';
const context = { workspaceId, actorId: 'codex', scopes: ['read', 'tasks:write'] };
const command = { commandId, action: 'create_task', input: { title: '할 일' } };
const env = { COM_MOON_ENGINE_URL: 'https://engine.test/', COM_MOON_SHARED_WEBHOOK_SECRET: 'shared' };
const receipt = { status: 'saved', persisted: true, commandId, action: 'create_task', entity: { id: commandId, status: 'todo', title: '할 일', updatedAt: '2026-09-13T01:00:00.123456Z' }, entityRef: { type: 'tasks', id: commandId, detailAvailable: true, href: `/api/agent/v1/entities/tasks/${commandId}` }, changedFields: ['title'], updatedAt: '2026-09-13T01:00:00.123456Z', replayed: false };
const execute = (...args) => { assert.ok(commands, 'Agent Hub transport exists'); return commands.executeAgentCommand(...args); };
const get = (...args) => { assert.ok(commands, 'Agent Hub receipt transport exists'); return commands.getAgentCommandReceipt(...args); };

test('forwards authenticated server context in headers, command body unchanged, and preserves exact receipt', async () => {
  const result = await execute(command, context, { env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://engine.test/api/agent/command'); assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-com-moon-shared-secret'], 'shared');
    assert.equal(options.headers['x-com-moon-agent-workspace'], workspaceId);
    assert.equal(options.headers['x-com-moon-agent-actor'], 'codex');
    assert.equal(options.headers['x-com-moon-agent-scopes'], 'read,tasks:write');
    assert.deepEqual(JSON.parse(options.body), command); assert.equal(options.redirect, 'error');
    return Response.json(receipt, { status: 201 });
  } });
  assert.deepEqual(result, { httpStatus: 201, data: receipt });
});

test('scope, actor and body identity overrides fail before any network call', async () => {
  const options = { env, fetchImpl: async () => assert.fail('No network call') };
  assert.equal((await execute(command, { ...context, scopes: ['read'] }, options)).httpStatus, 403);
  assert.equal((await get(commandId, { ...context, scopes: ['tasks:write'] }, options)).httpStatus, 403);
  for (const extra of [{ actorId: 'other' }, { workspaceId }, { scopes: ['tasks:write'] }]) assert.equal((await execute({ ...command, ...extra }, context, options)).httpStatus, 400);
  assert.equal((await get('../../tasks', context, options)).httpStatus, 400);
});

test('missing config previews honestly and unknown writes never automatically retry', async () => {
  const preview = await execute(command, context, { env: {}, fetchImpl: async () => assert.fail('No network call') });
  assert.equal(preview.httpStatus, 202); assert.equal(preview.data.status, 'preview'); assert.equal(preview.data.persisted, false);
  for (const fetchImpl of [async () => { throw new DOMException('timeout', 'TimeoutError'); }, async () => new Response('broken'), async () => Response.json({ status: 'saved' })]) {
    let calls = 0;
    const response = await execute(command, context, { env, fetchImpl: (...args) => { calls += 1; return fetchImpl(...args); } });
    assert.equal(calls, 1); assert.equal(response.httpStatus, 502); assert.equal(response.data.persisted, null);
    assert.equal(response.data.code, 'command-outcome-unknown'); assert.equal(response.data.retryable, false);
  }
});

test('receipt lookup after response loss is a scoped GET and not another command', async () => {
  let lost = false; const methods = [];
  const fetchImpl = async (url, options) => {
    methods.push(options.method);
    if (options.method === 'POST') { lost = true; throw new TypeError('response lost after commit'); }
    assert.equal(lost, true); assert.equal(url, `https://engine.test/api/agent/command/${commandId}`);
    assert.equal(options.body, undefined);
    return Response.json({ ...receipt, replayed: true });
  };
  const outcome = await execute(command, context, { env, fetchImpl });
  assert.equal(outcome.data.nextAction, 'get_command_receipt');
  const recovered = await get(commandId, context, { env, fetchImpl });
  assert.equal(recovered.data.persisted, true); assert.equal(recovered.data.commandId, commandId);
  assert.deepEqual(methods, ['POST', 'GET']);
});

test('preserves actionable conflicts and missing migration without exposing raw diagnostics', async () => {
  for (const [status, data] of [[409, { status: 'error', code: 'conflict', error: 'stale-update', persisted: false, retryable: false, entity: { id: commandId, updated_at: receipt.updatedAt }, detail: 'private SQL' }], [503, { status: 'error', code: 'agent-commands-migration-required', error: 'agent-commands-migration-required', persisted: false }]]) {
    const result = await execute(command, context, { env, fetchImpl: async () => Response.json(data, { status }) });
    assert.equal(result.httpStatus, status); assert.equal(result.data.code, data.code); assert.equal(result.data.detail, undefined);
  }
});

test('receipt absence remains unknown even when an older Engine returns persisted:false', async () => {
  const result = await get(commandId, context, { env, fetchImpl: async () => Response.json({ status: 'error', error: 'receipt-not-found', code: 'not-found', persisted: false, retryable: false }, { status: 404 }) });
  assert.equal(result.httpStatus, 404);
  assert.equal(result.data.persisted, null);
  assert.equal(result.data.commandId, commandId);
  assert.equal(result.data.retryable, false);
  assert.equal(result.data.retryPolicy, 'same-command-id-and-input-only');
});

test('Hub bounds older Engine receipts while retaining exact version and all changed fields', async () => {
  const raw = { ...receipt, entity: { id: commandId, status: 'todo', title: '업무', updated_at: receipt.updatedAt, meta: { raw: '원문'.repeat(100000) } } };
  for (const result of [await execute(command, context, { env, fetchImpl: async () => Response.json(raw) }), await get(commandId, context, { env, fetchImpl: async () => Response.json(raw) })]) {
    assert.equal(result.data.entity.meta, undefined);
    assert.equal(result.data.entity.updatedAt, receipt.updatedAt);
    assert.deepEqual(result.data.changedFields, receipt.changedFields);
    assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 2048);
  }
});
