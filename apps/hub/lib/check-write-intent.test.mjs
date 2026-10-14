import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCheckWriteIntent } from './check-write-intent.js';
import { createTaskForItem, postReceipt, scheduleItem } from '../components/hub/check-items/check-item-actions.js';
import { unblockProject } from '../components/hub/unblock-actions.js';
import { executePmsCommand } from '../../engine/lib/pms-command-service.ts';
import { buildSignalOutcomeWrite } from './check-items/outcome-input.js';
import { matchingOutcome, receiptFromRow } from './repositories/signal-outcomes.js';

const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const TASK = '55555555-5555-4555-8555-555555555555';
const RECEIPT = '66666666-6666-4666-8666-666666666666';
const DECISION = '44444444-4444-4444-8444-444444444444';
const NOW = Date.parse('2026-10-07T01:00:00Z');
const context = { ownerKey: 'a'.repeat(64), workspaceId: WORKSPACE, expiresAt: NOW + 3600000 };
const item = { signalKey: `work-blocked:${PROJECT}`, title: '합성 확인 항목', subject: { type: 'project', id: PROJECT } };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
function memoryStorage() {
  const rows = new Map();
  return { rows, getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
}
function harness({ storage = memoryStorage(), clock = () => NOW } = {}) {
  let owner = context;
  return { storage, setOwner: value => { owner = value; }, make: key => createCheckWriteIntent(key, {
    storage, now: clock, getContext: async () => owner,
  }) };
}
function engineLedger() {
  const rows = new Map(), receipts = new Map(), calls = [];
  let lostUrl = null;
  const deps = {
    insert: async (table, row) => {
      const key = `${table}:${row.id}`;
      if (rows.has(key)) return { persisted: false, reason: 'duplicate' };
      rows.set(key, structuredClone(row)); return { persisted: true, record: structuredClone(row) };
    },
    fetchRows: async (table, options) => table === 'projects' ? [{ id: PROJECT, workspace_id: WORKSPACE }] : [...rows].filter(([key, row]) => key.startsWith(table + ':') && options.filters.every(([field, value]) => value === `eq.${row[field]}`)).map(([, row]) => structuredClone(row)),
    update: async () => { throw new Error('unexpected update'); },
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const body = calls.at(-1).body;
    let data;
    if (url === '/api/hub/signal-outcomes') {
      const checked = buildSignalOutcomeWrite(body); assert.equal(checked.ok, true);
      const record = { ...checked.row, id: body.requestId, workspace_id: WORKSPACE };
      const existing = receipts.get(record.id);
      assert.ok(!existing || matchingOutcome(existing, record));
      receipts.set(record.id, existing || record);
      data = { status: existing ? 'duplicate' : 'saved', receipt: receiptFromRow(existing || record) };
    } else {
      const action = url === '/api/hub/tasks' ? 'create_task' : 'create_decision';
      const result = await executePmsCommand({ ...body, action }, { workspaceId: WORKSPACE, now: new Date(NOW).toISOString() }, deps);
      data = { ...result, [action === 'create_task' ? 'task' : 'decision']: result.entity };
    }
    if (lostUrl === url) { lostUrl = null; throw new Error('synthetic lost acknowledgement after commit'); }
    return response(data);
  };
  return { rows, receipts, calls, fetchImpl, lose: url => { lostUrl = url; } };
}

test('statusless/malformed HTTP200 and mismatched receipt acknowledgements never finish a card', async () => {
  for (const data of [{}, { status: 'saved' }, { status: 'duplicate', receipt: { id: RECEIPT } }]) {
    const result = await postReceipt(async () => response(data), item, { requestId: RECEIPT, outcome: 'scheduled', scheduledStart: '2026-10-07T02:00:00Z', scheduledEnd: '2026-10-07T02:30:00Z', context });
    assert.equal(result.ok, false); assert.match(result.message, /저장 여부를 확인하지 못했습니다/);
  }
});

test('a matching id alone cannot acknowledge changed task scope/content', async () => {
  const ledger = engineLedger();
  const valid = await createTaskForItem(ledger.fetchImpl, item, { title: '합성 할 일', taskId: TASK, context });
  assert.equal(valid.ok, true);
  const actual = ledger.rows.get(`tasks:${TASK}`);
  for (const patch of [{ workspace_id: PROJECT }, { title: '다른 내용' }, { project_id: RECEIPT }, { due_at: '2026-10-09T00:00:00Z' }]) {
    const result = await createTaskForItem(async () => response({ status: 'duplicate', task: { ...actual, ...patch } }), item, { title: '합성 할 일', taskId: TASK, context });
    assert.equal(result.ok, false);
  }
});

test('task commit with lost ACK survives a new controller and replays the same Engine id once', async () => {
  const h = harness(), ledger = engineLedger(), input = { title: '합성 할 일', dueAt: '2026-10-08' };
  const first = h.make('task');
  const a = await first.begin(ledger.fetchImpl, input, () => ({ taskId: TASK, receiptId: RECEIPT }));
  assert.equal(a.ok, true); assert.ok(h.storage.rows.size > 0, 'checkpoint precedes the write');
  ledger.lose('/api/hub/tasks');
  const unknown = await createTaskForItem((url, init) => first.ownedFetch(ledger.fetchImpl, url, init), item, { ...input, taskId: a.ids.taskId, context: a.context });
  assert.equal(unknown.ok, false); await first.finish(ledger.fetchImpl, unknown);
  const restored = h.make('task');
  const b = await restored.begin(ledger.fetchImpl, input, () => { throw new Error('must not rotate ids'); });
  assert.deepEqual(b.ids, a.ids);
  const result = await createTaskForItem((url, init) => restored.ownedFetch(ledger.fetchImpl, url, init), item, { ...input, taskId: b.ids.taskId, context: b.context });
  assert.equal(result.ok, true); assert.equal(result.status, 'duplicate'); assert.equal(ledger.rows.size, 1);
  assert.equal(ledger.calls[0].body.id, ledger.calls[1].body.id);
});

test('receipt lost ACK retries one immutable receipt and never creates/deletes a provider event', async () => {
  const h = harness(), ledger = engineLedger(), slot = { start: '2026-10-07T02:00:00Z', end: '2026-10-07T02:30:00Z' };
  const first = h.make('schedule'), a = await first.begin(ledger.fetchImpl, { slot }, () => ({ receiptId: RECEIPT }));
  ledger.lose('/api/hub/signal-outcomes');
  const unknown = await scheduleItem((url, init) => first.ownedFetch(ledger.fetchImpl, url, init), item, { slot, requestId: a.ids.receiptId, context: a.context });
  assert.equal(unknown.ok, false); await first.finish(ledger.fetchImpl, unknown);
  const restored = h.make('schedule'), b = await restored.begin(ledger.fetchImpl, { slot }, () => { throw new Error('rotated receipt'); });
  const result = await scheduleItem((url, init) => restored.ownedFetch(ledger.fetchImpl, url, init), item, { slot, requestId: b.ids.receiptId, context: b.context });
  assert.equal(result.ok, true); assert.equal(result.status, 'duplicate'); assert.equal(ledger.receipts.size, 1);
  assert.deepEqual(ledger.calls.map(c => c.url), ['/api/hub/signal-outcomes', '/api/hub/signal-outcomes']);
});

test('new Google creation is blocked before either provider or receipt side effects', async () => {
  let calls = 0;
  const result = await scheduleItem(async () => { calls++; throw new Error('unexpected write'); }, item, { addToCalendar: true, slot: { start: '2026-10-07T02:00:00Z', end: '2026-10-07T02:30:00Z' }, requestId: RECEIPT });
  assert.equal(result.status, 'blocked'); assert.equal(calls, 0);
});

test('changing the draft after an unknown result restores it first and sends no write', async () => {
  const h = harness(), controller = h.make('task');
  await controller.begin(null, { title: '이전 입력' }, () => ({ taskId: TASK }));
  const restored = await h.make('task').begin(null, { title: '새 입력' }, () => { throw new Error('rotated id'); });
  assert.equal(restored.ok, false); assert.deepEqual(restored.restore, { title: '이전 입력' });
  assert.ok([...h.storage.rows.values()].every(raw => JSON.parse(raw).ids.taskId === TASK));
});

test('storage denied or failed readback stops the first risky write', async () => {
  for (const storage of [
    { getItem: () => null, setItem: () => { throw new Error('denied'); } },
    { getItem: () => null, setItem: () => {} },
  ]) {
    const result = await harness({ storage }).make('task').begin(null, { title: '보존할 입력' }, () => ({ taskId: TASK }));
    assert.equal(result.ok, false); assert.match(result.message, /전송을 막았습니다/);
  }
});

test('owner or workspace change blocks a pending write and removes its stored text', async () => {
  for (const patch of [{ ownerKey: 'b'.repeat(64) }, { workspaceId: PROJECT }]) {
    const h = harness(), controller = h.make('task');
    await controller.begin(null, { title: '이전 로그인 입력' }, () => ({ taskId: TASK }));
    h.setOwner({ ...context, ...patch }); let calls = 0;
    await assert.rejects(controller.ownedFetch(async () => { calls++; }, '/api/hub/tasks', { body: '{}' }));
    assert.equal(calls, 0); assert.equal(h.storage.rows.size, 0);
  }
});

test('TTL or a clock rollback scrubs text and keeps a fence against new ids', async () => {
  for (const later of [NOW + 15 * 60000, NOW - 1]) {
    let clock = NOW; const h = harness({ clock: () => clock });
    await h.make('task').begin(null, { title: '시간 제한 입력' }, () => ({ taskId: TASK })); clock = later;
    const result = await h.make('task').begin(null, { title: '다음 입력' }, () => { throw new Error('rotated id'); });
    assert.equal(result.ok, false); assert.match(result.message, /복구 시간이 지났습니다/);
    assert.ok([...h.storage.rows.values()].every(raw => !raw.includes('시간 제한 입력') && JSON.parse(raw).state === 'expired'));
  }
});

test('a late acknowledgement after owner change cannot settle the old command', async () => {
  const h = harness(), controller = h.make('task');
  await controller.begin(null, { title: '입력' }, () => ({ taskId: TASK }));
  h.setOwner({ ...context, ownerKey: 'b'.repeat(64) });
  assert.equal(await controller.finish(null, { ok: true }), false);
});

test('unblock decision ACK loss is unknown and replays the same normalized decision', async () => {
  const ledger = engineLedger(), input = { branch: 'decision', decision: { title: '합성 결정', clearBlocker: false } };
  const ids = { decisionId: DECISION, taskId: TASK, decidedAt: new Date(NOW).toISOString() };
  ledger.lose('/api/hub/decisions');
  const unknown = await unblockProject(ledger.fetchImpl, { id: PROJECT }, input, { ids, context });
  assert.equal(unknown.ok, false); assert.match(unknown.message, /저장 여부를 확인하지 못했습니다/);
  assert.doesNotMatch(unknown.message, /아무것도 저장되지/);
  const again = await unblockProject(ledger.fetchImpl, { id: PROJECT }, input, { ids, context, progress: unknown.progress });
  assert.equal(again.ok, true); assert.equal(ledger.rows.size, 1);
  assert.equal(ledger.calls[0].body.id, ledger.calls[1].body.id);
});

test('receipt duplicate matching covers every normalized payload field, not just signal/outcome', () => {
  const checked = buildSignalOutcomeWrite({ requestId: RECEIPT, signalKey: item.signalKey, subject: item.subject, title: item.title, outcome: 'scheduled', scheduledStart: '2026-10-07T02:00:00Z', scheduledEnd: '2026-10-07T02:30:00Z' });
  const record = { ...checked.row, id: RECEIPT, workspace_id: WORKSPACE };
  assert.equal(matchingOutcome(record, record), true);
  for (const [key, value] of Object.entries({ subject_id: TASK, title: '다름', record_ref: { table: 'tasks', id: TASK }, scheduled_start: '2026-10-07T03:00:00Z', scheduled_end: '2026-10-07T03:30:00Z', calendar_event_id: 'other-provider-id', workspace_id: PROJECT, note: '다름' })) {
    assert.equal(matchingOutcome({ ...record, [key]: value }, record), false, key);
  }
});


test('a panel closed during the owner read cannot send a delayed write', async () => {
  const storage = memoryStorage(); let release, blocked = false, active = true;
  const controller = createCheckWriteIntent('closed', { storage, now: () => NOW, getContext: async () => blocked ? new Promise(resolve => { release = resolve; }) : context });
  await controller.begin(null, { title: '입력' }, () => ({ taskId: TASK })); blocked = true; let calls = 0;
  const sending = controller.ownedFetch(async () => { calls++; }, '/api/hub/tasks', { body: '{}' }, () => active);
  await Promise.resolve(); active = false; release(context);
  await assert.rejects(sending, /panel-closed/); assert.equal(calls, 0);
});
