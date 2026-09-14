import assert from 'node:assert/strict';
import { test } from 'node:test';
let module;
try { module = await import('./content-transform-forwarder.js'); } catch {}
const env = { COM_MOON_ENGINE_URL: 'https://engine.test/', COM_MOON_DEFAULT_WORKSPACE_ID: 'server-workspace', COM_MOON_SHARED_WEBHOOK_SECRET: 'shared-secret' };

test('injects the server workspace and shared secret while forwarding the saved recovery token unchanged', async () => {
  assert.ok(module, 'transform forwarder must exist');
  let sent;
  const result = await module.forwardContentTransform({ action: 'recover', requestId: 'request', recoveryToken: 'signed-token', workspaceId: 'foreign' }, { env, fetchImpl: async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ status: 'generated', persisted: true, run: { id: 'request' } })); } });
  assert.equal(result.httpStatus, 200);
  assert.equal(sent.url, 'https://engine.test/api/content/transform');
  assert.deepEqual(JSON.parse(sent.init.body), { action: 'recover', requestId: 'request', recoveryToken: 'signed-token', workspaceId: 'server-workspace' });
  assert.equal(sent.init.headers['x-com-moon-shared-secret'], 'shared-secret');
  assert.equal(sent.init.cache, 'no-store');
});

test('network interruption is unknown and makes one forward attempt without exposing error text', async () => {
  assert.ok(module);
  let calls = 0;
  const result = await module.forwardContentTransform({}, { env, fetchImpl: async () => { calls += 1; throw new Error('secret-leak'); } });
  assert.equal(result.data.status, 'unknown');
  assert.equal(result.httpStatus, 202);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /secret-leak/);
});

test('preserves actionable Engine states and reports incomplete setup honestly', async () => {
  assert.ok(module);
  const result = await module.forwardContentTransform({}, { env, fetchImpl: async () => new Response(JSON.stringify({ status: 'conflict', error: 'stale-variant' }), { status: 409 }) });
  assert.equal(result.httpStatus, 409);
  assert.equal(result.data.error, 'stale-variant');
  const unused = async () => { throw new Error('must not forward'); };
  assert.equal((await module.forwardContentTransform({}, { env: {}, fetchImpl: unused })).data.status, 'preview');
  assert.equal((await module.forwardContentTransform({}, { env: { ...env, COM_MOON_SHARED_WEBHOOK_SECRET: '' }, fetchImpl: unused })).data.error, 'shared-secret-not-configured');
});
