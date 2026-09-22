import assert from 'node:assert/strict';
import { test } from 'node:test';
let route;
try { route = await import('./route.js'); } catch {}
const workspaceId = '11111111-1111-1111-1111-111111111111';
const variantId = '44444444-4444-4444-4444-444444444444';
const updatedAt = '2026-01-01T00:00:00.123456+00:00';
const record = { id: variantId, workspace_id: workspaceId, updated_at: updatedAt, published_at: '2025-01-01T00:00:00Z', meta: { origin: 'studio' } };
const payload = { variantId, expectedUpdatedAt: updatedAt, views: 0, shares: null, replies: null };
async function withEnv(run) {
  const snapshot = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: 'production', COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, COM_MOON_HUB_WRITE_SECRET: 'hub-secret', SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'db-secret' });
  try { return await run(); } finally { process.env = snapshot; globalThis.fetch = originalFetch; }
}
const request = (body, authenticated = true) => new Request('https://hub.test/api/hub/content/performance', { method: 'PATCH', headers: { 'content-type': 'application/json', ...(authenticated ? { 'x-com-moon-hub-write-secret': 'hub-secret' } : {}) }, body: JSON.stringify(body) });

test('write guard and JSON limits run before persistence', async () => {
  assert.ok(route, 'performance route must exist');
  await withEnv(async () => {
    globalThis.fetch = async () => { throw Error('must not fetch'); };
    assert.equal((await route.PATCH(request(payload, false))).status, 401);
    assert.equal((await route.PATCH(request({ note: '한'.repeat(30000) }))).status, 413);
    assert.equal((await route.PATCH(request([]))).status, 400);
    assert.equal((await route.PATCH(new Request('https://hub.test/api/hub/content/performance', { method: 'PATCH', headers: { 'x-com-moon-hub-write-secret': 'hub-secret' }, body: '{bad' }))).status, 400);
  });
});

test('read errors use HTTP 200 error envelopes, and missing configuration is preview', async () => {
  assert.ok(route);
  await withEnv(async () => {
    globalThis.fetch = async () => new Response('failed', { status: 500 });
    const failed = await route.GET(new Request('https://hub.test/api/hub/content/performance?year=2026'));
    assert.equal(failed.status, 200); assert.equal((await failed.json()).status, 'error');
    globalThis.fetch = async () => { throw Error('must not fetch'); };
    const invalid = await route.GET(new Request('https://hub.test/api/hub/content/performance?year=2026x'));
    assert.equal(invalid.status, 200); assert.equal((await invalid.json()).status, 'error');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
    const preview = await route.GET(new Request('https://hub.test/api/hub/content/performance'));
    assert.equal((await preview.json()).status, 'preview');
    assert.equal((await route.PATCH(request(payload))).status, 202);
  });
});

test('PATCH saves scoped CAS representation and maps both race and pre-read conflicts to 409', async () => {
  assert.ok(route);
  await withEnv(async () => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, init });
      if (init.method === 'PATCH') {
        const patch = JSON.parse(init.body);
        return new Response(JSON.stringify([{ id: variantId, ...patch }]));
      }
      return new Response(JSON.stringify([record]));
    };
    const response = await route.PATCH(request(payload));
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'saved');
    const write = calls.find(call => call.init.method === 'PATCH');
    const url = new URL(write.url);
    assert.equal(url.searchParams.get('workspace_id'), `eq.${workspaceId}`);
    assert.equal(url.searchParams.get('updated_at'), `eq.${updatedAt}`);
    assert.equal(JSON.parse(write.init.body).meta.origin, 'studio');
    globalThis.fetch = async (url, init = {}) => new Response(JSON.stringify(init.method === 'PATCH' ? [] : [record]));
    assert.equal((await route.PATCH(request(payload))).status, 409);
    globalThis.fetch = async () => new Response(JSON.stringify([{ ...record, updated_at: '2026-01-02T00:00:00Z' }]));
    assert.equal((await route.PATCH(request(payload))).status, 409);
  });
});
