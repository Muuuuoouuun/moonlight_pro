import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hubGet, hubPost } from './hub-client.js';

test('legacy MCP sends the configured Hub credential on both reads and writes', async (t) => {
  const originalSecret = process.env.COM_MOON_HUB_WRITE_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.COM_MOON_HUB_WRITE_SECRET;
    else process.env.COM_MOON_HUB_WRITE_SECRET = originalSecret;
  });
  process.env.COM_MOON_HUB_WRITE_SECRET = 'test-server-credential';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.method);
    assert.equal(options.headers.authorization, 'Bearer test-server-credential');
    assert.equal(options.redirect, 'error');
    return Response.json({ status: 'live' });
  });
  assert.equal((await hubGet('/api/hub/projects')).ok, true);
  assert.equal((await hubPost('/api/hub/brand-mentor', { draft: 'test' })).ok, true);
  assert.deepEqual(calls, ['GET', 'POST']);

  delete process.env.COM_MOON_HUB_WRITE_SECRET;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.authorization, undefined);
    return Response.json({ status: 'unauthorized' }, { status: 401 });
  });
  assert.equal((await hubGet('/api/hub/projects')).kind, 'http-error');
});
