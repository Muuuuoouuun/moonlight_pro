import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetingReviewService, normalizeMeetingAnalysis } from './meeting-review-service.js';

const workspace = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const proposalId = '44444444-4444-4444-8444-444444444444';
const source = '고객은 🌓 다음 주 연락을 요청했다.';
const quote = '다음 주 연락을 요청했다.';
const start = source.indexOf(quote);
const candidate = { kind: 'action', text: '고객에게 연락', quote, start, end: start + quote.length, certainty: 'stated' };
const extracted = { ok: true, data: { summary: '후속 연락 요청', proposals: [candidate] }, usage: { promptTokens: 12, candidatesTokens: null, totalTokens: 18 }, model: 'test-model' };
const snapshot = (state = 'ready') => ({ status: 'live', entryId, revision: 1,
  run: { requestId, state, sourceRevision: 1, stale: false, summary: '후속 연락 요청', model: 'test-model' },
  proposals: [{ id: proposalId, kind: 'action', text: '고객에게 연락', source: { start, end: start + quote.length, quote }, certainty: 'stated',
    review: { status: 'pending', text: '고객에게 연락', edited: false }, application: { status: 'none' } }],
  usage: { status: 'known', promptTokens: 12, candidatesTokens: null, totalTokens: 18 } });
const configured = { configured: () => true, workspaceId: () => workspace, providerConfigured: () => true };

test('model proposal must match exact Unicode source offsets before persistence', () => {
  assert.equal(normalizeMeetingAnalysis(extracted, source).proposals[0].start, start);
  assert.equal(normalizeMeetingAnalysis(extracted, source).usage.candidatesTokens, null);
  assert.equal(normalizeMeetingAnalysis({ ...extracted, data: { ...extracted.data, proposals: [{ ...candidate, start: start + 1 }] } }, source), null);
  assert.equal(normalizeMeetingAnalysis({ ...extracted, data: { ...extracted.data, proposals: [{ ...candidate, quote: '없는 말' }] } }, source), null);
});

test('manual analyze reserves a durable request, calls provider once, and returns saved receipt', async () => {
  const calls = [];
  let generated = 0;
  const service = createMeetingReviewService({ ...configured,
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'meeting_review_claim_v1') return { ok: true, data: { status: 'claimed', sourceBody: source } };
      if (name === 'meeting_review_finish_v2') return { ok: true, data: { status: 'saved', snapshot: snapshot() } };
      throw Error('unexpected RPC');
    },
    extract: async () => { generated++; return extracted; },
  });
  const result = await service.analyze({ entryId, requestId, expectedRevision: 1 });
  assert.equal(result.status, 'saved');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.proposals[0].source.quote, quote);
  assert.equal(generated, 1);
  assert.deepEqual(calls.map(([name]) => name), ['meeting_review_claim_v1', 'meeting_review_finish_v2']);
  assert.equal(calls[1][1].p_result.usage.candidatesTokens, null);
});

test('same requestId receipt never calls the provider again, including unknown runs', async () => {
  let generated = 0;
  let state = 'ready';
  const service = createMeetingReviewService({ ...configured,
    rpc: async (name) => name === 'meeting_review_claim_v1'
      ? { ok: true, data: { status: 'existing', snapshot: snapshot(state) } }
      : { ok: true, data: snapshot(state) },
    extract: async () => { generated++; return extracted; },
  });
  const input = { entryId, requestId, expectedRevision: 1 };
  assert.equal((await service.analyze(input)).status, 'duplicate');
  state = 'unknown';
  const pending = await service.analyze(input);
  assert.equal(pending.status, 'unknown');
  assert.equal(pending.httpStatus, 202);
  assert.equal(pending.retryable, false);
  assert.equal(generated, 0);
});

