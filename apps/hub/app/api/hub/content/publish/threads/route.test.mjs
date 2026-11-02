import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { POST, GET, maxDuration } from './route.js';
import { createOperatorSessionToken, OPERATOR_SESSION_COOKIE } from '@/lib/operator-session';
import { resolveRouteAccess } from '@/lib/route-access';

// 밖으로 글을 보내는 라우트 — 세션 게이트 · 운영자 세션 · 같은 출처 · 확인 플래그 · 기본 꺼짐을 고정한다.
const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
const url = 'https://hub.example.com/api/hub/content/publish/threads';
beforeEach(() => {
  process.env = { NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'synthetic-write-secret', COM_MOON_OPERATOR_SESSION_SECRET: 'synthetic-session-secret',
    COM_MOON_OPERATOR_USERNAME: 'operator', COM_MOON_OPERATOR_PASSWORD_HASH: `scrypt$131072$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`,
    COM_MOON_DEFAULT_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111' };
  globalThis.fetch = async () => assert.fail('no provider/storage network in route guard tests');
});
afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });
const input = { action: 'publish', requestId: '22222222-2222-4222-8222-222222222222', variantId: '33333333-3333-4333-8333-333333333333',
  contentId: '44444444-4444-4444-8444-444444444444', brandId: '55555555-5555-4555-8555-555555555555', bodyHash: 'a'.repeat(64), confirmPublish: true };
const request = (body, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const session = () => ({ origin: 'https://hub.example.com', cookie: `${OPERATOR_SESSION_COOKIE}=${createOperatorSessionToken()}` });

test('the publish route sits behind the session gate and refuses server secrets alone or other origins', async () => {
  assert.equal(resolveRouteAccess({ pathname: new URL(url).pathname, host: 'hub.example.com', secretConfigured: true, hasSession: false, allowLoopback: false }).action, 'unauthorized');
  const secretOnly = await POST(request(input, { 'x-com-moon-hub-write-secret': 'synthetic-write-secret' }));
  assert.equal(secretOnly.status, 401); assert.equal((await secretOnly.json()).reason, 'operator-session-required');
  assert.equal((await POST(request(input, { ...session(), origin: 'https://attacker.example', 'x-com-moon-hub-write-secret': 'synthetic-write-secret' }))).status, 403);
  assert.equal(maxDuration, 60);
});

test('an operator still needs the confirmation flag, and the switch is off unless the env says true', async () => {
  assert.equal((await POST(request({ ...input, confirmPublish: false }, session()))).status, 400);
  assert.equal((await POST(request({ ...input, posts: ['클라이언트가 보낸 글'] }, session()))).status, 400, 'the server reads the saved body itself');
  const off = await POST(request(input, session()));
  assert.equal(off.status, 503); assert.equal((await off.json()).status, 'disabled'); assert.match(off.headers.get('cache-control'), /no-store/);
});

test('GET rejects a malformed result ID without reading storage', async () => {
  assert.equal((await GET(new Request(`${url}?variantId=wrong`))).status, 400);
});
