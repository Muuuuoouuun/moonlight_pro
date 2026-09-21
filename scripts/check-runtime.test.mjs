import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectRuntime, probeWorkspace } from './check-runtime.mjs';

function environment(overrides = {}) {
  return {
    SUPABASE_URL: 'https://current.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref: 'current', role: 'service_role' })).toString('base64url')}.test`,
    COM_MOON_DEFAULT_WORKSPACE_ID: '11111111-1111-1111-1111-111111111111',
    COM_MOON_ENGINE_URL: 'http://localhost:3001',
    COM_MOON_SHARED_WEBHOOK_SECRET: 'test-only-secret',
    ...overrides,
  };
}

test('matching current project settings pass without disclosing keys', () => {
  const result = inspectRuntime(['root', 'hub', 'engine'].map(name => ({ name, env: environment() })));
  assert.deepEqual(result.issues, []);
});

test('detects stale project URLs, mismatched workspace and shared secret', () => {
  const result = inspectRuntime([
    { name: 'hub', env: environment({ SUPABASE_URL: 'https://previous.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://current.supabase.co' }) },
    { name: 'engine', env: environment({ COM_MOON_DEFAULT_WORKSPACE_ID: 'other', COM_MOON_SHARED_WEBHOOK_SECRET: 'other-secret' }) },
  ]);
  assert.ok(result.issues.some(v => v.includes('URL and service key project differ')));
  assert.ok(result.issues.some(v => v.includes('browser/server')));
  assert.ok(result.issues.some(v => v.includes('workspace settings differ')));
  assert.ok(result.issues.some(v => v.includes('shared secret')));
  assert.doesNotMatch(JSON.stringify(result.issues), /test-only-secret|other-secret|eyJ/);
});

test('missing configuration is a failure, not a healthy empty database', () => {
  assert.ok(inspectRuntime([{ name: 'hub', env: {} }]).issues.length);
});

test('workspace probe bounds waiting and distinguishes missing workspace from success', async () => {
  const { targets: [target] } = inspectRuntime([{ name: 'hub', env: environment() }]);
  for (const rows of [[], [{ id: target.workspace }]]) {
    const result = await probeWorkspace(target, async (url, options) => {
      assert.equal(url.searchParams.get('id'), `eq.${target.workspace}`);
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.apikey, target.key);
      return Response.json(rows);
    });
    assert.equal(result.ok, rows.length === 1);
  }
  assert.deepEqual(await probeWorkspace(target, async () => { throw new DOMException('timeout', 'TimeoutError'); }), { ok: false, reason: 'timeout' });
  assert.deepEqual(await probeWorkspace(target, async () => new Response('', { status: 401 })), { ok: false, reason: 'HTTP 401' });
  assert.deepEqual(await probeWorkspace(target, async () => { throw Error(target.key); }), { ok: false, reason: 'connection-failed' });
});
