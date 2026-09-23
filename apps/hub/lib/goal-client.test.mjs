import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateGoalCommand } from '@com-moon/goal-contracts';

const file = new URL('./goal-client.js', import.meta.url);
test('goal read failures retain a safe actionable explanation without exposing server errors as content', async () => {
  const { createGoalReadClient, goalReadErrorMessage } = await import(file);
  for (const code of ['invalid-workspace', 'entity-scope-unavailable', 'database internal details']) {
    const reader = createGoalReadClient({ fetchImpl: async () => ({ ok: true,
      json: async () => ({ status: 'error', error: code, objectives: [{ id: 'stale-goal' }] }),
    }) });
    const result = await reader.read('entityType=tasks');
    assert.equal(result.status, 'error');
    assert.deepEqual(result.objectives, []);
    assert.equal(result.error, goalReadErrorMessage(code));
    assert.equal(result.error.includes(code), false);
  }
  assert.match(goalReadErrorMessage('invalid-workspace'), /작업공간 설정/);
  assert.match(goalReadErrorMessage('entity-scope-unavailable'), /프로젝트·소속/);
});
test('goal routes retain the check view and list scope through create and detail navigation', async () => {
  const { goalHref } = await import(file);
  for (const scope of ['all', 'personal', 'classin']) {
    const create = new URL(goalHref(null, scope, { check: true, create: true }), 'https://hub.invalid');
    assert.equal(create.searchParams.get('scope'), scope);
    assert.equal(create.searchParams.get('check'), '1');
    assert.equal(create.searchParams.get('new'), 'goal');
    assert.equal(create.searchParams.has('goal'), false);
    const detail = new URL(goalHref('saved-goal', scope, { check: true }), 'https://hub.invalid');
    assert.equal(detail.searchParams.get('scope'), scope);
    assert.equal(detail.searchParams.get('check'), '1');
    assert.equal(detail.searchParams.get('goal'), 'saved-goal');
    assert.equal(detail.searchParams.has('new'), false);
  }
});
test('the weekly actuals view is its own route state and never combines with the check view', async () => {
  const { goalHref, goalView } = await import(file);
  const weekly = new URL(goalHref(null, 'classin', { weekly: true }), 'https://hub.invalid');
  assert.equal(weekly.searchParams.get('weekly'), '1');
  assert.equal(weekly.searchParams.has('check'), false);
  assert.equal(new URL(goalHref(null, 'all', { weekly: true, check: true }), 'https://hub.invalid').searchParams.has('check'), false);
  assert.equal(goalView(new URLSearchParams('weekly=1&check=1')), 'weekly');
  assert.equal(goalView(new URLSearchParams('check=1')), 'check');
  assert.equal(goalView(new URLSearchParams('')), 'goals');
});

test('a company objective cannot pick daily reviews, which are personal by definition and would read a permanent 0', async () => {
  const { goalSourceKeysFor } = await import(file);
  assert.ok(goalSourceKeysFor('personal').includes('reviews_completed'));
  assert.equal(goalSourceKeysFor('company').includes('reviews_completed'), false);
  assert.deepEqual(goalSourceKeysFor('company'), ['manual', 'tasks_completed', 'contacts_recorded', 'content_published']);
});

