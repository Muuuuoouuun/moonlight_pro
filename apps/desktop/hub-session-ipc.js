'use strict';
// Narrow renderer intent messages: no password, cookie or stored credential crosses IPC.
function registerHubSessionIpc({ ipcMain, getWindow, getHubUrl, getBridge, enabled, verifyAcceptedLogin }) {
  function authorize(event, pathname = '/login') {
    const window = getWindow(), frame = event.senderFrame;
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || !frame || frame !== window.webContents.mainFrame) throw new Error('Session IPC requires the main Hub frame');
    const url = new URL(frame.url);
    if (url.origin !== new URL(getHubUrl()).origin || url.pathname !== pathname) throw new Error('Session IPC origin rejected');
  }
  const publicResult = (result) => ({ supported: true, signedOut: result.signedOut === true,
    automaticLoginBlocked: result.automaticLoginBlocked === true,
    ...(result.error ? { error: result.error } : {}),
    ...(result.logoutIntent ? { logoutIntent: result.logoutIntent } : {}),
    ...(result.loginAttempt ? { loginAttempt: result.loginAttempt } : {}) });
  const use = async (event, operation, pathname = '/login') => {
    authorize(event, pathname);
    if (!enabled()) return { supported: false };
    const bridge = getBridge();
    if (!bridge) return { supported: true, error: 'bridge-unavailable', automaticLoginBlocked: true };
    return publicResult(await operation(bridge));
  };
  ipcMain.handle('moonlight:session-state', (event) => use(event, (bridge) => bridge.read()));
  ipcMain.handle('moonlight:session-logout', (event) => use(event, (bridge) => bridge.logout(), '/dashboard/settings'));
  ipcMain.handle('moonlight:session-begin-login', (event) => use(event, (bridge) => bridge.beginLogin()));
  ipcMain.handle('moonlight:session-cancel-login', (event, attempt) => {
    authorize(event);
    return getBridge()?.cancelLogin(attempt);
  });
  ipcMain.handle('moonlight:session-accept-login', (event, attempt) => use(event, async (bridge) => {
    if (typeof attempt !== 'string' || !/^[0-9a-f-]{36}$/.test(attempt)) throw new Error('Invalid login attempt');
    if (!await verifyAcceptedLogin(attempt)) throw new Error('Server did not confirm the current session');
    // Verification is async; re-check the exact current sender/frame afterwards.
    authorize(event);
    return bridge.acceptLogin(attempt);
  }));
}
module.exports = { registerHubSessionIpc };
