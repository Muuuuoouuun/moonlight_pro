import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NextResponse } from 'next/server.js';

// Run the actual public route with controllable verification promises. No real
// credentials, hashing work, env access, network, or persisted sessions are used.
const source = readFileSync(new URL('./route.js', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
function route(verify, { configured = true, token = 'synthetic-session-token' } = {}) {
  const scope = {
    NextResponse, OPERATOR_SESSION_COOKIE: 'synthetic-operator-session',
    hasOperatorLoginCredentials: () => configured, hasOperatorSessionSecret: () => configured,
    operatorLoginCredentialsMatch: verify, createOperatorSessionToken: () => token,
    operatorSessionCookieOptions: ({ maxAge = 60 } = {}) => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge }),
    verifyOperatorSessionRequest: () => ({ ok: false }),
  };
  return new Function(...Object.keys(scope), `${source}\nreturn { POST };`)(...Object.values(scope));
}
function request(body = { username: 'synthetic-operator', password: 'synthetic-password' }, origin = 'https://hub.example.invalid') {
  return new Request('https://hub.example.invalid/api/operator/session', {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body),
  });
}
function controlled() {
  let active = 0;
  let peak = 0;
  const pending = [];
  let wake;
  const verify = (...args) => new Promise((resolve, reject) => {
    active += 1;
    peak = Math.max(peak, active);
    pending.push({ args, resolve: value => { active -= 1; resolve(value); }, reject: error => { active -= 1; reject(error); } });
    wake?.();
  });
  const waitFor = async count => {
    while (pending.length < count) await new Promise(resolve => { wake = resolve; });
  };
  return { verify, pending, waitFor, get peak() { return peak; }, get active() { return active; } };
}

test('at most two login verifications run and overflow receives a retryable 429 without a cookie', async () => {
  const work = controlled();
  const { POST } = route(work.verify);
  const first = POST(request());
  const second = POST(request());
  await work.waitFor(2);
  const overflow = await POST(request());
  assert.equal(overflow.status, 429);
  assert.equal((await overflow.json()).status, 'busy');
  assert.equal(overflow.headers.get('retry-after'), '1');
  assert.equal(overflow.headers.get('set-cookie'), null);
  assert.equal(work.pending.length, 2);
  assert.equal(work.peak, 2);
  assert.equal(work.active, 2);
  work.pending[0].resolve(true);
  work.pending[1].resolve(false);
  const [success, failed] = await Promise.all([first, second]);
  assert.equal(success.status, 200);
  assert.equal((await success.json()).status, 'authenticated');
  assert.match(success.headers.get('set-cookie'), /synthetic-operator-session=synthetic-session-token.*HttpOnly/);
  assert.equal(failed.status, 401);
  assert.equal((await failed.json()).error, 'invalid-operator-credentials');
  assert.equal(failed.headers.get('set-cookie'), null);
  assert.equal(work.active, 0);
});

for (const outcome of [true, false]) test(`a ${outcome ? 'successful' : 'failed'} verification immediately releases capacity`, async () => {
  const work = controlled();
  const { POST } = route(work.verify);
  const first = POST(request());
  const second = POST(request());
  await work.waitFor(2);
  work.pending[0].resolve(outcome);
  assert.equal((await first).status, outcome ? 200 : 401);
  const replacement = POST(request());
  await work.waitFor(3);
  assert.equal(work.active, 2);
  const overflow = await POST(request());
  assert.equal(overflow.status, 429);
  work.pending[1].resolve(false);
  work.pending[2].resolve(true);
  await Promise.all([second, replacement]);
  assert.equal(work.peak, 2);
});

test('a throwing verifier releases its slot and preserves the existing exception behavior', async () => {
  const work = controlled();
  const { POST } = route(work.verify);
  const first = POST(request());
  const rejected = assert.rejects(first, /synthetic verifier failure/);
  const second = POST(request());
  await work.waitFor(2);
  work.pending[0].reject(new Error('synthetic verifier failure'));
  await rejected;
  const replacement = POST(request());
  await work.waitFor(3);
  assert.equal(work.active, 2);
  work.pending[1].resolve(false);
  work.pending[2].resolve(true);
  await Promise.all([second, replacement]);
  assert.equal(work.peak, 2);
});

test('missing token after a valid verification also releases its slot', async () => {
  const work = controlled();
  const { POST } = route(work.verify, { token: null });
  const first = POST(request());
  const second = POST(request());
  await work.waitFor(2);
  work.pending[0].resolve(true);
  assert.equal((await first).status, 503);
  const replacement = POST(request());
  await work.waitFor(3);
  work.pending[1].resolve(true);
  work.pending[2].resolve(true);
  await Promise.all([second, replacement]);
  assert.equal(work.peak, 2);
});

test('a burst of thirty additional requests starts no extra expensive work', async () => {
  const work = controlled();
  const { POST } = route(work.verify);
  const first = POST(request());
  const second = POST(request());
  await work.waitFor(2);
  const burst = await Promise.all(Array.from({ length: 30 }, () => POST(request())));
  assert.ok(burst.every(response => response.status === 429));
  assert.equal(work.pending.length, 2);
  assert.equal(work.peak, 2);
  work.pending.forEach(job => job.resolve(false));
  await Promise.all([first, second]);
});

test('logout, origin checks, body validation, and missing configuration never wait for login slots', async () => {
  const work = controlled();
  const { POST } = route(work.verify);
  const first = POST(request());
  const second = POST(request());
  await work.waitFor(2);
  const logout = await POST(request({ action: 'logout' }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await POST(request({}, 'https://other.example.invalid'))).status, 403);
  assert.equal((await POST(request({ password: 'x'.repeat(5000) }))).status, 413);
  const malformed = new Request('https://hub.example.invalid/api/operator/session', { method: 'POST', headers: { origin: 'https://hub.example.invalid' }, body: '{' });
  assert.equal((await POST(malformed)).status, 400);
  const unconfigured = route(() => { throw new Error('must not verify without configuration'); }, { configured: false });
  assert.equal((await unconfigured.POST(request())).status, 503);
  assert.equal(work.pending.length, 2);
  work.pending.forEach(job => job.resolve(false));
  await Promise.all([first, second]);
});
