import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OFFICE_MENTOR_DRAFT_LIMIT, buildOfficeMentorDraft, buildOfficeMentorQuestion, buildOfficeMentorRequest,
  officeMentorPartialNote, requestOfficeMentor,
} from './office-mentor-client.js';

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
// Distinct, position-marked text so a silent cut anywhere is detectable.
const marked = (tag, length) => {
  const body = `${tag}:` + '가나다라마바사아자차'.repeat(Math.ceil(length / 10));
  const end = `끝${tag}`;
  return body.slice(0, length - end.length) + end;
};
// The largest result the Office answer contract allows (packages/agent-contracts/office.js).
const contractMaximum = () => ({
  status: 'generated', scope: 'personal',
  answer: marked('본문', 10000), recommendation: marked('추천', 2000),
  evidence: [1, 2, 3, 4, 5].map(n => marked(`근거${n}`, 1000)),
  dissent: [1, 2, 3, 4, 5].map(n => marked(`이견${n}`, 1000)),
  nextAction: marked('다음', 1000),
});
const fieldsOf = result => [result.answer, result.recommendation, ...result.evidence, ...result.dissent, result.nextAction];

test('personal Office result routes to brand office-review with its provenance and no synthetic card', () => {
  const request = buildOfficeMentorRequest({ result: officeResult(), officeSource, scope: 'personal' });
  assert.equal(request.endpoint, '/api/hub/brand-mentor');
  assert.equal(request.lane, 'personal');
  assert.equal(request.body.mode, 'office-review');
  assert.equal(request.body.scope, 'personal');
  assert.equal(request.body.createWorkOrder, false);
  assert.deepEqual(request.body.officeSource, officeSource);
  assert.equal(request.body.guidanceId, undefined);
  assert.equal(request.sourceTruncation, null);
  for (const part of [officeResult().answer, officeResult().recommendation, officeResult().evidence[0], officeResult().evidence[1], officeResult().dissent[0], officeResult().nextAction, requestId, runId]) {
    assert.ok(request.body.draft.includes(part), part);
  }
  assert.match(request.body.draft, /확정된 기록 사실은 아닙니다/);
});

