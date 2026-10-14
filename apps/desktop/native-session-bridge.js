'use strict';
// Only the current OS user can discover this loopback endpoint. Hub credentials
// stay in Electron's cookie store; this file contains only a per-run capability.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { normalizeHubUrl } = require('./hub-url');
const SESSION_COOKIE = 'com_moon_operator_session';

function sharedCookie(cookies, origin, now = Date.now() / 1000) {
  const url = new URL(origin);
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE && cookie.httpOnly &&
    cookie.path === '/' && cookie.domain.replace(/^\./, '').toLowerCase() === url.hostname.toLowerCase() &&
    (url.protocol !== 'https:' || cookie.secure) &&
    (cookie.expirationDate == null || cookie.expirationDate > now) &&
    typeof cookie.value === 'string' && cookie.value.length > 0 && cookie.value.length <= 4096 &&
    !/[\s;,\r\n]/.test(cookie.value));
}

async function startNativeSessionBridge({ session, getHubUrl, home = os.homedir() }) {
  const directory = path.join(home, 'Library', 'Application Support', 'MoonlightNativeBridge');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await fs.lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.uid !== process.getuid() || (directoryInfo.mode & 0o077)) {
    throw new Error('Native session bridge directory must be private to this user');
  }
  const descriptor = path.join(directory, 'connection.json');
  const token = randomBytes(32).toString('hex');
  let endpoint;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    const authorization = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (req.method !== 'GET' || req.url !== '/session' || req.headers.origin ||
        req.headers.host !== new URL(endpoint).host || authorization.length !== expected.length ||
        !timingSafeEqual(authorization, expected)) {
      res.writeHead(403); res.end('{"status":"forbidden"}'); return;
    }
    try {
      const normalized = normalizeHubUrl(getHubUrl());
      if (!normalized.ok) throw new Error('Hub origin is unavailable');
      const origin = new URL(normalized.url).origin;
      const cookie = sharedCookie(await session.cookies.get({ url: `${origin}/`, name: SESSION_COOKIE }), origin);
      res.end(JSON.stringify({ origin, cookie: cookie?.value ?? null }));
    } catch {
      res.writeHead(503); res.end('{"status":"unavailable"}');
    }
  });
  server.headersTimeout = 3000;
  server.requestTimeout = 3000;
  server.maxHeadersCount = 16;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();
  endpoint = `http://127.0.0.1:${server.address().port}/session`;
  const temporary = `${descriptor}.${token}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ url: endpoint, token }), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, descriptor);
  } catch (error) {
    server.close(); await fs.rm(temporary, { force: true }); throw error;
  }
  return {
    async close() {
      server.close(); server.closeAllConnections();
      // A restarted shell may already have published a new endpoint.
      const current = await fs.readFile(descriptor, 'utf8').catch(() => '');
      if (current && JSON.parse(current).token === token) await fs.rm(descriptor, { force: true });
    },
  };
}
module.exports = { startNativeSessionBridge, sharedCookie };
