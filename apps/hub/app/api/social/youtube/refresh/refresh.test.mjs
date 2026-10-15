import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { POST } from './route.js';
import { GET as status } from '../status/route.js';
const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
const channelId = 'UCabcdefghijklmnopqrstuv', workspaceId = '11111111-1111-1111-1111-111111111111';
beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'fake-write-secret',
    COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId, SUPABASE_URL: 'https://db.example.com', SUPABASE_SERVICE_ROLE_KEY: 'fake-db-key',
    COM_MOON_YOUTUBE_CLIENT_ID: 'fake-client', COM_MOON_YOUTUBE_CLIENT_SECRET: 'fake-secret', COM_MOON_OAUTH_STATE_SECRET: 'fake-state' };
});
afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });
const json = (value, code = 200) => new Response(JSON.stringify(value), { status: code });
const req = (value, headers = { 'x-com-moon-hub-write-secret': 'fake-write-secret' }) => new NextRequest(
  'https://hub.example.com/api/social/youtube/refresh', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
function connection() {
  return { id: 'row1', workspace_id: workspaceId, provider: 'youtube', account_key: channelId, status: 'connected',
    config: { channelId, channelTitle: 'Synthetic channel', accessToken: 'fake-private-access', refreshToken: 'fake-private-refresh',
      expiresAt: new Date(Date.now() + 3600000).toISOString(), refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString() } };
}

test('production refresh rejects anonymous same-origin requests before any credential read/issuance', async () => {
  globalThis.fetch = () => { throw new Error('must not fetch'); };
  const response = await POST(req({ channelId, confirmRefresh: true }, { origin: 'https://hub.example.com' }));
  assert.ok([401, 403].includes(response.status));
});

test('confirmed account ID is mandatory even for authorized server callers', async () => {
  globalThis.fetch = () => { throw new Error('must not fetch'); };
  for (const value of [{ channelId }, { channelId, confirmRefresh: false }, { channelId: 'UCbad', confirmRefresh: true }, { confirmRefresh: true }]) {
    assert.equal((await POST(req(value))).status, 400);
  }
});

test('refresh cannot select a foreign workspace/provider or return credentials', async () => {
  const row = connection();
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    const params = new URL(url).searchParams;
    assert.equal(params.get('workspace_id'), `eq.${workspaceId}`);
    assert.equal(params.get('provider'), 'eq.youtube');
    assert.equal(params.get('account_key'), `eq.${channelId}`);
    return json([row]);
  };
  const response = await POST(req({ channelId, confirmRefresh: true, workspaceId: 'attacker-workspace', provider: 'instagram_api' }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'saved');
  assert.equal(payload.refreshed, false);
  assert.doesNotMatch(JSON.stringify(payload), /fake-private-access|fake-private-refresh/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('refresh does not report saved if connection is disabled after helper completion', async () => {
  let reads = 0;
  globalThis.fetch = async () => json([{ ...connection(), status: ++reads === 1 ? 'connected' : 'disabled' }]);
  assert.equal((await POST(req({ channelId, confirmRefresh: true }))).status, 409);
});

test('GET status reports expiry and blocked upload without refresh or DB writes', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'db.example.com');
    assert.equal(options.method, 'GET');
    return json([connection()]);
  };
  const response = await status(new NextRequest('https://hub.example.com/api/social/youtube/status'));
  const payload = await response.json();
  assert.equal(payload.verification, 'stored-metadata');
  assert.equal(payload.refreshScheduled, false);
  assert.equal(payload.connections[0].reauthorizationDue, true);
  assert.equal(payload.connections[0].upload.enabled, false);
  assert.doesNotMatch(JSON.stringify(payload), /fake-private-access|fake-private-refresh/);
});
