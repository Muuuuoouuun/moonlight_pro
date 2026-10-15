import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { getUsableYouTubeAccessToken, exchangeYouTubeCode } from './youtube-oauth.js';

const env = { ...process.env }, originalFetch = globalThis.fetch, originalError = console.error;
const now = Date.parse('2026-09-30T12:00:00Z');
const grantExpiry = '2026-10-01T12:00:00Z';
const scopes = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload';
beforeEach(() => {
  process.env = { ...env, SUPABASE_URL: 'https://db.example.com', SUPABASE_SERVICE_ROLE_KEY: 'fake-db-key',
    COM_MOON_YOUTUBE_CLIENT_ID: 'fake-client', COM_MOON_YOUTUBE_CLIENT_SECRET: 'fake-client-secret' };
  console.error = () => {};
});
afterEach(() => { process.env = { ...env }; globalThis.fetch = originalFetch; console.error = originalError; });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function row(channelId = 'UC123', patch = {}) {
  return { id: `row-${channelId}`, workspace_id: 'w1', provider: 'youtube', account_key: channelId,
    status: 'connected', last_synced_at: '2026-09-30T11:00:00Z', ...patch,
    config: { channelId, brandKey: 'bridgemaker', scope: scopes, accessToken: 'fake-expired-access',
      refreshToken: 'fake-original-refresh', expiresAt: '2026-09-30T11:00:00Z',
      refreshTokenExpiresAt: grantExpiry, ...patch.config } };
}
function fixture({ selected = row(), token = { access_token: 'fake-new-access', expires_in: 3600 },
  patchResponse, latest, channel = selected.config.channelId } = {}) {
  const calls = [], writes = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), method = options.method || 'GET';
    calls.push({ url: parsed, method });
    // Credentials may be in the provider POST body/DB PATCH body, never DB URLs.
    assert.doesNotMatch(String(url), /fake-(expired-access|original-refresh|new-access)/);
    if (parsed.hostname === 'oauth2.googleapis.com') return json(token);
    if (parsed.hostname === 'www.googleapis.com') return json({ items: [{ id: channel, snippet: { title: 'Test' } }] });
    if (method === 'GET') return json([writes.length && latest ? latest : selected]);
    assert.equal(method, 'PATCH');
    writes.push({ value: JSON.parse(options.body), query: parsed.searchParams });
    return patchResponse ? patchResponse() : json([{ id: selected.id }]);
  };
  return { calls, writes };
}
const request = (extra = {}) => getUsableYouTubeAccessToken({ workspaceId: 'w1', channelId: 'UC123', now, ...extra });

test('refresh preserves provider grant expiry and refresh credential when omitted by Google', async () => {
  const { writes } = fixture();
  await request();
  assert.equal(writes[0].value.config.refreshTokenExpiresAt, grantExpiry);
  assert.equal(writes[0].value.config.refreshToken, 'fake-original-refresh');
  assert.equal(writes[0].query.get('last_synced_at'), 'eq.2026-09-30T11:00:00Z');
  assert.equal(writes[0].query.get('select'), 'id');
  assert.ok([...writes[0].query.keys()].every(key => !/token/i.test(key)));
});

test('refresh uses a returned grant TTL only and advances same-millisecond CAS version', async () => {
  const { writes } = fixture({ selected: row('UC123', { last_synced_at: new Date(now).toISOString() }),
    token: { access_token: 'fake-new-access', expires_in: 3600, refresh_token_expires_in: 7200 } });
  await request();
  assert.equal(writes[0].value.config.refreshTokenExpiresAt, new Date(now + 7200000).toISOString());
  assert.equal(writes[0].value.last_synced_at, new Date(now + 1).toISOString());
});

test('same-process same-account requests share one issuance and release after completion', async () => {
  const { calls } = fixture();
  const result = await Promise.all([request(), request()]);
  assert.equal(result[0].accessToken, result[1].accessToken);
  assert.equal(calls.filter(call => call.url.hostname === 'oauth2.googleapis.com').length, 1);
  await request();
  assert.equal(calls.filter(call => call.url.hostname === 'oauth2.googleapis.com').length, 2);
});

test('CAS losing to a valid selected-account winner returns only that persisted winner', async () => {
  const latest = row('UC123', { config: { accessToken: 'fake-winner', expiresAt: new Date(now + 3600000).toISOString() } });
  fixture({ patchResponse: () => json([]), latest });
  const result = await request();
  assert.equal(result.accessToken, 'fake-winner');
  assert.equal(result.refreshed, false);
});

test('CAS conflict with a disabled or wrongly mapped row fails without another issuance/write', async () => {
  for (const latest of [row('UC123', { status: 'disabled' }), row('UC999')]) {
    const { calls, writes } = fixture({ patchResponse: () => json([]), latest });
    await assert.rejects(request(), /not-persisted/);
    assert.equal(writes.length, 1);
    assert.equal(calls.filter(call => call.url.hostname === 'oauth2.googleapis.com').length, 1);
  }
});

test('HTTP/save response failure cannot report the newly issued credential as saved', async () => {
  for (const patchResponse of [() => json({ detail: 'fake-new-access fake-original-refresh' }, 500),
    () => json([{ id: 'wrong-row' }]), () => json([{ id: 'row-UC123' }, { id: 'other' }]),
    () => { throw new Error('fake-new-access request lost'); }]) {
    fixture({ patchResponse });
    await assert.rejects(request(), error => error.message === 'youtube-token-refresh-not-persisted');
  }
});

test('partial or malformed refresh responses never write', async () => {
  for (const token of [{}, { access_token: 'fake-new-access' }, { access_token: {}, expires_in: 3600 },
    { access_token: 'fake-new-access', expires_in: -1 }, { access_token: 'fake-new-access', expires_in: 999999 },
    { access_token: 'fake-new-access', expires_in: 3600, refresh_token: {} }]) {
    const { writes } = fixture({ token });
    await assert.rejects(request(), /invalid-response/);
    assert.equal(writes.length, 0);
  }
});

test('reduced grant scopes fail before identity lookup/storage', async () => {
  const { writes, calls } = fixture({ token: { access_token: 'fake-new-access', expires_in: 3600,
    scope: 'https://www.googleapis.com/auth/youtube.readonly' } });
  await assert.rejects(request(), /permission-required/);
  assert.equal(writes.length, 0);
  assert.equal(calls.length, 2);
});

test('row workspace/provider/account/config mismatch fails before issuance', async () => {
  for (const selected of [row('UC123', { workspace_id: 'w2' }), row('UC123', { provider: 'google_calendar' }),
    row('UC123', { account_key: 'UC999' }), row('UC123', { config: { channelId: 'UC999' } }), row('UC123', { status: 'disabled' })]) {
    const { calls } = fixture({ selected });
    await assert.rejects(request(), /connection-not-found/);
    assert.equal(calls.length, 1);
  }
});

test('new credential channel identity mismatch cannot rewrite selected connection', async () => {
  const { writes } = fixture({ channel: 'UC999' });
  await assert.rejects(request(), /channel-mismatch/);
  assert.equal(writes.length, 0);
});

test('partial OAuth response cannot be accepted as a durable grant', async () => {
  for (const token of [{ access_token: 'fake-access', refresh_token: 'fake-refresh' },
    { access_token: 'fake-access', refresh_token: {}, expires_in: 3600 },
    { access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600, scope: 'profile' }]) {
    globalThis.fetch = async () => json(token);
    await assert.rejects(exchangeYouTubeCode({ code: 'fake-code', redirectUri: 'https://hub.example.com/callback' }),
      /invalid-response|offline-grant-missing|required-scope-missing/);
  }
});
