import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { NextRequest } from 'next/server.js';

import { GET as connect } from './meta/threads/connect/route.js';
import { GET as callback } from './meta/threads/callback/route.js';
import { GET as status } from './meta/threads/status/route.js';
import { buildMetaThreadsAuthUrl, decodeMetaThreadsState } from '../../../lib/meta-threads.js';
import { resolveMetaOAuthApp, resolveMetaOAuthAppFromState } from '../../../lib/meta-oauth-apps.js';
import { SOCIAL_BRAND_REGISTRY } from '../../../lib/social-brand-registry.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const workspaceId = '11111111-1111-1111-1111-111111111111';
const target = { provider: 'meta_threads', brandKey: 'gore', brandHandle: 'go_re_startagain' };
const targetUrl = 'https://hub.example.com/api/social/meta/threads/connect?brand=go_re_startagain&brandKey=gore';

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function setup(configured = true) {
  // Only synthetic credentials can reach the mocked provider or database.
  for (const key of Object.keys(process.env)) {
    if (/^(COM_MOON_(META_THREADS|INSTAGRAM)|META_THREADS|THREADS|INSTAGRAM)_/.test(key)) delete process.env[key];
  }
  process.env.SUPABASE_URL = 'https://db.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-db-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspaceId;
  process.env.COM_MOON_OAUTH_STATE_SECRET = 'synthetic-state-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://hub.example.com';
  process.env.COM_MOON_META_THREADS_APP_ID = 'synthetic-bridge-app';
  process.env.COM_MOON_META_THREADS_APP_SECRET = 'synthetic-bridge-secret';
  process.env.COM_MOON_META_THREADS_CLASSMOON_APP_ID = 'synthetic-class-app';
  process.env.COM_MOON_META_THREADS_CLASSMOON_APP_SECRET = 'synthetic-class-secret';
  if (configured) {
    process.env.COM_MOON_META_THREADS_GORE_APP_ID = 'synthetic-gore-app';
    process.env.COM_MOON_META_THREADS_GORE_APP_SECRET = 'synthetic-gore-secret';
  }
}

function authState(expectedAccountId = null) {
  const url = buildMetaThreadsAuthUrl({ origin: 'https://hub.example.com', workspaceId, ...target, expectedAccountId });
  return new URL(url).searchParams.get('state');
}

function connection(overrides = {}) {
  return { id: 'gore-row', workspace_id: workspaceId, provider: 'meta_threads', account_key: 'gore-account', status: 'connected',
    config: { brandKey: 'gore', brandHandle: 'go_re_startagain', username: 'go_re_startagain',
      oauthAppId: 'synthetic-gore-app', oauthAppKey: 'gore', accessToken: 'synthetic-private-token',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), ...overrides } };
}

function mockCallback(state, { profile = { id: 'gore-account', username: 'go_re_startagain' }, consumed = true, previous = [],
  shortToken = { access_token: 'synthetic-short-token', expires_in: 3600 },
  longToken = { access_token: 'synthetic-long-token', expires_in: 5184000 } } = {}) {
  const decoded = decodeMetaThreadsState(state);
  const nonceHash = createHash('sha256').update(decoded.nonce).digest('hex');
  const observed = { tokenCalls: 0, saved: null, connectionWrites: 0 };
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.endsWith('/social_oauth_flows')) {
      assert.equal(options.method, 'PATCH');
      assert.equal(parsed.searchParams.get('workspace_id'), `eq.${workspaceId}`);
      assert.equal(parsed.searchParams.get('app_key'), 'eq.gore');
      assert.equal(parsed.searchParams.get('app_id'), 'eq.synthetic-gore-app');
      assert.equal(parsed.searchParams.get('consumed_at'), 'is.null');
      return new Response(JSON.stringify(consumed ? [{ nonce_hash: nonceHash }] : []));
    }
    if (path.endsWith('/oauth/access_token')) {
      observed.tokenCalls += 1;
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('client_id'), 'synthetic-gore-app');
      assert.equal(body.get('client_secret'), 'synthetic-gore-secret');
      return new Response(JSON.stringify(shortToken));
    }
    if (path.endsWith('/access_token')) {
      observed.tokenCalls += 1;
      assert.equal(parsed.searchParams.get('client_secret'), 'synthetic-gore-secret');
      return new Response(JSON.stringify(longToken));
    }
    if (path.endsWith('/me')) return new Response(JSON.stringify(profile));
    if (path.endsWith('/integration_connections') && options.method === 'GET') return new Response(JSON.stringify(previous));
    if (path.endsWith('/integration_connections') && options.method === 'POST') {
      observed.connectionWrites += 1;
      observed.saved = JSON.parse(options.body)[0];
      assert.equal(parsed.searchParams.get('on_conflict'), 'workspace_id,provider,account_key');
      return new Response(JSON.stringify([{ id: 'saved-gore-row' }]), { status: 201 });
    }
    if (path.endsWith('/sync_runs')) return new Response('[]', { status: 201 });
    throw new Error(`Unexpected synthetic request: ${path}`);
  };
  return observed;
}

