import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseOfficeVerdict, mergeVerdict, recordOfficeVerdict, createOfficeVerdictHandler } from './verdict.js';

const runId = randomUUID();

test('parse requires a uuid, a known value and a reason only for dropped', () => {
  assert.equal(parseOfficeVerdict(null).ok, false);
  assert.equal(parseOfficeVerdict({ runId: 'x', value: 'kept' }).error, 'invalid-run-id');
  assert.equal(parseOfficeVerdict({ runId, value: 'nope' }).error, 'invalid-verdict-value');
  assert.equal(parseOfficeVerdict({ runId, value: 'dropped' }).error, 'invalid-verdict-reason');
  assert.equal(parseOfficeVerdict({ runId, value: 'dropped', reason: 'x' }).error, 'invalid-verdict-reason');
  const kept = parseOfficeVerdict({ runId, value: 'kept', reason: 'wrong' }, Date.parse('2026-10-29T00:00:00Z'));
  assert.deepEqual(kept.verdict, { value: 'kept', reason: null, at: '2026-10-29T00:00:00.000Z' });
  assert.equal(parseOfficeVerdict({ runId, value: 'dropped', reason: 'context', at: '2026-10-28T01:00:00Z' }).verdict.at, '2026-10-28T01:00:00.000Z');
});

test('merge keeps every other recommendation key', () => {
  const verdict = { value: 'edited', reason: null, at: 'x' };
  assert.deepEqual(mergeVerdict({ elapsedMs: 5, usage: { totalTokens: 3 } }, verdict), { elapsedMs: 5, usage: { totalTokens: 3 }, verdict });
  assert.deepEqual(mergeVerdict(null, verdict), { verdict });
  assert.deepEqual(mergeVerdict([1], verdict), { verdict });
});

test('record reads, merges and updates scoped to office rows; maps missing/preview/failed', async () => {
  const workspaceId = randomUUID();
  let patch;
  const fetchRows = async (_t, o) => { assert.ok(o.filters.some(([k, v]) => k === 'agent' && v === 'like.office.*')); return { configured: true, rows: [{ id: runId, recommendation: { elapsedMs: 7 } }] }; };
  const update = async (table, filters, record) => { patch = { table, filters, record }; return { persisted: true, id: runId }; };
  const ok = await recordOfficeVerdict({ runId, value: 'dropped', reason: 'useless' }, { workspaceId, fetchRows, update });
  assert.equal(ok.status, 'saved'); assert.equal(ok.http, 200);
  assert.equal(patch.table, 'agent_runs');
  assert.equal(patch.record.recommendation.elapsedMs, 7);
  assert.equal(patch.record.recommendation.verdict.reason, 'useless');
  assert.ok(patch.filters.some(([k]) => k === 'workspace_id'));
  assert.equal((await recordOfficeVerdict({ runId, value: 'kept' }, { workspaceId, fetchRows: async () => ({ configured: true, rows: [] }), update })).http, 404);
  assert.equal((await recordOfficeVerdict({ runId, value: 'kept' }, { workspaceId, fetchRows: async () => ({ configured: false, rows: null }), update })).status, 'preview');
  assert.equal((await recordOfficeVerdict({ runId, value: 'kept' }, { workspaceId, fetchRows: async () => ({ configured: true, rows: null, error: {} }), update })).status, 'failed');
  assert.equal((await recordOfficeVerdict({ runId, value: 'kept' }, { workspaceId, fetchRows, update: async () => ({ persisted: false, reason: 'http-500' }) })).status, 'failed');
  assert.equal((await recordOfficeVerdict({ value: 'kept' }, { workspaceId, fetchRows, update })).http, 400);
});

test('handler is guarded before reading the body and returns ok:false envelopes on failure', async () => {
  const req = body => new Request('http://localhost/api/hub/office/verdict', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const denied = createOfficeVerdictHandler({ guard: () => Response.json({}, { status: 403 }), record: () => assert.fail('record before guard') });
  assert.equal((await denied(req({}))).status, 403);
  const saved = await createOfficeVerdictHandler({ guard: () => null, record: async () => ({ status: 'saved', runId, verdict: {}, http: 200 }) })(req({}));
  assert.deepEqual(await saved.json(), { ok: true, status: 'saved', runId, verdict: {} });
  const bad = await createOfficeVerdictHandler({ guard: () => null, record: async () => ({ status: 'error', error: 'run-not-found', http: 404 }) })(req({}));
  assert.equal(bad.status, 404); assert.deepEqual(await bad.json(), { ok: false, status: 'error', error: 'run-not-found' });
  const thrown = await createOfficeVerdictHandler({ guard: () => null, record: async () => { throw new Error('x'); } })(req({}));
  assert.equal(thrown.status, 502);
});
