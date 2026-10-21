'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHubClient } = require('./pet-hub-client');
const { createOfficeApi } = require('./pet-office-api');
const scope = 'personal';
const item = (changes = {}) => ({ requestId: randomUUID(), intent: 'weekly_report', scope,
  originRef: { periodStart: '2026-10-12', periodEnd: '2026-10-18', timezone: 'Asia/Seoul' }, ownerId: 'eevee', mode: 'draft',
  participants: [], createdAt: '2026-10-18T01:02:03.123456Z', status: 'generated', state: 'generated', expired: false, ...changes });
const page = rows => ({ status: 'ready', source: 'live', items: rows, hasMore: false, nextCursor: null });
function setup(replies) {
  const calls = [];
  const client = createHubClient({ origin: 'https://office.example.test', cookieHeader: async () => 'operator=test',
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
      const next = replies.shift();
      if (!next) throw new Error('Unexpected request');
      return new Response(JSON.stringify(next), { status: 200 });
    } });
  return { api: createOfficeApi(client), calls };
}
const reject = promise => assert.rejects(promise, e => ['invalid', 'error', 'preview', 'unauthorized'].includes(e.kind));
test('Office metadata and microsecond cursor ordering retain the real scope and request identity', async () => {
  const first = item(), second = item({ createdAt: '2026-10-18T01:02:03.123455Z' });
  const { api, calls } = setup([{ ...page([first]), hasMore: true, nextCursor: { createdAt: first.createdAt, id: first.requestId } }, page([second])]);
  const a = await api.inbox({ scope });
  assert.deepEqual(a.items, [first]);
  assert.deepEqual((await api.inbox({ scope, cursor: a.nextCursor })).items, [second]);
  assert.ok(calls.every(c => c.method === 'GET' && c.headers.cookie === 'operator=test'));
  const cursor = JSON.parse(Buffer.from(new URL(calls[1].url).searchParams.get('cursor'), 'base64url'));
  assert.equal(cursor.createdAt, first.createdAt);
});
test('Inbox rejects payload leaks, another scope, duplicate rows, bad order, and false cursors', async () => {
  const row = item();
  for (const response of [page([{ ...row, result: 'private body' }]), page([{ ...row, scope: 'classin' }]), page([row, row]),
    page([row, item({ createdAt: '2026-10-18T01:02:03.123457Z' })]), { ...page([row]), hasMore: true },
    { ...page([row]), nextCursor: { id: row.requestId, createdAt: row.createdAt } },
    page([{ ...row, originRef: { ...row.originRef, periodEnd: '2026-10-19' } }])]) {
    await reject(setup([response]).api.inbox({ scope }));
  }
});
test('Receipt binds the selected identity and hides expired bodies', async () => {
  const row = item();
  const result = { version: '2026-09-21.v1', status: 'generated', resultRevision: 1, requestId: row.requestId,
    scope, ownerId: row.ownerId, mode: row.mode, participants: [], artifact: { kind: 'markdown', body: '검증할 원문' } };
  const response = { ...row, resultRevision: 1, persistence: { persisted: true }, result };
  assert.equal((await setup([response]).api.receipt({ item: row })).body, result.artifact.body);
  await reject(setup([{ ...response, result: { ...result, scope: 'classin' } }]).api.receipt({ item: row }));
  await reject(setup([{ ...response, ownerId: 'glaceon' }]).api.receipt({ item: row }));
  const expired = { ...response, state: 'expired', status: 'expired', expired: true };
  assert.equal((await setup([expired]).api.receipt({ item: row })).body, null);
});
function conversation(id = randomUUID()) {
  return { status: 'ready', persisted: true, meeting: { meetingId: id, title: '저장된 대화', scope, ownerId: 'eevee', reviewers: [],
    mode: 'chat', revision: 1, state: 'open', createdAt: '2026-10-18T01:00:00Z', updatedAt: '2026-10-18T01:00:00Z' }, turns: [] };
}
test('Durable conversations reject another meeting/scope and forged generated answers', async () => {
  const d = conversation();
  assert.equal((await setup([d]).api.detail({ id: d.meeting.meetingId, scope })).meeting.title, d.meeting.title);
  await reject(setup([d]).api.detail({ id: randomUUID(), scope }));
  await reject(setup([d]).api.detail({ id: d.meeting.meetingId, scope: 'classin' }));
  const turn = { id: randomUUID(), roundNumber: 1, state: 'generated', request: { message: '질문', ownerId: 'eevee', mode: 'chat' },
    result: { answer: '답변', nextAction: '확인', scope: 'classin', ownerId: 'eevee', mode: 'chat' } };
  await reject(setup([{ ...d, turns: [turn] }]).api.detail({ id: d.meeting.meetingId, scope }));
});
test('Sending is an explicit POST with original request ID/version; recovery is read only', async () => {
  const d = conversation(), requestId = randomUUID(), message = '질문';
  const turn = { id: requestId, roundNumber: 1, state: 'running', request: { message, ownerId: 'eevee', mode: 'chat' } };
  const running = { ...d, status: 'running', turns: [turn] };
  const { api, calls } = setup([running, { ...running, status: 'ready' }]);
  const command = { id: d.meeting.meetingId, scope, requestId, revision: 1, message };
  assert.equal((await api.send(command)).turns[0].state, 'running');
  await api.detail({ id: command.id, scope });
  assert.deepEqual(calls.map(c => c.method), ['POST', 'GET']);
  assert.deepEqual(calls[0].body, { requestId, expectedRevision: 1, message, includeProjects: false });
  assert.equal(calls[0].headers.origin, 'https://office.example.test');
});
test('Creating a conversation verifies its identity without generating a reply', async () => {
  const d = conversation(), { api, calls } = setup([d]);
  await api.create({ id: d.meeting.meetingId, scope, title: d.meeting.title, ownerId: 'eevee' });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/api/hub/office/meetings');
  assert.deepEqual(calls[0].body.reviewers, []);
  assert.equal(calls[0].body.mode, 'chat');
});
test('Conversation pagination retains the server cursor and rejects a mismatched last row', async () => {
  const d = conversation(), point = { meetingId: d.meeting.meetingId, updatedAt: d.meeting.updatedAt };
  const cursor = Buffer.from(JSON.stringify(point)).toString('base64url');
  const { api, calls } = setup([{ status: 'ready', meetings: [d.meeting], nextCursor: cursor }, { status: 'ready', meetings: [], nextCursor: null }]);
  const first = await api.meetings({ scope });
  assert.equal(first.hasMore, true);
  await api.meetings({ scope, cursor: first.nextCursor });
  assert.equal(new URL(calls[1].url).searchParams.get('cursor'), cursor);
  const wrong = Buffer.from(JSON.stringify({ ...point, meetingId: randomUUID() })).toString('base64url');
  await reject(setup([{ status: 'ready', meetings: [d.meeting], nextCursor: wrong }]).api.meetings({ scope }));
});
test('HTTP-200 error and preview cannot become an empty successful Office list', async () => {
  for (const status of ['error', 'preview', 'unknown']) await reject(setup([{ ...page([]), status }]).api.inbox({ scope }));
});

