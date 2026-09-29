import assert from 'node:assert/strict';
import crypto, { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import { authorizeAgentRequest } from './auth.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const env = { COM_MOON_AGENT_API_TOKEN: 'private-agent-token', COM_MOON_DEFAULT_WORKSPACE_ID: workspaceId };
const request = (headers = {}) => new Request('http://hub.test/api/agent/v1/query', { headers });

test('all Agent reads require their own bearer, including same-origin and Hub-secret callers', () => {
  for (const headers of [{}, { origin: 'http://hub.test' }, { 'x-hub-write-secret': 'private-agent-token' }, { authorization: 'Bearer wrong' }]) {
    const result = authorizeAgentRequest(request(headers), { env });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 401);
    assert.equal(result.context, null);
    assert.equal(result.data.status, 'error');
  }
});

test('authenticated identity and default read-only scopes come only from server settings', () => {
  const result = authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token', 'x-workspace-id': 'attacker', 'x-actor-id': 'attacker', 'x-agent-scopes': 'tasks:write' }), { env });
  assert.equal(result.ok, true);
  assert.deepEqual(result.context, { workspaceId, actorId: 'codex', scopes: ['read'] });
  assert.equal(JSON.stringify(result).includes('private-agent-token'), false);
  assert.equal(authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token' }), { scope: 'tasks:write', env }).httpStatus, 403);
});

test('allowed scopes are enforced individually and unknown configured scopes fail closed', () => {
  const writable = { ...env, COM_MOON_AGENT_ACTOR_ID: 'codex-local', COM_MOON_AGENT_SCOPES: 'read,tasks:write,jobs:read' };
  assert.equal(authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token' }), { scope: 'tasks:write', env: writable }).ok, true);
  assert.equal(authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token' }), { scope: 'jobs:write', env: writable }).httpStatus, 403);
  assert.equal(authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token' }), { scope: '*', env: writable }).httpStatus, 403);
  assert.equal(authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token' }), { env: { ...env, COM_MOON_AGENT_SCOPES: '*' } }).httpStatus, 503);
});

test('missing token or workspace configuration cannot silently create a public preview endpoint', () => {
  for (const invalid of [{}, { COM_MOON_AGENT_API_TOKEN: 'secret' }, { ...env, COM_MOON_DEFAULT_WORKSPACE_ID: 'invalid' }]) {
    const result = authorizeAgentRequest(request(), { env: invalid });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 503);
  }
});

test('scope:null authenticates the caller before body-based action authorization', () => {
  const writeOnly = { ...env, COM_MOON_AGENT_SCOPES: 'tasks:write' };
  const result = authorizeAgentRequest(request({ authorization: 'Bearer private-agent-token' }), { scope: null, env: writeOnly });
  assert.equal(result.ok, true);
  assert.deepEqual(result.context.scopes, ['tasks:write']);
  assert.equal(authorizeAgentRequest(request(), { scope: null, env: writeOnly }).httpStatus, 401);
});

test('actor identifiers satisfy the trusted Engine header contract', () => {
  const headers = { authorization: 'Bearer private-agent-token' };
  assert.equal(authorizeAgentRequest(request(headers), { env: { ...env, COM_MOON_AGENT_ACTOR_ID: 'actor with spaces' } }).httpStatus, 503);
  assert.equal(authorizeAgentRequest(request(headers), { env: { ...env, COM_MOON_AGENT_ACTOR_ID: 'codex:local/operator' } }).ok, true);
});

// Per-client identities (2026-09-26): the Hub stores only `actor:sha256hex` pairs.
const sha = (value) => createHash('sha256').update(value).digest('hex');
const clientEnv = { ...env, COM_MOON_AGENT_SCOPES: 'read,tasks:write', COM_MOON_AGENT_CLIENT_TOKEN_HASHES: `claude-code:${sha('claude-code-token')},codex:${sha('codex-cli-token')},claude-desktop:${sha('desktop-token')}` };
const bearer = (value) => request({ authorization: `Bearer ${value}` });

test('each client token authenticates as its own actor; the shared token keeps the default actor', () => {
  for (const [value, actorId] of [['claude-code-token', 'claude-code'], ['codex-cli-token', 'codex'], ['desktop-token', 'claude-desktop'], ['private-agent-token', 'codex']]) {
    const result = authorizeAgentRequest(bearer(value), { scope: 'tasks:write', env: clientEnv });
    assert.equal(result.ok, true, value);
    assert.deepEqual(result.context, { workspaceId, actorId, scopes: ['read', 'tasks:write'] });
    assert.equal(JSON.stringify(result).includes(value), false);
  }
  const shared = authorizeAgentRequest(bearer('private-agent-token'), { env: { ...clientEnv, COM_MOON_AGENT_ACTOR_ID: 'operator-mcp' } });
  assert.equal(shared.context.actorId, 'operator-mcp');
  for (const value of ['unknown-token', sha('claude-code-token'), 'claude-code', `claude-code:${sha('claude-code-token')}`]) {
    assert.equal(authorizeAgentRequest(bearer(value), { env: clientEnv }).httpStatus, 401, value);
  }
  assert.equal(authorizeAgentRequest(bearer('claude-code-token'), { env }).httpStatus, 401, 'a client token means nothing without its registered digest');
});

test('client actors share the configured scopes; a request cannot name or widen its actor', () => {
  const readOnly = { ...clientEnv, COM_MOON_AGENT_SCOPES: 'read' };
  assert.equal(authorizeAgentRequest(bearer('claude-code-token'), { scope: 'tasks:write', env: readOnly }).httpStatus, 403);
  const result = authorizeAgentRequest(request({ authorization: 'Bearer desktop-token', 'x-actor-id': 'codex', 'x-com-moon-agent-actor': 'codex' }), { scope: null, env: readOnly });
  assert.deepEqual(result.context, { workspaceId, actorId: 'claude-desktop', scopes: ['read'] });
});

test('every identity is compared in constant time with no early exit', (t) => {
  const calls = [];
  const original = crypto.timingSafeEqual;
  t.mock.method(crypto, 'timingSafeEqual', (a, b) => { calls.push([a.length, b.length]); return original(a, b); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  for (const value of ['private-agent-token', 'claude-code-token', 'desktop-token', 'unknown-token']) {
    calls.length = 0;
    authorizeAgentRequest(bearer(value), { env: clientEnv });
    assert.equal(calls.length, 4, value);
    assert.ok(calls.every(([a, b]) => a === 32 && b === 32));
  }
});

test('a present but malformed client hash list fails closed like any misconfiguration', () => {
  const a = sha('claude-code-token');
  for (const value of [`claude-code:${a},`, `claude-code ${a}`, `claude code:${a}`, `claude-code:${a.toUpperCase()}`, `claude-code:${a.slice(2)}`,
    `claude-code:${a},claude-code:${sha('other')}`, `claude-code:${a},codex:${a}`, `claude-code:${sha('private-agent-token')}`]) {
    for (const token of ['private-agent-token', 'claude-code-token']) {
      const result = authorizeAgentRequest(bearer(token), { env: { ...env, COM_MOON_AGENT_CLIENT_TOKEN_HASHES: value } });
      assert.equal(result.httpStatus, 503, value);
      assert.equal(result.data.code, 'agent-auth-not-configured');
    }
  }
  for (const blank of ['', '  ']) assert.deepEqual(authorizeAgentRequest(bearer('private-agent-token'), { env: { ...env, COM_MOON_AGENT_CLIENT_TOKEN_HASHES: blank } }).context, { workspaceId, actorId: 'codex', scopes: ['read'] });
});
