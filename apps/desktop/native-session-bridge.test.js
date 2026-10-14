'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startNativeSessionBridge, sharedCookie } = require('./native-session-bridge');

const origin = 'https://hub.example.test';
const cookie = { name: 'com_moon_operator_session', value: 'contract-session', domain: 'hub.example.test', path: '/', httpOnly: true, secure: true };

test('only the exact operator session, origin, root path and live HttpOnly cookie are shared', () => {
  assert.equal(sharedCookie([cookie], origin), cookie);
  for (const patch of [{ domain: '.example.test' }, { name: 'other' }, { path: '/api' }, { secure: false },
    { httpOnly: false }, { expirationDate: 1 }, { value: 'header; injection' }, { value: 'line\r\ninjection' }]) {
    assert.equal(sharedCookie([{ ...cookie, ...patch }], origin), undefined);
  }
});

test('private endpoint follows login, logout and origin changes without writing Hub cookies', { skip: process.platform === 'win32' }, async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'moonlight-native-bridge-'));
  let currentOrigin = origin;
  let cookies = [cookie];
  const bridge = await startNativeSessionBridge({ home, getHubUrl: () => currentOrigin,
    session: { cookies: { get: async (filter) => {
      assert.equal(filter.url, `${currentOrigin}/`);
      return cookies;
    } } },
  });
  t.after(async () => { await bridge.close(); await fs.rm(home, { recursive: true, force: true }); });
  const directory = path.join(home, 'Library/Application Support/MoonlightNativeBridge');
  const descriptor = path.join(directory, 'connection.json');
  const text = await fs.readFile(descriptor, 'utf8');
  const { url, token } = JSON.parse(text);
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(descriptor)).mode & 0o777, 0o600);
  assert.ok(!text.includes(cookie.value));
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const headers = { Authorization: `Bearer ${token}` };
  for (const request of [{}, { headers: { Authorization: 'Bearer invalid' } },
    { headers: { ...headers, Origin: origin } }, { method: 'POST', headers }]) {
    assert.equal((await fetch(url, request)).status, 403);
  }
  assert.equal((await fetch(url + '?extra', { headers })).status, 403);
  let response = await fetch(url, { headers });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), { origin, cookie: cookie.value });
  cookies = [];
  assert.deepEqual(await (await fetch(url, { headers })).json(), { origin, cookie: null });
  cookies = [{ ...cookie, value: 'next-session' }];
  assert.equal((await (await fetch(url, { headers })).json()).cookie, 'next-session');
  currentOrigin = 'https://other.example.test';
  assert.deepEqual(await (await fetch(url, { headers })).json(), { origin: currentOrigin, cookie: null });
  currentOrigin = 'file:///tmp/untrusted';
  assert.equal((await fetch(url, { headers })).status, 503);
  await bridge.close();
  await assert.rejects(fs.stat(descriptor), { code: 'ENOENT' });
});

test('a public or symlinked bridge directory is rejected', { skip: process.platform === 'win32' }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'moonlight-native-bridge-'));
  const directory = path.join(home, 'Library/Application Support/MoonlightNativeBridge');
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o755 });
    await fs.chmod(directory, 0o755);
    await assert.rejects(startNativeSessionBridge({ home }), /private/);
    await fs.rm(directory, { recursive: true });
    await fs.symlink(home, directory);
    await assert.rejects(startNativeSessionBridge({ home }), /private/);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