function callbackRequest(state) {
  return new NextRequest(`https://hub.example.com/api/social/meta/threads/callback?code=synthetic-code&state=${encodeURIComponent(state)}`);
}

test('blank Go;Re settings cannot borrow BridgeMaker or Class.Moon credentials or create an OAuth flow', async () => {
  setup(false);
  const app = resolveMetaOAuthApp(target);
  assert.equal(app.configured, false);
  assert.equal(app.appId, '');
  assert.equal(app.appSecret, '');
  assert.equal(buildMetaThreadsAuthUrl({ origin: 'https://hub.example.com', workspaceId, ...target }), null);
  let reads = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'db.example.com');
    assert.equal(options.method, 'GET');
    reads += 1;
    return new Response(JSON.stringify(new URL(url).pathname.endsWith('/brands') ? [{ id: 'gore-brand' }] : [connection()]));
  };
  const response = await connect(new NextRequest(targetUrl));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('metaThreads'), 'missing-meta-config');
  const summary = await (await status(new NextRequest(targetUrl))).json();
  assert.equal(summary.status, 'missing-config');
  assert.equal(summary.connection, null);
  assert.deepEqual(summary.connections, []);
  assert.doesNotMatch(JSON.stringify(summary), /synthetic-private-token|synthetic-.*-secret/);
  assert.equal(reads, 2);
});

test('Go;Re auth binds its own app, handle and fixed scopes without expanding permissions', () => {
  setup();
  process.env.COM_MOON_META_THREADS_SCOPES = 'threads_basic,threads_manage_replies';
  const url = new URL(buildMetaThreadsAuthUrl({ origin: 'https://hub.example.com', workspaceId, ...target }));
  const state = decodeMetaThreadsState(url.searchParams.get('state'));
  assert.equal(url.searchParams.get('client_id'), 'synthetic-gore-app');
  assert.equal(url.searchParams.get('scope'), 'threads_basic,threads_content_publish');
  assert.equal(state.brandKey, 'gore');
  assert.equal(state.brandHandle, 'go_re_startagain');
  assert.equal(state.appKey, 'gore');
  assert.equal(state.provider, 'meta_threads');
  assert.equal(state.workspaceId, workspaceId);
  assert.equal(resolveMetaOAuthApp({ ...target, brandHandle: 'ml_bridgemaker' }), null);
  assert.equal(resolveMetaOAuthApp({ ...target, provider: 'instagram_api' }), null);
  assert.equal(resolveMetaOAuthAppFromState({ ...state, appKey: 'moonlight' }), null);
  assert.equal(resolveMetaOAuthAppFromState({ ...state, provider: 'instagram_api' }), null);
});

test('Go;Re app isolation preserves existing Instagram brands and rejects a shared Threads app ID', () => {
  setup();
  process.env.COM_MOON_META_THREADS_GORE_APP_ID = 'synthetic-bridge-app';
  assert.equal(resolveMetaOAuthApp(target).configured, false);
  assert.equal(resolveMetaOAuthApp({ provider: 'meta_threads', brandKey: 'bridgemaker', brandHandle: 'ml_bridgemaker' }).configured, true);
  process.env.COM_MOON_INSTAGRAM_APP_ID = 'synthetic-ig-bridge-app';
  process.env.COM_MOON_INSTAGRAM_APP_SECRET = 'synthetic-ig-bridge-secret';
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_ID = 'synthetic-ig-class-app';
  process.env.COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET = 'synthetic-ig-class-secret';
  // An unsupported Go;Re Instagram setting must not block another Instagram app.
  process.env.COM_MOON_INSTAGRAM_GORE_APP_ID = 'synthetic-ig-class-app';
  for (const [brandKey, brandHandle] of [['bridgemaker', 'ml_bridgemaker'], ['classmoon', 'moon.classin']]) {
    assert.equal(resolveMetaOAuthApp({ provider: 'instagram_api', brandKey, brandHandle }).configured, true);
  }
});

