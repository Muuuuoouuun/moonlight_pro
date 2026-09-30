import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchCommand } from './research-inbox-command.js';

const id = '11111111-1111-4111-8111-111111111111';

test('rejects invalid commands without touching RPC', async () => {
  const result = await runResearchCommand({ action: 'promote-draft', requestId: id }, { workspaceId: id, invokeRpc: () => { throw Error('unexpected RPC'); } });
  assert.equal(result.status, 'invalid-input');
});

test('passes only normalized command and scoped idempotency hash to one RPC', async () => {
  let call;
  const result = await runResearchCommand({ action: 'discard', requestId: id, briefId: id, expectedRevision: 1, expectedStateVersion: 1, workspaceId: 'attacker' }, {
    workspaceId: id, invokeRpc: async (...args) => { call = args; return { ok: true, data: { status: 'saved', briefId: id, state: 'discarded' } }; },
  });
  assert.equal(result.status, 'saved');
  assert.equal(call[0], 'research_command_v1');
  assert.equal(call[1].p_workspace_id, id);
  assert.match(call[1].p_request_hash, /^[a-f0-9]{64}$/);
  assert.equal(call[1].p_command.workspaceId, undefined);
});

test('an uncertain RPC response cannot be shown as saved', async () => {
  const result = await runResearchCommand({ action: 'discard', requestId: id, briefId: id, expectedRevision: 1, expectedStateVersion: 1 }, {
    workspaceId: id, invokeRpc: async () => ({ ok: false, error: 'timeout' }),
  });
  assert.equal(result.status, 'error');
});
