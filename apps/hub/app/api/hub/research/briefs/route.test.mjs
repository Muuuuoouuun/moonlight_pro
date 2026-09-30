import assert from 'node:assert/strict';
import { test } from 'node:test';

let route;
try { route = await import('./route.js'); } catch { /* expected before implementation */ }
const W = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
async function withEnv(run) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'hub-secret',
    COM_MOON_DEFAULT_WORKSPACE_ID: W, SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'db-secret' });
  try { await run(); } finally { process.env = saved; globalThis.fetch = originalFetch; }
}
const post = (body, authorized = true) => new Request('https://hub.test/api/hub/research/briefs', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { 'x-com-moon-hub-write-secret': 'hub-secret' } : {}) },
  body: JSON.stringify(body),
});

test('write guard and bounded command validation run before storage', async () => {
  assert.ok(route);
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{}'); };
    assert.equal((await route.POST(post({ action: 'discard' }, false))).status, 401);
    assert.equal((await route.POST(post({ action: 'discard' }))).status, 400);
    assert.equal((await route.POST(post({ data: '한'.repeat(34000) }))).status, 413);
    assert.equal(calls, 0);
  });
});

test('read failure stays an HTTP 200 error envelope', async () => {
  assert.ok(route);
  await withEnv(async () => {
    globalThis.fetch = async () => new Response('upstream failure', { status: 503 });
    const response = await route.GET();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'error');
  });
});

test('valid review command uses server workspace and one service RPC', async () => {
  assert.ok(route);
  await withEnv(async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push([url, options]); return Response.json({ status: 'saved', state: 'deferred' }); };
    const response = await route.POST(post({ action: 'defer', requestId: W, briefId: B, expectedRevision: 1, expectedStateVersion: 1, workspaceId: 'foreign' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, 'deferred');
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /\/rpc\/research_command_v1$/);
    const sent = JSON.parse(calls[0][1].body);
    assert.equal(sent.p_workspace_id, W);
    assert.equal(sent.p_command.workspaceId, undefined);
  });
});
