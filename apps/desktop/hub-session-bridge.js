'use strict';
// Private same-user IPC for the Mac companion. No TCP listener, credential file,
// password, or session in process arguments. The Hub still verifies every token.
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');

const COOKIE = 'com_moon_operator_session';
const MAX_BYTES = 8192;
const bridgeDirectory = () => `/tmp/moonlight-hub-${process.getuid()}`;

function validSession(value) {
  return value && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.value)
    && value.value.length < 4096 && Number.isFinite(value.expiresAt)
    && value.expiresAt > Date.now() / 1000;
}

async function startHubSessionBridge({ session, getHubUrl, directory = bridgeDirectory() }) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const dir = await fs.lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o777) !== 0o700) {
    throw new Error('Unsafe Hub session bridge directory');
  }
  const socketPath = path.join(directory, 'session.sock');
  try {
    const existing = await fs.lstat(socketPath);
    if (!existing.isSocket() || existing.uid !== process.getuid()) throw new Error('Unsafe Hub session socket');
    const live = await new Promise((resolve) => {
      const probe = net.createConnection(socketPath);
      probe.setTimeout(250);
      probe.once('connect', () => { probe.destroy(); resolve(true); });
      probe.once('error', (error) => resolve(!['ECONNREFUSED', 'ENOENT'].includes(error.code)));
      probe.once('timeout', () => { probe.destroy(); resolve(true); });
    });
    if (live) throw new Error('Hub session bridge already running');
    await fs.unlink(socketPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const server = net.createServer((socket) => {
    let buffer = '';
    let handled = false;
    socket.setEncoding('utf8');
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', async (chunk) => {
      if (handled) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_BYTES) { handled = true; socket.destroy(); return; }
      if (!buffer.includes('\n')) return;
      handled = true;
      try {
        const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        const url = new URL(getHubUrl());
        if (request.origin !== url.origin || !['read', 'write'].includes(request.action)) throw new Error('Rejected bridge request');
        const cookieUrl = `${url.origin}/`;
        if (request.action === 'write') {
          if (request.session === null) {
            signedOutOrigins.add(url.origin);
            await session.cookies.remove(cookieUrl, COOKIE);
          }
          else {
            if (!validSession(request.session)) throw new Error('Invalid session');
            signedOutOrigins.delete(url.origin);
            await session.cookies.set({ url: cookieUrl, name: COOKIE, value: request.session.value,
              expirationDate: request.session.expiresAt, path: '/', httpOnly: true,
              secure: url.protocol === 'https:', sameSite: 'lax' });
          }
          await session.cookies.flushStore();
        }
        const cookies = await session.cookies.get({ url: cookieUrl, name: COOKIE });
        const cookie = cookies.find((item) => item.name === COOKIE && item.path === '/');
        const saved = cookie ? { value: cookie.value, expiresAt: cookie.expirationDate } : null;
        socket.end(`${JSON.stringify({ origin: url.origin, session: validSession(saved) ? saved : null,
          signedOut: signedOutOrigins.has(url.origin) })}\n`);
      } catch { socket.end('{"error":"rejected"}\n'); }
    });
  });
  const signedOutOrigins = new Set();
  const onCookieChanged = (_event, cookie, cause, removed) => {
    if (cookie.name !== COOKIE) return;
    let origin;
    try { origin = new URL(getHubUrl()).origin; } catch { return; }
    const host = new URL(origin).hostname;
    const domain = cookie.domain?.replace(/^\./, '');
    if (domain && host !== domain && !host.endsWith(`.${domain}`)) return;
    if (!removed) signedOutOrigins.delete(origin);
    else if (['explicit', 'expired-overwrite'].includes(cause)) signedOutOrigins.add(origin);
  };
  session.cookies.on?.('changed', onCookieChanged);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  await fs.chmod(socketPath, 0o600);
  return { close: () => { session.cookies.removeListener?.('changed', onCookieChanged);
    return new Promise((resolve) => server.close(resolve)); }, socketPath };
}

module.exports = { startHubSessionBridge, bridgeDirectory };
