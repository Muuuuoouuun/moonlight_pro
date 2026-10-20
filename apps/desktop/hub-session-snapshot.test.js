'use strict';
// Executes the JS Unix-socket protocol on Linux/macOS with an in-memory cookie
// double. It does not exercise Electron, native login, Keychain, or Swift.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { startHubSessionBridge } = require('./hub-session-bridge');

const capability = { protocolVersion: 2, capabilities: { logoutIntent: true } };
const origin = 'https://hub.example.test';
const cookieName = 'com_moon_operator_session';
const originalSession = { value: 'previous.signature', expiresAt: Date.now() / 1000 + 3600 };
const nextSession = { value: 'renewed.signature', expiresAt: originalSession.expiresAt };
const socketOptions = { skip: process.platform === 'win32', timeout: 5000 };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function exchange(socketPath, value = { action: 'read', origin }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let body = '';
    socket.on('connect', () => socket.write(`${JSON.stringify({ protocolVersion: 2, ...value })}\n`));
    socket.on('data', (chunk) => { body += chunk; });
    socket.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    socket.on('error', reject);
  });
}

async function createBridge(t) {
  const directory = await fs.mkdtemp('/tmp/moonlight-session-snapshot-');
  const cookies = new EventEmitter();
  let current;
  const replace = (value) => {
    current = value ? { name: cookieName, value: value.value, expirationDate: value.expiresAt,
      domain: 'hub.example.test', path: '/' } : null;
  };
  replace(originalSession);
  cookies.get = async () => current ? [current] : [];
  cookies.set = async (value) => replace({ value: value.value, expiresAt: value.expirationDate });
  cookies.remove = async () => replace(null);
  cookies.flushStore = async () => {};
  const changed = (value, cause = 'explicit', name = cookieName, domain = 'hub.example.test') => {
    if (name === cookieName && domain === 'hub.example.test') replace(value);
    cookies.emit('changed', {}, { name, domain, path: '/' }, cause, value === null);
  };
  const bridge = await startHubSessionBridge({ directory, session: { cookies }, getHubUrl: () => origin });
  t.after(() => bridge.close()); // Retain the isolated temporary directory; no recursive removal.
  return { bridge, cookies, changed };
}

async function holdFirstRead(cookies) {
  const read = cookies.get;
  const began = deferred(), release = deferred();
  let reads = 0;
  cookies.get = async (...args) => {
    reads++;
    const snapshot = await read(...args);
    if (reads === 1) { began.resolve(); await release.promise; }
    return snapshot;
  };
  return { began: began.promise, release: release.resolve, reads: () => reads };
}

test('session snapshot discards a prior cookie when logout arrives during lookup', socketOptions, async (t) => {
  const { bridge, cookies, changed } = await createBridge(t);
  const gate = await holdFirstRead(cookies);
  const pending = exchange(bridge.socketPath);
  await gate.began;
  await bridge.logout();
  gate.release();
  const loggedOut = await pending;
  assert.equal(loggedOut.signedOut, true);
  assert.equal(loggedOut.logoutIntent.persistence, 'persisted');
  const begin = await exchange(bridge.socketPath, { action: 'begin-login', origin });
  const login = await exchange(bridge.socketPath, { action: 'accept-login', origin, loginAttempt: begin.loginAttempt, session: nextSession });
  assert.deepEqual(login, { ...capability, origin, session: nextSession, signedOut: false, sessionEpoch: login.sessionEpoch });
  assert.equal(typeof login.sessionEpoch, 'string');
});

test('session snapshot rereads after logout then login instead of exporting the older cookie', socketOptions, async (t) => {
  const { bridge, cookies, changed } = await createBridge(t);
  const gate = await holdFirstRead(cookies);
  const pending = exchange(bridge.socketPath);
  await gate.began;
  await bridge.logout();
  const begin = await exchange(bridge.socketPath, { action: 'begin-login', origin });
  await exchange(bridge.socketPath, { action: 'accept-login', origin, loginAttempt: begin.loginAttempt, session: nextSession });
  gate.release();
  const restored = await pending;
  assert.deepEqual(restored, { ...capability, origin, session: nextSession, signedOut: false, sessionEpoch: restored.sessionEpoch });
  assert.equal(typeof restored.sessionEpoch, 'string');
  assert.equal(gate.reads(), 3); // Accepted-login snapshot plus the suspended read and its retry.
});

