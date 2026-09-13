import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let runner, transport;
try { runner = await import('./process.mjs'); transport = await import('./client.mjs'); } catch {}

test('worker transport sends only worker credential and retries the identical idempotent event', async () => {
  assert.ok(transport, 'worker transport must exist');
  const calls = [];
  const client = transport.createWorkerClient({ engineUrl: 'http://localhost:3001', workerToken: 'worker-secret' }, { sleep: async () => {}, fetch: async (url, init) => { calls.push({ url, init }); if (calls.length === 1) throw new Error('lost response'); return Response.json({ status: 'saved', seq: 2 }); } });
  assert.equal((await client.call('event', { id: 'job', leaseToken: 'lease', eventId: 'event-2', type: 'step', payload: {} })).seq, 2);
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(calls[0].init.headers.authorization, 'Bearer worker-secret');
  assert.equal(calls[0].url, 'http://localhost:3001/api/agent/worker');
});

test('production terminal status is persisted only after its SDK child has exited', async () => {
  assert.ok(runner);
  const dir = await mkdtemp(join(tmpdir(), 'moonlight-worker-finish-'));
  try {
    const path = join(dir, 'finish.mjs'), pidPath = join(dir, 'pid');
    await writeFile(path, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('message',message=>{if(message.type==='run')process.send({type:'finished',result:{status:'pending-finish',finish:{id:'job',leaseToken:'lease',state:'succeeded'}}},()=>process.disconnect());});`);
    let finishes = 0;
    const result = await runner.runJobProcess({ id: 'job', leaseToken: 'lease', mode: 'read', budget: { wallClockSeconds: 60 } }, {}, { childModule: path, client: { call: async (action, input) => {
      assert.equal(action, 'finish');
      const pid = Number(await readFile(pidPath, 'utf8'));
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      assert.equal(input.state, 'succeeded'); finishes++; return { status: 'saved' };
    } } });
    assert.equal(finishes, 1); assert.equal(result.status, 'saved');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('uncertain claim is never retried into another execution', async () => {
  assert.ok(transport);
  let calls = 0;
  const client = transport.createWorkerClient({ engineUrl: 'http://localhost:3001', workerToken: 'worker' }, { fetch: async () => { calls++; throw new Error('lost'); } });
  await assert.rejects(() => client.call('claim', {}));
  assert.equal(calls, 1);
});

test('hard watchdog kills a child that ignores abort before finishing and accepting another job', async () => {
  assert.ok(runner, 'SDK process supervisor must exist');
  const dir = await mkdtemp(join(tmpdir(), 'moonlight-worker-watchdog-'));
  try {
    const path = join(dir, 'ignore.mjs');
    await writeFile(path, "process.on('SIGTERM',()=>{});process.on('message',()=>{});setInterval(()=>{},1000);");
    const finishes = [];
    const result = await runner.runJobProcess({ id: 'job', leaseToken: 'lease', mode: 'apply', budget: { wallClockSeconds: 60 } }, {}, { childModule: path, wallClockMs: 50, graceMs: 20, client: { call: async (action, input) => { finishes.push({ action, input }); return { status: 'saved' }; } } });
    assert.equal(result.status, 'saved');
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0].input.state, 'needs_attention');
    assert.equal(finishes[0].input.error, 'worker-process-timeout');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
