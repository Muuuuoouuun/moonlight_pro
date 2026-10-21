import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopAllowsSessionRestore, beginDesktopLogin, acceptDesktopLogin, persistDesktopLogout } from './desktop-session-intent.js';

test('ordinary browser keeps existing behavior and explicit desktop login requires its matching grant', async () => {
  assert.equal(await desktopAllowsSessionRestore(undefined), true);
  assert.equal(await beginDesktopLogin(undefined), null);
  assert.equal(await persistDesktopLogout(undefined), null);
  const calls = [];
  const bridge = { beginLogin: async () => ({ supported: true, loginAttempt: 'synthetic-attempt' }),
    acceptLogin: async (attempt) => { calls.push(attempt); return { supported: true, signedOut: false }; } };
  const attempt = await beginDesktopLogin(bridge); await acceptDesktopLogin(bridge, attempt);
  assert.deepEqual(calls, ['synthetic-attempt']);
  bridge.acceptLogin = async () => ({ supported: true, signedOut: true, automaticLoginBlocked: true });
  await assert.rejects(acceptDesktopLogin(bridge, attempt));
  bridge.beginLogin = async () => ({ supported: true, error: 'bridge-unavailable' });
  await assert.rejects(beginDesktopLogin(bridge));
});
test('unavailable bridge and durable logout block passive login redirect without inventing logout', async () => {
  for (const state of [{ supported: true, error: 'bridge-unavailable' }, { supported: true, signedOut: true },
    { supported: true, automaticLoginBlocked: true }, null]) {
    assert.equal(await desktopAllowsSessionRestore({ state: async () => state }), false);
  }
  assert.equal(await desktopAllowsSessionRestore({ state: async () => ({ supported: false }) }), true);
});
test('logout helper distinguishes persistence/removal failure and never claims companion/remote completion', async () => {
  for (const result of [{ supported: true, error: 'intent-unavailable' },
    { supported: true, signedOut: true, logoutIntent: { persistence: 'pending', localSession: 'cleared' } },
    { supported: true, signedOut: true, logoutIntent: { persistence: 'persisted', localSession: 'failed' } }]) {
    await assert.rejects(persistDesktopLogout({ logout: async () => result }));
  }
  const intent = { persistence: 'persisted', localSession: 'cleared', companion: 'unconfirmed', remoteSession: 'not-requested', ownedKeychain: 'not-requested' };
  assert.deepEqual(await persistDesktopLogout({ logout: async () => ({ supported: true, signedOut: true, logoutIntent: intent }) }), intent);
});
