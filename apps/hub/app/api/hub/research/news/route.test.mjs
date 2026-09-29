import assert from 'node:assert/strict';
import { test } from 'node:test';

let route;
try { route = await import('./route.js'); } catch { /* red step */ }

async function withEnv(run) {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'hub-secret', BRAVE_SEARCH_API_KEY: 'brave-secret' });
  try { await run(); } finally { process.env = originalEnv; globalThis.fetch = originalFetch; }
}

function request(body, authorized = true) {
  return new Request('https://hub.test/api/hub/research/news', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { 'x-com-moon-hub-write-secret': 'hub-secret' } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('paid news search requires Hub authorization and rejects malformed or arbitrary queries before Brave', async () => {
  assert.ok(route);
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{}'); };
    assert.equal((await route.POST(request({ brand: 'classmoon', topic: 'ebs' }, false))).status, 401);
    assert.equal((await route.POST(request('{bad'))).status, 400);
    assert.equal((await route.POST(request({ brand: 'classmoon', topic: 'arbitrary paid query' }))).status, 400);
    assert.equal((await route.POST(request({ brand: 'classmoon', topic: 'ebs', q: 'inject' }))).status, 400);
    assert.equal(calls, 0);
  });
});

test('returns transient news results with no-store and reports upstream state honestly', async () => {
  assert.ok(route);
  await withEnv(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ results: [{ title: '원문', url: 'https://news.example/story' }] }), { status: 200 });
    const ok = await route.POST(request({ brand: 'classmoon', topic: 'ebs', freshness: 'pd' }));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('cache-control'), /no-store/);
    const data = await ok.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.results.length, 1);
    assert.equal(JSON.stringify(data).includes('brave-secret'), false);

    delete process.env.BRAVE_SEARCH_API_KEY;
    const missing = await route.POST(request({ brand: 'classmoon', topic: 'ebs' }));
    assert.equal((await missing.json()).status, 'preview');
    process.env.BRAVE_SEARCH_API_KEY = 'brave-secret';
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    const throttled = await route.POST(request({ brand: 'classmoon', topic: 'ebs' }));
    assert.equal(throttled.status, 429);
    assert.equal((await throttled.json()).reason, 'brave-rate-limited');
  });
});
