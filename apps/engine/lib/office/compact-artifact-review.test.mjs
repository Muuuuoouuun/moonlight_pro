import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRequest, officeDiscussionReviewTargets } from '@com-moon/agent-contracts/office';
import { runOfficeResponse } from './response-core.ts';

const model = 'compact-artifact-test-provider';
const context = { source: 'provided', scope: 'classin', projects: [], note: '원문에 제공 여부가 없습니다.' };
const requestFor = (mode = 'chat', profile = 'balanced') => parseOfficeRequest({ ownerId: 'flareon', scope: 'classin', mode,
  participants: mode === 'council' ? ['flareon', 'umbreon', 'leafeon'] : [],
  message: '제공된 원문으로 결과물을 작성해 주세요.', history: [{ role: 'user', text: '이전 사용자 원문입니다.' }, { role: 'assistant', text: 'UNTRUSTED_PRIOR_ANSWER' }],
  ...(mode === 'council' ? { deliberation: { profile } } : {}),
});
const draftAnswer = { answer: 'UNTRUSTED_COMPLETE_DRAFT', nextAction: '초안의 다음 행동입니다.' };
const finalAnswer = { answer: '검토 후 완성된 결과물입니다.', nextAction: '추가 행동 없음.' };
const reply = value => ({ ok: true, model, text: JSON.stringify({ sourceIndexes: [0], corrections: [], ...value }), usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 } });
const body = input => JSON.parse(input.prompt);
const run = (request, generate, options = {}) => runOfficeResponse(request, context, { authoring: 'compact-reviewed-v1', signal: new AbortController().signal, generate, ...options });

test('compact artifact review reads the full parsed solo artifact once with the original prompt, sources, schema, model and signal', async t => {
  const calls = [], request = requestFor(), controller = new AbortController();
  let deadlines = 0;
  t.mock.method(AbortSignal, 'timeout', () => { deadlines++; throw new Error('Caller owns the deadline.'); });
  const result = await run(request, async input => { calls.push(input); return reply(calls.length === 1 ? { ...draftAnswer, corrections: ['PRIVATE_CORRECTION'] } : finalAnswer); }, { signal: controller.signal });
  assert.equal(result.status, 'generated');
  assert.equal(calls.length, 2);
  assert.equal(deadlines, 0);
  const original = body(calls[0]), { untrustedDraft, ...reviewInput } = body(calls[1]);
  assert.deepEqual(untrustedDraft, draftAnswer);
  assert.deepEqual(reviewInput, original);
  assert.deepEqual(calls[1].responseJsonSchema, calls[0].responseJsonSchema);
  assert.ok(calls[1].systemInstruction.startsWith(calls[0].systemInstruction));
  assert.doesNotMatch(calls[1].systemInstruction, /UNTRUSTED_|PRIVATE_CORRECTION/);
  assert.doesNotMatch(JSON.stringify(untrustedDraft), /sourceCheck|sourceCounts|sourceIndexes|corrections|PRIVATE_CORRECTION/);
  assert.ok(original.sourceCatalog.every(entry => !/UNTRUSTED_|PRIVATE_CORRECTION/.test(entry.quote)));
  assert.ok(calls.every(input => input.signal === controller.signal && input.thinkingLevel === 'low' && input.retries === 1));
  assert.equal(calls[1].model, model);
  assert.equal(result.answer, finalAnswer.answer);
  assert.equal(result.nextAction, finalAnswer.nextAction);
  assert.equal(result.sourceCheck, 'traced');
  assert.equal(result.generation.modelCalls, 2);
  assert.deepEqual(result.generation.usage, { promptTokens: 4, outputTokens: 6, totalTokens: 10 });
  assert.doesNotMatch(JSON.stringify(result), /UNTRUSTED_COMPLETE_DRAFT|PRIVATE_CORRECTION/);
});

const failures = [
  ['provider', () => ({ ok: false, reason: 'missing-api-key' }), 'provider'],
  ['throw', () => { throw new Error('PRIVATE_REVIEW_FAILURE'); }, 'provider'],
  ['model', () => ({ ...reply(finalAnswer), model: 'different-provider-model' }), 'model-mismatch'],
  ['json', () => ({ ...reply(finalAnswer), text: '{' }), 'json'],
  ['source', () => reply({ ...finalAnswer, sourceIndexes: ['0'] }), 'source-review'],
  ['source-catalog', () => reply({ ...finalAnswer, sourceCatalog: [] }), 'source-review'],
  ['public-answer', () => reply({ ...finalAnswer, answer: '' }), 'contract'],
  ['public-extra', () => reply({ ...finalAnswer, discussion: { turns: [] } }), 'contract'],
];
for (const [name, fail, category] of failures) test(`compact solo review rejects ${name} without returning the valid draft`, async () => {
  const calls = [], events = [];
  const result = await run(requestFor(), async input => { calls.push(input); return calls.length === 1 ? reply(draftAnswer) : fail(); }, { onDiagnostic: event => events.push(event) });
  assert.equal(calls.length, 2);
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.equal(result.generation, undefined);
  assert.doesNotMatch(JSON.stringify(result), /UNTRUSTED_COMPLETE_DRAFT|PRIVATE_REVIEW_FAILURE/);
  assert.deepEqual(events.at(-1), { phase: 'review', category, ownerId: 'flareon' });
});

