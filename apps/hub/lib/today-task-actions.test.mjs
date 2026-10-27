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

test('legacy compact row projection preserves unobserved counts and historical streak', () => {
  const source = { ...read([task('a')]), queueItems: undefined, queueCount: undefined, completionDayCounts: undefined, laterCount: 12, streak: { streak: 9, todayDoneCount: 1 } };
  const next = applyTodayTaskRow(source, { ...task('a'), focusDates: [date] }, { now: today });
  assert.equal(next.hiddenCount, 0); assert.equal(next.laterCount, 11); assert.equal(next.streak.streak, 9);
  assert.equal(next.focus.picked, 1); assert.equal(next.items[0].focusToday, true);
});

test('a visible row acknowledgement preserves aggregate lanes outside the five-row display window', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({ ...task(`late-${i}`), dueAt: '2026-10-26' }));
  const source = read(tasks), chosen = source.items[0];
  assert.equal(source.counts.missed, 20); assert.equal(source.items.length, 5); assert.equal(source.hiddenCount, 15);
  const next = applyTodayTaskRow(source, { ...chosen, focusDates: [date] }, { now: today });
  assert.equal(next.counts.missed, 19); assert.equal(next.counts.focus, 1); assert.equal(next.counts.total, 20);
  assert.equal(next.items.length, 6, 'full queue supplies the next real row while preserving the five non-focus preview slots');
  assert.equal(next.hiddenCount, 14); assert.equal(next.queueItems.length, 19);
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

test('editor acknowledgement proves every changed field including nullable dates and raw snake_case clears', () => {
  const patch = { title: '새 제목', dueAt: null, priority: 'high', description: '', nextAction: '', expectedUpdatedAt: today.toISOString() };
  const row = { id: 'a', title: '새 제목', due_at: null, priority: 'high', description: null, next_action: null, updated_at: today.toISOString() };
  assert.equal(todayTaskAcknowledges(row, task('a'), patch, date), true);
  for (const key of ['title', 'due_at', 'priority', 'description', 'next_action', 'updated_at']) {
    const incomplete = { ...row }; delete incomplete[key];
    assert.equal(todayTaskAcknowledges(incomplete, task('a'), patch, date), false, `${key} must be present in the actual persisted acknowledgement`);
  }
  assert.equal(todayTaskAcknowledges({ ...row, due_at: date }, task('a'), patch, date), false);
  assert.equal(todayTaskAcknowledges({ ...row, title: '원래 제목' }, task('a'), patch, date), false);
  assert.equal(todayTaskAcknowledges({ ...row, next_action: '원래 다음 행동' }, task('a'), patch, date), false);
  assert.equal(todayTaskAcknowledges({ ...row, dueAt: date, due_at: `${date}T00:00:00Z` }, task('a'), { dueAt: date }, date), true);
});

test('editing a formerly hidden queue task preserves focus membership and survives a failed reread', async () => {
  const tasks = Array.from({ length: 9 }, (_, i) => ({ ...task(`item-${i}`), status: 'inbox' }));
  tasks[0].focusDates = [date];
  const calls = [], client = createTodayTaskActions({ now: () => today,
    onChanged: () => client.observe({ ...client.view(), state: 'partial', stale: true }),
    fetchImpl: async (_url, options) => { calls.push(JSON.parse(options.body)); return reply({ id: 'item-8', title: '수정된 마지막', due_at: null, priority: 'high', description: null, next_action: null, updated_at: today.toISOString() }); },
  });
  client.observe(read(tasks));
  const patch = { title: '수정된 마지막', dueAt: null, priority: 'high', description: '', nextAction: '', expectedUpdatedAt: today.toISOString() };
  const result = await client.run(tasks[8], patch);
  assert.equal(result.ok, true); assert.deepEqual(calls, [{ id: 'item-8', ...patch }]);
  assert.equal(client.view().queueCount, 8); assert.equal(client.view().queueItems.length, 8);
  assert.equal(client.view().queueItems.find(row => row.id === 'item-8').title, '수정된 마지막');
  assert.equal(client.view().focusItems[0].id, 'item-0'); assert.equal(client.view().focus.picked, 1);
});

