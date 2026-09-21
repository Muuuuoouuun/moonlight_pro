import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { middleware } from '../middleware.js';
import { createOperatorSessionToken, OPERATOR_SESSION_COOKIE } from './operator-session.js';
import { HUB_WRITE_SECRET_HEADER } from './hub-write-guard.js';

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: 'production', COM_MOON_HUB_WRITE_SECRET: 'test-hub-secret' };
});
afterEach(() => { process.env = { ...originalEnv }; });

function request(path, headers = {}, method = 'GET') {
  return new NextRequest(`https://hub.example.com${path}`, { method, headers });
}

test('production middleware accepts MCP credentials for API reads and writes', () => {
  for (const headers of [
    { authorization: 'Bearer test-hub-secret' },
    { [HUB_WRITE_SECRET_HEADER]: 'test-hub-secret' },
  ]) {
    for (const [path, method] of [['/api/hub/projects', 'GET'], ['/api/hub/brand-mentor', 'POST']]) {
      assert.equal(middleware(request(path, headers, method)).headers.get('x-middleware-next'), '1');
    }
  }
});

test('missing or invalid server credentials do not open production reads, even on localhost', () => {
  for (const headers of [
    {}, { authorization: 'Bearer wrong' }, { [HUB_WRITE_SECRET_HEADER]: 'wrong' },
    { origin: 'https://hub.example.com' }, { host: 'localhost:3000' },
  ]) {
    assert.equal(middleware(request('/api/hub/projects', headers)).status, 401);
  }
});

test('server credentials do not replace browser sessions on pages', () => {
  const response = middleware(request('/dashboard', { authorization: 'Bearer test-hub-secret' }));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  const cookie = `${OPERATOR_SESSION_COOKIE}=${createOperatorSessionToken()}`;
  assert.equal(middleware(request('/dashboard', { cookie })).headers.get('x-middleware-next'), '1');
});

test('a credential must be configured server-side and cannot use the session signing secret', () => {
  delete process.env.COM_MOON_HUB_WRITE_SECRET;
  process.env.COM_MOON_OPERATOR_SESSION_SECRET = 'session-signing-only';
  assert.equal(middleware(request('/api/hub/projects', { authorization: 'Bearer session-signing-only' })).status, 401);
  delete process.env.COM_MOON_OPERATOR_SESSION_SECRET;
  delete process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  assert.equal(middleware(request('/api/hub/projects', { authorization: 'Bearer test-hub-secret' })).status, 503);
});