test('company Office result routes to sales open-question without assigning a Guru card', () => {
  const request = buildOfficeMentorRequest({ result: officeResult('classin'), officeSource, scope: 'classin' });
  assert.equal(request.endpoint, '/api/hub/sales-mentor');
  assert.equal(request.body.mode, 'open-question');
  assert.equal(request.body.scope, 'classin');
  assert.equal(request.body.createWorkOrder, false);
  assert.deepEqual(request.body.officeSource, officeSource);
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

test('the largest contract-valid Office result reaches the mentor verbatim, even with a full follow-up question', () => {
  const result = contractMaximum();
  for (const question of [undefined, '가'.repeat(1200)]) {
    const { draft, sourceTruncation } = buildOfficeMentorDraft({ result, officeSource, question, turns: question ? [{ question: '첫 질문', answer: '첫 답' }] : [] });
    assert.equal(sourceTruncation, null);
    assert.ok(draft.length <= OFFICE_MENTOR_DRAFT_LIMIT, String(draft.length));
    for (const field of fieldsOf(result)) assert.ok(draft.includes(field), field.slice(0, 12));
    assert.doesNotMatch(draft, /원문 [\d,]+자 중/);
    assert.doesNotMatch(draft, /발췌/);
  }
  assert.equal(OFFICE_MENTOR_DRAFT_LIMIT, 25000);
});

test('every evidence and dissent item is sent, not just the first three', () => {
  const result = { ...officeResult(), evidence: ['근거 하나', '근거 둘', '근거 셋', '근거 넷', '근거 다섯'], dissent: ['이견 하나', '이견 둘', '이견 셋', '이견 넷', '이견 다섯'] };
  const draft = buildOfficeMentorQuestion({ result, officeSource });
  for (const item of [...result.evidence, ...result.dissent]) assert.match(draft, new RegExp(`- ${item}`));
});

test('a recommendation that repeats the answer is not sent twice', () => {
  const result = { ...officeResult(), recommendation: officeResult().answer };
  const draft = buildOfficeMentorQuestion({ result, officeSource });
  assert.equal(draft.split(officeResult().answer).length - 1, 1);
  assert.doesNotMatch(draft, /주관 추천/);
});

test('follow-up history keeps full questions and answers up to 4,000 characters, dropping the oldest turn first', () => {
  const turns = [
    { question: '가장 오래된 질문', answer: '가장 오래된 답' },
    { question: marked('질문A', 1200), answer: marked('답A', 3900) },
    { question: '두 번째 질문', answer: '두 번째 답' },
    { question: '세 번째 질문', answer: marked('답C', 3990) },
    { question: '네 번째 질문', answer: marked('답D', 5000) },
  ];
  const { draft } = buildOfficeMentorDraft({ result: officeResult(), officeSource, question: '다섯 번째 질문', turns });
  assert.equal(draft.includes('가장 오래된 질문'), false, 'only the last four turns are kept');
  assert.ok(draft.includes(turns[1].question));
  assert.ok(draft.includes(turns[1].answer));
  assert.ok(draft.includes(turns[3].answer));
  assert.equal(draft.includes(turns[4].answer), false);
  assert.ok(draft.includes(turns[4].answer.slice(0, 3900)));
  assert.match(draft, /\[원문 5,000자 중 3,960자 전달\]/);

  // Near the cap the oldest remaining turn goes first; the Office source stays whole.
  const heavy = { ...contractMaximum(), answer: marked('본문', 5000) };
  const long = [1, 2, 3, 4].map(n => ({ question: marked(`질문${n}`, 1000), answer: marked(`답${n}`, 3000) }));
  const bounded = buildOfficeMentorDraft({ result: heavy, officeSource, question: '이어지는 질문', turns: long });
  assert.equal(bounded.sourceTruncation, null);
  assert.ok(bounded.draft.length <= OFFICE_MENTOR_DRAFT_LIMIT);
  assert.equal(bounded.draft.includes(long[0].answer), false);
  assert.equal(bounded.draft.includes(long[2].answer), false);
  assert.ok(bounded.draft.includes(long[3].question));
  assert.ok(bounded.draft.includes(long[3].answer));
  for (const field of fieldsOf(heavy)) assert.ok(bounded.draft.includes(field));
});

test('a source over the cap cuts only the longest field, marks the cut and reports it', () => {
  const result = { ...officeResult(), answer: marked('본문', 30000), recommendation: marked('추천', 2000) };
  const { draft, sourceTruncation } = buildOfficeMentorDraft({ result, officeSource, question: '후속 질문', turns: [{ question: '첫 질문', answer: '첫 답' }] });
  assert.ok(draft.length <= OFFICE_MENTOR_DRAFT_LIMIT);
  assert.equal(draft.includes('첫 답'), false, 'history goes before the 오피스 source');
  assert.equal(sourceTruncation.length, 1);
  assert.equal(sourceTruncation[0].label, '본문');
  assert.equal(sourceTruncation[0].total, 30000);
  assert.ok(sourceTruncation[0].sent > 20000 && sourceTruncation[0].sent < 30000);
  assert.ok(draft.includes(result.answer.slice(0, sourceTruncation[0].sent)));
  assert.ok(draft.includes(`[원문 30,000자 중 ${sourceTruncation[0].sent.toLocaleString('ko-KR')}자 전달]`));
  for (const field of [result.recommendation, ...result.evidence, ...result.dissent, result.nextAction]) assert.ok(draft.includes(field));
  assert.match(draft, /확정된 기록 사실은 아닙니다/);
  assert.match(draft, /이번 질문: 후속 질문/);
  assert.match(officeMentorPartialNote(sourceTruncation), /^멘토는 오피스 원문 일부만 받았습니다 · 본문 30,000자 중 [\d,]+자\. 전체 원문은 오피스 결과 카드에 있습니다\.$/);
  assert.equal(officeMentorPartialNote(null), null);
  assert.equal(buildOfficeMentorRequest({ result, officeSource, scope: 'personal', question: '후속 질문', turns: [{ question: '첫 질문', answer: '첫 답' }] }).sourceTruncation[0].label, '본문');
});

test('two oversized fields share the cut from the longest down, never below the next one in one step', () => {
  const result = { ...officeResult(), answer: marked('본문', 20000), recommendation: marked('추천', 12000) };
  const { draft, sourceTruncation } = buildOfficeMentorDraft({ result, officeSource });
  assert.ok(draft.length <= OFFICE_MENTOR_DRAFT_LIMIT);
  assert.deepEqual(sourceTruncation.map(field => field.label), ['본문']);
  assert.ok(sourceTruncation[0].sent >= 12000);
  assert.ok(draft.includes(result.recommendation));
});

test('question limits and missing questions still fail before any request is built', () => {
  assert.throws(() => buildOfficeMentorQuestion({ result: officeResult(), officeSource, question: '가'.repeat(1201), turns: [{ question: 'q', answer: 'a' }] }), /question-too-long/);
  assert.throws(() => buildOfficeMentorQuestion({ result: officeResult(), officeSource, question: '  ', turns: [{ question: 'q', answer: 'a' }] }), /question-required/);
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
  assert.equal(calls[0].body.draft, request.body.draft);
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

test('the company lane now proves its Office source the same way as the personal lane', async () => {
  const request = buildOfficeMentorRequest({ result: officeResult('classin'), officeSource, scope: 'classin' });
  const reply = body => requestOfficeMentor(request, { fetcher: async (endpoint, init) => {
    assert.equal(endpoint, '/api/hub/sales-mentor');
    assert.deepEqual(JSON.parse(init.body).officeSource, officeSource);
    return Response.json(body);
  } });
  assert.equal((await reply({ status: 'generated', text: '회사 관점', officeSource })).status, 'generated');
  assert.equal((await reply({ status: 'generated', text: '출처 없음' })).status, 'error');
  assert.equal((await reply({ status: 'generated', text: '다른 실행', officeSource: { requestId, runId: null } })).status, 'error');
});
