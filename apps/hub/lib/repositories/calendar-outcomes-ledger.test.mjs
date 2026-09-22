import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
const ledger = await import('./calendar-outcomes-ledger.js').catch(() => ({}));
const workspace = '11111111-1111-4111-8111-111111111111';
const eventKey = 'a'.repeat(64);
const originalFetch = globalThis.fetch;
const keys = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','COM_MOON_DEFAULT_WORKSPACE_ID'];
const savedEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let rows, calls, fail;
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://calendar-outcomes.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.COM_MOON_DEFAULT_WORKSPACE_ID = workspace;
  rows = []; calls = []; fail = false;
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body, method: options.method });
    if (fail) return new Response('unavailable', { status: 503 });
    const matches = row => [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
    if (options.method === 'POST') {
      if (rows.some(row => row.workspace_id === body.workspace_id && row.event_key === body.event_key)) return Response.json({ code: '23505' }, { status: 409 });
      rows.push(body);
      return Response.json([body], { status: 201 });
    }
    if (options.method === 'PATCH') {
      const selected = rows.filter(matches);
      selected.forEach(row => Object.assign(row, body));
      return Response.json(selected);
    }
    return Response.json(rows.filter(matches));
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  keys.forEach(key => savedEnv[key] === undefined ? delete process.env[key] : process.env[key] = savedEnv[key]);
});
test('outcomes support guarded durable read and save operations', () => {
  assert.equal(typeof ledger.getCalendarOutcome, 'function');
  assert.equal(typeof ledger.saveCalendarOutcome, 'function');
});
test('save, reload, uncheck and clear note retain workspace isolation', async () => {
  const input = { eventKey, done: true, note: '특이사항', expectedRevision: 0, workspaceId: 'untrusted' };
  const result = await ledger.saveCalendarOutcome(input);
  assert.equal(result.status, 'saved');
  assert.equal(result.outcome.revision, 1);
  assert.equal(rows[0].workspace_id, workspace);
  assert.equal((await ledger.getCalendarOutcome(eventKey)).outcome.note, '특이사항');
  const next = await ledger.saveCalendarOutcome({ ...input, done: false, note: '', expectedRevision: 1 });
  assert.equal(next.outcome.done, false);
  assert.equal(next.outcome.note, '');
  assert.equal(rows.length, 1);
});
test('stale writes conflict without overwriting; identical uncertain retries are duplicate', async () => {
  const input = { eventKey, done: true, note: 'first', expectedRevision: 0 };
  await ledger.saveCalendarOutcome(input);
  assert.equal((await ledger.saveCalendarOutcome(input)).status, 'duplicate');
  assert.equal((await ledger.saveCalendarOutcome({ ...input, note: 'stale' })).status, 'conflict');
  assert.equal(rows[0].note, 'first');
  await ledger.saveCalendarOutcome({ ...input, note: 'latest', expectedRevision: 1 });
  assert.equal((await ledger.saveCalendarOutcome({ ...input, note: 'overwrite', expectedRevision: 1 })).status, 'conflict');
  assert.equal(rows[0].note, 'latest');
});
test('failed reads are errors and missing persistence cannot report saved', async () => {
  fail = true;
  assert.equal((await ledger.getCalendarOutcome(eventKey)).status, 'error');
  assert.equal((await ledger.saveCalendarOutcome({ eventKey, done: true, note: '', expectedRevision: 0 })).status, 'error');
  delete process.env.COM_MOON_DEFAULT_WORKSPACE_ID;
  assert.equal((await ledger.getCalendarOutcome(eventKey)).status, 'preview');
  assert.equal((await ledger.saveCalendarOutcome({ eventKey, done: false, note: '', expectedRevision: 0 })).httpStatus, 503);
});
test('invalid keys, notes, booleans and revisions never reach persistence', async () => {
  for (const patch of [{ eventKey: 'bad' }, { note: 'x'.repeat(4001) }, { done: 'true' }, { expectedRevision: -1 }, { expectedRevision: 1.5 }]) {
    assert.equal((await ledger.saveCalendarOutcome({ eventKey, done: true, note: '', expectedRevision: 0, ...patch })).httpStatus, 400);
  }
  assert.equal(calls.length, 0);
});

test('route rejects cross-origin writes and reads keep HTTP 200 error envelopes', async () => {
  const { GET, POST } = await import('../../app/api/hub/calendar-outcomes/route.js');
  const denied = await POST(new Request('http://localhost:3000/api/hub/calendar-outcomes', {
    method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: '{}',
  }));
  assert.ok([401, 403].includes(denied.status));
  assert.equal(calls.length, 0);
  fail = true;
  const read = await GET(new Request(`http://localhost:3000/api/hub/calendar-outcomes?eventKey=${eventKey}`));
  assert.equal(read.status, 200);
  assert.equal((await read.json()).status, 'error');
});
