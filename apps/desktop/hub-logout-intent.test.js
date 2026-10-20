'use strict';
// Synthetic cookies/credential sentinels only. No Electron, Swift, HTTP, Keychain or app env.
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const { fork } = require('node:child_process');
const { startHubSessionBridge } = require('./hub-session-bridge');
const origin = 'https://logout.example.test';
const saved = { value: 'synthetic.signature', expiresAt: 4102444800 };
const newer = { value: 'newer.signature', expiresAt: 4102444800 };
const name = 'com_moon_operator_session';
function exchange(socketPath, request) {
  return new Promise((resolve, reject) => {
    let data = '';
    const socket = net.createConnection(socketPath);
    socket.on('connect', () => socket.write(JSON.stringify({ origin, protocolVersion: 2, ...request }) + '\n'));
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
    socket.on('error', reject);
  });
}
async function setup(directory, options = {}) {
  let cookie = null;
  const cookieFile = path.join(directory, 'synthetic-cookie.json');
  try { cookie = JSON.parse(await fs.readFile(cookieFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const cookies = new EventEmitter();
  const replace = async (value) => {
    cookie = value ? { name, value: value.value, expirationDate: value.expiresAt, path: '/', domain: 'logout.example.test' } : null;
    await fs.writeFile(cookieFile, JSON.stringify(cookie), { mode: 0o600 });
  };
  cookies.get = async () => cookie ? [cookie] : [];
  cookies.set = async (value) => replace({ value: value.value, expiresAt: value.expirationDate });
  cookies.remove = async () => replace(null);
  cookies.flushStore = async () => {};
  const bridge = await startHubSessionBridge({ directory, session: { cookies }, getHubUrl: () => origin, ...options });
  return { bridge, cookies, replace, call: (request) => exchange(bridge.socketPath, request) };
}
if (process.argv[2] === 'synthetic-child') {
  (async () => {
    const directory = process.argv[3];
    let current = await setup(directory);
    process.on('message', async ({ id, action, request }) => {
      try {
        let result;
        if (action === 'recreate') { await current.bridge.close(); current = await setup(directory); result = true; }
        else if (action === 'stop') { await current.bridge.close(); process.send({ id, result: true }, () => process.exit(0)); return; }
        else result = await current.call(request);
        process.send({ id, result });
      } catch (error) { process.send({ id, error: error.message }); }
    });
    process.send({ ready: true, pid: process.pid });
  })().catch(() => process.exit(1));
} else {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const options = { skip: process.platform === 'win32', timeout: 10000 };
  async function local(t, extra = {}) {
    const directory = await fs.mkdtemp('/tmp/r15-logout-test-');
    const result = await setup(directory, extra);
    t.after(() => result.bridge.close()); // Keep synthetic evidence; no recursive deletion.
    return { ...result, directory };
  }
  async function login(call, session = saved) {
    const begin = await call({ action: 'begin-login' });
    assert.ok(begin.loginAttempt);
    return call({ action: 'accept-login', loginAttempt: begin.loginAttempt, session });
  }
  test('explicit logout survives bridge recreation, real process restart and SIGKILL after durable ack', options, async () => {
    const directory = await fs.mkdtemp('/tmp/r15-logout-restart-');
    const taskHome = path.join(directory, 'home'); await fs.mkdir(taskHome, { mode: 0o700 });
    const untouched = path.join(directory, 'synthetic-user-data.json');
    const sentinel = JSON.stringify({ draft: '합성 초안', notes: 'preserve', credentials: { owned: 'fake', otherApp: 'fake-other' } });
    await fs.writeFile(untouched, sentinel, { mode: 0o600 });
    let child, sequence = 0;
    const boot = async () => {
      child = fork(__filename, ['synthetic-child', directory], {
        env: { PATH: '/usr/bin:/bin', HOME: taskHome, TMPDIR: directory, CI: '1' },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      const ready = (await once(child, 'message'))[0]; assert.equal(ready.ready, true); return ready.pid;
    };
    const command = (action, request) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const listener = (message) => { if (message.id !== id) return; child.off('message', listener); message.error ? reject(Error(message.error)) : resolve(message.result); };
      child.on('message', listener); child.send({ id, action, request });
    });
    const call = (request) => command('exchange', request);
    try {
      const firstPid = await boot();
      assert.deepEqual(await call({ action: 'read' }), { origin, session: null, signedOut: false, protocolVersion: 2, capabilities: { logoutIntent: true } });
      await login(call);
      const loggedOut = await call({ action: 'write', session: null });
      assert.equal(loggedOut.logoutIntent.persistence, 'persisted');
      assert.equal(loggedOut.logoutIntent.localSession, 'cleared');
      assert.equal(loggedOut.logoutIntent.companion, 'unconfirmed');
      assert.equal(loggedOut.logoutIntent.ownedKeychain, 'not-requested');
      assert.equal(loggedOut.logoutIntent.remoteSession, 'not-requested');
      await command('recreate');
      assert.equal((await call({ action: 'read' })).signedOut, true);
      const exited = once(child, 'exit'); await command('stop'); await exited;
      const secondPid = await boot(); assert.notEqual(firstPid, secondPid);
      assert.equal((await call({ action: 'read' })).logoutIntent.id, loggedOut.logoutIntent.id);
      const killed = once(child, 'exit'); child.kill('SIGKILL'); await killed;
      const thirdPid = await boot(); assert.notEqual(secondPid, thirdPid);
      const restarted = await call({ action: 'read' });
      assert.equal(restarted.signedOut, true);
      assert.equal(restarted.logoutIntent.installationId, loggedOut.logoutIntent.installationId);
      assert.equal((await call({ action: 'write', session: saved })).signedOut, true);
      assert.equal((await login(call, newer)).signedOut, false);
      assert.equal(await fs.readFile(untouched, 'utf8'), sentinel);
      const intentFile = path.join(directory, 'intent/logout-intent.json');
      const raw = await fs.readFile(intentFile, 'utf8');
      assert.equal(raw.includes(saved.value), false); assert.equal(raw.includes(newer.value), false);
      assert.equal((await fs.stat(intentFile)).mode & 0o777, 0o600);
      console.log(JSON.stringify({ fixture: 'logout-restart', directory, firstPid, secondPid, thirdPid, userDataUnchanged: true }));
    } finally { if (child?.connected) { const exited = once(child, 'exit'); await command('stop'); await exited; } }
  });
  test('first launch, expiry, overwrite and foreign cookie removal do not invent explicit intent', options, async (t) => {
    const { call, cookies, replace } = await local(t);
    for (const cause of ['expired', 'expired-overwrite', 'explicit']) {
      await replace(null); cookies.emit('changed', {}, { name, domain: 'logout.example.test' }, cause, true);
      assert.equal((await call({ action: 'read' })).signedOut, false);
    }
    await replace(saved);
    cookies.emit('changed', {}, { name, domain: 'other.example.test' }, 'explicit', true);
    assert.deepEqual((await call({ action: 'read' })).session, saved);
    assert.deepEqual(await call({ action: 'read', origin: 'https://other.example.test' }), { error: 'rejected' });
  });
  test('late cookies and automatic writes cannot clear intent; only one-use current explicit acceptance can', options, async (t) => {
    const { call, cookies, replace } = await local(t);
    const old = await call({ action: 'begin-login' });
    await call({ action: 'write', session: null });
    await replace(saved); cookies.emit('changed', {}, { name, domain: 'logout.example.test' }, 'explicit', false);
    assert.equal((await call({ action: 'read' })).signedOut, true);
    // Wait for exact-cookie reconciliation, not merely the hidden snapshot.
    await call({ action: 'write', session: null });
    assert.deepEqual(await cookies.get(), []);
    assert.equal((await call({ action: 'write', session: saved })).signedOut, true);
    assert.deepEqual(await call({ action: 'accept-login', loginAttempt: old.loginAttempt, session: saved }), { error: 'rejected' });
    const begin = await call({ action: 'begin-login' });
    assert.equal((await call({ action: 'accept-login', loginAttempt: begin.loginAttempt, session: newer })).signedOut, false);
    assert.deepEqual(await call({ action: 'accept-login', loginAttempt: begin.loginAttempt, session: saved }), { error: 'rejected' });
  });
  test('origin/account/current installation scopes do not clear each other', options, async (t) => {
    let accountId = 'synthetic-account-a', hub = origin;
    const { call, bridge, directory } = await local(t, { getAccountId: () => accountId, getHubUrl: () => hub });
    const first = await call({ action: 'write', session: null });
    accountId = 'synthetic-account-b';
    assert.equal((await call({ action: 'read' })).signedOut, false);
    await login(call);
    accountId = 'synthetic-account-a';
    assert.equal((await call({ action: 'read' })).logoutIntent.id, first.logoutIntent.id);
    hub = 'https://other.example.test';
    assert.equal((await exchange(bridge.socketPath, { origin: hub, action: 'read' })).signedOut, false);
    hub = origin;
    assert.equal((await call({ action: 'read' })).signedOut, true);
    const second = await local(t);
    assert.equal((await second.call({ action: 'read' })).signedOut, false);
    assert.notEqual(directory, second.directory);
  });
  test('corrupt or unsafe state blocks automatic login without claiming logout or touching cookie data', options, async (t) => {
    const directory = await fs.mkdtemp('/tmp/r15-logout-corrupt-');
    const intentDirectory = path.join(directory, 'intent'); await fs.mkdir(intentDirectory, { mode: 0o700 });
    const file = path.join(intentDirectory, 'logout-intent.json'); await fs.writeFile(file, '{broken', { mode: 0o600 });
    const { bridge, call, replace } = await setup(directory); t.after(() => bridge.close()); await replace(saved);
    const result = await call({ action: 'read' });
    assert.equal(result.signedOut, false); assert.equal(result.automaticLoginBlocked, true); assert.equal(result.error, 'intent-unavailable');
    assert.equal((await call({ action: 'begin-login' })).loginAttempt, undefined);
    assert.equal(await fs.readFile(file, 'utf8'), '{broken');
    const unsafeDirectory = await fs.mkdtemp('/tmp/r15-logout-unsafe-');
    await fs.mkdir(path.join(unsafeDirectory, 'intent'), { mode: 0o700 });
    await fs.chmod(path.join(unsafeDirectory, 'intent'), 0o755);
    const unsafe = await setup(unsafeDirectory); t.after(() => unsafe.bridge.close());
    assert.equal((await unsafe.call({ action: 'read' })).error, 'intent-unavailable');
  });
  test('persistence failure never acknowledges durable logout and does not remove the cookie', options, async (t) => {
    let removes = 0;
    const { call, cookies } = await local(t, { intentFileSystem: { ...fs, rename: async () => { throw Error('synthetic failure'); } } });
    cookies.remove = async () => { removes++; };
    const result = await call({ action: 'write', session: null });
    assert.equal(result.signedOut, true); assert.equal(result.error, 'intent-unavailable');
    assert.equal(result.logoutIntent.persistence, 'write-failed'); assert.equal(removes, 0);
    assert.equal((await call({ action: 'write', session: saved })).automaticLoginBlocked, true);
  });
  test('cookie removal failure remains partial, repeated logout keeps the same intent and preserves unrelated data', options, async (t) => {
    const { call, cookies } = await local(t);
    const remove = cookies.remove; cookies.remove = async () => { throw Error('synthetic cookie failure'); };
    const partial = await call({ action: 'write', session: null });
    assert.equal(partial.logoutIntent.persistence, 'persisted'); assert.equal(partial.logoutIntent.localSession, 'failed');
    cookies.remove = remove;
    const retry = await call({ action: 'write', session: null });
    assert.equal(retry.logoutIntent.id, partial.logoutIntent.id); assert.equal(retry.logoutIntent.localSession, 'cleared');
  });
  test('a logout racing an accepted login fences its response and finishes with a durable intent', options, async (t) => {
    const { call, cookies } = await local(t);
    const begin = await call({ action: 'begin-login' });
    let release, started;
    const began = new Promise((resolve) => { started = resolve; });
    const held = new Promise((resolve) => { release = resolve; });
    const set = cookies.set; cookies.set = async (...args) => { started(); await held; await set(...args); };
    const accepting = call({ action: 'accept-login', loginAttempt: begin.loginAttempt, session: saved });
    await began;
    const loggingOut = call({ action: 'write', session: null });
    // Wait until the logout request has fenced the accepted login.
    for (let i = 0; i < 20; i++) { if ((await call({ action: 'read' })).signedOut) break; }
    release();
    assert.deepEqual(await accepting, { error: 'rejected' });
    assert.equal((await loggingOut).logoutIntent.persistence, 'persisted');
    assert.equal((await call({ action: 'read' })).signedOut, true);
  });
}

if (process.argv[2] !== 'synthetic-child') {
  const test = require('node:test'), assert = require('node:assert/strict');
  test('legacy companion reads never interpret the new marker as permission to erase credentials', { skip: process.platform === 'win32' }, async (t) => {
    const directory = await fs.mkdtemp('/tmp/r15-logout-legacy-');
    const { bridge, call } = await setup(directory); t.after(() => bridge.close());
    await call({ action: 'write', session: null });
    const legacy = await call({ action: 'read', protocolVersion: 1 });
    assert.equal(legacy.signedOut, false); assert.equal(legacy.session, null); assert.equal(legacy.automaticLoginBlocked, true);
    assert.equal(legacy.logoutIntent.ownedKeychain, 'not-requested');
  });
  test('new accepted login fences old session writes and discarded connection grants', { skip: process.platform === 'win32' }, async (t) => {
    const directory = await fs.mkdtemp('/tmp/r15-logout-epoch-');
    const { bridge, call } = await setup(directory); t.after(() => bridge.close());
    const first = await call({ action: 'begin-login' });
    const accepted = await call({ action: 'accept-login', loginAttempt: first.loginAttempt, session: saved });
    await call({ action: 'write', session: null });
    const second = await call({ action: 'begin-login' });
    const current = await call({ action: 'accept-login', loginAttempt: second.loginAttempt, session: newer });
    assert.notEqual(accepted.sessionEpoch, current.sessionEpoch);
    assert.deepEqual(await call({ action: 'write', session: saved, sessionEpoch: accepted.sessionEpoch }), { error: 'rejected' });
    assert.deepEqual((await call({ action: 'read' })).session, newer);
    const pending = await call({ action: 'begin-login' });
    const epoch = bridge.sessionEpoch(); bridge.invalidateConnection();
    assert.notEqual(bridge.sessionEpoch(), epoch);
    assert.deepEqual(await call({ action: 'accept-login', loginAttempt: pending.loginAttempt, session: saved }), { error: 'rejected' });
  });
  test('connection changes while persisting keep intent but do not remove the new account cookie', { skip: process.platform === 'win32' }, async (t) => {
    const directory = await fs.mkdtemp('/tmp/r15-logout-switch-');
    let account = 'a', release, began;
    const entered = new Promise((resolve) => { began = resolve; });
    const held = new Promise((resolve) => { release = resolve; });
    const current = await setup(directory, { getAccountId: () => account, intentFileSystem: { ...fs,
      rename: async (...args) => { began(); await held; return fs.rename(...args); } } });
    t.after(() => current.bridge.close());
    let removes = 0; current.cookies.remove = async () => { removes++; };
    const logout = current.call({ action: 'write', session: null });
    await entered; account = 'b'; release();
    const result = await logout;
    assert.equal(result.logoutIntent.persistence, 'persisted'); assert.equal(result.logoutIntent.localSession, 'unconfirmed');
    assert.equal(removes, 0); assert.equal((await current.call({ action: 'read' })).signedOut, false);
  });
  test('Swift source keeps durable suppression separate from credential deletion and blocks unverified restore', async () => {
    const source = await fs.readFile(path.join(__dirname, '../../prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Support/HubTransport.swift'), 'utf8');
    assert.match(source, /if shared\.logoutIntent == nil, shared\.signedOut == true \{\s*try credentialStore\.remove/);
    const restore = source.slice(source.indexOf('private func restoreLogin()'), source.indexOf('func logout() async throws {'));
    assert.ok(restore.indexOf('!desktopSessionAvailable') < restore.indexOf('credentialStore.load'));
    assert.match(source, /acceptLogin\(saved, attempt: attempt, origin: origin\)/);
    assert.match(source, /publishSession: false/);
    assert.match(source, /defer \{ if generation == sessionGeneration \{ clearCookies\(\) \} \}/);
    assert.match(source, /try await recordDesktopLogout\(\)\s*guard generation == sessionGeneration else \{ throw CancellationError\(\) \}/);
    // Source inspection only: no native compilation or credential store execution.
  });
}
