import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRequest, officeDiscussionReviewTargets } from '@com-moon/agent-contracts/office';
import { runOfficeResponse } from './response-core.ts';
import { officeResponseSchema } from './response-schema.ts';
import { officeTaskDeliverySchema, readOfficeTaskDeliveryOutput } from './task-delivery.ts';

const model = 'delivery-test-provider';
const context = { source: 'provided', scope: 'classin', projects: [], note: 'CONTEXT_ONLY_QUOTE' };
const requestFor = (mode = 'chat', profile = 'balanced') => parseOfficeRequest({ ownerId: 'glaceon', scope: 'classin', mode,
  participants: mode === 'council' ? ['glaceon', 'umbreon', 'leafeon'] : [],
  message: '저장 뒤 다시 열기 기준만 확인하고 끝내 주세요.',
  history: [{ role: 'user', text: 'HISTORY_ONLY_QUOTE' }],
  ...(mode === 'council' ? { deliberation: { profile } } : {}),
});
const artifact = request => ({
  requestContract: { deliverable: '저장 뒤 다시 열기 범위 확인', doneWhen: '범위를 답 안에 명시하면 완료', currentRequestQuote: request.message, targetEvidence: 'unverified' },
  followUp: null,
  answer: '저장 뒤 다시 열었을 때 입력값이 유지되는 것까지입니다.',
});
const reply = value => ({ ok: true, model, text: JSON.stringify({ sourceIndexes: [0], corrections: [], ...value }), usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 } });
const body = input => JSON.parse(input.prompt);
const run = (request, generate, options = {}) => runOfficeResponse(request, context, { authoring: 'compact-delivery-v1', signal: new AbortController().signal, generate, ...options });

test('delivery solo fulfills one request in one source-bound call and exposes only the existing public fields', async () => {
  const request = requestFor(), calls = [], controller = new AbortController();
  const value = artifact(request);
  const result = await run(request, async input => { calls.push(input); return reply(value); }, { signal: controller.signal });
  assert.equal(result.status, 'generated');
  assert.equal(calls.length, 1);
  assert.equal(result.answer, value.answer);
  assert.equal(result.nextAction, '추가 행동 없음.');
  assert.equal(result.sourceCheck, 'traced');
  assert.equal(result.generation.modelCalls, 1);
  assert.deepEqual(result.generation.usage, { promptTokens: 2, outputTokens: 3, totalTokens: 5 });
  for (const key of ['requestContract', 'followUp', 'sourceIndexes', 'corrections']) assert.equal(Object.hasOwn(result, key), false);
  const input = calls[0], data = body(input);
  assert.equal(input.signal, controller.signal);
  assert.equal(input.thinkingLevel, 'low');
  assert.equal(input.retries, 1);
  assert.equal(data.userRequest, request.message);
  assert.deepEqual(data.sourceContext, context);
  assert.deepEqual(data.untrustedRecentConversation, request.history);
  assert.ok(input.responseJsonSchema.required.includes('requestContract'));
  assert.ok(input.responseJsonSchema.required.includes('followUp'));
  assert.equal(Object.hasOwn(input.responseJsonSchema.properties, 'nextAction'), false);
  assert.doesNotMatch(input.systemInstruction, /nextAction에는/);
});

const action = request => ({ kind: 'requested_action', text: '제공한 항목을 확인해 주세요.', currentRequestQuote: request.message });
const question = request => ({ kind: 'answer_blocking_question', text: '어느 문서가 대상인가요?', missingInput: '검토할 문서 원문', currentRequestQuote: request.message });

test('delivery decoder copies text verbatim, strips only its private fields, preserves unknown public fields and never mutates input', () => {
  const request = requestFor();
  for (const followUp of [null, action(request), question(request)]) {
    const value = { ...artifact(request), followUp, answer: '  본문\n원문  ', recommendation: '  추천 원문  ', evidence: ['근거'], unexpectedPublic: true };
    if (followUp) followUp.text = '  ' + followUp.text + '\n';
    const before = structuredClone(value);
    const result = readOfficeTaskDeliveryOutput(value, request.message);
    assert.deepEqual(result, { answer: value.answer, recommendation: value.recommendation, evidence: value.evidence, unexpectedPublic: true, nextAction: followUp?.text ?? '추가 행동 없음.' });
    assert.deepEqual(value, before);
  }
});

