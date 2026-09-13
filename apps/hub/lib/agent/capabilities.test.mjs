import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { getAgentCapabilities } from './capabilities.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const context = { workspaceId, actorId: 'codex', scopes: ['read'] };
const savedEnv = { ...process.env };
let calls;
let respond;
beforeEach(() => {
  Object.assign(process.env, { SUPABASE_URL: 'https://agent-capabilities.test', SUPABASE_SERVICE_ROLE_KEY: 'service-test', COM_MOON_AGENT_API_TOKEN: 'private-agent-token', COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_ENGINE_URL: 'https://engine.test', COM_MOON_SHARED_WEBHOOK_SECRET: 'private-shared-secret', COM_MOON_HUB_WRITE_SECRET: 'private-hub-secret' });
  calls = [];
  respond = (url) => url.pathname.endsWith('workspaces') ? [{ id: workspaceId }] : [];
  mock.method(console, 'error', () => {});
  mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input); calls.push({ url, options });
    const value = respond(url, options);
    return value instanceof Response ? value : Response.json(value);
  });
});
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

test('health distinguishes authenticated read access from configured write secrets', async () => {
  const result = await getAgentCapabilities({ ...context, scopes: ['read', 'tasks:write'] });
  const health = result.data.data;
  assert.equal(result.httpStatus, 200);
  assert.equal(result.data.status, 'live');
  assert.equal(health.configured, true);
  assert.equal(health.reachable, true);
  assert.equal(health.authenticated, true);
  assert.equal(health.canRead, true);
  assert.equal(health.canWrite, null);
  assert.equal(health.persistence.verified, false);
  assert.equal(health.writeVerification, 'receipt-required');
  assert.ok(health.permissions.actions.includes('create_task'));
  assert.equal(health.connections.engine.authenticated, null);
  assert.equal(JSON.stringify(result).includes('private-'), false);
  assert.ok(calls.every((call) => call.options.method === 'GET'));
  assert.ok(calls.every((call) => call.url.searchParams.get('select') === 'id'));
  assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 2048);
});

test('read-only scope advertises no writes or unseen executor state', async () => {
  const result = await getAgentCapabilities(context);
  assert.equal(result.data.data.canWrite, false);
  assert.deepEqual(result.data.data.permissions.actions, []);
  assert.equal(result.data.data.executor.executorOnline, null);
  assert.equal(result.data.data.executor.reason, 'scope-not-granted');
});

test('missing database configuration remains authenticated preview', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
  const result = await getAgentCapabilities(context);
  assert.equal(result.data.status, 'preview');
  assert.equal(result.data.data.configured, false);
  assert.equal(result.data.data.authenticated, true);
  assert.equal(result.data.data.canRead, false);
  assert.equal(calls.length, 0);
});

test('failed database probe does not masquerade as an empty healthy ledger', async () => {
  respond = () => new Response('denied', { status: 401 });
  const result = await getAgentCapabilities(context);
  assert.equal(result.data.status, 'error');
  assert.equal(result.data.data.canRead, false);
  assert.equal(result.data.data.connections.database.reachable, true);
  assert.equal(result.data.data.connections.database.authenticated, false);
  assert.deepEqual(result.data.failedSources, ['workspaces', 'tasks']);
});

test('worker availability is read only and scoped; its failure is partial alongside healthy database', async () => {
  respond = (url) => {
    if (url.pathname.includes('/rpc/')) return new Response('missing RPC', { status: 404 });
    return url.pathname.endsWith('workspaces') ? [{ id: workspaceId }] : [];
  };
  const result = await getAgentCapabilities({ ...context, scopes: ['read', 'jobs:read'] });
  assert.equal(result.data.status, 'partial');
  assert.equal(result.data.data.canRead, true);
  assert.equal(result.data.data.executor.executorOnline, null);
  assert.deepEqual(result.data.failedSources, ['agent_jobs']);
  const call = calls.find((entry) => entry.url.pathname.includes('/rpc/'));
  assert.equal(JSON.parse(call.options.body).p_action, 'availability');
  assert.equal(JSON.parse(call.options.body).p_workspace_id, workspaceId);
});

test('invalid context fails before a capability probe', async () => {
  const result = await getAgentCapabilities({ ...context, scopes: ['tasks:write'] });
  assert.equal(result.httpStatus, 403);
  assert.equal(calls.length, 0);
});
