import assert from 'node:assert/strict';
import { test } from 'node:test';
let service;
try { service = await import('./agent-worker.ts'); } catch {}
const workspaceId = '11111111-1111-4111-8111-111111111111';
const env = { COM_MOON_CODEX_WORKER_TOKEN: 'separate-worker-secret', COM_MOON_CODEX_WORKER_ID: 'local-codex', COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_CODEX_PROJECTS_JSON: '{"moonlight":{"path":"/repo","modes":["read"]}}' };
function request(body, token = env.COM_MOON_CODEX_WORKER_TOKEN) { return new Request('http://engine/api/agent/worker', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

test('worker endpoint rejects agent bearer and caller-selected workspace before persistence', async () => {
  assert.ok(service, 'worker HTTP service must exist');
  const rpc = async () => assert.fail('unauthorized request reached persistence');
  assert.equal((await service.handleWorkerRequest(request({ action: 'claim' }, 'agent-token'), { env, rpc })).status, 401);
  assert.equal((await service.handleWorkerRequest(request({ action: 'claim', workspaceId }), { env, rpc })).status, 400);
  assert.equal((await service.handleWorkerRequest(request({ action: 'claim' }), { env: { ...env, COM_MOON_AGENT_API_TOKEN: env.COM_MOON_CODEX_WORKER_TOKEN }, rpc })).status, 503);
  const { createHash } = await import('node:crypto');
  const clientHashes = `claude-code:${createHash('sha256').update(env.COM_MOON_CODEX_WORKER_TOKEN).digest('hex')}`;
  assert.equal((await service.handleWorkerRequest(request({ action: 'claim' }), { env: { ...env, COM_MOON_AGENT_CLIENT_TOKEN_HASHES: clientHashes }, rpc })).status, 503, 'a worker token reused as a client Agent token');
});

test('claim passes server identity and registered project capabilities to typed RPC', async () => {
  assert.ok(service);
  const calls = [];
  const response = await service.handleWorkerRequest(request({ action: 'claim' }), { env, rpc: async (name, params) => { calls.push({ name, params }); return { ok: true, data: { status: 'idle' } }; } });
  assert.equal(response.status, 200);
  assert.equal(calls[0].name, 'agent_worker_v1');
  assert.equal(calls[0].params.p_workspace_id, workspaceId);
  assert.equal(calls[0].params.p_worker_id, 'local-codex');
  assert.deepEqual(calls[0].params.p_input.projects, [{ id: 'moonlight', modes: ['read'] }]);
});

test('lease tokens and payload bounds are checked and lease fencing errors remain conflict', async () => {
  assert.ok(service);
  const rpc = async () => ({ ok: true, data: { status: 'error', code: 'lease-lost', error: 'lease-lost' } });
  assert.equal((await service.handleWorkerRequest(request({ action: 'finish', id: workspaceId }), { env, rpc })).status, 400);
  assert.equal((await service.handleWorkerRequest(request({ action: 'heartbeat', id: workspaceId, leaseToken: workspaceId }), { env, rpc })).status, 409);
  assert.equal((await service.handleWorkerRequest(request({ action: 'event', id: workspaceId, leaseToken: workspaceId, eventId: 'e', type: 'item.completed', payload: { text: '가'.repeat(10000) } }), { env, rpc })).status, 400);
});

test('storage failures remain operational errors rather than invalid user input', async () => {
  const response = await service.handleWorkerRequest(request({ action: 'claim' }), { env, rpc: async () => { throw new Error('network failure'); } });
  assert.equal(response.status, 502);
});
