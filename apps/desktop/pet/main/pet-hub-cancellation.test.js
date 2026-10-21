'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPetHub } = require('./pet-hub');

const origin = 'https://hub.example.test';
const question = { ownerId: 'eevee', scope: 'personal', message: '준비를 기다리던 질문' };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function response(body, answer = '확인한 답변') {
  return new Response(JSON.stringify({ status: 'generated', version: '2026-09-22.v3',
    ownerId: body.ownerId, scope: body.scope, mode: 'chat', lens: null, simulation: false,
    participants: [], answer, nextAction: '검토하기', context: { source: 'provided', scope: body.scope, projects: [], note: '입력 기준' },
    log: { persisted: false, runId: null }, businessWrites: false }));
}
function harness(t, { holdReplies = false } = {}) {
  const ready = deferred();
  const calls = [], replies = [], events = [];
  const hub = createPetHub({ origin,
    store: { get: async key => { if (key === `petHub.pending.v1.${origin}`) await ready.promise; return null; }, set: async () => {} },
    onEvent: (name, payload) => events.push({ name, payload }),
    fetch: async (url, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, method: init.method, body, signal: init.signal });
      if (init.method !== 'POST') return new Response(JSON.stringify({ status: 'anonymous', configured: true }));
      if (!holdReplies) return response(body);
      const gate = deferred(); replies.push({ gate, body });
      return gate.promise;
    },
  });
  t.after(() => { ready.resolve(); for (const entry of replies) entry.gate.resolve(response(entry.body)); hub.dispose(); });
  return { hub, ready, calls, replies, events };
}
const posts = calls => calls.filter(call => call.method === 'POST');

test('cancel during connection preparation invalidates the queued send before any POST', async t => {
  const { hub, ready, calls } = harness(t);
  const pending = hub.chatSend(question);
  const cancelled = await hub.chatCancel();
  ready.resolve();
  const result = await pending;
  assert.deepEqual({ cancelled: cancelled.data.cancelled, error: result.error, posts: posts(calls).length },
    { cancelled: true, error: 'cancelled', posts: 0 });
});

test('repeated cancel is idempotent and an explicit replacement send may start before preparation completes', async t => {
  const { hub, ready, calls } = harness(t);
  const old = hub.chatSend(question);
  const first = await hub.chatCancel();
  const repeated = await hub.chatCancel();
  const newer = hub.chatSend({ ...question, message: '명시적으로 다시 보낸 질문' });
  ready.resolve();
  const [oldResult, newResult] = await Promise.all([old, newer]);
  assert.equal(first.data.cancelled, true);
  assert.equal(repeated.data.cancelled, false);
  assert.equal(oldResult.error, 'cancelled');
  assert.equal(newResult.kind, 'live');
  assert.deepEqual(posts(calls).map(call => call.body.message), ['명시적으로 다시 보낸 질문']);
  assert.equal((await hub.chatCancel()).data.cancelled, false);
});

test('one send reservation covers preparation as well as the network request', async t => {
  const { hub, ready, calls } = harness(t);
  const first = hub.chatSend(question);
  let duplicate;
  const second = hub.chatSend({ ...question, message: '중복 클릭' }).then(value => { duplicate = value; return value; });
  await tick();
  const rejectedBeforeReady = duplicate?.error;
  ready.resolve();
  await Promise.all([first, second]);
  assert.equal(rejectedBeforeReady, 'busy');
  assert.equal(posts(calls).length, 1);
});

test('an old queued completion cannot clear or cancel the newer in-flight request', async t => {
  const { hub, ready, calls, replies } = harness(t, { holdReplies: true });
  const old = hub.chatSend(question);
  await hub.chatCancel();
  const newer = hub.chatSend({ ...question, message: '새로 보낸 질문' });
  ready.resolve();
  await tick();
  // Release all transport gates so the pre-fix reproduction cannot hang.
  const oldRace = await Promise.race([old, Promise.resolve(null)]);
  const state = await hub.chatSession(question);
  const duplicate = hub.chatSend({ ...question, message: '진행 중 중복' });
  const cancelled = await hub.chatCancel();
  for (const entry of replies) entry.gate.resolve(response(entry.body, '늦은 답변'));
  const [oldResult, newResult, duplicateResult] = await Promise.all([old, newer, duplicate]);
  assert.equal(oldRace?.error, 'cancelled');
  assert.equal(oldResult.error, 'cancelled');
  assert.equal(state.data.busyWith.message, '새로 보낸 질문');
  assert.equal(duplicateResult.error, 'busy');
  assert.equal(cancelled.data.cancelled, true);
  assert.equal(newResult.error, 'cancelled');
  assert.deepEqual(posts(calls).map(call => call.body.message), ['새로 보낸 질문']);
  assert.deepEqual((await hub.chatSession(question)).data.turns, []);
});

test('origin replacement releases old preparation reservation without waiting for old storage', async t => {
  const { hub, ready, calls } = harness(t);
  const old = hub.chatSend(question);
  await hub.setOrigin('https://replacement.example.test');
  const newer = await hub.chatSend({ ...question, message: '새 허브 질문' });
  ready.resolve();
  assert.equal((await old).error, 'stale-origin');
  assert.equal(newer.kind, 'live');
  assert.deepEqual(posts(calls).map(call => new URL(call.url).origin), ['https://replacement.example.test']);
});

test('same-origin session replacement invalidates the old reservation and admits an explicit new send', async t => {
  const { hub, ready, calls } = harness(t);
  const old = hub.chatSend(question);
  const changed = hub.sessionChanged();
  const newer = hub.chatSend({ ...question, message: '새 세션 질문' });
  ready.resolve();
  const [oldResult, newResult] = await Promise.all([old, newer, changed]);
  assert.equal(oldResult.error, 'stale-origin');
  assert.equal(newResult.kind, 'live');
  assert.deepEqual(posts(calls).map(call => call.body.message), ['새 세션 질문']);
});

test('dispose invalidates queued sends and leaves no cancellable reservation', async t => {
  const { hub, ready, calls } = harness(t);
  const old = hub.chatSend(question);
  hub.dispose();
  const cancelled = await hub.chatCancel();
  ready.resolve();
  assert.equal((await old).error, 'stale-origin');
  assert.equal(cancelled.data.cancelled, false);
  assert.equal(posts(calls).length, 0);
});

test('in-flight cancellation keeps abort behavior and ignores a late reply after a new send', async t => {
  const { hub, ready, calls, replies, events } = harness(t, { holdReplies: true });
  ready.resolve();
  const old = hub.chatSend(question);
  await tick();
  const cancelled = await hub.chatCancel();
  const newer = hub.chatSend({ ...question, message: '취소 후 새 질문' });
  await tick();
  replies[0].gate.resolve(response(replies[0].body, '취소된 늦은 답'));
  const oldResult = await old;
  const busy = (await hub.chatSession(question)).data.busy;
  replies[1].gate.resolve(response(replies[1].body, '새 요청의 답'));
  const newerResult = await newer;
  assert.equal(cancelled.data.cancelled, true);
  assert.equal(posts(calls)[0].signal.aborted, true);
  assert.equal(oldResult.error, 'cancelled');
  assert.equal(busy, true);
  assert.equal(newerResult.data.turn.text, '새 요청의 답');
  assert.deepEqual(events.filter(entry => entry.name === 'pet:chat-reply').map(entry => entry.payload.turn.text), ['새 요청의 답']);
  assert.deepEqual((await hub.chatSession(question)).data.turns.map(turn => turn.text), ['취소 후 새 질문', '새 요청의 답']);
});
