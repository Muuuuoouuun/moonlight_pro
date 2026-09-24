import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOfficeMentorQuestion, buildOfficeMentorRequest, requestOfficeMentor } from './office-mentor-client.js';

const requestId = '10000000-0000-4000-8000-000000000001';
const runId = '20000000-0000-4000-8000-000000000002';
const officeSource = { requestId, runId };
const officeResult = (scope = 'personal') => ({
  status: 'generated', scope,
  answer: '제품 약속을 이번 주에는 좁혀야 합니다.',
  recommendation: '한 문장으로 검증합니다.',
  evidence: ['독자 인터뷰 세 건', '발행 기록 두 건'],
  dissent: ['일부는 기능 확장을 원합니다.'],
  nextAction: '약속 문장을 다시 읽습니다.',
});

test('personal Office result routes to brand office-review with its provenance and no synthetic card', () => {
  const request = buildOfficeMentorRequest({ result: officeResult(), officeSource, scope: 'personal' });
  assert.equal(request.endpoint, '/api/hub/brand-mentor');
  assert.equal(request.lane, 'personal');
  assert.equal(request.body.mode, 'office-review');
  assert.equal(request.body.scope, 'personal');
  assert.equal(request.body.createWorkOrder, false);
  assert.deepEqual(request.body.officeSource, officeSource);
  assert.equal(request.body.guidanceId, undefined);
  for (const part of [officeResult().answer, officeResult().evidence[0], officeResult().dissent[0], officeResult().nextAction, requestId, runId]) {
    assert.ok(request.body.draft.includes(part), part);
  }
});

test('company Office result routes to sales open-question without assigning a Guru card', () => {
  const request = buildOfficeMentorRequest({ result: officeResult('classin'), officeSource, scope: 'classin' });
  assert.equal(request.endpoint, '/api/hub/sales-mentor');
  assert.equal(request.body.mode, 'open-question');
  assert.equal(request.body.createWorkOrder, false);
  assert.equal(request.body.guidanceId, undefined);
  assert.equal(request.body.draft.includes(requestId), true);
  assert.equal(request.body.draft.includes(runId), true);
});

test('an all-scope result requires an explicit mentor lane and does not switch a fixed lane', () => {
  assert.throws(() => buildOfficeMentorRequest({ result: officeResult('all'), officeSource, scope: 'all' }), /lane-required/);
  const selected = buildOfficeMentorRequest({ result: officeResult('all'), officeSource, scope: 'all', lane: 'personal' });
  assert.equal(selected.endpoint, '/api/hub/brand-mentor');
  assert.equal(selected.body.scope, 'personal');
  assert.throws(() => buildOfficeMentorRequest({ result: officeResult('classin'), officeSource, scope: 'classin', lane: 'personal' }), /lane-mismatch/);
});

test('question and recent conversation are bounded while retaining evidence and two follow-up answers', () => {
  const turns = [
    { question: '이전 오래된 질문', answer: '오래된 답' },
    { question: '첫 질문', answer: '첫 멘토 답변' },
    { question: '첫 후속 질문', answer: '첫 후속 답변' },
  ];
  const draft = buildOfficeMentorQuestion({ result: officeResult(), officeSource, question: '두 번째 후속 질문', turns });
  assert.match(draft, /첫 멘토 답변/);
  assert.match(draft, /첫 후속 답변/);
  assert.match(draft, /두 번째 후속 질문/);
  assert.match(draft, /독자 인터뷰 세 건/);
  assert.ok(draft.length <= 6000);
  assert.throws(() => buildOfficeMentorQuestion({ result: officeResult(), officeSource, question: '가'.repeat(1201), turns }), /question-too-long/);
  const long = buildOfficeMentorQuestion({
    result: { ...officeResult(), answer: '가'.repeat(10000), evidence: Array(5).fill('나'.repeat(1000)), dissent: Array(5).fill('다'.repeat(1000)) },
    officeSource, question: '후속 질문', turns: Array(10).fill({ question: '라'.repeat(1000), answer: '마'.repeat(1000) }),
  });
  assert.ok(long.length <= 6000);
  assert.match(long, /발췌/);
  assert.equal(long.includes('이전 오래된 질문'), false);
});

test('missing source IDs and non-generated Office outputs cannot be sent', () => {
  for (const source of [null, {}, { requestId: 'bad', runId: null }, { requestId, runId: 'bad' }]) {
    assert.throws(() => buildOfficeMentorRequest({ result: officeResult(), officeSource: source, scope: 'personal' }), /invalid-office-source/);
  }
  assert.throws(() => buildOfficeMentorRequest({ result: { ...officeResult(), status: 'error' }, officeSource, scope: 'personal' }), /office-result-required/);
});

test('network request occurs only when called and preserves truthful preview, error and generated envelopes', async () => {
  const request = buildOfficeMentorRequest({ result: officeResult(), officeSource, scope: 'personal' });
  const calls = [];
  const fetcher = async (endpoint, init) => {
    calls.push({ endpoint, body: JSON.parse(init.body) });
    return Response.json({ status: 'generated', text: '두 번째 관점', runId: '30000000-0000-4000-8000-000000000003', officeSource });
  };
  assert.equal(calls.length, 0);
  const generated = await requestOfficeMentor(request, { fetcher });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, '/api/hub/brand-mentor');
  assert.deepEqual(calls[0].body.officeSource, officeSource);
  assert.equal(generated.status, 'generated');
  assert.equal(generated.mentorRunId, '30000000-0000-4000-8000-000000000003');
  assert.deepEqual(generated.officeSource, officeSource);

  const preview = await requestOfficeMentor(request, { fetcher: async () => Response.json({ status: 'preview' }, { status: 202 }) });
  assert.equal(preview.status, 'preview');
  const falsePreview = await requestOfficeMentor(request, { fetcher: async () => Response.json({ status: 'preview' }, { status: 502 }) });
  assert.equal(falsePreview.status, 'error');
  const failed = await requestOfficeMentor(request, { fetcher: async () => Response.json({ status: 'generated', text: 'misleading' }, { status: 502 }) });
  assert.equal(failed.status, 'error');
  const acceptedOnly = await requestOfficeMentor(request, { fetcher: async () => Response.json({ status: 'generated', text: 'not complete', officeSource }, { status: 202 }) });
  assert.equal(acceptedOnly.status, 'error');
  const wrongSource = await requestOfficeMentor(request, { fetcher: async () => Response.json({ status: 'generated', text: 'wrong source', officeSource: { requestId: '40000000-0000-4000-8000-000000000004', runId } }) });
  assert.equal(wrongSource.status, 'error');
  const missingSource = await requestOfficeMentor(request, { fetcher: async () => Response.json({ status: 'generated', text: 'no source' }) });
  assert.equal(missingSource.status, 'error');
  const broken = await requestOfficeMentor(request, { fetcher: async () => { throw new Error('private transport detail'); } });
  assert.equal(broken.status, 'error');
  assert.equal(JSON.stringify(broken).includes('private transport detail'), false);
});
