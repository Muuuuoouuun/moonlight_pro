import assert from 'node:assert/strict';
import { test } from 'node:test';
let service;
try { service = await import('./agent-command-service.ts'); } catch {}
const context = { workspaceId: '33333333-3333-4333-8333-333333333333', actorId: 'codex', scopes: ['read', 'tasks:write'] };
const commandId = '11111111-1111-4111-8111-111111111111';
const command = { commandId, action: 'create_task', input: { title: '할 일' } };
const execute = (...args) => { assert.ok(service, 'Atomic command service exists'); return service.executeAgentCommand(...args); };
const receipt = (...args) => { assert.ok(service, 'Receipt read service exists'); return service.getAgentCommandReceipt(...args); };
const saved = { status: 'saved', persisted: true, commandId, action: 'create_task', entity: { id: commandId, title: '할 일', status: 'todo', updatedAt: '2026-09-13T01:00:00.123456+00:00' }, entityRef: { type: 'tasks', id: commandId, detailAvailable: true, href: `/api/agent/v1/entities/tasks/${commandId}` }, changedFields: ['title'], updatedAt: '2026-09-13T01:00:00.123456+00:00', replayed: false };

test('valid mutations call one atomic RPC with only normalized authenticated input', async () => {
  let calls = 0;
  const result = await execute(command, context, { rpc: async (name, params) => {
    calls += 1; assert.equal(name, 'agent_command_v1');
    assert.equal(params.p_workspace_id, context.workspaceId); assert.equal(params.p_actor_id, context.actorId);
    assert.deepEqual(params.p_scopes, context.scopes); assert.equal(params.p_command.targetId, commandId);
    assert.equal(params.p_command.payload.title, '할 일'); assert.equal(params.p_command.requestHash, undefined);
    return { ok: true, data: saved };
  } });
  assert.deepEqual(result, { httpStatus: 201, data: saved }); assert.equal(calls, 1);
});

test('replays preserve the actual stored receipt and conflicts are HTTP 409', async () => {
  const repeated = { ...saved, replayed: true };
  assert.deepEqual(await execute(command, context, { rpc: async () => ({ ok: true, data: repeated }) }), { httpStatus: 200, data: repeated });
  const conflict = { status: 'error', error: 'command-id-reuse', code: 'conflict', persisted: false, retryable: false };
  assert.equal((await execute(command, context, { rpc: async () => ({ ok: true, data: conflict }) })).httpStatus, 409);
});

test('timeouts or invalid RPC success remain unknown and never automatically retry writes', async () => {
  for (const result of [{ ok: false, error: 'timeout' }, { ok: false, error: 'request-failed' }, { ok: true, data: null }, { ok: true, data: { status: 'saved' } }]) {
    let calls = 0;
    const response = await execute(command, context, { rpc: async () => { calls += 1; return result; } });
    assert.equal(calls, 1); assert.equal(response.httpStatus, 502);
    assert.equal(response.data.persisted, null); assert.equal(response.data.retryable, false);
    assert.equal(response.data.commandId, commandId); assert.equal(response.data.code, 'command-outcome-unknown');
  }
});

test('missing config is preview and missing schema or permission failure is explicit', async () => {
  const preview = await execute(command, context, { rpc: async () => ({ ok: false, error: 'missing-config' }) });
  assert.equal(preview.httpStatus, 202); assert.equal(preview.data.status, 'preview'); assert.equal(preview.data.persisted, false);
  for (const failure of [{ error: 'http-404', status: 404, detail: 'Could not find the function public.agent_command_v1 in the schema cache' }, { error: 'http-400', status: 400, detail: 'relation "public.agent_command_receipts" does not exist' }]) {
    const result = await execute(command, context, { rpc: async () => ({ ok: false, ...failure }) });
    assert.equal(result.httpStatus, 503); assert.equal(result.data.code, 'agent-commands-migration-required');
    assert.equal(result.data.detail, undefined);
  }
  const denied = await execute(command, context, { rpc: async () => ({ ok: false, error: 'http-401', status: 401 }) });
  assert.equal(denied.httpStatus, 503); assert.equal(denied.data.code, 'command-storage-unauthorized');
  const innerMigration = await execute(command, context, { rpc: async () => ({ ok: true, data: { status: 'error', code: 'agent-commands-migration-required', error: 'agent-commands-migration-required', persisted: false } }) });
  assert.equal(innerMigration.httpStatus, 503);
});

test('receipt lookup is read-only and actor/workspace scoped, preserving not found', async () => {
  assert.equal((await receipt(commandId, { ...context, scopes: ['tasks:write'] }, { rpc: async () => assert.fail('must not call') })).httpStatus, 403);
  const found = await receipt(commandId, context, { rpc: async (name, params) => {
    assert.equal(name, 'agent_command_receipt_v1');
    assert.deepEqual(params, { p_workspace_id: context.workspaceId, p_actor_id: context.actorId, p_scopes: context.scopes, p_command_id: commandId });
    return { ok: true, data: { ...saved, replayed: true } };
  } });
  assert.equal(found.httpStatus, 200); assert.equal(found.data.updatedAt, saved.updatedAt);
  const absent = await receipt(commandId, context, { rpc: async () => ({ ok: true, data: { status: 'error', error: 'receipt-not-found', code: 'not-found', persisted: false } }) });
  assert.equal(absent.httpStatus, 404);
});

test('absent receipt preserves an unknown outcome and the same-command retry policy', async () => {
  const pending = { status: 'error', error: 'receipt-not-found', code: 'not-found', persisted: null, retryable: false, commandId, nextAction: 'get_command_receipt', retryPolicy: 'same-command-id-and-input-only' };
  const result = await receipt(commandId, context, { rpc: async () => ({ ok: true, data: pending }) });
  assert.deepEqual(result, { httpStatus: 404, data: pending });
});

test('legacy absent-receipt envelopes cannot report a definitively failed write', async () => {
  const result = await receipt(commandId, context, { rpc: async () => ({ ok: true, data: { status: 'error', error: 'receipt-not-found', code: 'not-found', persisted: false, retryable: false } }) });
  assert.equal(result.httpStatus, 404);
  assert.equal(result.data.persisted, null);
  assert.equal(result.data.commandId, commandId);
  assert.equal(result.data.retryPolicy, 'same-command-id-and-input-only');
});

test('Engine bounds raw entities returned by an older RPC on writes, receipt reads and conflicts', async () => {
  const entity = { id: commandId, status: 'todo', title: '할 일', updated_at: saved.updatedAt, meta: { private_note: '원문'.repeat(100000) } };
  const rpc = async () => ({ ok: true, data: { ...saved, entity } });
  for (const result of [await execute(command, context, { rpc }), await receipt(commandId, context, { rpc })]) {
    assert.equal(result.data.entity.meta, undefined);
    assert.equal(result.data.entity.updatedAt, saved.updatedAt);
    assert.deepEqual(result.data.changedFields, saved.changedFields);
    assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 2048);
  }
  const result = await execute(command, context, { rpc: async () => ({ ok: true, data: { status: 'error', error: 'stale-update', code: 'conflict', updatedAt: saved.updatedAt, entity } }) });
  assert.equal(result.httpStatus, 409);
  assert.equal(result.data.entity.meta, undefined);
  assert.equal(result.data.entityRef.type, 'tasks');
});
