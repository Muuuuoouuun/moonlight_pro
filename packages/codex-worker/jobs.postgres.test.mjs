import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const enabled = process.env.CODEX_JOBS_POSTGRES_TEST === '1';
const migration = new URL('../../supabase/migrations/20260913_0033_agent_jobs.sql', import.meta.url);
let directory;
const literal = v => `'${String(v).replaceAll("'", "''")}'`;
async function sql(query) { const { stdout } = await exec('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-d', 'postgres', '-c', query]); return stdout.trim(); }
const call = (fn, workspace, who, action, input = {}) => sql(`select public.${fn}('${workspace}',${literal(who)},${literal(action)},${literal(JSON.stringify(input))}::jsonb)`).then(JSON.parse);
const hub = (w, action, input = {}, actor = 'codex') => call('agent_jobs_v1', w, actor, action, input);
const worker = (w, action, input = {}, who = 'worker') => call('agent_worker_v1', w, who, action, input);
const projects = [{ id: 'repo', modes: ['read', 'draft', 'apply'] }];
async function workspace() { const id = randomUUID(); await sql(`insert into workspaces values ('${id}')`); return id; }
const submission = (mode = 'read') => ({ requestId: randomUUID(), requestHash: 'a'.repeat(64), projectId: 'repo', mode, prompt: 'Review Korean 한글 task', contextRefs: [], budget: { wallClockSeconds: 60, maxTokens: null, maxTurns: 3 }, queueIfOffline: true });

