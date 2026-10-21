'use strict';
// Bind browser login responses to explicit intent without inspecting request bodies.
const COOKIE = 'com_moon_operator_session';
const ATTEMPT = 'x-moonlight-login-attempt';
const CHECK = 'x-moonlight-login-check';
function registerHubSessionNetwork({ webRequest, getHubUrl, getWindow, getBridge }) {
  const requests = new Map();
  const isCurrent = (details) => {
    try { return new URL(details.url).origin === new URL(getHubUrl()).origin; } catch { return false; }
  };
  const header = (headers, name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const bridge = getBridge();
    if (!isCurrent(details)) { callback({}); return; }
    const headers = { ...details.requestHeaders };
    const attempt = header(headers, ATTEMPT), check = header(headers, CHECK);
    const window = getWindow();
    const loginRequest = new URL(details.url).pathname === '/api/operator/session' && details.method === 'POST'
      && window && !window.isDestroyed() && details.webContentsId === window.webContents.id
      && new URL(window.webContents.getURL()).pathname === '/login'
      && bridge?.hasLoginAttempt(attempt) && requests.size < 128 && bridge.claimLoginRequest(attempt);
    if (new URL(details.url).pathname === '/api/operator/session' && requests.size < 128) {
      requests.set(details.id, { attempt: loginRequest ? attempt : null, epoch: bridge?.sessionEpoch() ?? null });
    }
    const sessionCheck = new URL(details.url).pathname === '/api/operator/session' && details.method === 'GET' && bridge?.hasLoginAttempt(check);
    for (const key of Object.keys(headers)) {
      if ([ATTEMPT, CHECK].includes(key.toLowerCase())) delete headers[key];
      else if (key.toLowerCase() === 'cookie' && (bridge?.sessionSuppressed() ?? true) && !sessionCheck) {
        headers[key] = String(headers[key]).split(';').filter((cookie) => cookie.trim().split('=')[0] !== COOKIE).join(';');
      }
    }
    callback({ requestHeaders: headers });
  });
  webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const bridge = getBridge();
    if (!isCurrent(details) || new URL(details.url).pathname !== '/api/operator/session') { callback({}); return; }
    const request = requests.get(details.id);
    const attempt = request?.attempt;
    const sameEpoch = request && request.epoch === (bridge?.sessionEpoch() ?? null);
    if (sameEpoch && bridge?.hasLoginAttempt(attempt) && details.statusCode >= 200 && details.statusCode < 300) {
      const issued = Object.entries(details.responseHeaders).filter(([key]) => key.toLowerCase() === 'set-cookie')
        .flatMap(([, values]) => values).map((value) => value.match(/^com_moon_operator_session=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:;|$)/)?.[1]).find(Boolean);
      if (issued) bridge.observeLoginCookie(attempt, issued);
      callback({}); return;
    }
    // A response begun before logout or a newer accepted login stays stale
    // even after that newer login has cleared the suppression marker.
    if (sameEpoch && bridge && !bridge.sessionSuppressed()) { callback({}); return; }
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) if (key.toLowerCase() === 'set-cookie') {
      headers[key] = headers[key].filter((value) => value.trim().split('=')[0] !== COOKIE);
    }
    callback({ responseHeaders: headers });
  });
  webRequest.onBeforeRedirect({ urls: ['http://*/*', 'https://*/*'] }, (details) => requests.delete(details.id));
  webRequest.onCompleted({ urls: ['http://*/*', 'https://*/*'] }, (details) => requests.delete(details.id));
  webRequest.onErrorOccurred({ urls: ['http://*/*', 'https://*/*'] }, (details) => requests.delete(details.id));
}
module.exports = { registerHubSessionNetwork };
