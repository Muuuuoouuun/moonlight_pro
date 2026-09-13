import assert from 'node:assert/strict';
import { test } from 'node:test';
let runtime;
try { runtime = await import('./runtime.mjs'); } catch {}
const job = { id: '22222222-2222-4222-8222-222222222222', projectId: 'moonlight', mode: 'read', prompt: 'Review', contextRefs: [], leaseToken: '33333333-3333-4333-8333-333333333333', budget: { wallClockSeconds: 60, maxTokens: 1000, maxTurns: 3 } };
const prepared = { workingDirectory: '/registered/repo', prompt: 'Review', sdkOptions: { env: { PATH: '/bin', CODEX_HOME: '/isolated' } } };
function fixture(events) {
  const calls = [];
  let options, signal, resumed;
  const sdk = { startThread: (o) => { options = o; return thread; }, resumeThread: (id, o) => { resumed = id; options = o; return thread; } };
  const thread = { runStreamed: async (_, turn) => { signal = turn.signal; return { events: events(turn.signal) }; } };
  const client = { call: async (action, input) => { calls.push({ action, input }); return { status: 'saved', cancelRequestedAt: null }; } };
  return { calls, client, sdk, inspect: () => ({ options, signal, resumed }) };
}

test('streams thread/checkpoint and actual usage without persisting command output', async () => {
  assert.ok(runtime, 'worker runtime must exist');
  const f = fixture(async function* () {
    yield { type: 'thread.started', thread_id: 'thread-1' };
    yield { type: 'item.completed', item: { id: 'i', type: 'command_execution', command: 'cat .env', aggregated_output: 'SECRET', status: 'completed' } };
    yield { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'Reviewed' } };
    yield { type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 3, cached_input_tokens: 5 } };
  });
  await runtime.executeLeasedJob(job, { ...f, prepare: async () => prepared, heartbeatMs: 100000 });
  const finish = f.calls.find(c => c.action === 'finish').input;
  assert.equal(finish.state, 'succeeded');
  assert.equal(finish.threadId, 'thread-1');
  assert.equal(finish.usage.inputTokens, 12);
  assert.equal(finish.usage.cacheWriteInputTokens, null);
  assert.equal(finish.result.text, 'Reviewed');
  assert.ok(!JSON.stringify(f.calls).includes('SECRET'));
  assert.equal(f.inspect().options.sandboxMode, 'read-only');
  assert.equal(f.inspect().options.approvalPolicy, 'never');
  assert.equal(f.inspect().options.networkAccessEnabled, false);
  assert.equal(f.inspect().options.model, undefined);
});

test('missing usage remains null and resume uses only persisted thread ID', async () => {
  assert.ok(runtime);
  const f = fixture(async function* () { yield { type: 'turn.completed' }; });
  await runtime.executeLeasedJob({ ...job, threadId: 'thread-saved' }, { ...f, prepare: async () => prepared });
  const finish = f.calls.find(c => c.action === 'finish').input;
  assert.equal(finish.usage, null);
  assert.equal(finish.usageReason, 'not-reported');
  assert.equal(f.inspect().resumed, 'thread-saved');
});

test('wall clock abort reaches SDK and does not pretend an interrupted apply was rolled back', async () => {
  assert.ok(runtime);
  const f = fixture(async function* (signal) { await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); });
  await runtime.executeLeasedJob({ ...job, mode: 'apply' }, { ...f, prepare: async () => prepared, wallClockMs: 20 });
  assert.equal(f.inspect().signal.aborted, true);
  const finish = f.calls.find(c => c.action === 'finish').input;
  assert.equal(finish.state, 'needs_attention');
  assert.equal(finish.error, 'wall-clock-limit');
});

test('heartbeat cancellation aborts idle streams and lease loss forbids finish', async () => {
  assert.ok(runtime);
  for (const lost of [false, true]) {
    const f = fixture(async function* (signal) { await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); });
    const old = f.client.call;
    f.client.call = async (action, input) => action === 'heartbeat' ? (lost ? { status: 'error', code: 'lease-lost' } : { status: 'saved', cancelRequestedAt: '2026-09-13T00:00:00Z' }) : old(action, input);
    await runtime.executeLeasedJob(job, { ...f, prepare: async () => prepared, heartbeatMs: 10 });
    assert.equal(f.inspect().signal.aborted, true);
    assert.equal(f.calls.some(c => c.action === 'finish'), !lost);
    if (!lost) assert.equal(f.calls.find(c => c.action === 'finish').input.state, 'cancelled');
  }
});
