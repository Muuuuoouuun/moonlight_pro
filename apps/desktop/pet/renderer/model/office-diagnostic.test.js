'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./office-diagnostic');

const at = '2026-10-20T12:00:00.000Z', later = '2026-10-20T12:01:00.000Z';
const original = () => Object.freeze({ origin: 'https://hub.example.test', scope: 'personal', id: 'meeting-a',
  requestId: 'request-a', phase: 'send', message: '원래 질문 🌓', revision: 3, includeProjects: false });
const context = { connection: 2, selection: 7, account: 'synthetic-account-a' };
function detail(command, state = 'unknown', extra = {}) {
  return { meeting: { meetingId: command.id, scope: command.scope, revision: 100 },
    turns: [{ id: command.requestId, message: command.message, state, ...extra }], historyComplete: true, observedAt: at };
}
function observed(command = original(), state = 'unknown', extra = {}) {
  const started = D.begin(D.create(command, context), at);
  return D.finish(started.state, started.ticket, { kind: 'live', data: detail(command, state, extra) }, at).state;
}

test('only explicit versioned server evidence classifies unknown; finishedAt and age cannot', () => {
  for (const extra of [{}, { finishedAt: at }, { createdAt: '2020-01-01T00:00:00Z', finishedAt: at },
    { diagnostic: { version: 2, kind: 'finished-unknown', observedAt: at } },
    { diagnostic: { version: 1, kind: 'finished-unknown' } }]) {
    assert.equal(observed(original(), 'unknown', extra).lastObservation.classification, 'unclassified');
  }
  for (const kind of ['overdue-running', 'finished-unknown']) {
    const state = observed(original(), 'unknown', { diagnostic: { version: 1, kind, observedAt: at } });
    assert.equal(state.lastObservation.classification, kind);
    assert.match(D.describe(state).explanation, /확인되지 않았어요/);
  }
});

test('failed, offline, unauthorized, timeout, conflict and invalid reads retain the last valid observation', () => {
  for (const result of [{ kind: 'error', error: 'server', httpStatus: 502 }, { kind: 'error', error: 'offline' },
    { kind: 'error', error: 'timeout' }, { kind: 'conflict', httpStatus: 409 }, { kind: 'unauthorized' }, { kind: 'invalid' }]) {
    const before = observed(), started = D.begin(before, later);
    const after = D.finish(started.state, started.ticket, result, later);
    assert.equal(after.apply, false);
    assert.deepEqual(after.state.lastObservation, before.lastObservation);
    assert.equal(after.state.lastAttempt.startedAt, later);
    assert.equal(after.state.lastAttempt.receivedAt, later);
    assert.equal(D.describe(after.state).stale, true);
  }
});

test('partial-page absence and full-read absence never prove missing request or release state', () => {
  for (const complete of [false, undefined, true]) {
    const before = observed(), started = D.begin(before, later);
    const data = { ...detail(original()), turns: [], historyComplete: complete };
    const after = D.finish(started.state, started.ticket, { kind: 'live', data }, later);
    assert.equal(after.apply, false);
    assert.deepEqual(after.state.lastObservation, before.lastObservation);
    assert.equal(after.state.lastAttempt.outcome, complete ? 'not-observed' : 'partial');
  }
});

test('different origin, account, scope, meeting, request, connection or selection generation cannot apply', () => {
  const before = observed(), started = D.begin(before, later);
  for (const key of ['origin', 'account', 'scope', 'id', 'requestId', 'connection', 'selection']) {
    const ticket = { ...started.ticket, target: { ...started.ticket.target, [key]: 'another' } };
    const after = D.finish(started.state, ticket, { kind: 'live', data: detail(original(), 'generated') }, later);
    assert.equal(after.apply, false, key);
    assert.equal(after.state, started.state, key);
  }
});

test('matching receipt requires same meeting scope, ID, original question and request ID', () => {
  const before = observed();
  for (const change of [d => { d.meeting.scope = 'classin'; }, d => { d.meeting.meetingId = 'other'; },
    d => { d.turns[0].message = 'changed question'; }, d => { d.turns[0].id = 'other'; }]) {
    const started = D.begin(before, later), data = detail(original(), 'generated'); change(data);
    const after = D.finish(started.state, started.ticket, { kind: 'live', data }, later);
    assert.equal(after.apply, false);
    assert.deepEqual(after.state.lastObservation, before.lastObservation);
  }
});

test('reverse responses cannot replace a verified generated observation with unknown', () => {
  const first = D.begin(observed(), at), second = D.begin(first.state, later);
  const generated = D.finish(second.state, second.ticket, { kind: 'live', data: detail(original(), 'generated') }, later);
  assert.equal(generated.apply, true);
  const older = D.finish(generated.state, first.ticket, { kind: 'live', data: detail(original()) }, later);
  assert.equal(older.apply, false);
  assert.equal(older.state.lastObservation.state, 'generated');
  // Even a subsequently requested stale snapshot cannot regress completion.
  const third = D.begin(generated.state, later);
  const replay = D.finish(third.state, third.ticket, { kind: 'live', data: detail(original()) }, later);
  assert.equal(replay.apply, false);
  assert.equal(replay.state.lastObservation.state, 'generated');
  assert.equal(replay.state.lastAttempt.outcome, 'older-observation');
});

test('historical command fields and options are unchanged by repeated observation', () => {
  const command = original(), copy = structuredClone(command);
  let state = observed(command);
  for (let i = 0; i < 5; i++) {
    const started = D.begin(state, later);
    state = D.finish(started.state, started.ticket, { kind: 'live', data: detail(command) }, later).state;
  }
  assert.deepEqual(command, copy);
  assert.equal(command.revision, 3);
  assert.equal(state.target.requestId, command.requestId);
});

test('client observation age is a stale label only, and server time is never invented', () => {
  const command = original(), started = D.begin(D.create(command, context), at);
  const data = detail(command); delete data.observedAt;
  const state = D.finish(started.state, started.ticket, { kind: 'live', data }, at).state;
  assert.equal(state.lastObservation.serverObservedAt, null);
  assert.equal(D.describe(state, Date.parse(at)).stale, false);
  assert.equal(D.describe(state, Date.parse(later)).stale, true);
  assert.equal(state.lastObservation.classification, 'unclassified');
  const blocked = D.blocked(state, later);
  assert.deepEqual(blocked.lastObservation, state.lastObservation);
  assert.equal(blocked.lastAttempt.receivedAt, null, 'blocked check does not invent a response');
});