test('invalid compact draft is rejected before starting artifact review', async () => {
  const calls = [];
  const result = await run(requestFor(), async input => { calls.push(input); return reply({ ...draftAnswer, nextAction: '' }); });
  assert.equal(result.status, 'error');
  assert.equal(calls.length, 1);
});

test('compact solo rejects cancellation after artifact review resolves but before the public return', async () => {
  const calls = [], events = [], controller = new AbortController();
  const result = await run(requestFor(), async input => {
    calls.push(input);
    if (calls.length === 2) queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => controller.abort())));
    return reply(calls.length === 1 ? draftAnswer : finalAnswer);
  }, { signal: controller.signal, onDiagnostic: event => events.push(event) });
  assert.equal(calls.length, 2);
  assert.equal(controller.signal.aborted, true);
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.deepEqual(events.at(-1), { phase: 'review', category: 'deadline', ownerId: 'flareon' });
});

function discussionReply(input, request) {
  const data = body(input);
  if (data.phase === 'position') return reply({ position: `${data.roleId}의 원래 판단입니다.`, evidence: [], objection: data.roleId === 'umbreon' ? '제공 여부가 미확인입니다.' : '', revisionCondition: '원문이 추가되면 바꿉니다.', peerReviews: [], replyTo: [], changed: false, changeReason: '', corrections: ['PRIVATE_ROLE_NOTE'] });
  if (data.phase === 'response') {
    const target = officeDiscussionReviewTargets(request.participants)[data.roleId];
    return reply({ position: null, evidence: null, objection: null, revisionCondition: null, changed: false, changeReason: '원문이 같아 기존 판단을 유지합니다.',
      peerReviewsByOwner: Object.fromEntries(request.participants.filter(ownerId => ownerId !== data.roleId).map(ownerId => [ownerId, ownerId === target ? { quoteIndex: data.peerReviewCatalog.find(entry => entry.ownerId === ownerId && entry.field === 'position').index, assessment: 'supports', reason: '동료 판단을 원문과 대조했습니다.' } : null])),
    });
  }
  const reviewing = !!data.untrustedDraft;
  return reply({ ...(reviewing ? finalAnswer : draftAnswer), recommendation: null, evidence: reviewing ? ['검토된 원문 근거입니다.'] : ['초안의 원문 근거입니다.'], dissent: reviewing ? [] : ['초안의 이견입니다.'], corrections: ['PRIVATE_SYNTHESIS_NOTE'],
    resolutionsByTurn: Object.fromEntries(data.objectionRefs.map((ref, index) => [ref, index ? data.objectionRefs[0] : { disposition: reviewing ? 'addressed' : 'open', rationale: reviewing ? '최종 결과물에 반영했습니다.' : '원문 확인 전 열어 둡니다.' }])),
  });
}

for (const profile of ['balanced', 'urgent']) test(`compact ${profile} Council reviews all parsed fields, preserves exact turns and records every call`, async () => {
  const request = requestFor('council', profile), calls = [], controller = new AbortController();
  const baseline = await run(request, async input => discussionReply(input, request), { authoring: 'compact-v1' });
  const result = await run(request, async input => { calls.push(input); return discussionReply(input, request); }, { signal: controller.signal });
  assert.equal(baseline.status, 'generated');
  assert.equal(result.status, 'generated');
  assert.equal(calls.length, profile === 'urgent' ? 5 : 8);
  const initial = body(calls.at(-2)), { untrustedDraft, ...reviewInput } = body(calls.at(-1));
  assert.deepEqual(reviewInput, initial);
  assert.deepEqual(untrustedDraft, { ...draftAnswer, recommendation: draftAnswer.answer, evidence: ['초안의 원문 근거입니다.'], dissent: ['초안의 이견입니다.'], resolutions: baseline.discussion.resolutions });
  assert.doesNotMatch(JSON.stringify(untrustedDraft), /sourceCheck|sourceCounts|sourceIndexes|corrections|PRIVATE_/);
  assert.ok(initial.sourceCatalog.every(entry => !/UNTRUSTED_|PRIVATE_/.test(entry.quote)));
  assert.deepEqual(calls.at(-1).responseJsonSchema, calls.at(-2).responseJsonSchema);
  assert.equal(calls.at(-1).model, model);
  assert.equal(calls.at(-1).signal, controller.signal);
  assert.equal(calls.at(-2).signal, controller.signal);
  assert.ok(calls.every(input => input.thinkingLevel === 'low'));
  assert.deepEqual(result.discussion.turns, baseline.discussion.turns);
  assert.equal(result.answer, finalAnswer.answer);
  assert.equal(result.recommendation, finalAnswer.answer);
  assert.deepEqual(result.evidence, ['검토된 원문 근거입니다.']);
  assert.deepEqual(result.dissent, []);
  assert.deepEqual(result.discussion.resolutions, baseline.discussion.resolutions.map(({ turnRef }) => ({ turnRef, disposition: 'addressed', rationale: '최종 결과물에 반영했습니다.' })));
  assert.equal(result.discussion.modelCalls, calls.length);
  assert.equal(result.discussion.artifactReviewCalls, 1);
  assert.equal(Object.hasOwn(baseline.discussion, 'artifactReviewCalls'), false);
  assert.equal(result.generation.modelCalls, calls.length);
  assert.deepEqual(result.generation.usage, { promptTokens: 2 * calls.length, outputTokens: 3 * calls.length, totalTokens: 5 * calls.length });
  controller.abort();
  assert.ok(calls.every(input => input.signal.aborted));
});

