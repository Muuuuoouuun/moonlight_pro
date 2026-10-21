'use strict';
// Private same-user IPC for the Mac companion. No TCP listener, credential file,
// password, or session in process arguments. The Hub still verifies every token.
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { openLogoutIntentStore, scopeKey } = require('./hub-logout-intent');

const COOKIE = 'com_moon_operator_session';
const MAX_BYTES = 8192;
const bridgeDirectory = () => `/tmp/moonlight-hub-${process.getuid()}`;

function validSession(value) {
  return value && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.value)
    && value.value.length < 4096 && Number.isFinite(value.expiresAt)
    && value.expiresAt > Date.now() / 1000;
}

async function startHubSessionBridge({ session, getHubUrl, directory = bridgeDirectory(),
  intentDirectory = path.join(directory, 'intent'), getAccountId = () => null, intentFileSystem }) {
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

  const store = await openLogoutIntentStore({ directory: intentDirectory, fileSystem: intentFileSystem });
  const sessionRevisions = new Map(), pendingWrites = new Map(), intents = new Map(), epochs = new Map();
  const attempts = new Map();
  const processEpoch = randomUUID();
  let queue = Promise.resolve();
  const scopeNow = () => {
    const origin = new URL(getHubUrl()).origin;
    const accountId = getAccountId();
    if (!(accountId === null || typeof accountId === 'string' && accountId.length > 0 && accountId.length <= 256)) throw new Error('Unknown account scope');
    return { origin, accountId };
  };
  const current = (scope) => scopeKey(scopeNow()) === scopeKey(scope);
  const epoch = (scope) => epochs.get(scopeKey(scope)) || `${store.get(scope)?.generation || 'initial'}:${processEpoch}`;
  const advance = (scope) => sessionRevisions.set(scopeKey(scope), (sessionRevisions.get(scopeKey(scope)) || 0) + 1);
  const record = (scope) => intents.get(scopeKey(scope)) || store.get(scope);
  const signedOut = (scope) => record(scope)?.signedOut === true;
  const blocked = (scope) => !!store.failure || signedOut(scope);
  function reserve(scope, operation) {
    const key = scopeKey(scope);
    advance(scope);
    pendingWrites.set(key, (pendingWrites.get(key) || 0) + 1);
    const result = queue.then(async () => {
      if (!current(scope)) throw new Error('Connection changed');
      return operation();
    });
    queue = result.catch(() => {});
    return result.finally(() => {
      const remaining = pendingWrites.get(key) - 1;
      if (remaining) pendingWrites.set(key, remaining); else pendingWrites.delete(key);
      advance(scope);
    });
  }
  function blockedSnapshot(scope) {
    const item = record(scope);
    return { origin: scope.origin, session: null, signedOut: signedOut(scope), automaticLoginBlocked: true, sessionEpoch: epoch(scope),
      ...(store.failure ? { error: 'intent-unavailable' } : {}),
      logoutIntent: { id: item?.intentId || null, installationId: store.installationId,
        accountScope: scope.accountId === null ? 'unknown/currentconnection' : 'known', accountId: scope.accountId,
        persistence: store.failure || (item?.durable === false ? 'pending' : 'persisted'),
        localSession: item?.localSession || 'unconfirmed', companion: 'unconfirmed',
        ownedKeychain: 'not-requested', remoteSession: 'not-requested' } };
  }
  async function readSessionSnapshot(scope) {
    const key = scopeKey(scope);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!current(scope)) throw new Error('Connection changed');
      if (blocked(scope)) return blockedSnapshot(scope);
      if (pendingWrites.has(key)) throw new Error('Session write pending');
      const revision = sessionRevisions.get(key) || 0;
      const cookies = await session.cookies.get({ url: `${scope.origin}/`, name: COOKIE });
      if (!current(scope)) throw new Error('Connection changed');
      if (blocked(scope)) return blockedSnapshot(scope);
      if (pendingWrites.has(key)) throw new Error('Session write pending');
      if (revision !== (sessionRevisions.get(key) || 0)) continue;
      const cookie = cookies.find((item) => item.name === COOKIE && item.path === '/');
      const saved = cookie ? { value: cookie.value, expiresAt: cookie.expirationDate } : null;
      return { origin: scope.origin, session: validSession(saved) ? saved : null, signedOut: false,
        ...(store.get(scope) ? { sessionEpoch: epoch(scope) } : {}) };
    }
    throw new Error('Session changed during bridge read');
  }
  async function setCookie(scope, saved) {
    const url = new URL(scope.origin);
    await session.cookies.set({ url: `${scope.origin}/`, name: COOKIE, value: saved.value,
      expirationDate: saved.expiresAt, path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax' });
    await session.cookies.flushStore();
  }
  async function logout(scope) {
    const key = scopeKey(scope);
    const existing = record(scope);
    const intentId = existing?.signedOut ? existing.intentId : randomUUID();
    // Fence in-flight auth immediately, before any filesystem or cookie await.
    epochs.set(key, randomUUID());
    intents.set(key, { signedOut: true, intentId, durable: false, localSession: 'pending' });
    try {
      await reserve(scope, async () => {
        const persisted = await store.set(scope, true, intentId);
        intents.set(key, { ...persisted, durable: true, localSession: 'pending' });
        // The connection/account may have changed while the file was syncing.
        if (!current(scope)) {
          intents.set(key, { ...persisted, durable: true, localSession: 'unconfirmed' });
          return;
        }
        // No credential deletion and no remote call are part of this operation.
        try {
          await session.cookies.remove(`${scope.origin}/`, COOKIE);
          await session.cookies.flushStore();
          intents.set(key, { ...persisted, durable: true, localSession: 'cleared' });
        } catch { intents.set(key, { ...persisted, durable: true, localSession: 'failed' }); }
      });
    } catch { /* Snapshot reports failure; never acknowledge durable completion. */ }
    return blockedSnapshot(scope);
  }
  async function beginLogin(scope) {
    if (store.failure) return blockedSnapshot(scope);
    // Grants are one-use, short-lived and belong to this bridge process/installation.
    for (const [id, value] of attempts) if (value.expiresAt < Date.now()) attempts.delete(id);
    if (attempts.size >= 32) throw new Error('Too many login attempts');
    const id = randomUUID();
    epochs.set(scopeKey(scope), epoch(scope));
    attempts.set(id, { key: scopeKey(scope), epoch: epoch(scope), expiresAt: Date.now() + 120000 });
    return { ...(await readSessionSnapshot(scope)), loginAttempt: id };
  }
  async function acceptLogin(scope, attemptId, saved) {
    const grant = attempts.get(attemptId);
    attempts.delete(attemptId);
    if (!validSession(saved) || !grant || grant.key !== scopeKey(scope) || grant.epoch !== epoch(scope)
      || grant.expiresAt < Date.now() || store.failure) throw new Error('Stale login attempt');
    await reserve(scope, async () => {
      if (grant.epoch !== epoch(scope)) throw new Error('Stale login attempt');
      await setCookie(scope, saved);
      if (!current(scope) || grant.epoch !== epoch(scope)) throw new Error('Stale login attempt');
      const accepted = await store.set(scope, false);
      // A logout may have arrived while persistence was suspended.
      if (grant.epoch !== epoch(scope)) throw new Error('Stale login attempt');
      epochs.set(scopeKey(scope), accepted.generation);
      intents.delete(scopeKey(scope));
    });
    return readSessionSnapshot(scope);
  }
  async function dispatch(request) {
    const scope = scopeNow();
    if (request.origin !== scope.origin || !['read', 'write', 'begin-login', 'accept-login', 'write-session', 'logout-intent'].includes(request.action)) throw new Error('Rejected bridge request');
    // Distinct opcodes make a replaced legacy peer reject modern mutations.
    if (['write-session', 'logout-intent'].includes(request.action) && request.protocolVersion !== 2) throw new Error('Protocol v2 required');
    if (request.action === 'begin-login') return beginLogin(scope);
    if (request.action === 'accept-login') return acceptLogin(scope, request.loginAttempt, request.session);
    if (request.action === 'logout-intent') return logout(scope);
    if (request.action === 'write' || request.action === 'write-session') {
      if (request.action === 'write' && request.session === null) return logout(scope);
      if (!validSession(request.session)) throw new Error('Invalid session');
      if (blocked(scope)) return blockedSnapshot(scope);
      const writeEpoch = epoch(scope);
      if (store.get(scope) && request.sessionEpoch !== writeEpoch) throw new Error('Stale session write');
      await reserve(scope, async () => {
        if (blocked(scope) || epoch(scope) !== writeEpoch) throw new Error('Explicit login required');
        await setCookie(scope, request.session);
      });
    }
    return readSessionSnapshot(scope);
  }
  const server = net.createServer((socket) => {
    let buffer = '', handled = false;
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
        const result = await dispatch(request);
        // Older companions treat signedOut as permission to delete credentials.
        // Only v2 understands suppression without deleting saved secrets.
        const response = request.protocolVersion === 2
          ? { ...result, protocolVersion: 2, capabilities: { logoutIntent: true } }
          : !result.logoutIntent ? result : { ...result, signedOut: false };
        socket.end(`${JSON.stringify(response)}\n`);
      }
      catch { socket.end('{"error":"rejected"}\n'); }
    });
  });
  const hasExplicitAttempt = (scope) => [...attempts.values()].some((attempt) =>
    attempt.key === scopeKey(scope) && attempt.epoch === epoch(scope) && attempt.expiresAt >= Date.now());
  async function removeLateCookie(scope) {
    if (!signedOut(scope) || store.failure || hasExplicitAttempt(scope)) return;
    await reserve(scope, async () => {
      if (!signedOut(scope) || store.failure || hasExplicitAttempt(scope)) return;
      const item = record(scope);
      try {
        await session.cookies.remove(`${scope.origin}/`, COOKIE);
        await session.cookies.flushStore();
        intents.set(scopeKey(scope), { ...item, localSession: 'cleared' });
      } catch { intents.set(scopeKey(scope), { ...item, localSession: 'failed' }); }
    });
  }
  const onCookieChanged = (_event, cookie, _cause, removed) => {
    if (cookie.name !== COOKIE) return;
    let scope;
    try { scope = scopeNow(); } catch { return; }
    const host = new URL(scope.origin).hostname, domain = cookie.domain?.replace(/^\./, '');
    if (domain && host !== domain && !host.endsWith(`.${domain}`)) return;
    // Cookie lifecycle events do not prove user intent. The explicit app/companion
    // actions below record logout; expiry, overwrites and late cookies never do.
    advance(scope);
    // A delayed response cannot restore the app cookie after explicit logout.
    // A current explicit login grant temporarily allows its accepted cookie to arrive.
    if (!removed) removeLateCookie(scope).catch(() => {});
  };
  session.cookies.on?.('changed', onCookieChanged);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  await fs.chmod(socketPath, 0o600);
  await removeLateCookie(scopeNow());
  return { close: () => { session.cookies.removeListener?.('changed', onCookieChanged);
    return queue.then(() => new Promise((resolve) => server.close(resolve))); }, socketPath,
    read: () => readSessionSnapshot(scopeNow()),
    sessionSuppressed: () => blocked(scopeNow()),
    sessionEpoch: () => epoch(scopeNow()),
    hasLoginAttempt: (id) => {
      const scope = scopeNow(), grant = attempts.get(id);
      return !!grant && grant.key === scopeKey(scope) && grant.epoch === epoch(scope) && grant.expiresAt >= Date.now();
    },
    claimLoginRequest: (id) => {
      const scope = scopeNow(), grant = attempts.get(id);
      if (!grant || grant.key !== scopeKey(scope) || grant.epoch !== epoch(scope) || grant.expiresAt < Date.now() || grant.browserClaimed) return false;
      grant.browserClaimed = true;
      return true;
    },
    observeLoginCookie: (id, value) => {
      const grant = attempts.get(id);
      if (grant) grant.browserCookie = value;
    },
    hasAcceptedBrowserResponse: (id) => !!attempts.get(id)?.browserCookie,
    cancelLogin: async (id) => { attempts.delete(id); await removeLateCookie(scopeNow()); },
    invalidateConnection: () => {
      const scope = scopeNow();
      epochs.set(scopeKey(scope), randomUUID());
      advance(scope);
      attempts.clear();
    },
    logout: () => logout(scopeNow()),
    beginLogin: () => beginLogin(scopeNow()),
    acceptLogin: async (loginAttempt) => {
      const scope = scopeNow();
      const cookies = await session.cookies.get({ url: `${scope.origin}/`, name: COOKIE });
      if (!current(scope)) throw new Error('Connection changed');
      const cookie = cookies.find((item) => item.name === COOKIE && item.path === '/');
      if (!cookie || cookie.value !== attempts.get(loginAttempt)?.browserCookie) throw new Error('Login cookie does not match the accepted response');
      return acceptLogin(scope, loginAttempt, { value: cookie.value, expiresAt: cookie.expirationDate });
    } };
}

module.exports = { startHubSessionBridge, bridgeDirectory };
