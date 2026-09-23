import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendProjectChecklistItem, createProjectTaskWriter } from './project-direct-work.js';

const taskId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const checkId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const version = '2026-09-23T01:00:00.123456+00:00';
const input = { id: taskId, projectId, title: '확인할 일' };
const check = { id: checkId, title: '자료 확인', done: false, note: '' };
const task = { id: taskId, project: projectId, title: input.title, updatedAt: version, checklist: [] };
const response = (status, row) => ({ ok: true, json: async () => ({ status, task: row }) });
const created = payload => ({ id: payload.id, title: payload.title, project_id: payload.projectId,
  status: 'todo', updated_at: version, meta: { item_type: payload.itemType, checklist: [] } });

test('simultaneous Enter submissions share one request and retain the intended project', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const write = createProjectTaskWriter({ fetchImpl: async (_url, options) => {
    calls += 1;
    const payload = JSON.parse(options.body);
    assert.equal(payload.projectId, projectId);
    assert.equal(payload.itemType, 'task');
    await gate;
    return response('saved', created(payload));
  } });
  const first = write(input);
  const second = write(input);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  const moved = await write({ ...input, projectId: otherId });
  assert.equal(moved.status, 'conflict');
  release();
  assert.equal((await first).ok, true);
  assert.equal((await second).task.id, taskId);
});

test('a lost create acknowledgement retries the same payload and accepts the durable duplicate', async () => {
  const bodies = [];
  const write = createProjectTaskWriter({ fetchImpl: (_url, options) => {
    bodies.push(options.body);
    if (bodies.length === 1) throw new Error('acknowledgement lost');
    return Promise.resolve(response('duplicate', created(JSON.parse(options.body))));
  } });
  assert.equal((await write(input)).ok, false);
  assert.equal((await write({ ...input, title: '바꾼 내용' })).status, 'conflict');
  const retried = await write(input);
  assert.equal(retried.ok, true);
  assert.equal(retried.status, 'duplicate');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
});

test('preview, missing echoes, and another project row never acknowledge creation', async () => {
  for (const result of [response('preview', null), response('saved', null),
    response('duplicate', { ...created({ ...input, itemType: 'task' }), project_id: otherId }),
    response('saved', { ...created({ ...input, itemType: 'task' }), meta: { item_type: 'milestone' } })]) {
    const write = createProjectTaskWriter({ fetchImpl: async () => result });
    assert.equal((await write(input)).ok, false);
  }
});

test('a definitive server validation rejection preserves invalid-input for editable draft recovery', async () => {
  const write = createProjectTaskWriter({ fetchImpl: async () => ({
    ok: false, status: 400, json: async () => ({ status: 'invalid-input', error: 'invalid-project-id', task: null }),
  }) });
  const result = await write(input);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid-input');
  assert.match(result.message, /프로젝트 연결/);
  assert.match(result.message, /다시 작성/);
  assert.match(result.message, /저장되지 않았습니다/);
});

test('checklist append saves the full current list under its exact observed version', async () => {
  const old = { id: otherId, title: '기존 항목', done: true, note: '보존', dueAt: '2026-09-24' };
  const current = { ...task, checklist: [old] };
  const result = await appendProjectChecklistItem(current, check, { saveChanges: async (rows, patch) => {
    assert.equal(rows[0].updatedAt, version);
    assert.deepEqual(patch.checklist, [old, check]);
    return { saved: [{ id: taskId, task: { ...current, checklist: patch.checklist } }], failed: [] };
  } });
  assert.equal(result.ok, true);
  assert.equal(result.task.checklist.length, 2);
});

test('a checklist append acknowledgement lost after persistence is resolved without another item', async () => {
  const current = { ...task, checklist: [check] };
  let writes = 0;
  const retry = await appendProjectChecklistItem(current, check, { saveChanges: async () => { writes += 1; } });
  assert.equal(retry.ok, true);
  assert.equal(retry.replayed, true);
  assert.equal(writes, 0);
  const conflict = await appendProjectChecklistItem(task, check, { saveChanges: async () => ({
    saved: [], failed: [{ id: taskId, status: 'conflict', current: { id: taskId, meta: { checklist: [check] } } }],
  }) });
  assert.equal(conflict.ok, true);
  assert.equal(conflict.replayed, true);
});

test('concurrent checklist changes are preserved and never automatically overwritten', async () => {
  const other = { ...check, id: otherId, title: '다른 창에서 추가' };
  let writes = 0;
  const latest = { ...task, updatedAt: '2026-09-23T01:00:01.000000+00:00', checklist: [other] };
  const result = await appendProjectChecklistItem(task, check, { saveChanges: async () => {
    writes += 1;
    return { saved: [], failed: [{ id: taskId, status: 'conflict', current: latest, message: '다시 확인하세요.' }] };
  } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'conflict');
  assert.equal(writes, 1);
  assert.deepEqual(result.task.checklist, [other]);
  const retry = await appendProjectChecklistItem(latest, check, { saveChanges: async (rows, patch) => {
    assert.equal(rows[0].updatedAt, latest.updatedAt);
    assert.deepEqual(patch.checklist, [other, check]);
    return { saved: [{ id: taskId, task: { ...latest, checklist: patch.checklist } }], failed: [] };
  } });
  assert.equal(retry.ok, true);
});

test('a changed same-ID item is not treated as a replay and malformed capture never writes', async () => {
  let writes = 0;
  const dependencies = { saveChanges: async () => { writes += 1; } };
  for (const changed of [{ ...check, done: true }, { ...check, note: '변경됨' }, { ...check, title: '다른 내용' }]) {
    assert.equal((await appendProjectChecklistItem({ ...task, checklist: [changed] }, check, dependencies)).status, 'conflict');
  }
  assert.equal((await appendProjectChecklistItem(task, { ...check, title: ' ' }, dependencies)).ok, false);
  assert.equal((await appendProjectChecklistItem({ ...task, updatedAt: null }, check, dependencies)).ok, false);
  assert.equal(writes, 0);
});
