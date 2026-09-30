import assert from 'node:assert/strict';
import test from 'node:test';
let createReportsSweepHandler;
try { ({ createReportsSweepHandler } = await import('../../../../lib/reports-generation.js')); } catch {}
const req = new Request('https://hub.test/api/cron/reports-sweep');
const actor = { workspaceId: '11111111-1111-4111-8111-111111111111', actorId: 'operator' };
const now = new Date('2026-10-01T00:00:00Z');

test('cron allows the measured-source reads plus Office generation within its server deadline', async () => {
  const route = await import('./route.js');
  assert.equal(route.maxDuration, 300);
});

test('cron authenticates before source reads and derives the Office actor on the server', async () => {
  assert.equal(typeof createReportsSweepHandler, 'function');
  const denied = createReportsSweepHandler({ guard: () => Response.json({ status: 'denied' }, { status: 401 }),
    run: () => assert.fail('denied before generation') });
  assert.equal((await denied(req)).status, 401);
  let received;
  const allowed = createReportsSweepHandler({ guard: () => null, identity: () => actor, clock: () => now,
    run: async options => { received = options; return { status: 'live', results: [] }; } });
  assert.equal((await allowed(req)).status, 200); assert.deepEqual(received, { identity: actor, now });
});

test('cron records the actual new AI preparation and distinguishes partial or failed preparation', async () => {
  assert.equal(typeof createReportsSweepHandler, 'function');
  for (const status of ['live', 'partial', 'error']) {
    let logged;
    const output = { status, results: [{ scope: 'company', status, snapshot: { status: 'saved', reportId: actor.workspaceId },
      ai: { status: status === 'error' ? 'error' : 'generated', attempted: true, missing: status === 'partial' ? ['contacts_recorded'] : [] } }] };
    const handler = createReportsSweepHandler({ guard: () => null, identity: () => actor, clock: () => now,
      run: async () => output, record: async input => { logged = input; return { persisted: true }; } });
    const response = await handler(req), body = await response.json();
    assert.equal(response.status, status === 'error' ? 500 : 200); assert.equal(body.status, status);
    assert.deepEqual(logged.output.results, output.results); assert.equal(logged.status, status === 'live' ? 'success' : 'failure');
    assert.equal(logged.startedAt, now.toISOString()); assert.equal(body.automationLog, 'saved');
  }
});

test('replayed preparation does not flood the automation ledger and log failure remains visible', async () => {
  assert.equal(typeof createReportsSweepHandler, 'function');
  const duplicate = { status: 'live', results: [{ status: 'live', snapshot: { status: 'duplicate' }, ai: { status: 'generated', replayed: true, attempted: false } }] };
  const quiet = createReportsSweepHandler({ guard: () => null, identity: () => actor, clock: () => now,
    run: async () => duplicate, record: () => assert.fail('no repeated log') });
  assert.equal((await (await quiet(req)).json()).automationLog, 'not-needed');
  const lost = createReportsSweepHandler({ guard: () => null, identity: () => actor, clock: () => now,
    run: async () => ({ status: 'live', results: [{ status: 'live', snapshot: { status: 'saved' }, ai: { status: 'disabled', attempted: false } }] }),
    record: async () => { throw Error('private logger exception'); } });
  const body = await (await lost(req)).json(); assert.equal(body.automationLog, 'error');
  assert.equal(JSON.stringify(body).includes('private logger exception'), false);
});
