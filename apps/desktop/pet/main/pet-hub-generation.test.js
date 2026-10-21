'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPetHub } = require('./pet-hub');

const question = { ownerId: 'eevee', scope: 'personal', message: '이전 연결에서 시작한 질문' };

function harness(t) {
  const calls = [];
  const hub = createPetHub({
    origin: 'https://original.example.test',
    fetch: async (url, init) => {
      calls.push({ url, method: init.method });
      return new Response(JSON.stringify({ status: 'error' }), { status: 503 });
    },
  });
  t.after(() => hub.dispose());
  return { hub, calls };
}

test('queued Council send never follows an origin replacement', async (t) => {
  const { hub, calls } = harness(t);
  const queued = hub.chatSend(question);
  await hub.setOrigin('https://replacement.example.test');
  assert.equal((await queued).error, 'stale-origin');
  assert.deepEqual(calls, [], 'the old question must not reach the replacement Hub');
});

test('queued Council send never follows a same-origin session replacement', async (t) => {
  const { hub, calls } = harness(t);
  const queued = hub.chatSend(question);
  await hub.sessionChanged();
  assert.equal((await queued).error, 'stale-origin');
  assert.equal(calls.filter(call => call.method === 'POST').length, 0,
    'a replacement session may probe but cannot inherit an old send');
});

test('disposing the connection invalidates a queued Council send', async (t) => {
  const { hub, calls } = harness(t);
  const queued = hub.chatSend(question);
  hub.dispose();
  assert.equal((await queued).error, 'stale-origin');
  assert.deepEqual(calls, []);
});

test('queued polling never reads a replacement origin before its own poll', async (t) => {
  const { hub, calls } = harness(t);
  const queued = hub.tick();
  await hub.setOrigin('https://replacement.example.test');
  assert.equal((await queued).skipped, true);
  assert.deepEqual(calls, [], 'an invalidated tick must not read from the new connection');
});
