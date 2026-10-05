import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NextResponse } from 'next/server.js';
import { isCanonicalUuid } from '../../../lib/uuid.js';
import { taskRecoveryAssertion } from '../../../lib/operator-session.js';

const id = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const request = path => ({ url: `http://localhost/api/hub/${path}?id=${id}&commandId=${id}` });

// Execute the actual route handlers with repository/transport bindings stubbed.
// Import stripping only replaces the server dependency boundary, not the GET logic.
function route(path, dependencies = {}) {
  const source = readFileSync(new URL(`./${path}/route.js`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\s*$/gm, '').replace(/\bexport /g, '');
  const bindings = {
    NextResponse, randomUUID, isCanonicalUuid, taskRecoveryAssertion, console: { error() {} },
    resolveDefaultWorkspaceId: () => workspaceId, resolveSupabaseConfig: () => ({}),
    withWorkspaceFilter: filters => [['workspace_id', `eq.${workspaceId}`], ...filters],
    eqFilter: value => `eq.${value}`, assertHubWriteAllowed: () => null,
    ...dependencies,
  };
  return new Function(...Object.keys(bindings), `${source}; return { GET, POST: typeof POST === 'function' ? POST : undefined };`)(...Object.values(bindings));
}

const outages = [
  ['tasks', 'getTaskLedger', { source: 'error', configured: true, workspaceId, error: 'task-read-failed', failedSources: ['tasks'], retryable: false }, 'tasks'],
  ['brands', 'getBrandLedger', { status: 'error', source: 'error', brands: [], error: 'brand-read-failed', failedSources: ['brands'], retryable: false }, 'brands'],
  ['memos', 'getMemoLedger', { status: 'error', memos: [], error: 'memo-read-failed', failedSources: ['notes'], retryable: false }, 'memos'],
  ['agent-runs', 'getRecentAgentRuns', { source: 'error', runs: [], error: 'run-read-failed', retryable: false }, 'runs'],
  ['intake', 'listStagedIntake', { source: 'error', rows: [], error: 'intake-read-failed', failedSources: ['lead_intake_raw'], retryable: false }, 'rows'],
  ['memo-capture', 'fetchSupabaseRows', null, null],
  ['goals/commands', 'getGoalCommandReceipt', { status: 'error', httpStatus: 503, error: 'receipt-read-unavailable', commandId: id, persisted: null, nextAction: 'get_goal_command_receipt', retryPolicy: 'same-command-id-and-input-only', retryable: false }, null],
];

for (const [path, reader, result, rows] of outages) {
  test(`${path}: repository outage uses HTTP 200 and preserves error/retry information`, async () => {
    const response = await route(path, { [reader]: async () => result }).GET(request(path));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.status, 'error');
    assert.equal(data.source, 'error');
    assert.equal(data.retryable, result?.retryable ?? true);
    if (result?.error) assert.equal(data.error, result.error);
    if (result?.failedSources) assert.deepEqual(data.failedSources, result.failedSources);
    if (rows) assert.deepEqual(data[rows], []);
    if (path === 'goals/commands') {
      assert.equal(data.persisted, null);
      assert.equal(data.commandId, id);
      assert.equal(data.retryPolicy, result.retryPolicy);
      assert.equal(data.nextAction, result.nextAction);
    }
  });

  test(`${path}: unexpected read exception remains an explicit retryable error`, async () => {
    const response = await route(path, { [reader]: async () => { throw Error('synthetic repository outage'); } }).GET(request(path));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.status, 'error');
    assert.equal(data.source, 'error');
    assert.equal(data.retryable, true);
    if (rows) assert.deepEqual(data[rows], []);
    if (path === 'goals/commands') {
      assert.equal(data.persisted, null, 'a failed receipt read cannot disprove an earlier write');
      assert.equal(data.commandId, id);
      assert.equal(data.retryPolicy, 'same-command-id-and-input-only');
    }
  });
}

test('Tasks retains partial-source information, deal filtering, and preview semantics', async () => {
  const getTaskLedger = async () => ({ source: 'supabase', configured: true, workspaceId, partial: true,
    taskAggregation: { partial: true }, failedSources: ['projects', 'tasks'],
    todos: [{ id, dealId: 'selected' }, { id: workspaceId, dealId: 'other' }] });
  const response = await route('tasks', { getTaskLedger }).GET({ url: 'http://localhost/api/hub/tasks?dealId=selected' });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'partial');
  assert.deepEqual(data.tasks, [{ id, dealId: 'selected' }]);
  assert.deepEqual(data.failedSources, ['tasks', 'projects']);
  const preview = await route('tasks', { getTaskLedger: async () => ({ source: 'preview', todos: [], configured: false }) }).GET(request('tasks'));
  assert.equal((await preview.json()).status, 'preview');
});

for (const [path, reader, payload] of [
  ['brands', 'getBrandLedger', { source: 'supabase', status: 'partial', brands: [{ id }], metricsAvailable: false }],
  ['memos', 'getMemoLedger', { status: 'partial', memos: [{ id }], failedSources: ['projects'], linksComplete: false }],
]) test(`${path}: usable partial data and metadata pass through unchanged`, async () => {
  const response = await route(path, { [reader]: async () => payload }).GET(request(path));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
});

for (const [path, reader, key] of [['agent-runs', 'getRecentAgentRuns', 'runs'], ['intake', 'listStagedIntake', 'rows']]) {
  test(`${path}: configured empty and unconfigured preview remain distinct`, async () => {
    for (const [source, status] of [['supabase', 'live'], ['preview', 'preview']]) {
      const response = await route(path, { [reader]: async () => ({ source, [key]: [] }) }).GET(request(path));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { source, status, [key]: [] });
    }
  });
}

