import assert from 'node:assert/strict';
import { test } from 'node:test';

let commands;
try { commands = await import('./inquiry-command.ts'); } catch {}
const workspaceId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const base = {
  action: 'ingest', source: 'gmail', sourceAccountKey: 'operator@example.com', externalEventId: 'message-1',
  threadId: 'thread-1', subject: '도입 상담', body: '견적을 요청합니다.', contact: { email: 'buyer@example.com' },
  kind: 'sales', classification: 'inquiry', reason: 'quote request', orgScope: 'unclassified',
  receivedAt: '2026-09-12T10:00:00+09:00', historical: false,
};

test('normalizes inquiry commands and sends one atomic RPC with trusted workspace', async () => {
  assert.ok(commands, 'inquiry command service exists');
  let calls = [];
  const result = await commands.executeInquiryCommand({ ...base, workspaceId: id }, { workspaceId }, {
    rpc: async (...args) => { calls.push(args); return { ok: true, data: { status: 'saved', inquiry: { id } } }; },
  });
  assert.equal(result.inquiry.id, id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'inquiry_command_v1');
  assert.equal(calls[0][1].p_workspace_id, workspaceId);
  assert.equal(calls[0][1].p_command.receivedAt, '2026-09-12T01:00:00.000Z');
  assert.equal(calls[0][1].p_command.workspaceId, undefined);
});

test('rejects invalid mutations before persistence', async () => {
  assert.ok(commands);
  const cases = [
    { ...base, source: 'unknown' }, { ...base, body: 'x'.repeat(40001) }, { ...base, sourceUrl: 'javascript:alert(1)' },
    { ...base, receivedAt: 'tomorrow' }, { ...base, canonicalKey: 12 }, { ...base, historical: 'false' },
    { ...base, kind: ['sales'] }, { ...base, classification: ['inquiry'] }, { ...base, orgScope: ['classin'] },
    { ...base, contact: { email: 'invalid' } }, { ...base, contact: { email: 'ok@example.com', name: {} } },
    { action: 'mark_read', id, seenSeq: -1 }, { action: 'mark_read', id, seenSeq: 1.5 },
    { action: 'update', id, patch: { status: 'closed' } },
    { action: 'update', id, expectedUpdatedAt: '2026-09-12T01:00:00Z', patch: { workspace_id: id } },
    { action: 'split', id, eventId: id }, { action: 'save_sync', accountKey: 'a', leaseToken: id, state: [] },
  ];
  for (const input of cases) {
    const result = await commands.executeInquiryCommand(input, { workspaceId }, { rpc: async () => assert.fail('invalid input reached RPC') });
    assert.equal(result.status, 'invalid-input', JSON.stringify(input).slice(0, 200));
  }
});

test('normalizes safe URL schemes and preserves Postgres CAS microseconds', async () => {
  assert.ok(commands);
  let received;
  const rpc = async (_, p) => { received = p.p_command; return { ok: true, data: { status: 'saved' } }; };
  await commands.executeInquiryCommand({ ...base, sourceUrl: 'HTTPS://example.com/path' }, { workspaceId }, { rpc });
  assert.equal(received.sourceUrl, 'https://example.com/path');
  await commands.executeInquiryCommand({ action: 'update', id, patch: { status: 'closed' }, expectedUpdatedAt: '2026-09-12T10:00:00.123456+00:00' }, { workspaceId }, { rpc });
  assert.equal(received.expectedUpdatedAt, '2026-09-12T10:00:00.123456+00:00');
});

test('sync checkpoint preserves caller state and optional success semantics', async () => {
  assert.ok(commands);
  let received;
  const result = await commands.executeInquiryCommand({ action: 'save_sync', accountKey: 'operator@example.com', leaseToken: id, state: { cursor: '123', pending: ['4'] } }, { workspaceId }, {
    rpc: async (_, p) => { received = p.p_command; return { ok: true, data: { status: 'saved', state: p.p_command.state } }; },
  });
  assert.deepEqual(result.state, { cursor: '123', pending: ['4'] });
  assert.equal(Object.hasOwn(received, 'success'), false);
});

test('Gmail ingestion carries a lease fence only for its verified source account', async () => {
  assert.ok(commands);
  let received;
  const ok = await commands.executeInquiryCommand({ ...base, accountKey: base.sourceAccountKey, leaseToken: id }, { workspaceId }, {
    rpc: async (_, p) => { received = p.p_command; return { ok: true, data: { status: 'saved' } }; },
  });
  assert.equal(ok.status, 'saved'); assert.equal(received.leaseToken, id); assert.equal(received.accountKey, base.sourceAccountKey);
  const bad = await commands.executeInquiryCommand({ ...base, accountKey: 'different@example.com', leaseToken: id }, { workspaceId }, {
    rpc: async () => assert.fail('mismatched lease account reached RPC'),
  });
  assert.equal(bad.status, 'invalid-input');
});

test('missing persistence and malformed RPC replies are errors, never saved or preview', async () => {
  assert.ok(commands);
  for (const response of [{ ok: false, error: 'missing-config' }, { ok: true, data: [] }, { ok: true, data: { status: 'nonsense' } }]) {
    const result = await commands.executeInquiryCommand(base, { workspaceId }, { rpc: async () => response });
    assert.equal(result.status, 'error');
    assert.equal(result.retryable, true);
  }
  const failed = await commands.executeInquiryCommand(base, { workspaceId }, { rpc: async () => { throw new Error('secret payload'); } });
  assert.equal(failed.status, 'error');
  assert.equal(JSON.stringify(failed).includes('secret payload'), false);
});
