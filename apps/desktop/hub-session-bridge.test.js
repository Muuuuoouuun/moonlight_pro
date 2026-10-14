'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startHubSessionBridge } = require('./hub-session-bridge');

function exchange(socketPath, value) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let response = '';
    client.on('connect', () => client.write(`${JSON.stringify(value)}\n`));
    client.on('data', (chunk) => { response += chunk; });
    client.on('end', () => { try { resolve(JSON.parse(response)); } catch { reject(new Error('Invalid bridge response')); } });
    client.on('error', reject);
  });
}

test('Mac session IPC shares login/logout in both directions, scoped to the current Hub', { skip: process.platform !== 'darwin' }, async (t) => {
  const directory = await fs.mkdtemp('/tmp/moonlight-bridge-test-');
  let cookie = null;
  let hub = 'https://hub.example.test';
  let flushes = 0;
  let cookieChanged;
  const session = { cookies: {
    on: (_name, listener) => { cookieChanged = listener; },
    get: async () => cookie ? [cookie] : [],
    set: async (value) => { cookie = value; },
    remove: async () => { cookie = null; },
    flushStore: async () => { flushes++; },
  } };
  const bridge = await startHubSessionBridge({ directory, session, getHubUrl: () => hub });
  t.after(async () => { await bridge.close(); await fs.rm(directory, { recursive: true, force: true }); });
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(bridge.socketPath)).mode & 0o777, 0o600);
  const read = { action: 'read', origin: hub };
  assert.deepEqual(await exchange(bridge.socketPath, read), { origin: hub, session: null, signedOut: false });
  const saved = { value: 'signed_payload.signature', expiresAt: Date.now() / 1000 + 86400 };
  assert.deepEqual(await exchange(bridge.socketPath, { ...read, action: 'write', session: saved }), { origin: hub, session: saved, signedOut: false });
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.deepEqual(await exchange(bridge.socketPath, read), { origin: hub, session: saved, signedOut: false });
  for (const origin of ['https://other.example.test', `${hub}/`, `${hub}.evil.test`, 'http://hub.example.test']) {
    assert.deepEqual(await exchange(bridge.socketPath, { ...read, origin }), { error: 'rejected' });
  }
  for (const bad of [{ value: 'password', expiresAt: saved.expiresAt }, { ...saved, expiresAt: 1 }]) {
    assert.deepEqual(await exchange(bridge.socketPath, { ...read, action: 'write', session: bad }), { error: 'rejected' });
  }
  cookie = null;
  const changedCookie = { name: 'com_moon_operator_session', domain: 'hub.example.test' };
  cookieChanged({}, changedCookie, 'expired', true);
  assert.deepEqual(await exchange(bridge.socketPath, read), { origin: hub, session: null, signedOut: false });
  cookieChanged({}, changedCookie, 'expired-overwrite', true);
  assert.deepEqual(await exchange(bridge.socketPath, read), { origin: hub, session: null, signedOut: true });
  assert.deepEqual(await exchange(bridge.socketPath, { ...read, action: 'write', session: null }), { origin: hub, session: null, signedOut: true });
  assert.equal(cookie, null);
  assert.equal(flushes, 2);
  hub = 'https://changed.example.test';
  assert.deepEqual(await exchange(bridge.socketPath, read), { error: 'rejected' });
});

test('Mac session IPC refuses permissive directories and an already active socket', { skip: process.platform !== 'darwin' }, async (t) => {
  const directory = await fs.mkdtemp('/tmp/moonlight-bridge-guard-');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.chmod(directory, 0o755);
  const options = { directory, session: { cookies: {} }, getHubUrl: () => 'https://hub.example.test' };
  await assert.rejects(startHubSessionBridge(options), /Unsafe/);
  await fs.chmod(directory, 0o700);
  const first = await startHubSessionBridge(options);
  try { await assert.rejects(startHubSessionBridge(options), /already running/); }
  finally { await first.close(); }
});

test('Swift companion shares real Unix socket sessions with the Electron bridge', { skip: process.platform !== 'darwin' }, async (t) => {
  const directory = await fs.mkdtemp('/tmp/moonlight-swift-session-');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const src = path.resolve(__dirname, '../../prototypes/moonlight-pet-macos');
  const binary = path.join(directory, 'SessionCheck');
  const run = promisify(execFile);
  await run('swiftc', ['-parse-as-library',
    `${src}/Sources/MoonlightPetPreview/Support/HubTransport.swift`,
    `${src}/Sources/MoonlightPetPreview/Support/HubDesktopSession.swift`,
    `${src}/Sources/MoonlightPetPreview/Support/HubCredentials.swift`,
    `${src}/Tests/MoonlightPetPreviewTests/HubDesktopSessionTests.swift`, '-o', binary]);
  let cookie;
  const session = { cookies: {
    get: async () => cookie ? [cookie] : [], set: async (value) => { cookie = value; },
    remove: async () => { cookie = null; }, flushStore: async () => {},
  } };
  const bridge = await startHubSessionBridge({ directory, session, getHubUrl: () => 'https://hub.example.test' });
  try { await run(binary, ['bridge', directory], { timeout: 15000 }); }
  finally { await bridge.close(); }
});
