'use strict';
// Synthetic Unix sockets/cookies only. The v1 fixture is the unmodified module
// from 14284e72dfb89096e8337abdb657413fb4fe4df5; no app or credential store runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { startHubSessionBridge } = require('./hub-session-bridge');
const legacy = require('./test-fixtures/hub-session-bridge-v1.cjs');
const origin = 'https://compatibility.example.test';
const saved = { value: 'synthetic.signature', expiresAt: 4102444800 };
const options = { skip: process.platform === 'win32', timeout: 10000 };
function exchange(socketPath, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath); let data = '';
    socket.on('connect', () => socket.write(JSON.stringify({ origin, ...request }) + '\n'));
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
    socket.on('error', reject);
  });
}
async function fixture(t, start = startHubSessionBridge) {
  const directory = await fs.mkdtemp('/tmp/r16-session-compat-');
  let cookie = null, mutations = 0;
  const cookies = {
    get: async () => cookie ? [cookie] : [],
    set: async (value) => { cookie = value; mutations++; },
    remove: async () => { cookie = null; mutations++; }, flushStore: async () => {},
  };
  const bridge = await start({ directory, session: { cookies }, getHubUrl: () => origin });
  t.after(() => bridge.close()); // Retain only this task's synthetic evidence.
  return { directory, bridge, mutations: () => mutations,
    call: (request) => exchange(bridge.socketPath, request) };
}
test('v2 advertises capability before any intent; v1 reply shape stays unchanged across lifecycle', options, async (t) => {
  const { call } = await fixture(t);
  const v1 = { action: 'read', protocolVersion: 1 };
  const v2 = { action: 'read', protocolVersion: 2 };
  assert.deepEqual(await call(v1), { origin, session: null, signedOut: false });
  assert.deepEqual(await call(v2), { origin, session: null, signedOut: false, protocolVersion: 2, capabilities: { logoutIntent: true } });
  assert.deepEqual(await call({ action: 'write', session: saved }), { origin, session: saved, signedOut: false });
  const signedOut = await call({ action: 'logout-intent', protocolVersion: 2 });
  assert.equal(signedOut.logoutIntent.persistence, 'persisted');
  const old = await call(v1), current = await call(v2);
  const { protocolVersion, capabilities, ...existingShape } = current;
  assert.deepEqual(old, { ...existingShape, signedOut: false });
  assert.equal(protocolVersion, 2); assert.deepEqual(capabilities, { logoutIntent: true });
  assert.equal(old.logoutIntent.ownedKeychain, 'not-requested');
});
test('modern mutations require v2 and retain explicit-login and epoch fences', options, async (t) => {
  const { call, mutations } = await fixture(t);
  for (const protocolVersion of [undefined, 1, 3, '2']) {
    for (const action of ['write-session', 'logout-intent']) {
      assert.deepEqual(await call({ action, protocolVersion, session: saved }), { error: 'rejected' });
    }
  }
  assert.equal(mutations(), 0);
  assert.deepEqual(await call({ action: 'write-session', protocolVersion: 2, session: null }), { error: 'rejected' });
  const begin = await call({ action: 'begin-login', protocolVersion: 2 });
  const accepted = await call({ action: 'accept-login', protocolVersion: 2, loginAttempt: begin.loginAttempt, session: saved });
  assert.equal(accepted.protocolVersion, 2);
  assert.deepEqual(await call({ action: 'write-session', protocolVersion: 2, session: saved, sessionEpoch: 'old' }), { error: 'rejected' });
  const renewed = await call({ action: 'write-session', protocolVersion: 2, session: saved, sessionEpoch: accepted.sessionEpoch });
  assert.deepEqual(renewed.session, saved);
  await call({ action: 'logout-intent', protocolVersion: 2 });
  const late = await call({ action: 'write-session', protocolVersion: 2, session: saved, sessionEpoch: accepted.sessionEpoch });
  assert.equal(late.signedOut, true); assert.equal(late.session, null);
});
test('actual preserved v1 bridge rejects modern mutations without changing its fake cookie', options, async (t) => {
  const { call, mutations } = await fixture(t, legacy.startHubSessionBridge);
  await call({ action: 'write', session: saved });
  const count = mutations();
  for (const action of ['write-session', 'logout-intent', 'begin-login', 'accept-login']) {
    assert.deepEqual(await call({ action, protocolVersion: 2, session: null }), { error: 'rejected' });
    assert.equal(mutations(), count);
    assert.deepEqual(await call({ action: 'read', protocolVersion: 2 }), { origin, session: saved, signedOut: false });
  }
});
test('Swift modern bridge cannot mutate the preserved legacy bridge', { skip: process.platform !== 'darwin', timeout: 30000 }, async (t) => {
  const { directory, call, mutations } = await fixture(t, legacy.startHubSessionBridge);
  await call({ action: 'write', session: saved });
  const count = mutations(), src = path.resolve(__dirname, '../../prototypes/moonlight-pet-macos');
  const binary = path.join(directory, 'CompatibilityCheck'), run = promisify(execFile);
  await run('swiftc', ['-parse-as-library',
    `${src}/Sources/MoonlightPetPreview/Support/HubTransport.swift`,
    `${src}/Sources/MoonlightPetPreview/Support/HubDesktopSession.swift`,
    `${src}/Sources/MoonlightPetPreview/Support/HubCredentials.swift`,
    `${src}/Tests/MoonlightPetPreviewTests/HubDesktopSessionTests.swift`, '-o', binary]);
  await run(binary, ['legacy-rejection', directory, origin], { timeout: 15000 });
  assert.equal(mutations(), count);
  assert.deepEqual((await call({ action: 'read' })).session, saved);
});