test('post-mutation refresh never shares a pre-mutation read or lets it evict the new read', async () => {
  const { createGoalReadClient } = await import(file);
  assert.equal(typeof createGoalReadClient, 'function');
  const requests = [];
  const reader = createGoalReadClient({ fetchImpl: () => new Promise(resolve => requests.push(resolve)) });
  const before = reader.read('scope=personal');
  reader.invalidate();
  const after = reader.read('scope=personal');
  assert.equal(requests.length, 2);
  requests[0]({ ok: true, json: async () => ({ status: 'live', objectives: [{ id: 'before' }] }) });
  await before;
  assert.equal(reader.read('scope=personal'), after, 'old completion must not evict the fresh pending read');
  requests[1]({ ok: true, json: async () => ({ status: 'live', objectives: [{ id: 'after' }] }) });
  assert.equal((await after).objectives[0].id, 'after');
});
test('receipt outage and a retry outage cannot clear an earlier ambiguous command', async () => {
  const { createGoalCommandClient } = await import(file);
  const pending = { commandId: 'same-request', action: 'create_objective', input: { title: 'preserved' } };
  for (const status of [401, 403, 404, 503]) {
    const client = createGoalCommandClient({ pending, fetchImpl: async () => ({ status, json: async () => ({ status: 'error', persisted: false, error: 'goal-storage-unavailable' }) }) });
    assert.equal((await client.checkReceipt()).state, 'unknown');
    assert.deepEqual(client.pending, pending);
    assert.equal((await client.retry()).state, 'unknown');
    assert.deepEqual(client.pending, pending);
  }
  const requests = [];
  const client = createGoalCommandClient({ makeId: () => pending.commandId, fetchImpl: async (_url, init) => {
    requests.push(init.body);
    if (requests.length === 1) throw new Error('response lost');
    return { status: 503, json: async () => ({ status: 'error', persisted: false, error: 'missing-persistence' }) };
  } });
  await client.submit(pending.action, pending.input);
  assert.equal((await client.retry()).state, 'unknown');
  assert.equal(requests[0], requests[1]);
  assert.deepEqual(client.pending, pending);
});
test('stale source links never regain an actionable destination through the entity fallback', async () => {
  const { goalLinkedEntityHref } = await import(file);
  assert.equal(typeof goalLinkedEntityHref, 'function');
  const link = { entityType: 'tasks', entityId: 'task', entityHref: '/dashboard/work/projects?task=task' };
  assert.equal(goalLinkedEntityHref(link), link.entityHref);
  for (const linkStatus of ['scope-mismatch', 'unavailable']) {
    assert.equal(goalLinkedEntityHref({ ...link, linkStatus }), null);
    assert.equal(goalLinkedEntityHref({ ...link, entityHref: null, linkStatus }), null);
  }
  assert.equal(goalLinkedEntityHref({ ...link, stale: true }), null);
});
test('a failed or capped goal section never reads as a complete empty collection', async () => {
  const client = await import(file);
  assert.equal(typeof client.goalSectionState, 'function');
  assert.equal(client.goalSectionState({ failedSources: ['operating_metrics'] }, 'operating_metrics'), 'error');
  assert.equal(client.goalSectionState({ truncatedSources: ['operating_goal_links'] }, 'operating_goal_links'), 'partial');
  assert.equal(client.goalSectionState({}, 'operating_metrics'), 'live');
});
test('clearing a saved form restores its default when reopened', async () => {
  const { readGoalLocal, writeGoalLocal } = await import(file);
  const key = `draft:${randomUUID()}`;
  const initial = { name: '', target: '' };
  writeGoalLocal(key, { name: '작성 중', target: '3' });
  assert.equal(readGoalLocal(key, initial).name, '작성 중');
  writeGoalLocal(key, null);
  assert.deepEqual(readGoalLocal(key, initial), initial);
});
test('form payloads satisfy the shared objective, metric and observation contract without draft-only fields', async () => {
  const client = await import(file);
  assert.equal(typeof client.goalObjectiveInput, 'function');
  const objective = { id: randomUUID(), periodStart: '2026-09-21', periodEnd: '2026-09-27' };
  const draft = { title: ' 목표 ', description: ' 설명 ', scope: 'personal', timezone: 'Asia/Seoul', ...objective, status: 'active' };
  const input = client.goalObjectiveInput(draft);
  assert.equal('status' in input, false);
  assert.deepEqual(validateGoalCommand({ commandId: randomUUID(), action: 'create_objective', input }).ok, true);
  const metric = { id: randomUUID() };
  const metricInput = client.goalMetricInput({ name: '지표', unit: '건', role: 'driver', direction: 'increase', baseline: '0', target: '4', targetMin: '8', targetMax: '10', sourceKey: 'manual', draftOnly: true }, objective.id);
  assert.equal(metricInput.targetMin, null);
  assert.deepEqual(validateGoalCommand({ commandId: randomUUID(), action: 'create_metric', input: metricInput }).ok, true);
  const observation = client.goalObservationInput({ value: '0', coverage: 'complete', observedAt: '2026-09-21T12:00:00+09:00', evidenceAt: '2026-09-21T11:00:00+09:00', evidenceLabel: '원장', evidenceHref: '/dashboard/work/my', note: '' }, metric.id, objective);
  assert.equal(observation.value, 0);
  assert.deepEqual(validateGoalCommand({ commandId: randomUUID(), action: 'record_observation', input: observation }).ok, true);
  assert.equal(client.goalObservationInput({ value: '5', coverage: 'unmeasured', observedAt: '2026-09-21T12:00:00+09:00', evidenceLabel: '', evidenceHref: '', note: '' }, metric.id, objective).value, null);
});
test('goal client implements failure-safe command and read contracts', async () => {
  const source = await readFile(file, 'utf8').catch(() => '');
  assert.ok(source.includes('createGoalCommandClient'), 'goal command client must exist');
  const { goalReadState, goalScope, goalHref, createGoalCommandClient, measurementLabel } = await import(file);
  assert.equal(goalReadState({ ok: true }, { status: 'error' }), 'error');
  assert.equal(goalReadState({ ok: true }, { status: 'preview' }), 'preview');
  assert.equal(goalReadState({ ok: true }, { status: 'partial' }), 'partial');
  assert.equal(goalReadState({ ok: true }, null), 'error');
  assert.equal(goalScope('classin'), 'company');
  assert.equal(goalScope('all'), '');
  assert.equal(goalHref('one', 'company'), '/dashboard/overview?view=goals&scope=classin&goal=one');
  assert.equal(measurementLabel({ measurement: { value: null, coverage: 'unmeasured' } }), '미측정');
  assert.equal(measurementLabel({ measurement: { value: 0, coverage: 'complete' }, unit: '건' }), '0 건');
  const requests = [];
  let disconnected = true;
  const client = createGoalCommandClient({
    makeId: () => 'request-a',
    fetchImpl: async (url, init) => {
      requests.push({ url, body: init.body });
      if (disconnected) throw new Error('offline');
      return { ok: true, status: 200, json: async () => ({ status: 'saved', persisted: true }) };
    },
  });
  const unknown = await client.submit('create_objective', { title: '입력' });
  assert.equal(unknown.state, 'unknown');
  assert.equal(client.pending.commandId, 'request-a');
  assert.equal((await client.submit('create_objective', { title: '다른 입력' })).state, 'unknown');
  assert.equal(requests.length, 1, 'an unresolved write cannot be replaced by another command');
  disconnected = false;
  const saved = await client.retry();
  assert.equal(saved.state, 'saved');
  assert.equal(requests[0].body, requests[1].body, 'manual retry uses identical ID and payload');
  assert.equal(client.pending, null);
});

