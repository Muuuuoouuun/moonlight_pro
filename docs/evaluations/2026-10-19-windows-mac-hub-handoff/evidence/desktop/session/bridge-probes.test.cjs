'use strict';
// Isolated Linux JS protocol probes; no Electron/Swift/native UI execution.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const sourceRoot = process.env.MOONLIGHT_AUDIT_ROOT || process.cwd();
const { startHubSessionBridge } = require(path.join(sourceRoot, 'apps/desktop/hub-session-bridge.js'));
const { startNativeSessionBridge } = require(path.join(sourceRoot, 'apps/desktop/native-session-bridge.js'));
const origin = 'https://hub.example.test';
const cookieName = 'com_moon_operator_session';
const saved = { value: 'isolated_payload.signature', expiresAt: Date.now() / 1000 + 3600 };
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function exchange(socketPath, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let body = '';
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', chunk => { body += chunk; });
    socket.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    socket.on('error', reject);
  });
}
function cookieStore() {
  const cookies = new EventEmitter();
  let cookie = null;
  cookies.get = async () => cookie ? [cookie] : [];
  cookies.set = async value => { cookie = { ...value, domain: new URL(value.url).hostname }; };
  cookies.remove = async () => { cookie = null; };
  cookies.flushStore = async () => {};
  return cookies;
}
async function unixBridge(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moonlight-js-probe-'));
  const cookies = cookieStore();
  const bridge = await startHubSessionBridge({ directory, session: { cookies }, getHubUrl: () => origin });
  t.after(async () => { await bridge.close(); }); // Preserve evidence directories; no cleanup of external files.
  return { bridge, cookies, directory };
}
async function nativeBridge(t, options = {}) {
  const home = options.home || await fs.mkdtemp(path.join(os.tmpdir(), 'moonlight-native-probe-'));
  const bridge = await startNativeSessionBridge({ home, session: { cookies: { get: async () => [] } }, getHubUrl: () => origin, ...options });
  t.after(async () => { await bridge.close(); });
  const descriptor = path.join(home, 'Library/Application Support/MoonlightNativeBridge/connection.json');
  const connection = JSON.parse(await fs.readFile(descriptor, 'utf8'));
  return { bridge, home, descriptor, connection };
}

test('contract — Unix logout marker is retained in-process and is cleared by login', async t => {
  const { bridge } = await unixBridge(t);
  const signout = await exchange(bridge.socketPath, { action: 'write', origin, session: null });
  assert.equal(signout.signedOut, true);
  const signin = await exchange(bridge.socketPath, { action: 'write', origin, session: saved });
  assert.equal(signin.signedOut, false);
  assert.deepEqual(signin.session, saved);
});

test('reproduction — shell restart loses explicit logout marker', async t => {
  const { bridge, cookies, directory } = await unixBridge(t);
  cookies.emit('changed', {}, { name: cookieName, domain: 'hub.example.test' }, 'expired-overwrite', true);
  const before = await exchange(bridge.socketPath, { action: 'read', origin });
  assert.equal(before.signedOut, true);
  await bridge.close();
  const restarted = await startHubSessionBridge({ directory, session: { cookies }, getHubUrl: () => origin });
  t.after(() => restarted.close());
  const after = await exchange(restarted.socketPath, { action: 'read', origin });
  assert.equal(after.session, null);
  assert.equal(after.signedOut, false);
  t.diagnostic(JSON.stringify({ beforeRestartSignedOut: before.signedOut, afterRestartSignedOut: after.signedOut }));
});

test('reproduction — in-flight cookie read can return valid old session with signedOut true', async t => {
  const { bridge, cookies } = await unixBridge(t);
  await exchange(bridge.socketPath, { action: 'write', origin, session: saved });
  const snapshot = await cookies.get();
  const ready = defer(), resume = defer();
  cookies.get = async () => { ready.resolve(); await resume.promise; return snapshot; };
  const pending = exchange(bridge.socketPath, { action: 'read', origin });
  await ready.promise;
  await cookies.remove();
  cookies.emit('changed', {}, { name: cookieName, domain: 'hub.example.test' }, 'explicit', true);
  resume.resolve();
  const response = await pending;
  assert.deepEqual(response.session, saved);
  assert.equal(response.signedOut, true);
  t.diagnostic('Observed contradictory response: valid session retained after explicit logout notification. Swift syncDesktopSession prioritizes session before signedOut.');
});

test('contract — one Unix socket request is handled once even when two lines arrive', async t => {
  const { bridge, cookies } = await unixBridge(t);
  let writes = 0;
  cookies.set = async () => { writes++; };
  await new Promise((resolve, reject) => {
    const client = net.createConnection(bridge.socketPath);
    client.on('connect', () => client.write(`${JSON.stringify({ action: 'write', origin, session: saved })}\n${JSON.stringify({ action: 'write', origin, session: saved })}\n`));
    client.resume(); client.on('end', resolve); client.on('error', reject);
  });
  assert.equal(writes, 1);
});

test('contract — native old close preserves descriptor when replacement already exists', async t => {
  const a = await nativeBridge(t);
  const b = await nativeBridge(t, { home: a.home });
  await a.bridge.close();
  const current = JSON.parse(await fs.readFile(a.descriptor, 'utf8'));
  assert.equal(current.token, b.connection.token);
  const response = await fetch(current.url, { headers: { Authorization: `Bearer ${current.token}` } });
  assert.equal(response.status, 200);
});

test('reproduction — native close can delete a replacement descriptor published after old descriptor read', async t => {
  const a = await nativeBridge(t);
  const original = fs.readFile;
  const readOld = defer(), resumeClose = defer();
  let intercept = true;
  fs.readFile = async function (...args) {
    const result = await original.apply(this, args);
    if (intercept && args[0] === a.descriptor) {
      intercept = false; readOld.resolve(); await resumeClose.promise;
    }
    return result;
  };
  const closing = a.bridge.close();
  await readOld.promise;
  const b = await nativeBridge(t, { home: a.home });
  resumeClose.resolve();
  try {
    await closing;
    await assert.rejects(original(a.descriptor, 'utf8'), { code: 'ENOENT' });
    const response = await fetch(b.connection.url, { headers: { Authorization: `Bearer ${b.connection.token}` } });
    assert.equal(response.status, 200);
    t.diagnostic('Replacement server is alive (200), but its discovery descriptor is absent (ENOENT). Requires overlapping bridge lifecycle.');
  } finally { fs.readFile = original; }
});

test('characterization — native read keeps its start origin if origin changes during cookie lookup', async t => {
  const ready = defer(), resume = defer();
  let current = origin;
  const a = await nativeBridge(t, { getHubUrl: () => current, session: { cookies: { get: async () => {
    ready.resolve(); await resume.promise;
    return [{ name: cookieName, value: 'isolated-session', domain: 'hub.example.test', path: '/', httpOnly: true, secure: true }];
  } } } });
  const pending = fetch(a.connection.url, { headers: { Authorization: `Bearer ${a.connection.token}` } });
  await ready.promise; current = 'https://other.example.test'; resume.resolve();
  const body = await (await pending).json();
  assert.equal(body.origin, origin);
  assert.equal(body.cookie, 'isolated-session');
  t.diagnostic('Snapshot response retains old origin; consumer must reject old generations. No cross-origin cookie pairing observed.');
});
