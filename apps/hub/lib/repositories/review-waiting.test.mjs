import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorLabel, filterReviewWaiting, getReviewWaitingLedger } from './review-waiting.js';

const TASK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TASK_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TASK_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function request(overrides) {
  return {
    requestId: 'r-' + (overrides.taskId || 'x'),
    taskId: TASK_A,
    scope: 'personal',
    state: 'completed',
    receiptActorId: 'claude-code',
    receiptAt: '2026-09-26T01:00:00.000Z',
    receipt: { state: 'completed', summary: '요약', evidence: [{ kind: 'path', value: '/tmp/out.txt' }] },
    ...overrides,
  };
}

test('filterReviewWaiting keeps only completed receipts whose linked task is not done', () => {
  const taskById = new Map([
    [TASK_A, { title: '할 일 A', status: 'todo' }],
    [TASK_B, { title: '할 일 B', status: 'done' }],
  ]);
  const requests = [
    request({ taskId: TASK_A }), // completed + todo -> kept
    request({ taskId: TASK_B }), // completed + done -> dropped
    request({ taskId: TASK_C, state: 'failed' }), // failed -> dropped (out of scope)
    request({ taskId: TASK_A, state: 'unconfirmed' }), // unconfirmed -> dropped (out of scope)
    request({ taskId: TASK_D }), // no matching task (deleted / outside read window) -> dropped
  ];
  const items = filterReviewWaiting(requests, taskById);
  assert.equal(items.length, 1);
  assert.equal(items[0].taskId, TASK_A);
  assert.equal(items[0].taskTitle, '할 일 A');
  assert.equal(items[0].summary, '요약');
  assert.deepEqual(items[0].evidence, { kind: 'path', value: '/tmp/out.txt' });
  assert.equal(items[0].actorId, 'claude-code');
  assert.equal(items[0].completedAt, '2026-09-26T01:00:00.000Z');
});

test('filterReviewWaiting tolerates malformed input without throwing', () => {
  assert.deepEqual(filterReviewWaiting(null, new Map()), []);
  assert.deepEqual(filterReviewWaiting([null, undefined, {}], new Map()), []);
  const taskById = new Map([[TASK_A, { title: 'A', status: 'todo' }]]);
  assert.deepEqual(filterReviewWaiting([request({ taskId: TASK_A, receipt: null })], taskById), [
    { requestId: 'r-' + TASK_A, taskId: TASK_A, taskTitle: 'A', scope: 'personal', summary: '', evidence: null, actorId: 'claude-code', completedAt: '2026-09-26T01:00:00.000Z' },
  ]);
});

test('actorLabel translates known agent ids and falls back to the raw id or "알 수 없음"', () => {
  assert.equal(actorLabel('claude-code'), 'Claude Code');
  assert.equal(actorLabel('codex'), 'Codex');
  assert.equal(actorLabel('claude-desktop'), 'Claude Desktop');
  assert.equal(actorLabel('some-other-actor'), 'some-other-actor');
  assert.equal(actorLabel(null), '알 수 없음');
  assert.equal(actorLabel(''), '알 수 없음');
});

// state-usage 계약(CLAUDE.md): read 실패·미구성은 200 + status:"error"/"preview" 봉투로 알리고,
// 조용히 "0건"으로 위장하지 않는다.
test('getReviewWaitingLedger reports storage-not-configured as preview, not a disguised empty list', async () => {
  const ledger = await getReviewWaitingLedger({
    listRequests: async () => ({ httpStatus: 200, data: { status: 'error', error: 'skill-storage-not-configured', source: 'error' } }),
    readTasks: async () => ({ source: 'preview', configured: false, todos: [] }),
  });
  assert.equal(ledger.source, 'preview');
  assert.equal(ledger.configured, false);
  assert.deepEqual(ledger.items, []);
});

test('getReviewWaitingLedger reports a genuine skill-request read failure as error', async () => {
  const ledger = await getReviewWaitingLedger({
    listRequests: async () => ({ httpStatus: 502, data: { status: 'error', error: 'skill-storage-unavailable', source: 'error' } }),
    readTasks: async () => ({ source: 'supabase', configured: true, todos: [] }),
  });
  assert.equal(ledger.source, 'error');
  assert.equal(ledger.error, 'skill-storage-unavailable');
  assert.deepEqual(ledger.items, []);
});

test('getReviewWaitingLedger reports a task-ledger read failure as error even when requests read fine', async () => {
  const ledger = await getReviewWaitingLedger({
    listRequests: async () => ({ httpStatus: 200, data: { status: 'ready', items: [] } }),
    readTasks: async () => ({ source: 'error', configured: true, todos: [] }),
  });
  assert.equal(ledger.source, 'error');
  assert.deepEqual(ledger.items, []);
});

test('getReviewWaitingLedger assembles the bundle from live requests and tasks', async () => {
  const ledger = await getReviewWaitingLedger({
    listRequests: async () => ({
      httpStatus: 200,
      data: { status: 'ready', items: [request({ taskId: TASK_A }), request({ taskId: TASK_B })] },
    }),
    readTasks: async () => ({
      source: 'supabase', configured: true, partial: false,
      todos: [
        { id: TASK_A, title: '할 일 A', status: 'doing' },
        { id: TASK_B, title: '할 일 B', status: 'done' },
      ],
    }),
  });
  assert.equal(ledger.source, 'supabase');
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].taskId, TASK_A);
});

test('getReviewWaitingLedger returns zero items (not an error) when nothing is waiting', async () => {
  const ledger = await getReviewWaitingLedger({
    listRequests: async () => ({ httpStatus: 200, data: { status: 'ready', items: [] } }),
    readTasks: async () => ({ source: 'supabase', configured: true, partial: false, todos: [] }),
  });
  assert.equal(ledger.source, 'supabase');
  assert.deepEqual(ledger.items, []);
});
