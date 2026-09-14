import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePmsCommand } from './pms-command.ts';
import { executePmsCommand } from './pms-command-service.ts';

const id = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const version = '2026-09-13T01:00:00.123456Z';
const context = { workspaceId: '33333333-3333-4333-8333-333333333333', now: '2026-09-13T02:00:00Z' };
const checklist = [{ id: itemId, title: ' 요구사항 확인 ', done: false, note: ' 고객에게 범위 확인 ' }];
const update = extra => ({ action: 'update_task', id, expectedUpdatedAt: version, checklist, ...extra });

test('task create and update normalize checklist fields and allow explicitly clearing it', () => {
  const created = normalizePmsCommand({ action: 'create_task', id, title: '준비', checklist }, context);
  assert.deepEqual(created.record.meta.checklist, [{ id: itemId, title: '요구사항 확인', done: false, note: '고객에게 범위 확인' }]);
  const changed = normalizePmsCommand(update({ checklist: [] }), context);
  assert.equal(changed.ok, true);
  assert.deepEqual(changed.patch.meta, { checklist: [] });
  assert.ok(changed.filters.some(([key, value]) => key === 'updated_at' && value === `eq.${version}`));
  assert.equal('status' in changed.patch, false);
});

test('checklist validation rejects unversioned updates, malformed entries, duplicate IDs and oversized input', () => {
  assert.equal(normalizePmsCommand(update({ expectedUpdatedAt: undefined }), context).ok, false);
  const noVersion = update(); delete noVersion.expectedUpdatedAt;
  assert.equal(normalizePmsCommand(noVersion, context).ok, false);
  for (const invalid of [null, {}, [null], [{ ...checklist[0], id: 'bad' }], [{ ...checklist[0], title: ' ' }], [{ ...checklist[0], done: 'false' }], [...checklist, ...checklist], [{ ...checklist[0], title: 'x'.repeat(201) }], [{ ...checklist[0], note: 'x'.repeat(501) }], Array.from({ length: 51 }, () => checklist[0])]) {
    assert.equal(normalizePmsCommand(update({ checklist: invalid }), context).ok, false, JSON.stringify(invalid)?.slice(0, 90));
  }
});

test('checklist save preserves other metadata and compares the exact observed version', async () => {
  const current = { id, updated_at: version, meta: { source: 'journal', source_refs: [{ type: 'memo', id: 'memo1' }], deal_id: 'deal1', unrelated: { keep: true } } };
  let savedPatch;
  const result = await executePmsCommand(update(), context, {
    fetchRows: async (_table, options) => { assert.deepEqual(options.filters, [['id', `eq.${id}`], ['workspace_id', `eq.${context.workspaceId}`]]); return [current]; },
    update: async (_table, filters, patch) => { savedPatch = patch; assert.ok(filters.some(([key, value]) => key === 'updated_at' && value === `eq.${version}`)); return { persisted: true, reason: 'ok', records: [{ ...current, ...patch }] }; },
  });
  assert.equal(result.status, 'saved');
  assert.deepEqual(savedPatch.meta.source_refs, current.meta.source_refs);
  assert.deepEqual(savedPatch.meta.unrelated, { keep: true });
  assert.equal(savedPatch.meta.deal_id, 'deal1');
  assert.equal(savedPatch.meta.checklist[0].title, '요구사항 확인');
});

test('failed metadata reads never issue a checklist write', async () => {
  let writes = 0;
  for (const rows of [null, []]) {
    const result = await executePmsCommand(update(), context, { fetchRows: async () => rows, update: async () => { writes += 1; return { persisted: true, reason: 'ok' }; } });
    assert.equal(result.status, 'error');
  }
  assert.equal(writes, 0);
});

test('a concurrent checklist write returns the latest row without claiming success', async () => {
  const current = { id, updated_at: version, meta: { checklist: [] } };
  const latest = { ...current, updated_at: context.now, meta: { checklist } };
  let reads = 0;
  const result = await executePmsCommand(update(), context, {
    fetchRows: async () => [++reads === 1 ? current : latest],
    update: async () => ({ persisted: false, reason: 'no-matching-row', records: [] }),
  });
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.entity, latest);
});

test('reusing a create ID with different checklist contents is a conflict', async () => {
  const input = { action: 'create_task', id, title: '준비', checklist };
  const first = normalizePmsCommand(input, context);
  const result = await executePmsCommand({ ...input, checklist: [] }, context, {
    insert: async () => ({ persisted: false, reason: 'duplicate' }),
    fetchRows: async () => [first.record],
  });
  assert.equal(result.status, 'conflict');
});

test('identical create retries accept JSONB property ordering while preserving checklist order', async () => {
  const input = { action: 'create_task', id, title: '준비', checklist: [...checklist, { ...checklist[0], id: '44444444-4444-4444-8444-444444444444', title: '검토' }] };
  const first = normalizePmsCommand(input, context);
  const stored = { ...first.record, meta: { ...first.record.meta, checklist: first.record.meta.checklist.map(({ id, title, done, note }) => ({ id, done, note, title })) } };
  const dependencies = { insert: async () => ({ persisted: false, reason: 'duplicate' }), fetchRows: async () => [stored] };
  assert.equal((await executePmsCommand(input, context, dependencies)).status, 'duplicate');
  assert.equal((await executePmsCommand({ ...input, checklist: [...input.checklist].reverse() }, context, dependencies)).status, 'conflict');
});
