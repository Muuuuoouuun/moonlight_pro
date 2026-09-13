import assert from 'node:assert/strict';
import { test } from 'node:test';
let api;
try { api = await import('./jobs.js'); } catch {}
const workspaceId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const context = { workspaceId, actorId: 'codex', scopes: ['jobs:read', 'jobs:write'] };
const env = { COM_MOON_CODEX_PROJECTS_JSON: JSON.stringify({ moonlight: { label: 'Moonlight', path: '/registered/repo', modes: ['read', 'draft'], contextRefs: { design: 'DESIGN.md' } } }) };
const input = { requestId: id, projectId: 'moonlight', mode: 'read', prompt: '오늘 업무를 검토해 줘', contextRefs: ['design'] };

test('jobs are normalized using only authenticated workspace and actor', async () => {
  assert.ok(api, 'job service must exist');
  const calls = [];
  const result = await api.handleAgentJob('submit', input, context, { env, rpc: async (name, params) => {
    calls.push({ name, params }); return { ok: true, data: { status: 'accepted', job: { id, state: 'queued' } } };
  } });
  assert.equal(result.httpStatus, 202);
  assert.equal(calls[0].name, 'agent_jobs_v1');
  assert.equal(calls[0].params.p_workspace_id, workspaceId);
  assert.equal(calls[0].params.p_actor_id, 'codex');
  assert.equal(calls[0].params.p_input.budget.wallClockSeconds, 600);
  assert.equal(calls[0].params.p_input.budget.maxTurns, 3);
  assert.match(calls[0].params.p_input.requestHash, /^[a-f0-9]{64}$/);
});

test('unknown paths, refs, identity fields, over-budget and missing scopes cannot reach storage', async () => {
  assert.ok(api);
  const rpc = async () => assert.fail('invalid input reached storage');
  for (const extra of [{ cwd: '/tmp' }, { workspaceId }, { actorId: 'admin' }, { contextRefs: ['secret'] }, { prompt: '가'.repeat(6000) }, { budget: { wallClockSeconds: 3601 } }, { mode: 'apply' }]) {
    const result = await api.handleAgentJob('submit', { ...input, ...extra }, context, { env, rpc });
    assert.equal(result.httpStatus, 400, JSON.stringify(extra).slice(0, 80));
  }
  assert.equal((await api.handleAgentJob('get', { id }, { ...context, scopes: [] }, { env, rpc })).httpStatus, 403);
});

test('events validate increasing cursors and preserve durable errors and preview', async () => {
  assert.ok(api);
  assert.equal((await api.handleAgentJob('events', { id, after: -1 }, context, { env })).httpStatus, 400);
  const conflict = await api.handleAgentJob('resume', { id, requestId: id, expectedTurnCount: 1, reconciliation: { confirmed: true, note: 'Checked receipt and changed files', checkedThreadId: 'thread-a' } }, context, { env, rpc: async () => ({ ok: true, data: { status: 'error', code: 'reconciliation-required', error: 'reconciliation-required' } }) });
  assert.equal(conflict.httpStatus, 409);
  const preview = await api.handleAgentJob('get', { id }, context, { env, rpc: async () => ({ ok: false, error: 'missing-config' }) });
  assert.equal(preview.data.status, 'preview');
  assert.equal(preview.data.persisted, false);
});

test('resume and cancel require stable request and turn fencing', async () => {
  assert.ok(api);
  const rpc = async () => assert.fail('unfenced control reached storage');
  assert.equal((await api.handleAgentJob('resume', { id }, context, { env, rpc })).httpStatus, 400);
  assert.equal((await api.handleAgentJob('cancel', { id }, context, { env, rpc })).httpStatus, 400);
});

test('projects expose only registered labels, modes and reference IDs', async () => {
  assert.ok(api);
  const result = await api.handleAgentJob('projects', {}, context, { env, rpc: async () => ({ ok: true, data: { status: 'live', executorOnline: false, lastHeartbeatAt: null } }) });
  assert.deepEqual(result.data.projects, [{ id: 'moonlight', label: 'Moonlight', modes: ['read', 'draft'], contextRefs: ['design'] }]);
  assert.equal(result.data.availability.executorOnline, false);
  assert.ok(!JSON.stringify(result).includes('/registered'));
});
