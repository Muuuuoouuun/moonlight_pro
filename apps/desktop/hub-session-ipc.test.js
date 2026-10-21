'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerHubSessionIpc } = require('./hub-session-ipc');
function setup() {
  const handlers = new Map(), calls = [];
  const frame = { url: 'https://hub.example.test/login' };
  const webContents = { mainFrame: frame };
  const window = { webContents, isDestroyed: () => false };
  const result = { origin: 'https://hub.example.test', session: { value: 'synthetic.signature' }, signedOut: false,
    loginAttempt: '12345678-1234-1234-1234-123456789abc' };
  let verified = true;
  const bridge = Object.fromEntries(['read', 'logout', 'beginLogin', 'acceptLogin'].map((name) => [name, async () => { calls.push(name); return result; }]));
  registerHubSessionIpc({ ipcMain: { handle: (key, value) => handlers.set(key, value) },
    getWindow: () => window, getHubUrl: () => 'https://hub.example.test', getBridge: () => bridge,
    enabled: () => true, verifyAcceptedLogin: async () => verified });
  const event = { sender: webContents, senderFrame: frame };
  return { call: (action, ev = event, arg) => handlers.get('moonlight:session-' + action)(ev, arg),
    frame, event, calls, result, setVerified: (value) => { verified = value; } };
}
test('session IPC requires exact main sender, frame, origin and action pathname', async () => {
  const { call, event, frame, calls } = setup();
  await assert.rejects(call('state', { ...event, sender: {} }), /main Hub frame/);
  await assert.rejects(call('state', { ...event, senderFrame: { url: frame.url } }), /main Hub frame/);
  frame.url = 'https://hub.example.test.evil.test/login'; await assert.rejects(call('state'), /origin rejected/);
  frame.url = 'https://hub.example.test/dashboard'; await assert.rejects(call('begin-login'), /origin rejected/);
  frame.url = 'https://hub.example.test/login'; await assert.rejects(call('logout'), /origin rejected/);
  assert.deepEqual(calls, []);
  const result = await call('begin-login');
  assert.equal(result.session, undefined); assert.equal(result.origin, undefined); assert.ok(result.loginAttempt);
  frame.url = 'https://hub.example.test/dashboard/settings'; await call('logout');
  assert.deepEqual(calls, ['beginLogin', 'logout']);
});
test('failed server verification never accepts the login or exposes session material', async () => {
  const { call, setVerified, calls, result } = setup();
  setVerified(false);
  await assert.rejects(call('accept-login', undefined, result.loginAttempt), /Server did not confirm/);
  assert.deepEqual(calls, []);
  setVerified(true);
  await assert.rejects(call('accept-login', undefined, 'replay-arbitrary'), /Invalid login attempt/);
  assert.deepEqual(calls, []);
  const accepted = await call('accept-login', undefined, result.loginAttempt);
  assert.equal(accepted.session, undefined); assert.deepEqual(calls, ['acceptLogin']);
});