test('delivery schema replaces only nextAction, makes private alternatives strict and leaves the source schema unchanged', () => {
  for (const mode of ['chat', 'council']) {
    const schema = officeResponseSchema(mode), before = structuredClone(schema);
    const result = officeTaskDeliverySchema(schema);
    assert.deepEqual(schema, before);
    assert.equal(result.additionalProperties, false);
    assert.equal(Object.hasOwn(result.properties, 'nextAction'), false);
    assert.deepEqual(new Set(result.required), new Set([...schema.required.filter(key => key !== 'nextAction'), 'requestContract', 'followUp']));
    for (const [key, value] of Object.entries(schema.properties).filter(([key]) => key !== 'nextAction')) assert.deepEqual(result.properties[key], value);
    const contract = result.properties.requestContract;
    assert.equal(contract.additionalProperties, false);
    assert.deepEqual(new Set(contract.required), new Set(['deliverable', 'doneWhen', 'currentRequestQuote', 'targetEvidence']));
    assert.deepEqual(contract.properties.targetEvidence.anyOf, [{ type: 'null' }, { type: 'string', enum: ['unverified', 'source-reported'] }]);
    assert.deepEqual(result.properties.followUp.anyOf[0], { type: 'null' });
    for (const choice of result.properties.followUp.anyOf.slice(1)) {
      assert.equal(choice.additionalProperties, false);
      assert.deepEqual(new Set(choice.required), new Set(Object.keys(choice.properties)));
    }
    assert.deepEqual(result.properties.followUp.anyOf[1].properties.kind.enum, ['requested_action']);
    assert.deepEqual(result.properties.followUp.anyOf[2].properties.kind.enum, ['answer_blocking_question']);
    for (const [key, max] of [['deliverable', 350], ['doneWhen', 350], ['currentRequestQuote', 600]]) {
      assert.equal(contract.properties[key].minLength, 1); assert.equal(contract.properties[key].maxLength, max);
    }
  }
});

const invalidPrivate = [
  ['missing-contract', value => { delete value.requestContract; }],
  ['missing-follow-up', value => { delete value.followUp; }],
  ['legacy-next-action', value => { value.nextAction = '추가 행동 없음.'; }],
  ['legacy-null-next-action', value => { value.nextAction = null; }],
  ['null-contract', value => { value.requestContract = null; }],
  ['array-contract', value => { value.requestContract = []; }],
  ['unknown-contract-key', value => { value.requestContract.authorized = true; }],
  ['bad-evidence', value => { value.requestContract.targetEvidence = 'verified'; }],
  ['boolean-evidence', value => { value.requestContract.targetEvidence = false; }],
  ['context-quote', value => { value.requestContract.currentRequestQuote = context.note; }],
  ['history-quote', value => { value.requestContract.currentRequestQuote = requestFor().history[0].text; }],
  ['array-follow-up', value => { value.followUp = []; }],
  ['string-follow-up', value => { value.followUp = '추가 행동 없음.'; }],
  ['unknown-follow-up-kind', value => { value.followUp = { ...action(requestFor()), kind: 'necessary_action' }; }],
  ['unknown-follow-up-key', value => { value.followUp = { ...action(requestFor()), authorized: true }; }],
  ['action-missing-input', value => { value.followUp = { ...action(requestFor()), missingInput: '사실' }; }],
  ['question-missing-input', value => { value.followUp = question(requestFor()); delete value.followUp.missingInput; }],
  ['follow-up-history-quote', value => { value.followUp = { ...action(requestFor()), currentRequestQuote: requestFor().history[0].text }; }],
];
for (const key of ['deliverable', 'doneWhen', 'currentRequestQuote', 'targetEvidence']) invalidPrivate.push([`missing-${key}`, value => { delete value.requestContract[key]; }]);
for (const [group, fields, maker] of [
  ['requestContract', [['deliverable', 350], ['doneWhen', 350], ['currentRequestQuote', 600]], request => artifact(request).requestContract],
  ['followUp', [['text', 1000], ['currentRequestQuote', 600], ['missingInput', 350]], question],
]) for (const [key, max] of fields) for (const [label, invalid] of [['empty', ''], ['blank', ' \n '], ['number', 1], ['nul', 'value\0'], ['long', 'x'.repeat(max + 1)]]) {
  invalidPrivate.push([`${group}-${key}-${label}`, value => { value[group] = maker(requestFor()); value[group][key] = invalid; }]);
}
for (const key of ['kind', 'text', 'currentRequestQuote']) invalidPrivate.push([`follow-up-missing-${key}`, value => { value.followUp = action(requestFor()); delete value.followUp[key]; }]);