test('deferred delete joins duplicate requests, retains the row until saved and serializes other changes', async () => {
  const selected = { ...task('a'), focusDates: [date] }, candidates = ['b', 'c', 'd'].map(id => ({ ...task(id), focusDates: id === 'd' ? [] : [date] }));
  let resolveDelete;
  const calls = [], client = createTodayTaskActions({ now: () => today, onChanged: () => client.observe({ ...client.view(), state: 'partial', stale: false }),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body); calls.push({ method: options.method, body });
      if (options.method === 'DELETE') return new Promise(resolve => { resolveDelete = resolve; });
      return reply({ ...task(body.id), focusDates: [date] });
    },
  });
  client.observe(read([selected, ...candidates]));
  const first = client.remove(selected), duplicate = client.remove(selected);
  assert.equal(first, duplicate);
  const pick = client.run(candidates[2], { focus: { on: true } });
  await tick(); assert.equal(calls.length, 1); assert.deepEqual(calls[0], { method: 'DELETE', body: { id: 'a' } });
  assert.equal(client.view().focus.picked, 3); assert.equal(client.view().focusItems.some(row => row.id === 'a'), true);
  assert.deepEqual(new Set(client.snapshot().pendingIds), new Set(['a', 'd']));
  resolveDelete(reply(undefined)); assert.equal((await first).ok, true);
  // A failed reread truthfully blocks new focus choices, but cannot resurrect the saved deletion.
  assert.equal((await pick).status, 'unverified'); assert.equal(calls.length, 1);
  assert.equal(client.view().focus.picked, 2); assert.equal(client.view().focusItems.some(row => row.id === 'a'), false);
  assert.equal(client.view().queueItems[0].id, 'd'); assert.deepEqual(client.snapshot().pendingIds, []);
  client.observe({ ...client.view(), state: 'partial', stale: true });
  assert.equal(client.view().focus.picked, 2, 'replaying the partial cached projection never subtracts twice');
  client.observe(read(candidates));
  assert.equal((await client.run(candidates[2], { focus: { on: true } })).ok, true);
  assert.equal(client.view().focus.picked, 3); assert.equal(calls.length, 2);
});

test('delete failures preserve the focused and queued rows and allow explicit retry', async () => {
  for (const send of [async () => reply(undefined, 202, 'preview'), async () => reply(undefined, 502, 'error'), async () => ({ ok: true, status: 200, json: async () => { throw Error('synthetic parse failure'); } }), async () => { throw Error('synthetic transport loss'); }]) {
    const original = { ...task('a'), focusDates: [date] }, calls = [];
    const client = createTodayTaskActions({ now: () => today, fetchImpl: (...args) => { calls.push(args[1]); return send(...args); } });
    client.observe(read([original, task('b')]));
    assert.equal((await client.remove(original)).ok, false);
    assert.equal(client.view().focus.picked, 1); assert.equal(client.view().queueCount, 1);
    assert.equal(client.view().focusItems[0].id, 'a'); assert.equal(client.view().queueItems[0].id, 'b');
    await client.remove(original); assert.equal(calls.length, 2); assert.equal(calls[0].body, calls[1].body);
    assert.deepEqual(client.snapshot().pendingIds, []);
  }
});

