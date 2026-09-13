import assert from 'node:assert/strict';
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