for (const [name, change] of invalidPrivate) test(`delivery decoder rejects ${name}`, () => {
  const request = requestFor(), value = artifact(request); change(value);
  const before = structuredClone(value);
  assert.throws(() => readOfficeTaskDeliveryOutput(value, request.message));
  assert.deepEqual(value, before);
});

test('delivery decoder accepts exact length limits, current-message substrings and all evidence states', () => {
  const message = 'a'.repeat(600);
  for (const targetEvidence of [null, 'unverified', 'source-reported']) {
    const value = { answer: '공개 답', requestContract: { deliverable: 'd'.repeat(350), doneWhen: 'd'.repeat(350), currentRequestQuote: message, targetEvidence }, followUp: { kind: 'answer_blocking_question', text: 't'.repeat(1000), missingInput: 'm'.repeat(350), currentRequestQuote: 'a'.repeat(599) } };
    assert.equal(readOfficeTaskDeliveryOutput(value, message).nextAction, value.followUp.text);
  }
});

for (const makeFollowUp of [action, question]) test(`delivery solo preserves ${makeFollowUp.name} through the actual public parser`, async () => {
  const request = requestFor(), calls = [];
  const value = { ...artifact(request), followUp: makeFollowUp(request) };
  const result = await run(request, async input => { calls.push(input); return reply(value); });
  assert.equal(result.status, 'generated');
  assert.equal(result.answer, value.answer);
  assert.equal(result.nextAction, value.followUp.text);
  assert.equal(calls.length, 1);
});

test('delivery keeps ordinary public whitespace normalization without rewriting the requested action or body', async () => {
  const request = requestFor();
  const value = { ...artifact(request), answer: '  본문\n내부 줄바꿈  ', followUp: { ...action(request), text: '  제공한 항목을\n확인해 주세요.  ' } };
  assert.equal(readOfficeTaskDeliveryOutput(value, request.message).nextAction, value.followUp.text);
  const result = await run(request, async () => reply(value));
  assert.equal(result.status, 'generated');
  assert.equal(result.answer, value.answer.trim());
  assert.equal(result.nextAction, value.followUp.text.trim());
});

const finalFailures = [
  ['private-contract', value => { value.requestContract.currentRequestQuote = context.note; }, 'contract'],
  ['missing-follow-up', value => { delete value.followUp; }, 'contract'],
  ['dual-action', value => { value.nextAction = '추가 행동 없음.'; }, 'contract'],
  ['source-index-type', value => { value.sourceIndexes = ['0']; }, 'source-review'],
  ['source-catalog', value => { value.sourceCatalog = []; }, 'source-review'],
  ['public-answer', value => { value.answer = ''; }, 'contract'],
  ['public-extra', value => { value.forgedPublic = true; }, 'contract'],
];
for (const [name, change, category] of finalFailures) test(`delivery solo rejects ${name} with no repair or partial public answer`, async () => {
  const request = requestFor(), calls = [], events = [];
  const result = await run(request, async input => {
    calls.push(input); const response = reply(artifact(request)); const value = JSON.parse(response.text); change(value); response.text = JSON.stringify(value); return response;
  }, { onDiagnostic: event => events.push(event) });
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(events.at(-1), { phase: 'draft', category, ownerId: request.ownerId });
});