test('durable job migration exists', async () => { let text; try { text = await readFile(migration, 'utf8'); } catch {} assert.ok(text, 'agent jobs migration must exist'); });
before(async () => {
  if (!enabled) return;
  directory = await mkdtemp(join(tmpdir(), 'moonlight-jobs-pg-'));
  await exec('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses='' -F`, '-w', 'start']);
  await sql(`create role anon; create role authenticated; create role service_role; create table workspaces(id uuid primary key); create table agent_runs(id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces(id),agent text,mode text,ref text,input_summary text,recommendation jsonb,result text);`);
  await sql(await readFile(migration, 'utf8'));
});
after(async () => { if (directory) { await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']).catch(() => {}); await rm(directory, { recursive: true, force: true }); } });

test('durable duplicate IDs, offline intent, actor and workspace boundaries', { skip: !enabled }, async () => {
  const w = await workspace(), input = submission();
  assert.equal((await hub(w, 'submit', { ...input, queueIfOffline: false })).code, 'worker-offline');
  const first = await hub(w, 'submit', input);
  assert.equal(first.status, 'accepted');
  assert.equal((await hub(w, 'submit', input)).job.id, first.job.id);
  assert.equal((await hub(w, 'submit', { ...input, requestHash: 'b'.repeat(64) })).code, 'request-conflict');
  assert.equal((await hub(w, 'get', { id: first.job.id }, 'someone-else')).code, 'not-found');
  assert.equal((await hub(await workspace(), 'get', { id: first.job.id })).code, 'not-found');
});

test('one atomic lease, fencing, heartbeat, idempotent ordered events and saved summary', { skip: !enabled }, async () => {
  const w = await workspace();
  await hub(w, 'submit', submission());
  const claims = await Promise.all([worker(w, 'claim', { projects }, 'one'), worker(w, 'claim', { projects }, 'two')]);
  assert.equal(claims.filter(c => c.job).length, 1);
  const index = claims.findIndex(c => c.job), who = index === 0 ? 'one' : 'two', job = claims[index].job;
  const lease = { id: job.id, leaseToken: job.leaseToken };
  assert.equal((await worker(w, 'heartbeat', { ...lease, leaseToken: randomUUID() }, who)).code, 'lease-lost');
  const event = { ...lease, eventId: 'event-1', type: 'thread.started', payload: { threadId: 'thread-one' }, threadId: 'thread-one' };
  const e = await worker(w, 'event', event, who);
  assert.equal((await worker(w, 'event', event, who)).seq, e.seq);
  const rows = await hub(w, 'events', { id: job.id, after: 0, limit: 50 });
  assert.equal(new Set(rows.events.map(e => e.seq)).size, rows.events.length);
  assert.equal((await hub(w, 'events', { id: job.id, after: rows.nextAfter, limit: 50 })).events.length, 0);
  const finish = await worker(w, 'finish', { ...lease, state: 'succeeded', result: { text: 'done' }, usage: null, usageReason: 'not-reported' }, who);
  assert.equal(finish.job.usage, null);
  assert.equal(finish.job.threadId, 'thread-one');
  assert.equal(await sql(`select count(*) from agent_runs where workspace_id='${w}'`), '1');
});

test('expired read can retry once; expired apply requires persisted reconciliation', { skip: !enabled }, async () => {
  for (const mode of ['read', 'apply']) {
    const w = await workspace();
    await hub(w, 'submit', submission(mode));
    const { job } = await worker(w, 'claim', { projects });
    await worker(w, 'event', { id: job.id, leaseToken: job.leaseToken, eventId: 'thread', type: 'thread.started', payload: {}, threadId: 'thread-known' });
    await sql(`update agent_jobs set lease_expires_at=now()-interval '1 second' where id='${job.id}'`);
    const claimed = await worker(w, 'claim', { projects });
    if (mode === 'read') {
      assert.equal(claimed.job.id, job.id); assert.equal(claimed.job.attempt, 2);
      assert.notEqual(claimed.job.leaseToken, job.leaseToken);
      assert.equal((await worker(w, 'event', { id: job.id, leaseToken: job.leaseToken, eventId: 'late', type: 'late', payload: {} })).code, 'lease-lost');
      await sql(`update agent_jobs set lease_expires_at=now()-interval '1 second' where id='${job.id}'`);
      assert.equal((await worker(w, 'claim', { projects })).job, null);
    } else {
      assert.equal(claimed.job, null);
      assert.equal((await hub(w, 'get', { id: job.id })).job.state, 'needs_attention');
      const resume = { id: job.id, queueIfOffline: true, requestId: randomUUID(), requestHash: 'c'.repeat(64), expectedTurnCount: 1 };
      assert.equal((await hub(w, 'resume', resume)).code, 'reconciliation-required');
      assert.equal((await hub(w, 'resume', { ...resume, reconciliation: { confirmed: true, note: 'Checked receipts and changed files', checkedThreadId: 'wrong' } })).code, 'reconciliation-required');
      assert.equal((await hub(w, 'resume', { ...resume, reconciliation: { confirmed: true, note: 'Checked receipts and changed files', checkedThreadId: 'thread-known' } })).job.state, 'queued');
      assert.equal((await worker(w, 'claim', { projects })).job.threadId, 'thread-known');
    }
  }
});

test('cancel is a request until worker acknowledges; tables and RPCs are service-only', { skip: !enabled }, async () => {
  const w = await workspace(); await hub(w, 'submit', submission());
  const { job } = await worker(w, 'claim', { projects });
  const cancelled = await hub(w, 'cancel', { id: job.id, expectedTurnCount: 1 });
  assert.equal(cancelled.job.state, 'running'); assert.ok(cancelled.job.cancelRequestedAt);
  const ack = await worker(w, 'heartbeat', { id: job.id, leaseToken: job.leaseToken });
  assert.ok(ack.cancelRequestedAt);
  assert.equal((await worker(w, 'finish', { id: job.id, leaseToken: job.leaseToken, state: 'cancelled' })).job.state, 'cancelled');
  assert.equal(await sql("select has_function_privilege('anon','agent_worker_v1(uuid,text,text,jsonb)','EXECUTE')"), 'f');
  assert.equal(await sql("select has_function_privilege('authenticated','agent_jobs_v1(uuid,text,text,jsonb)','EXECUTE')"), 'f');
  assert.equal(await sql("select has_function_privilege('service_role','agent_jobs_v1(uuid,text,text,jsonb)','EXECUTE')"), 't');
  assert.equal(await sql("select bool_and(relrowsecurity) from pg_class where oid in ('agent_jobs'::regclass,'agent_job_events'::regclass,'agent_workers'::regclass)"), 't');
});

test('resume receipt survives completion; stale cancellation cannot cancel another turn', { skip: !enabled }, async () => {
  const w = await workspace(); await hub(w, 'submit', submission());
  const { job } = await worker(w, 'claim', { projects });
  await worker(w, 'finish', { id: job.id, leaseToken: job.leaseToken, state: 'succeeded' });
  const continuation = { id: job.id, requestId: randomUUID(), requestHash: 'd'.repeat(64), expectedTurnCount: 1, queueIfOffline: true };
  assert.equal((await hub(w, 'resume', continuation)).job.turnCount, 2);
  const second = (await worker(w, 'claim', { projects })).job;
  await worker(w, 'finish', { id: job.id, leaseToken: second.leaseToken, state: 'succeeded' });
  assert.equal((await hub(w, 'resume', continuation)).status, 'duplicate');
  assert.equal((await hub(w, 'resume', { ...continuation, requestHash: 'e'.repeat(64) })).code, 'request-conflict');
  assert.equal((await hub(w, 'get', { id: job.id })).job.turnCount, 2);
  const third = { ...continuation, requestId: randomUUID(), expectedTurnCount: 2 };
  await hub(w, 'resume', third);
  assert.equal((await hub(w, 'cancel', { id: job.id, expectedTurnCount: 2 })).code, 'stale-job-turn');
  assert.equal((await hub(w, 'get', { id: job.id })).job.state, 'queued');
});

test('reported usage survives a worker stop and resume checks the actual target registry', { skip: !enabled }, async () => {
  const w = await workspace(); await hub(w, 'submit', submission());
  const { job } = await worker(w, 'claim', { projects });
  await worker(w, 'event', { id: job.id, leaseToken: job.leaseToken, eventId: 'usage', type: 'turn.completed', payload: { usage: { inputTokens: 18, outputTokens: 2, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null } } });
  const finished = await worker(w, 'finish', { id: job.id, leaseToken: job.leaseToken, state: 'failed', usage: null, usageReason: 'not-reported', error: 'worker-process-stopped' });
  assert.equal(finished.job.usage.inputTokens, 18);
  assert.equal(finished.job.usageReason, 'reported');
  await worker(w, 'pulse', { projects: [{ id: 'other', modes: ['read'] }] });
  assert.equal((await hub(w, 'resume', { id: job.id, requestId: randomUUID(), requestHash: 'f'.repeat(64), expectedTurnCount: 1, queueIfOffline: false })).code, 'worker-offline');
});