test('Go;Re connect pins the known account in the matching app and rejects a cross-app requested ID', async () => {
  setup();
  let createdFlow = null;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/brands')) {
      assert.equal(parsed.searchParams.get('slug'), 'eq.gore');
      return new Response(JSON.stringify([{ id: 'gore-brand' }]));
    }
    if (parsed.pathname.endsWith('/integration_connections')) {
      return new Response(JSON.stringify([connection(), { ...connection({ oauthAppId: 'other-app' }), account_key: 'other-app-id' }]));
    }
    if (parsed.pathname.endsWith('/social_oauth_flows')) {
      assert.equal(options.method, 'POST');
      createdFlow = JSON.parse(options.body);
      return new Response('', { status: 201 });
    }
    throw new Error(`Unexpected synthetic request: ${parsed.pathname}`);
  };
  const response = await connect(new NextRequest(`${targetUrl}&accountId=gore-account`));
  const state = decodeMetaThreadsState(new URL(response.headers.get('location')).searchParams.get('state'));
  assert.equal(state.expectedAccountId, 'gore-account');
  assert.equal(createdFlow.app_key, 'gore');
  assert.equal(createdFlow.app_id, 'synthetic-gore-app');
  assert.equal(createdFlow.workspace_id, workspaceId);
  assert.equal(createdFlow.provider, 'meta_threads');
  createdFlow = null;
  const rejected = await connect(new NextRequest(`${targetUrl}&accountId=other-app-id`));
  assert.equal(new URL(rejected.headers.get('location')).searchParams.get('metaThreads'), 'account-mismatch');
  assert.equal(createdFlow, null);
});

test('Go;Re callback saves only a verified profile under the exact brand/app/provider account', async () => {
  setup();
  const state = authState('gore-account');
  const observed = mockCallback(state);
  const response = await callback(callbackRequest(state));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('metaThreads'), 'connected');
  assert.equal(observed.saved.workspace_id, workspaceId);
  assert.equal(observed.saved.provider, 'meta_threads');
  assert.equal(observed.saved.account_key, 'gore-account');
  assert.equal(observed.saved.config.brandKey, 'gore');
  assert.equal(observed.saved.config.brandHandle, 'go_re_startagain');
  assert.equal(observed.saved.config.oauthAppKey, 'gore');
  assert.equal(observed.saved.config.oauthAppId, 'synthetic-gore-app');
  assert.doesNotMatch(response.headers.get('location'), /synthetic-(long|short)-token/);
});

test('Go;Re callback refuses a wrong handle or replaced account ID before saving a connection', async () => {
  setup();
  for (const profile of [{ id: 'gore-account', username: 'ml_bridgemaker' }, { id: 'replacement-id', username: 'go_re_startagain' }]) {
    const state = authState('gore-account');
    const observed = mockCallback(state, { profile });
    const response = await callback(callbackRequest(state));
    assert.equal(new URL(response.headers.get('location')).searchParams.get('metaThreads'), 'account-mismatch');
    assert.equal(observed.connectionWrites, 0);
  }
});

test('Go;Re rejects replayed state and changed app credentials before issuing tokens', async () => {
  setup();
  const state = authState();
  const observed = mockCallback(state, { consumed: false });
  const replay = await callback(callbackRequest(state));
  assert.equal(new URL(replay.headers.get('location')).searchParams.get('metaThreads'), 'invalid-state');
  assert.equal(observed.tokenCalls, 0);
  process.env.COM_MOON_META_THREADS_GORE_APP_ID = 'replacement-app';
  globalThis.fetch = async () => { assert.fail('changed app must not access the provider or database'); };
  const changed = await callback(callbackRequest(state));
  assert.equal(new URL(changed.headers.get('location')).searchParams.get('metaThreads'), 'invalid-state');
});