test('full meeting projection preserves receipts and optional explicit unknown diagnostics without inferring from finishedAt', () => {
  const { meetingDetail } = require('./pet-office-api');
  const d = conversation(), requestId = randomUUID(), observedAt = '2026-10-20T01:00:00Z';
  d.observedAt = observedAt; d.meeting.decisionContext = '보존할 문맥'; d.skillRequests = [{ receipt: { body: '원본 영수증' } }];
  d.turns = [{ id: requestId, roundNumber: 1, state: 'unknown', request: { message: '질문', ownerId: 'eevee', mode: 'chat' },
    createdAt: observedAt, finishedAt: observedAt, diagnostic: { version: 1, kind: 'finished-unknown', observedAt } }];
  const result = meetingDetail(d, d.meeting.meetingId, scope);
  assert.deepEqual(result.turns[0].diagnostic, d.turns[0].diagnostic);
  assert.deepEqual(result.skillRequests, d.skillRequests); assert.equal(result.meeting.decisionContext, d.meeting.decisionContext);
  assert.equal(result.unresolved.total, 1); assert.equal(result.historyComplete, true);
  for (const diagnostic of [undefined, { version: 1, kind: 'finished-unknown', observedAt: 'bad' }, { version: 2, kind: 'finished-unknown', observedAt }]) {
    d.turns[0].diagnostic = diagnostic;
    assert.equal(meetingDetail(d, d.meeting.meetingId, scope).turns[0].diagnostic, null);
  }
  assert.throws(() => meetingDetail({ ...d, historyComplete: false }, d.meeting.meetingId, scope));
});
