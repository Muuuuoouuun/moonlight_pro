import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePmsCommand } from './pms-command.ts';
import { executePmsCommand } from './pms-command-service.ts';

const id = '11111111-1111-4111-8111-111111111111';
const context = { workspaceId: '33333333-3333-4333-8333-333333333333', now: '2026-09-13T01:00:00Z' };

test('task next action can be saved and explicitly cleared without rewriting other fields', () => {
  for (const [input, expected] of [['  회신 확인  ', '회신 확인'], ['', null]]) {
    const result = normalizePmsCommand({ action: 'update_task', id, nextAction: input }, context);
    assert.equal(result.ok, true);
    assert.equal(result.patch.next_action, expected);
    assert.equal('description' in result.patch, false);
    assert.equal('status' in result.patch, false);
  }
});

test('task optimistic lock preserves Postgres microseconds and rejects malformed versions', () => {
  const version = '2026-09-13T09:00:00.123456+09:00';
  const result = normalizePmsCommand({ action: 'update_task', id, status: 'doing', expectedUpdatedAt: version }, context);
  assert.equal(result.ok, true);
  assert.ok(result.filters.some(([key, value]) => key === 'updated_at' && value === `eq.${version}`));
  assert.equal(normalizePmsCommand({ action: 'update_task', id, status: 'doing', expectedUpdatedAt: 'bad' }, context).ok, false);
});

test('a stale task update returns current row as conflict instead of saved', async () => {
  const current = { id, title: '다른 창에서 저장', updated_at: '2026-09-13T02:00:00Z' };
  const result = await executePmsCommand({ action: 'update_task', id, status: 'doing', expectedUpdatedAt: '2026-09-13T00:00:00Z' }, context, {
    update: async () => ({ persisted: false, reason: 'no-matching-row', records: [] }),
    fetchRows: async () => [current],
  });
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.entity, current);
});

test('created task echoes include database-generated version for immediate follow-up writes', async () => {
  const version = '2026-09-13T01:00:00.123456Z';
  const result = await executePmsCommand({ action: 'create_task', id, title: '실행할 일' }, context, {
    insert: async (_table, row) => ({ persisted: true, reason: 'inserted', record: { ...row, updated_at: version } }),
  });
  assert.equal(result.status, 'saved');
  assert.equal(result.entity.updated_at, version);
});