test('Go;Re cannot reassign an existing provider account owned by another brand or app', async () => {
  setup();
  for (const config of [{ brandKey: 'classmoon' }, { oauthAppId: 'class-app', oauthAppKey: 'classmoon' }]) {
    const state = authState('gore-account');
    const observed = mockCallback(state, { previous: [connection(config)] });
    const response = await callback(callbackRequest(state));
    assert.equal(new URL(response.headers.get('location')).searchParams.get('metaThreads'), 'connect-failed');
    assert.equal(observed.connectionWrites, 0);
  }
});

test('Go;Re rejects partial OAuth responses and explicit permission loss before saving credentials', async () => {
  setup();
  for (const tokens of [
    { shortToken: { access_token: null } },
    { shortToken: { access_token: { private: 'synthetic-private-token' } } },
    { shortToken: { access_token: 'synthetic-token', scope: 'threads_basic' } },
    { longToken: { expires_in: 5184000 } },
    { longToken: { access_token: 'synthetic-token' } },
    { longToken: { access_token: 'synthetic-token', expires_in: -1 } },
    { longToken: { access_token: 'synthetic-token', expires_in: '5184000' } },
    { longToken: { access_token: 'synthetic-token', expires_in: 5184000, scope: 'threads_basic' } },
  ]) {
    const state = authState();
    const observed = mockCallback(state, tokens);
    const response = await callback(callbackRequest(state));
    assert.equal(new URL(response.headers.get('location')).searchParams.get('metaThreads'), 'connect-failed');
    assert.equal(observed.connectionWrites, 0);
    assert.doesNotMatch(response.headers.get('location'), /synthetic-private-token|synthetic-token/);
  }
  // A valid short response need not include TTL; the verified long response does.
  const state = authState();
  const valid = mockCallback(state, { shortToken: { access_token: 'synthetic-short-token', user_id: 'gore-account' } });
  const response = await callback(callbackRequest(state));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('metaThreads'), 'connected');
  assert.equal(valid.connectionWrites, 1);
});

test('Go;Re status exposes only matching account metadata and never calls a provider or renews tokens', async () => {
  setup();
  const rows = [connection(),
    { ...connection({ brandKey: 'bridgemaker' }), id: 'wrong-brand' },
    { ...connection({ oauthAppId: 'other-app' }), id: 'wrong-app' },
    { ...connection({ username: 'moon.classin' }), id: 'wrong-handle' },
    { ...connection({}), id: 'other-account', account_key: 'another-account' }];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'db.example.com');
    assert.equal(parsed.searchParams.get('provider'), 'eq.meta_threads');
    assert.equal(parsed.searchParams.get('workspace_id'), `eq.${workspaceId}`);
    assert.equal(options.method, 'GET');
    return new Response(JSON.stringify(rows));
  };
  const response = await status(new NextRequest(`${targetUrl}&accountId=gore-account`));
  const summary = await response.json();
  assert.equal(summary.status, 'connected');
  assert.equal(summary.appKey, 'gore');
  assert.equal(summary.brandKey, 'gore');
  assert.equal(summary.connection.id, 'gore-row');
  assert.deepEqual(summary.connections.map(row => row.id), ['gore-row', 'other-account']);
  assert.equal(summary.verification, 'stored-metadata');
  assert.equal(summary.refreshScheduled, false);
  assert.doesNotMatch(JSON.stringify(summary), /synthetic-private-token|synthetic-gore-secret/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('the prepared OAuth allowlist migration covers every registry app and preserves existing guards', async () => {
  // Static compatibility check only; no migration is applied to a real database.
  const sql = await readFile(new URL('../../../../../supabase/migrations/20261001_0063_gore_oauth_app_binding.sql', import.meta.url), 'utf8');
  const allowlist = sql.match(/app_key in \(([^)]+)\)/)?.[1];
  assert.ok(allowlist);
  const keys = [...allowlist.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(new Set(keys), new Set(Object.values(SOCIAL_BRAND_REGISTRY).map(brand => brand.appKey)));
  assert.doesNotMatch(sql, /\b(update|delete|insert|truncate)\b/i);
  assert.doesNotMatch(sql, /drop (?:table|trigger|function)|drop constraint[^,;]*(?:pair|app_id)/i);
});