function discussionReply(input, request) {
  const data = body(input);
  if (data.phase === 'position') return reply({ position: `${data.roleId}의 판단입니다.`, evidence: [], objection: data.roleId === 'umbreon' ? '실제 검증 여부는 미확인입니다.' : '', revisionCondition: '새 원문이 있으면 바꿉니다.', peerReviews: [], replyTo: [], changed: false, changeReason: '' });
  if (data.phase === 'response') {
    const target = officeDiscussionReviewTargets(request.participants)[data.roleId];
    return reply({ position: null, evidence: null, objection: null, revisionCondition: null, changed: false, changeReason: '원문이 같아 판단을 유지합니다.',
      peerReviewsByOwner: Object.fromEntries(request.participants.filter(ownerId => ownerId !== data.roleId).map(ownerId => [ownerId, ownerId === target ? { quoteIndex: data.peerReviewCatalog.find(entry => entry.ownerId === ownerId && entry.field === 'position').index, assessment: 'supports', reason: '동료 판단의 범위를 검토했습니다.' } : null])),
    });
  }
  const final = artifact(request);
  return reply({ ...(input.responseJsonSchema.properties.followUp ? final : { answer: final.answer, nextAction: '추가 행동 없음.' }), recommendation: null, evidence: [], dissent: ['실제 실행 결과는 미확인입니다.'],
    resolutionsByTurn: Object.fromEntries(data.objectionRefs.map((ref, index) => [ref, index ? data.objectionRefs[0] : { disposition: 'open', rationale: '범위 확인 답변과 실제 구현 검증을 구분합니다.' }])),
  });
}

for (const profile of ['balanced', 'urgent']) test(`delivery ${profile} Council changes only final authoring and preserves actual turns, peer quotes and objection accounting`, async () => {
  const request = requestFor('council', profile), calls = [], baselineCalls = [], controller = new AbortController();
  const baseline = await run(request, async input => { baselineCalls.push(input); return discussionReply(input, request); }, { authoring: 'compact-v1' });
  const result = await run(request, async input => { calls.push(input); return discussionReply(input, request); }, { signal: controller.signal });
  assert.equal(baseline.status, 'generated');
  assert.equal(result.status, 'generated');
  assert.equal(calls.length, profile === 'urgent' ? 4 : 7);
  assert.equal(calls.length, baselineCalls.length);
  for (let index = 0; index < calls.length - 1; index++) {
    const { signal: _candidateSignal, ...candidate } = calls[index], { signal: _baselineSignal, ...original } = baselineCalls[index];
    assert.deepEqual(candidate, original);
    assert.equal(Object.hasOwn(calls[index].responseJsonSchema.properties, 'requestContract'), false);
  }
  assert.deepEqual(body(calls.at(-1)), body(baselineCalls.at(-1)));
  assert.equal(calls.at(-1).model, model);
  assert.equal(calls.at(-1).signal, controller.signal);
  assert.deepEqual(result.discussion, baseline.discussion);
  assert.equal(result.recommendation, result.answer);
  assert.equal(result.discussion.modelCalls, calls.length);
  assert.equal(result.generation.modelCalls, calls.length);
  assert.deepEqual(result.generation.usage, { promptTokens: 2 * calls.length, outputTokens: 3 * calls.length, totalTokens: 5 * calls.length });
  assert.equal(result.discussion.resolutions.length, profile === 'urgent' ? 1 : 2);
  for (const turn of result.discussion.turns.filter(turn => turn.round === 'response')) for (const review of turn.peerReviews) {
    assert.equal(review.quote, result.discussion.turns.find(position => position.round === 'position' && position.ownerId === review.ownerId)[review.field]);
  }
  assert.ok(calls.every(input => input.retries === 1 && input.thinkingLevel === 'low'));
  assert.doesNotMatch(JSON.stringify(result), /requestContract|followUp|targetEvidence/);
  controller.abort(); assert.ok(calls.every(input => input.signal.aborted));
});