test('provider error is written as a failed receipt and never reported as saved', async () => {
  let finished;
  const service = createMeetingReviewService({ ...configured,
    rpc: async (name, args) => name === 'meeting_review_claim_v1'
      ? { ok: true, data: { status: 'claimed', sourceBody: source } }
      : (finished = args.p_result, { ok: true, data: { status: 'saved', snapshot: snapshot('error') } }),
    extract: async () => ({ ok: false, reason: 'provider-unavailable' }),
  });
  const result = await service.analyze({ entryId, requestId, expectedRevision: 1 });
  assert.equal(finished.state, 'error');
  assert.equal(result.status, 'error');
  assert.equal(result.httpStatus, 502);
});

test('uncertain claim never dispatches the model, preview never creates a claim', async () => {
  let generated = 0;
  const uncertain = createMeetingReviewService({ ...configured, rpc: async () => ({ ok: false }), extract: async () => { generated++; return extracted; } });
  assert.equal((await uncertain.analyze({ entryId, requestId, expectedRevision: 1 })).status, 'unknown');
  assert.equal(generated, 0);
  const preview = createMeetingReviewService({ ...configured, configured: () => false,
    rpc: async () => { throw Error('must not call'); } });
  assert.equal((await preview.analyze({ entryId, requestId, expectedRevision: 1 })).status, 'preview');
  assert.equal((await preview.get(entryId)).status, 'preview');
});

test('read uses the error envelope; review persists accepted edit and exposes duplicate', async () => {
  const unavailable = createMeetingReviewService({ ...configured, rpc: async () => ({ ok: false }) });
  const read = await unavailable.get(entryId);
  assert.equal(read.status, 'error');
  assert.deepEqual(read.proposals, []);
  const calls = [];
  const service = createMeetingReviewService({ ...configured, rpc: async (name, args) => {
    calls.push([name, args]);
    return { ok: true, data: { status: calls.length === 1 ? 'saved' : 'duplicate', snapshot: snapshot() } };
  } });
  const execution = { actionScope: 'mine', dueAt: '2026-09-30', method: '전화', checklist: [] };
  const input = { entryId, proposalId, decision: 'accepted', editedText: '후속 연락하기', execution };
  assert.equal((await service.review(input)).status, 'saved');
  assert.equal((await service.review(input)).status, 'duplicate');
  assert.equal(calls[0][1].p_edited_text, '후속 연락하기');
  assert.deepEqual(calls[0][1].p_execution, execution);
});

test('action details require exact nested source spans and valid review execution', async () => {
  const grounded = { ...candidate, actionScope: 'mine', relation: { quote: '요청했다.', start: source.indexOf('요청했다.'), end: source.indexOf('요청했다.') + '요청했다.'.length },
    dateMentions: [], methodQuote: null, checklist: [] };
  assert.equal(normalizeMeetingAnalysis({ ...extracted, data: { summary: '요약', proposals: [grounded] } }, source).proposals[0].actionScope, 'mine');
  assert.equal(normalizeMeetingAnalysis({ ...extracted, data: { summary: '요약', proposals: [{ ...grounded, relation: { ...grounded.relation, start: 0 } }] } }, source), null);
  const calls = [];
  const service = createMeetingReviewService({ ...configured, rpc: async (name, args) => {
    calls.push([name, args]); return { ok: true, data: { status: 'saved', snapshot: snapshot() } };
  } });
  assert.equal((await service.review({ entryId, proposalId, decision: 'accepted', editedText: '연락', execution: {
    actionScope: 'mine', dueAt: '2026-02-31', method: null, checklist: [],
  } })).status, 'invalid-input');
  assert.equal((await service.review({ entryId, proposalId, decision: 'accepted', editedText: '연락', execution: {
    actionScope: 'mine', dueAt: null, method: null, checklist: [{ id: proposalId, title: '단계', done: true, note: '' }],
  } })).status, 'invalid-input');
  assert.equal((await service.review({ entryId, proposalId, decision: 'accepted', editedText: '연락', execution: {
    actionScope: 'mine', dueAt: null, method: null, checklist: [{ id: proposalId, title: 7, done: false, note: '' }],
  } })).status, 'invalid-input');
  assert.equal(calls.length, 0);
});
