import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { persistDesktopLogout } from '../../../lib/desktop-session-intent.js';
const source = readFileSync(new URL('./evolution-settings.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const logout = async () => {'), source.indexOf('  const loadDeadlineAlerts'));
function setup(intent) {
  const order = [], errors = [], visits = [];
  const scope = { logoutBusy: false, setLogoutBusy() {}, setLogoutError: (value) => errors.push(value), persistDesktopLogout,
    window: { moonlightSession: { logout: async () => { order.push('persist'); return intent; } }, location: { replace: (value) => visits.push(value) } },
    resetQuickTasks: () => order.push('existing-capture-cleanup'),
    fetch: async () => { order.push('server-logout'); return { ok: true }; } };
  const logout = new Function(...Object.keys(scope), handler + '; return logout;')(...Object.values(scope));
  return { logout, order, errors, visits };
}
test('actual settings logout awaits intent persistence before cookie/server logout', async () => {
  const run = setup({ supported: true, signedOut: true, logoutIntent: { persistence: 'persisted', localSession: 'cleared', companion: 'unconfirmed' } });
  await run.logout(); assert.deepEqual(run.order, ['persist', 'existing-capture-cleanup', 'server-logout']);
  assert.deepEqual(run.visits, ['/login?companionLogout=unconfirmed']);
});
test('partial desktop failure still attempts server logout and retains a visible partial result', async () => {
  const run = setup({ supported: true, signedOut: true, error: 'intent-unavailable' });
  await run.logout(); assert.deepEqual(run.order, ['persist', 'existing-capture-cleanup', 'server-logout']);
  assert.deepEqual(run.visits, []); assert.match(run.errors.at(-1), /서버 로그아웃 응답은 받았습니다.*미확인/);
});