for (const [name, change, category] of [...finalFailures,
  ['missing-resolution', value => { value.resolutionsByTurn = {}; }, 'contract'],
  ['forged-resolution', value => { value.resolutions = []; }, 'contract'],
  ['invalid-alias', value => { value.resolutionsByTurn['response:umbreon'] = 'position:glaceon'; }, 'contract'],
]) test(`delivery Council final rejects ${name} without repair or partial discussion`, async () => {
  const request = requestFor('council'), calls = [], events = [];
  const result = await run(request, async input => {
    calls.push(input); const response = discussionReply(input, request);
    if (!body(input).phase) { const value = JSON.parse(response.text); change(value); response.text = JSON.stringify(value); }
    return response;
  }, { onDiagnostic: event => events.push(event) });
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined); assert.equal(result.discussion, undefined);
  assert.equal(calls.length, 7);
  assert.deepEqual(events.at(-1), { phase: 'synthesis', category, ownerId: request.ownerId });
});

test('delivery Council rejects invented peer quotes before attempting final authoring', async () => {
  const request = requestFor('council'), calls = [], events = [];
  const result = await run(request, async input => {
    calls.push(input); const response = discussionReply(input, request);
    if (body(input).phase === 'response') { const value = JSON.parse(response.text); Object.values(value.peerReviewsByOwner).filter(Boolean)[0].quoteIndex = 999; response.text = JSON.stringify(value); }
    return response;
  }, { onDiagnostic: event => events.push(event) });
  assert.equal(result.status, 'error'); assert.equal(result.discussion, undefined);
  assert.equal(calls.length, 6); assert.ok(calls.every(input => body(input).phase));
  assert.ok(events.some(event => event.phase === 'response' && event.category === 'contract'));
});

for (const mode of ['chat', 'council']) {
  for (const [name, failure] of [
    ['provider', () => ({ ok: false, reason: 'provider-failed' })],
    ['throw', () => { throw new Error('PRIVATE_PROVIDER_ERROR'); }],
    ['json', () => ({ ok: true, model, text: '{' })],
  ]) test(`delivery ${mode} ${name} failure stops after its original final call`, async () => {
    const request = requestFor(mode), calls = [];
    const result = await run(request, async input => { calls.push(input); return body(input).phase ? discussionReply(input, request) : failure(); });
    assert.equal(result.status, 'error'); assert.equal(result.answer, undefined); assert.equal(result.discussion, undefined);
    assert.equal(calls.length, mode === 'council' ? 7 : 1);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_ERROR/);
  });

  test(`delivery ${mode} caller deadline discards final success and never retries`, async () => {
    const request = requestFor(mode), calls = [], events = [], controller = new AbortController();
    let entered, release;
    const waiting = new Promise(resolve => { entered = resolve; }), released = new Promise(resolve => { release = resolve; });
    const running = run(request, async input => {
      calls.push(input);
      if (!body(input).phase) { entered(); await released; }
      return mode === 'council' ? discussionReply(input, request) : reply(artifact(request));
    }, { signal: controller.signal, onDiagnostic: event => events.push(event) });
    await Promise.race([waiting, running]);
    controller.abort(new Error('PRIVATE_DEADLINE')); release();
    const result = await running;
    assert.equal(result.status, 'error'); assert.equal(result.answer, undefined); assert.equal(result.discussion, undefined);
    assert.equal(calls.length, mode === 'council' ? 7 : 1);
    assert.deepEqual(events.at(-1), { phase: mode === 'council' ? 'synthesis' : 'draft', category: 'deadline', ownerId: request.ownerId });
  });

  test(`delivery ${mode} already-aborted request never reaches the provider`, async () => {
    const controller = new AbortController(), calls = [];
    controller.abort();
    const result = await run(requestFor(mode), async input => { calls.push(input); return reply({}); }, { signal: controller.signal });
    assert.equal(result.status, 'error'); assert.equal(result.answer, undefined);
    assert.equal(calls.length, 0);
  });
}

test('delivery Council rejects a different final provider model without retry', async () => {
  const request = requestFor('council'), calls = [], events = [];
  const result = await run(request, async input => {
    calls.push(input); const response = discussionReply(input, request);
    return body(input).phase ? response : { ...response, model: 'different-model' };
  }, { onDiagnostic: event => events.push(event) });
  assert.equal(result.status, 'error'); assert.equal(result.discussion, undefined);
  assert.equal(calls.length, 7);
  assert.deepEqual(events.at(-1), { phase: 'synthesis', category: 'model-mismatch', ownerId: request.ownerId });
});
