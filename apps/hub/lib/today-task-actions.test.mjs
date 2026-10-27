import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaskToday, dateKeyInZone, applyTodayTaskRow } from './task-today.js';
import { createTodayTaskActions, todayTaskAcknowledges } from './today-task-actions.js';

const today = new Date('2026-10-27T03:00:00Z');
const date = dateKeyInZone(today);
const task = id => ({ id, title: `입력 ${id}`, status: 'todo', focusDates: [], completedAt: null, dueAt: null, updatedAt: today.toISOString() });
const read = rows => ({ ...buildTaskToday(rows, { now: today }), state: 'live' });
const reply = (task, status = 200, envelope = 'saved') => ({ ok: status < 400, status, json: async () => ({ status: envelope, task }) });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function server({ failedRead = false } = {}) {
  const rows = new Map(['a', 'b', 'c', 'd'].map(id => [id, task(id)]));
  const requests = [];
  const client = createTodayTaskActions({ now: () => today,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      const row = rows.get(body.id);
      if (body.focus) row.focusDates = body.focus.on ? [...new Set([...row.focusDates, body.focus.date])] : row.focusDates.filter(day => day !== body.focus.date);
      if (body.status) { row.status = body.status; row.completedAt = body.status === 'done' ? today.toISOString() : null; }
      return reply({ ...row });
    }, onChanged: () => { if (!failedRead) client.observe(read([...rows.values()])); else client.observe({ ...client.view(), state: 'partial', stale: true }); },
  });
  client.observe(read([...rows.values()]));
  return { client, rows, requests };
}

test('same-render duplicate selection shares one promise and one acknowledged update', async () => {
  let resolve, requests = 0;
  const client = createTodayTaskActions({ now: () => today, fetchImpl: () => { requests++; return new Promise(done => { resolve = done; }); } });
  client.observe(read([task('a')]));
  const first = client.run(task('a'), { focus: { on: true } }), duplicate = client.run(task('a'), { focus: { on: true } });
  assert.equal(first, duplicate); assert.deepEqual(client.snapshot().pendingIds, ['a']); await tick(); assert.equal(requests, 1);
  resolve(reply({ ...task('a'), focusDates: [date] })); assert.equal((await first).ok, true);
  assert.equal(client.view().focus.picked, 1); assert.deepEqual(client.view().focusItems.map(row => row.id), ['a']);
  assert.deepEqual(client.snapshot().pendingIds, []);
});

test('queued selections enforce three locally, release frees exactly one slot, and completion retains its choice', async () => {
  const { client, requests } = server();
  const results = await Promise.all(['a', 'b', 'c', 'd'].map(id => client.run(task(id), { focus: { on: true } })));
  assert.deepEqual(results.map(result => result.ok), [true, true, true, false]); assert.equal(requests.length, 3);
  assert.equal(client.view().focus.picked, 3);
  await client.run(task('a'), { status: 'done' });
  assert.equal(client.view().focus.picked, 3); assert.equal(client.view().focus.done, 1);
  assert.equal(client.view().focusCompletedItems[0].title, '입력 a', 'completed choices retain the real task name');
  await client.run(task('a'), { focus: { on: false } });
  assert.equal(client.view().focus.picked, 2); assert.equal(client.view().focus.done, 0);
  assert.equal((await client.run(task('d'), { focus: { on: true } })).ok, true);
  assert.equal(client.view().focus.picked, 3);
});

test('saved row projection and cap remain correct when rereading fails with cached partial truth', async () => {
  const { client } = server({ failedRead: true });
  assert.equal((await client.run(task('a'), { focus: { on: true } })).ok, true);
  assert.equal(client.view().focus.picked, 1); assert.equal(client.view().focusItems.length, 1);
  assert.equal((await client.run(task('b'), { focus: { on: true } })).status, 'unverified');
  assert.equal(client.view().focus.picked, 1, 'failed reread never adds the acknowledged row twice');
});

test('mismatched acknowledgement, preview and transport loss preserve source and allow explicit retry', async () => {
  for (const send of [async () => reply({ ...task('other'), focusDates: [date] }), async () => reply(task('a'), 202, 'preview'), async () => { throw Error('synthetic response loss'); }]) {
    const calls = [], client = createTodayTaskActions({ now: () => today, fetchImpl: (...args) => { calls.push(JSON.parse(args[1].body)); return send(...args); } });
    client.observe(read([task('a')]));
    assert.equal((await client.run(task('a'), { focus: { on: true } })).ok, false);
    assert.equal(client.view().focus.picked, 0); assert.equal(client.view().later[0].title, '입력 a');
    await client.run(task('a'), { focus: { on: true } }); assert.deepEqual(calls[0], calls[1]);
  }
});

