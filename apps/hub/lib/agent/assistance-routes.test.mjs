import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as assistance from '../../app/api/agent/v1/ai-assistance/route.js';
import * as goals from '../../app/api/agent/v1/goals/route.js';
import * as commands from '../../app/api/agent/v1/goals/commands/route.js';

test('AI and goal Agent routes require own bearer and new write scopes before reading bodies', async () => {
  const before = { ...process.env }, oldFetch = globalThis.fetch;
  Object.assign(process.env, { COM_MOON_AGENT_API_TOKEN: 'test-agent-token', COM_MOON_DEFAULT_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111', COM_MOON_AGENT_SCOPES: 'read' });
  globalThis.fetch = async () => { throw new Error('must-not-access-data'); };
  const req = (path, method = 'GET', token = '') => new Request(`https://hub.test/api/agent/v1/${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(method === 'POST' ? { body: '{invalid' } : {}) });
  try {
    assert.equal((await assistance.GET(req('ai-assistance'))).status, 401);
    assert.equal((await goals.GET(req('goals'))).status, 401);
    assert.equal((await commands.GET(req('goals/commands'))).status, 401);
    assert.equal((await assistance.POST(req('ai-assistance', 'POST', 'test-agent-token'))).status, 403);
    assert.equal((await commands.POST(req('goals/commands', 'POST', 'test-agent-token'))).status, 403);
    process.env.COM_MOON_AGENT_SCOPES = 'read,ai:write,goals:write';
    assert.equal((await assistance.POST(req('ai-assistance', 'POST', 'test-agent-token'))).status, 400);
    assert.equal((await commands.POST(req('goals/commands', 'POST', 'test-agent-token'))).status, 400);
  } finally { process.env = before; globalThis.fetch = oldFetch; }
});
