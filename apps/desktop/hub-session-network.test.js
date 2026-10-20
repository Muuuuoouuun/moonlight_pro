'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerHubSessionNetwork } = require('./hub-session-network');
function setup() {
  const listeners = {}, grants = new Map();
  let suppressed = true, epoch = 'before';
  let available = true;
  const webRequest = Object.fromEntries(['onBeforeSendHeaders', 'onHeadersReceived', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred']
    .map((name) => [name, (_filter, listener) => { listeners[name] = listener; }]));
  const bridge = { sessionSuppressed: () => suppressed, sessionEpoch: () => epoch, hasLoginAttempt: (id) => grants.has(id),
    claimLoginRequest: (id) => { const grant = grants.get(id); if (!grant || grant.claimed) return false; grant.claimed = true; return true; },
    observeLoginCookie: (id, value) => { grants.get(id).cookie = value; } };
  registerHubSessionNetwork({ webRequest, getHubUrl: () => 'https://hub.example.test',
    getWindow: () => ({ isDestroyed: () => false, webContents: { id: 7, getURL: () => 'https://hub.example.test/login' } }), getBridge: () => available ? bridge : undefined });
  const run = (name, details) => { let result; listeners[name]({ id: 1, url: 'https://hub.example.test/api/operator/session', method: 'POST',
    webContentsId: 7, requestHeaders: {}, responseHeaders: {}, statusCode: 200, ...details }, (value) => { result = value; }); return result; };
  return { run, grants, allow: () => { suppressed = false; epoch = 'after'; }, unavailable: () => { available = false; } };
}
test('late auth response cannot install marked cookie while a different explicit login grant is active', () => {
  const { run, grants } = setup(); grants.set('new-attempt', {});
  run('onBeforeSendHeaders', { id: 2, requestHeaders: { 'x-moonlight-login-attempt': 'new-attempt' } });
  const headers = { 'Set-Cookie': ['com_moon_operator_session=old.signature; Path=/', 'preference=kept; Path=/'], 'X-Test': ['kept'] };
  const stale = run('onHeadersReceived', { id: 1, responseHeaders: headers });
  assert.deepEqual(stale.responseHeaders, { 'Set-Cookie': ['preference=kept; Path=/'], 'X-Test': ['kept'] });
  const accepted = run('onHeadersReceived', { id: 2, responseHeaders: { 'Set-Cookie': ['com_moon_operator_session=new.signature; Path=/'] } });
  assert.deepEqual(accepted, {}); assert.equal(grants.get('new-attempt').cookie, 'new.signature');
  grants.delete('new-attempt');
  assert.deepEqual(run('onHeadersReceived', { id: 2, responseHeaders: headers }).responseHeaders['Set-Cookie'], ['preference=kept; Path=/']);
});
test('request headers remove only marked session cookie and keep nonce local; verification is grant-bound', () => {
  const { run, grants } = setup(); grants.set('current', {});
  const headers = { Cookie: 'theme=dark; com_moon_operator_session=old.signature; pref=yes', 'X-Test': 'kept', 'x-moonlight-login-attempt': 'current' };
  const result = run('onBeforeSendHeaders', { requestHeaders: headers });
  assert.equal(result.requestHeaders.Cookie, 'theme=dark; pref=yes'); assert.equal(result.requestHeaders['X-Test'], 'kept');
  assert.equal(result.requestHeaders['x-moonlight-login-attempt'], undefined);
  const checked = run('onBeforeSendHeaders', { method: 'GET', requestHeaders: { Cookie: headers.Cookie, 'x-moonlight-login-check': 'current' } });
  assert.equal(checked.requestHeaders.Cookie, headers.Cookie); assert.equal(checked.requestHeaders['x-moonlight-login-check'], undefined);
  const wrong = run('onBeforeSendHeaders', { method: 'GET', requestHeaders: { Cookie: headers.Cookie, 'x-moonlight-login-check': 'old' } });
  assert.equal(wrong.requestHeaders.Cookie, 'theme=dark; pref=yes');
});
test('wrong nonce, foreign sender, redirects and replay cannot authorize a response; unrelated traffic stays intact', () => {
  const { run, grants } = setup(); grants.set('current', {});
  const responseHeaders = { 'Set-Cookie': ['com_moon_operator_session=new.signature; Path=/'] };
  run('onBeforeSendHeaders', { id: 1, webContentsId: 999, requestHeaders: { 'x-moonlight-login-attempt': 'current' } });
  assert.deepEqual(run('onHeadersReceived', { id: 1, responseHeaders }).responseHeaders['Set-Cookie'], []);
  run('onBeforeSendHeaders', { id: 2, requestHeaders: { 'x-moonlight-login-attempt': 'current' } });
  run('onBeforeRedirect', { id: 2 });
  run('onBeforeSendHeaders', { id: 3, requestHeaders: { 'x-moonlight-login-attempt': 'current' } });
  for (const id of [2, 3]) assert.deepEqual(run('onHeadersReceived', { id, responseHeaders }).responseHeaders['Set-Cookie'], []);
  assert.deepEqual(run('onHeadersReceived', { url: 'https://other.example.test/api/operator/session', responseHeaders }), {});
  assert.deepEqual(run('onHeadersReceived', { url: 'https://hub.example.test/api/unrelated', responseHeaders }), {});
});


test('old response remains fenced after the newer explicit login clears suppression', () => {
  const { run, allow } = setup();
  run('onBeforeSendHeaders', { id: 1 });
  allow();
  const result = run('onHeadersReceived', { id: 1, responseHeaders: { 'Set-Cookie': ['com_moon_operator_session=old.signature; Path=/', 'pref=kept'] } });
  assert.deepEqual(result.responseHeaders['Set-Cookie'], ['pref=kept']);
});
test('unavailable bridge withholds automatic session cookies without changing unrelated headers', () => {
  const { run, unavailable } = setup(); unavailable();
  const request = run('onBeforeSendHeaders', { requestHeaders: { Cookie: 'pref=kept; com_moon_operator_session=old.signature' } });
  assert.equal(request.requestHeaders.Cookie, 'pref=kept');
  const response = run('onHeadersReceived', { responseHeaders: { 'Set-Cookie': ['com_moon_operator_session=old.signature; Path=/'], 'X-Test': ['kept'] } });
  assert.deepEqual(response.responseHeaders, { 'Set-Cookie': [], 'X-Test': ['kept'] });
});