test('server-side concurrent cap refusal keeps the task available and requests a reread', async () => {
  let refreshed = 0;
  const client = createTodayTaskActions({ now: () => today, onChanged: () => { refreshed++; }, fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ status: 'conflict', error: 'focus-limit', limit: 3 }) }) });
  client.observe(read([task('a')])); const result = await client.run(task('a'), { focus: { on: true } });
  assert.equal(result.status, 'full'); assert.match(result.message, /하나를 빼고/); assert.equal(refreshed, 1); assert.equal(client.view().focus.picked, 0);
});

test('day rollover hides yesterday and prevents a queued stale selection from writing a different day', async () => {
  let clock = today, writes = 0, refreshed = 0;
  const client = createTodayTaskActions({ now: () => clock, onChanged: () => { refreshed++; }, fetchImpl: async () => { writes++; return reply(task('a')); } });
  client.observe(read([{ ...task('a'), focusDates: [date] }]));
  const pending = client.run(task('a'), { focus: { on: false } }); clock = new Date('2026-10-27T15:01:00Z');
  assert.equal((await pending).status, 'stale'); assert.equal(writes, 0); assert.equal(refreshed, 1);
  assert.equal(client.view().state, 'loading'); assert.equal(client.view().items.length, 0);
  client.observe({ ...buildTaskToday([task('a')], { now: clock }), state: 'live' });
  assert.equal(client.view().focus.picked, 0); assert.equal(client.view().later[0].id, 'a');
});

test('fresh reads replace choices even when picked stays the same and remove deleted choices', async () => {
  const { client } = server(); await client.run(task('a'), { focus: { on: true } });
  client.observe(read([{ ...task('b'), focusDates: [date] }]));
  assert.equal(client.view().focus.picked, 1); assert.deepEqual(client.view().focusItems.map(row => row.id), ['b']);
  client.observe(read([])); assert.equal(client.view().focus.picked, 0); assert.deepEqual(client.view().focusItems, []);
});

test('row projection preserves hidden counts and historical streak while reflecting the acknowledged choice', () => {
  const source = { ...read([task('a')]), laterCount: 12, streak: { streak: 9, todayDoneCount: 1 } };
  const next = applyTodayTaskRow(source, { ...task('a'), focusDates: [date] }, { now: today });
  assert.equal(next.hiddenCount, 0); assert.equal(next.laterCount, 11); assert.equal(next.streak.streak, 9);
  assert.equal(next.focus.picked, 1); assert.equal(next.items[0].focusToday, true);
});

test('a visible row acknowledgement preserves aggregate lanes outside the five-row display window', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({ ...task(`late-${i}`), dueAt: '2026-10-26' }));
  const source = read(tasks), chosen = source.items[0];
  assert.equal(source.counts.missed, 20); assert.equal(source.items.length, 5); assert.equal(source.hiddenCount, 15);
  const next = applyTodayTaskRow(source, { ...chosen, focusDates: [date] }, { now: today });
  assert.equal(next.counts.missed, 19); assert.equal(next.counts.focus, 1); assert.equal(next.counts.total, 20); assert.equal(next.hiddenCount, 15);
});

test('an unresponsive reread cannot hold the acknowledged write queue or pending controls forever', async () => {
  const client = createTodayTaskActions({ now: () => today, onChanged: () => new Promise(() => {}), fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); return reply({ ...task(body.id), focusDates: [date] });
  } });
  client.observe(read([task('a'), task('b')]));
  assert.equal((await client.run(task('a'), { focus: { on: true } })).ok, true);
  assert.deepEqual(client.snapshot().pendingIds, []);
  assert.equal((await client.run(task('b'), { focus: { on: true } })).ok, true);
  assert.equal(client.view().focus.picked, 2);
});

test('release and completion require explicit persisted focus and completion-time evidence', () => {
  assert.equal(todayTaskAcknowledges({ id: 'a' }, task('a'), { focus: { on: false } }, date), false);
  assert.equal(todayTaskAcknowledges({ id: 'a', focusDates: [] }, task('a'), { focus: { on: false } }, date), true);
  assert.equal(todayTaskAcknowledges({ id: 'a', status: 'done' }, task('a'), { status: 'done' }, date), false);
  assert.equal(todayTaskAcknowledges({ id: 'a', status: 'done', completed_at: today.toISOString() }, task('a'), { status: 'done' }, date), true);
});