test('session snapshot preserves natural expiry without inventing explicit logout', socketOptions, async (t) => {
  const { bridge, cookies, changed } = await createBridge(t);
  const gate = await holdFirstRead(cookies);
  const pending = exchange(bridge.socketPath);
  await gate.began;
  changed(null, 'expired');
  gate.release();
  assert.deepEqual(await pending, { ...capability, origin, session: null, signedOut: false });
  assert.equal(gate.reads(), 2);
});

test('session snapshot bounds repeated rotation and recovers on the next stable read', socketOptions, async (t) => {
  const { bridge, cookies, changed } = await createBridge(t);
  const read = cookies.get;
  let reads = 0;
  cookies.get = async (...args) => {
    reads++;
    const snapshot = await read(...args);
    changed(reads === 1 ? nextSession : originalSession);
    return snapshot;
  };
  assert.deepEqual(await exchange(bridge.socketPath), { error: 'rejected' });
  assert.equal(reads, 2);
  cookies.get = read;
  assert.deepEqual(await exchange(bridge.socketPath), { ...capability, origin, session: originalSession, signedOut: false });
});

test('session snapshot observes a concurrent bridge write even without a cookie event', socketOptions, async (t) => {
  const { bridge, cookies } = await createBridge(t);
  const gate = await holdFirstRead(cookies);
  const pending = exchange(bridge.socketPath);
  await gate.began;
  assert.deepEqual(await exchange(bridge.socketPath, { action: 'write', origin, session: nextSession }),
    { ...capability, origin, session: nextSession, signedOut: false });
  gate.release();
  assert.deepEqual(await pending, { ...capability, origin, session: nextSession, signedOut: false });
});

test('session snapshot ignores unrelated cookie changes', socketOptions, async (t) => {
  const { bridge, cookies, changed } = await createBridge(t);
  const gate = await holdFirstRead(cookies);
  const pending = exchange(bridge.socketPath);
  await gate.began;
  changed(null, 'explicit', 'unrelated_cookie');
  changed(null, 'explicit', cookieName, 'other.example.test');
  gate.release();
  assert.deepEqual(await pending, { ...capability, origin, session: originalSession, signedOut: false });
  assert.equal(gate.reads(), 1);
});

test('session snapshots begun before or during a pending login reject until the cookie write settles', socketOptions, async (t) => {
  const { bridge, cookies } = await createBridge(t);
  const readGate = await holdFirstRead(cookies);
  const earlierRead = exchange(bridge.socketPath);
  await readGate.began;
  const set = cookies.set;
  const beganSet = deferred(), releaseSet = deferred();
  cookies.set = async (...args) => { beganSet.resolve(); await releaseSet.promise; await set(...args); };
  const writing = exchange(bridge.socketPath, { action: 'write', origin, session: nextSession });
  await beganSet.promise;
  const duringRead = await exchange(bridge.socketPath);
  readGate.release();
  const earlierResponse = await earlierRead;
  releaseSet.resolve();
  assert.deepEqual(await writing, { ...capability, origin, session: nextSession, signedOut: false });
  assert.deepEqual(duringRead, { error: 'rejected' });
  assert.deepEqual(earlierResponse, { error: 'rejected' });
  assert.deepEqual(await exchange(bridge.socketPath), { ...capability, origin, session: nextSession, signedOut: false });
});

test('session snapshot retains all overlapping write reservations and clears failed writes', socketOptions, async (t) => {
  const { bridge, cookies } = await createBridge(t);
  const set = cookies.set;
  const beganSet = deferred(), releaseSet = deferred();
  let writes = 0;
  cookies.set = async (...args) => {
    writes++;
    if (writes === 1) { beganSet.resolve(); await releaseSet.promise; throw new Error('Isolated write failure'); }
    await set(...args);
  };
  const firstWrite = exchange(bridge.socketPath, { action: 'write', origin, session: originalSession });
  await beganSet.promise;
  const secondWrite = exchange(bridge.socketPath, { action: 'write', origin, session: nextSession });
  const duringRead = await exchange(bridge.socketPath);
  releaseSet.resolve();
  assert.deepEqual(await firstWrite, { error: 'rejected' });
  assert.deepEqual(await secondWrite, { ...capability, origin, session: nextSession, signedOut: false });
  assert.deepEqual(duringRead, { error: 'rejected' });
  assert.deepEqual(await exchange(bridge.socketPath), { ...capability, origin, session: nextSession, signedOut: false });
});
