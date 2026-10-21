'use strict';
// Installation-owned, non-secret intent only. Never stores cookies or credentials.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_BYTES = 65536;
const identifier = (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
const scopeKey = ({ origin, accountId = null }) => JSON.stringify([origin, accountId]);

async function openLogoutIntentStore({ directory, fileSystem = fs }) {
  const file = path.join(directory, 'logout-intent.json');
  let state = { version: 1, installationId: randomUUID(), scopes: [] };
  let failure = null;
  const safe = (stat, directory = false) => !stat.isSymbolicLink()
    && (directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1)
    && stat.uid === process.getuid() && (stat.mode & 0o777) === (directory ? 0o700 : 0o600);
  async function checkDirectory() {
    if (!safe(await fileSystem.lstat(directory), true)) throw new Error('Unsafe logout intent directory');
  }
  try {
    await fileSystem.mkdir(directory, { recursive: true, mode: 0o700 });
    await checkDirectory();
    try {
      const stat = await fileSystem.lstat(file);
      if (!safe(stat) || stat.size > MAX_BYTES) throw new Error('Unsafe logout intent file');
      const handle = await fileSystem.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      let raw;
      try {
        if (!safe(await handle.stat())) throw new Error('Unsafe logout intent file');
        raw = await handle.readFile('utf8');
      } finally { await handle.close(); }
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('Oversized logout intent file');
      const value = JSON.parse(raw);
      if (value.version !== 1 || !identifier(value.installationId) || !Array.isArray(value.scopes)
        || value.scopes.length > 256) throw new Error('Invalid logout intent state');
      const keys = new Set();
      for (const item of value.scopes) {
        if (new URL(item.origin).origin !== item.origin || !['https:', 'http:'].includes(new URL(item.origin).protocol)
          || !(item.accountId === null || typeof item.accountId === 'string' && item.accountId.length > 0 && item.accountId.length <= 256)
          || !identifier(item.generation) || typeof item.signedOut !== 'boolean'
          || (item.signedOut && !identifier(item.intentId)) || keys.has(scopeKey(item))) throw new Error('Invalid logout intent scope');
        keys.add(scopeKey(item));
      }
      state = value;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  } catch { failure = 'unavailable'; }
  // All callers serialize mutations. Atomic replacement + file and directory
  // fsync precede acknowledgement, including clearing an accepted login intent.
  async function persist() {
    if (failure) throw new Error('Logout intent unavailable');
    let handle;
    try {
      await checkDirectory();
      try { if (!safe(await fileSystem.lstat(file))) throw new Error('Unsafe logout intent file'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const temporary = `${file}.${randomUUID()}.tmp`;
      const serialized = JSON.stringify(state);
      if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Logout intent limit');
      handle = await fileSystem.open(temporary, 'wx', 0o600);
      await handle.writeFile(serialized); await handle.sync(); await handle.close(); handle = null;
      await fileSystem.rename(temporary, file);
      const parent = await fileSystem.open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
      try { await parent.sync(); } finally { await parent.close(); }
    } catch {
      failure = 'write-failed';
      throw new Error('Logout intent persistence failed');
    } finally { await handle?.close(); }
  }
  return {
    installationId: state.installationId,
    get failure() { return failure; },
    get(scope) { return state.scopes.find((item) => scopeKey(item) === scopeKey(scope)); },
    async set(scope, signedOut, intentId = randomUUID()) {
      const previous = state.scopes.find((item) => scopeKey(item) === scopeKey(scope));
      const next = { ...scope, accountId: scope.accountId ?? null, generation: randomUUID(), signedOut,
        ...(signedOut ? { intentId } : {}) };
      if (!previous && state.scopes.length >= 256) throw new Error('Logout intent limit');
      state.scopes = state.scopes.filter((item) => scopeKey(item) !== scopeKey(scope));
      state.scopes.push(next);
      try { await persist(); }
      catch (error) {
        // Never expose a cleared tombstone after failed persistence.
        if (!signedOut && previous) state.scopes = state.scopes.map((item) => item === next ? previous : item);
        throw error;
      }
      return next;
    },
  };
}
module.exports = { openLogoutIntentStore, scopeKey };