test('pending receipts survive reconstruction and absence does not prove a failed write', async () => {
  const source = await readFile(file, 'utf8').catch(() => '');
  assert.ok(source.includes('createGoalCommandClient'), 'goal command client must exist');
  const { createGoalCommandClient } = await import(file);
  const pending = { commandId: 'still-pending', action: 'update_objective', expectedRevision: 4, input: { id: 'goal' } };
  const client = createGoalCommandClient({ pending, fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ status: 'error', error: 'receipt-not-found', persisted: null }) }) });
  assert.equal((await client.checkReceipt()).state, 'unknown');
  assert.deepEqual(client.pending, pending);
});

test('explicit conflicts preserve current entity for comparison and allow a revised command', async () => {
  const source = await readFile(file, 'utf8').catch(() => '');
  assert.ok(source.includes('createGoalCommandClient'), 'goal command client must exist');
  const { createGoalCommandClient } = await import(file);
  const entity = { id: 'goal', revision: 5 };
  const client = createGoalCommandClient({ makeId: () => 'conflict', fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ status: 'conflict', persisted: false, entity }) }) });
  const result = await client.submit('update_objective', { id: 'goal' }, 4);
  assert.equal(result.state, 'conflict');
  assert.deepEqual(result.entity, entity);
  assert.equal(client.pending, null);
});
