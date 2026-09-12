import assert from 'node:assert/strict';
import { test } from 'node:test';
let route;
try { route = await import('./route.js'); } catch {}
async function withEnv(run) {
  const snapshot = { ...process.env };
  const fetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: 'production', COM_MOON_DEFAULT_WORKSPACE_ID: 'server-workspace', COM_MOON_HUB_WRITE_SECRET: 'hub-secret', COM_MOON_SHARED_WEBHOOK_SECRET: 'engine-secret', COM_MOON_ENGINE_URL: 'https://engine.test' });
  try { await run(); } finally { process.env = snapshot; globalThis.fetch = fetch; }
}
const request = (body, authenticated = true) => new Request('https://hub.test/api/hub/content/transform', { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { 'x-com-moon-hub-write-secret': 'hub-secret' } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('guards every transform and recovery write and enforces the UTF-8 body limit', async () => {
  assert.ok(route, 'Hub transform route must exist');
  await withEnv(async () => {
    globalThis.fetch = async () => { throw new Error('must not forward'); };
    assert.equal((await route.POST(request({ action: 'recover' }, false))).status, 401);
    assert.equal((await route.POST(request({ text: '한'.repeat(90000) }))).status, 413);
    assert.equal((await route.POST(request('[]'))).status, 400);
    assert.equal((await route.POST(request('{bad'))).status, 400);
  });
});

test('uses only server workspace/secret and propagates unsaved candidates plus recovery token', async () => {
  assert.ok(route);
  await withEnv(async () => {
    let sent;
    const data = { status: 'unsaved', persisted: false, run: { id: 'run', result: { candidates: [] } }, recoveryToken: 'signed-token' };
    globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify(data)); };
    const response = await route.POST(request({ requestId: 'run', workspaceId: 'foreign' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), data);
    assert.equal(sent.url, 'https://engine.test/api/content/transform');
    assert.equal(JSON.parse(sent.init.body).workspaceId, 'server-workspace');
    assert.equal(sent.init.headers['x-com-moon-shared-secret'], 'engine-secret');
    assert.equal(sent.init.headers['x-com-moon-hub-write-secret'], undefined);
  });
});
