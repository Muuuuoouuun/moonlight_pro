import assert from 'node:assert/strict';
import { test } from 'node:test';
let route, receiptRoute;
try { route = await import('./route.ts'); receiptRoute = await import('./[id]/route.ts'); } catch {}
const workspaceId = '33333333-3333-4333-8333-333333333333';
const commandId = '11111111-1111-4111-8111-111111111111';
const command = { commandId, action: 'create_task', input: { title: '실제 할 일' } };
const headers = { 'content-type': 'application/json', 'x-com-moon-shared-secret': 'shared', 'x-com-moon-agent-workspace': workspaceId, 'x-com-moon-agent-actor': 'codex', 'x-com-moon-agent-scopes': 'read,tasks:write' };
const request = (body = command, changes = {}) => new Request('https://engine.test/api/agent/command', { method: 'POST', headers: { ...headers, ...changes }, body: typeof body === 'string' ? body : JSON.stringify(body) });
function setup(t, changes = {}) {
  assert.ok(route && receiptRoute, 'Engine command and receipt routes exist');
  const env = { NODE_ENV: 'test', COM_MOON_SHARED_WEBHOOK_SECRET: 'shared', COM_MOON_ALLOW_OPEN_WEBHOOKS: 'false', COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_AGENT_ACTOR_ID: 'codex', COM_MOON_AGENT_SCOPES: 'read,tasks:write', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service', ...changes };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test('Engine requires a shared secret even when local open webhook mode is enabled', async t => {
  setup(t, { COM_MOON_SHARED_WEBHOOK_SECRET: '', COM_MOON_ALLOW_OPEN_WEBHOOKS: 'true' });
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No storage access'));
  assert.equal((await route.POST(request())).status, 401);
});

test('Engine rejects spoofed workspace, actor, elevated scope and command body identity', async t => {
  setup(t); t.mock.method(globalThis, 'fetch', async () => assert.fail('No storage access'));
  assert.equal((await route.POST(request(command, { 'x-com-moon-shared-secret': 'wrong' }))).status, 401);
  for (const changes of [{ 'x-com-moon-agent-workspace': commandId }, { 'x-com-moon-agent-actor': 'other' }, { 'x-com-moon-agent-scopes': 'read,tasks:write,contact-outcomes:write' }]) assert.equal((await route.POST(request(command, changes))).status, 403);
  assert.equal((await route.POST(request({ ...command, actorId: 'other' }))).status, 400);
  assert.equal((await route.POST(request(command, { 'x-com-moon-agent-scopes': 'read' }))).status, 403);
});

test('Engine enforces streamed UTF-8 byte limits and rejects invalid JSON before storage', async t => {
  setup(t); t.mock.method(globalThis, 'fetch', async () => assert.fail('No storage access'));
  for (const body of ['[]', 'null', '{', JSON.stringify({ ...command, input: { title: '한'.repeat(100000) } })]) assert.equal((await route.POST(request(body))).status, 400);
  const huge = request(command, { 'content-length': '99999999' });
  assert.equal((await route.POST(huge)).status, 400);
});

test('Engine forwards one transaction with server-derived context and serves owned receipts', async t => {
  setup(t); const names = [];
  const saved = { status: 'saved', persisted: true, commandId, action: 'create_task', entity: { id: commandId, updated_at: '2026-09-13T01:00:00.123456+00:00' }, changedFields: ['title'], updatedAt: '2026-09-13T01:00:00.123456+00:00', replayed: false };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1); names.push(name);
    const params = JSON.parse(options.body);
    assert.equal(params.p_actor_id, 'codex'); assert.equal(params.p_workspace_id, workspaceId); assert.deepEqual(params.p_scopes, ['read', 'tasks:write']);
    return Response.json({ ...saved, replayed: name === 'agent_command_receipt_v1' });
  });
  const created = await route.POST(request()); assert.equal(created.status, 201); assert.equal((await created.json()).updatedAt, saved.updatedAt);
  const found = await receiptRoute.GET(new Request(`https://engine.test/api/agent/command/${commandId}`, { headers }), { params: Promise.resolve({ id: commandId }) });
  assert.equal(found.status, 200); assert.equal((await found.json()).replayed, true);
  assert.deepEqual(names, ['agent_command_v1', 'agent_command_receipt_v1']);
});