for (const [name, change] of [
  ['missing-resolution', value => { value.resolutionsByTurn = {}; }],
  ['forged-resolution', value => { value.resolutionsByTurn['position:invented'] = { disposition: 'open', rationale: 'invented' }; }],
  ['bad-alias', value => { value.resolutionsByTurn['response:umbreon'] = 'position:flareon'; }],
  ['forged-turns', value => { value.turns = []; }],
  ['forged-public-resolutions', value => { value.resolutions = []; }],
  ['forged-review-count', value => { value.artifactReviewCalls = 1; }],
]) test(`compact Council artifact review rejects ${name} instead of returning the synthesis draft`, async () => {
  const request = requestFor('council'), calls = [], events = [];
  const result = await run(request, async input => {
    calls.push(input);
    const response = discussionReply(input, request);
    if (body(input).untrustedDraft) { const value = JSON.parse(response.text); change(value); response.text = JSON.stringify(value); }
    return response;
  }, { onDiagnostic: event => events.push(event) });
  assert.equal(calls.length, 8);
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.equal(result.discussion, undefined);
  assert.deepEqual(events.at(-1), { phase: 'review', category: 'contract', ownerId: 'flareon' });
});

for (const mode of ['chat', 'council']) test(`compact ${mode} artifact review cannot return late output after the original signal aborts`, async () => {
  const request = requestFor(mode), calls = [], events = [], controller = new AbortController();
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  const running = run(request, async input => {
    calls.push(input);
    if (body(input).untrustedDraft) { entered(); await released; }
    return mode === 'council' ? discussionReply(input, request) : reply(body(input).untrustedDraft ? finalAnswer : draftAnswer);
  }, { signal: controller.signal, onDiagnostic: event => events.push(event) });
  // A rejected unsupported policy also settles this guard during the initial RED run.
  await Promise.race([waiting, running]);
  controller.abort(new Error('PRIVATE_DEADLINE'));
  release();
  const result = await running;
  assert.equal(calls.length, mode === 'council' ? 8 : 2);
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.equal(result.discussion, undefined);
  assert.deepEqual(events.at(-1), { phase: 'review', category: 'deadline', ownerId: 'flareon' });
});

test('Council validates the complete initial public discussion byte bound before artifact review', async () => {
  const request = requestFor('council'), calls = [], events = [];
  const result = await run(request, async input => {
    calls.push(input);
    const data = body(input), response = discussionReply(input, request), value = JSON.parse(response.text);
    if (data.phase === 'position') Object.assign(value, { position: '판'.repeat(600), evidence: ['근'.repeat(300), '거'.repeat(300)], objection: '반'.repeat(400), revisionCondition: '조'.repeat(300) });
    if (data.phase === 'response') {
      value.changeReason = '유'.repeat(400);
      for (const review of Object.values(value.peerReviewsByOwner).filter(Boolean)) review.reason = '검'.repeat(400);
    }
    if (!data.phase) value.resolutionsByTurn = Object.fromEntries(data.objectionRefs.map(ref => [ref, { disposition: 'open', rationale: '원문 확인 전 열어 둡니다.' }]));
    response.text = JSON.stringify(value);
    return response;
  }, { onDiagnostic: event => events.push(event) });
  assert.equal(result.status, 'error');
  assert.equal(calls.length, 7);
  assert.ok(calls.every(input => !body(input).untrustedDraft));
  assert.deepEqual(events.at(-1), { phase: 'synthesis', category: 'contract', ownerId: 'flareon' });
});