test('saved deletion removes a completed focus row and its streak evidence without waiting for refresh', async () => {
  const completed = { ...task('a'), status: 'done', completedAt: today.toISOString(), focusDates: [date] };
  const client = createTodayTaskActions({ now: () => today, onChanged: () => new Promise(() => {}), fetchImpl: async () => reply(undefined) });
  client.observe(read([completed, task('b')]));
  assert.equal(client.view().streak.streak, 1);
  const result = await client.remove(completed); assert.equal(result.deletedId, 'a');
  assert.equal(client.view().focus.picked, 0); assert.equal(client.view().focus.done, 0);
  assert.equal(client.view().focusCompletedItems.length, 0); assert.equal(client.view().queueCount, 1);
  assert.equal(client.view().streak.streak, 0); assert.equal(client.view().streak.todayDoneCount, 0);
  assert.equal((await client.run(completed, { status: 'todo' })).status, 'missing');
});

test('editor version conflicts preserve the row and distinguish changed-elsewhere recovery from uncertain writes', async () => {
  let refreshes = 0;
  const client = createTodayTaskActions({ now: () => today, onChanged: () => { refreshes++; }, fetchImpl: async () => reply(undefined, 409, 'conflict') });
  client.observe(read([task('a')]));
  const result = await client.run(task('a'), { title: '내가 편집한 제목', expectedUpdatedAt: today.toISOString() });
  assert.equal(result.ok, false); assert.equal(result.status, 'conflict'); assert.match(result.message, /입력은 유지/);
  assert.equal(client.view().queueItems[0].title, '입력 a'); assert.equal(refreshes, 1);
  assert.deepEqual(client.snapshot().pendingIds, []);
});

test('completed rows leaving both visible lists retain ACK evidence through cached partial reads and a following deletion', async () => {
  const stored = { ...task('a'), focusDates: [date] };
  const client = createTodayTaskActions({ now: () => today,
    onChanged: () => client.observe({ ...client.view(), state: 'partial', stale: true }),
    fetchImpl: async (_url, options) => {
      if (options.method === 'DELETE') return reply(undefined);
      const patch = JSON.parse(options.body);
      if (patch.status) { stored.status = patch.status; stored.completedAt = today.toISOString(); }
      if (patch.focus) stored.focusDates = [];
      return reply({ ...stored });
    },
  });
  client.observe(read([stored]));
  assert.equal((await client.run(stored, { status: 'done' })).ok, true);
  assert.equal(client.view().streak.todayDoneCount, 1);
  assert.equal((await client.run(stored, { focus: { on: false } })).ok, true);
  assert.equal(client.view().focus.picked, 0); assert.equal(client.view().focusCompletedItems.length, 0); assert.equal(client.view().queueCount, 0);
  assert.equal(client.view().streak.todayDoneCount, 1);
  client.observe({ ...client.view(), state: 'partial', stale: true });
  assert.equal(client.view().streak.todayDoneCount, 1, 'cached ACK replays do not credit the completed row twice');
  assert.equal((await client.remove(stored)).ok, true);
  assert.equal(client.view().streak.todayDoneCount, 0); assert.equal(client.view().streak.streak, 0);
  client.observe({ ...client.view(), state: 'partial', stale: true });
  assert.equal(client.view().streak.todayDoneCount, 0);
});

test('raw priority acknowledgement replaces the preserved edit enum and a partial title ACK cannot downgrade it', async () => {
  const original = { ...task('a'), priority: 'high', priorityRaw: 'critical' };
  const responses = [reply({ id: 'a', priority: 'low' }), reply({ id: 'a', title: '새 제목' })];
  const client = createTodayTaskActions({ now: () => today, fetchImpl: async () => responses.shift() });
  client.observe(read([original]));
  assert.equal((await client.run(original, { priority: 'low' })).ok, true);
  assert.equal(client.view().queueItems[0].priorityRaw, 'low');
  assert.equal((await client.run(original, { title: '새 제목' })).ok, true);
  assert.equal(client.view().queueItems[0].priorityRaw, 'low');
  assert.equal(client.view().queueItems[0].title, '새 제목');
  const legacy = applyTodayTaskRow(read([{ ...task('b'), priority: 'med', priorityRaw: 'medium' }]), { id: 'b', priority: 'high' }, { now: today });
  assert.equal(legacy.queueItems[0].priorityRaw, 'high');
});