test('Intake preserves filters and returned diagnostic details instead of hiding source:error as preview', async () => {
  let input;
  const response = await route('intake', { listStagedIntake: async params => {
    input = params; return { source: 'error', rows: [], error: 'intake-read-failed', reason: 'unavailable', retryable: true };
  } }).GET({ url: 'http://localhost/api/hub/intake?status=pending&source=manual' });
  assert.deepEqual(input, { status: 'pending', source: 'manual' });
  assert.equal((await response.json()).reason, 'unavailable');
});

test('Memos and AgentRuns keep invalid query HTTP 400 and do not call the reader', async () => {
  let calls = 0;
  const memos = route('memos', { getMemoLedger: async () => { calls++; } });
  for (const query of ['task=bad', 'note=bad']) {
    const response = await memos.GET({ url: `http://localhost/api/hub/memos?${query}` });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: 'invalid-input' });
  }
  const runs = route('agent-runs', { getRecentAgentRuns: async () => { calls++; } });
  for (const query of ['limit=0', 'limit=51', 'agent=unknown', `ref=${'a'.repeat(301)}`]) {
    const response = await runs.GET({ url: `http://localhost/api/hub/agent-runs?${query}` });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid-agent-run-query');
  }
  assert.equal(calls, 0);
});

test('MemoCapture keeps invalid 400, unconfigured 202, confirmed absence 404 and exact live memo', async () => {
  let calls = 0;
  const invalid = await route('memo-capture', { fetchSupabaseRows: async () => { calls++; } }).GET({ url: 'http://localhost/api/hub/memo-capture?id=bad' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { status: 'invalid-input' });
  const preview = await route('memo-capture', { resolveSupabaseConfig: () => null, fetchSupabaseRows: async () => { calls++; } }).GET(request('memo-capture'));
  assert.equal(preview.status, 202);
  assert.deepEqual(await preview.json(), { status: 'preview' });
  assert.equal(calls, 0);
  const absent = await route('memo-capture', { fetchSupabaseRows: async () => [] }).GET(request('memo-capture'));
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { status: 'not-found' });
  let options;
  const live = await route('memo-capture', { fetchSupabaseRows: async (table, params) => {
    assert.equal(table, 'notes'); options = params; return [{ id }];
  } }).GET(request('memo-capture'));
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'live', memo: { id } });
  assert.deepEqual(options.filters, [['workspace_id', `eq.${workspaceId}`], ['id', `eq.${id}`]]);
});

test('GoalReceipt keeps invalid 400, confirmed absence 404, and saved command data unchanged', async () => {
  for (const payload of [
    { httpStatus: 400, status: 'error', error: 'invalid-command-id', persisted: false },
    { httpStatus: 404, status: 'error', error: 'receipt-not-found', persisted: null, retryPolicy: 'same-command-id-and-input-only' },
    { httpStatus: 200, status: 'saved', persisted: true, commandId: id, entity: { id } },
  ]) {
    const response = await route('goals/commands', { getGoalCommandReceipt: async () => payload }).GET(request('goals/commands'));
    const { httpStatus, ...data } = payload;
    assert.equal(response.status, httpStatus);
    assert.deepEqual(await response.json(), data);
  }
});

test('all six existing POST handlers preserve the write guard response without reaching persistence', async () => {
  let calls = 0;
  for (const [path, reader] of [['tasks', 'forwardPmsCommand'], ['brands', 'forwardPmsCommand'], ['memos', 'forwardMemoLinkCommand'], ['intake', 'promoteStagedLeads'], ['memo-capture', 'forwardMemoCapture'], ['goals/commands', 'executeGoalCommand']]) {
    const guard = NextResponse.json({ status: 'forbidden' }, { status: 403 });
    const response = await route(path, { assertHubWriteAllowed: () => guard, [reader]: async () => { calls++; } }).POST(request(path));
    assert.equal(response, guard);
  }
  assert.equal(calls, 0);
});

test('Tasks POST retains the original UUID and conflict HTTP/body contract', async () => {
  let command;
  const entity = { id };
  const response = await route('tasks', {
    readHubWriteJson: async () => ({ data: { id, title: 'synthetic task' } }),
    forwardPmsCommand: async input => { command = input; return { httpStatus: 409, data: { status: 'conflict', error: 'id-reuse-payload-mismatch', entity } }; },
  }).POST(request('tasks'));
  assert.deepEqual(command, { id, title: 'synthetic task', action: 'create_task', workspaceId });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { status: 'conflict', error: 'id-reuse-payload-mismatch', entity, task: entity });
});

test('Goal commands POST and Intake POST preserve write failure semantics', async () => {
  const receipt = await route('goals/commands', {
    readHubWriteJson: async () => ({ data: { commandId: id } }),
    executeGoalCommand: async () => ({ httpStatus: 503, status: 'error', persisted: null, retryable: true }),
  }).POST(request('goals/commands'));
  assert.equal(receipt.status, 503);
  assert.deepEqual(await receipt.json(), { status: 'error', persisted: null, retryable: true });
  const intake = await route('intake', {
    readHubWriteJson: async () => ({ data: { op: 'promote', id } }),
    promoteStagedLeads: async () => { throw Error('synthetic write unavailable'); },
  }).POST(request('intake'));
  assert.equal(intake.status, 500);
  assert.deepEqual(await intake.json(), { status: 'error', error: 'synthetic write unavailable' });
});
