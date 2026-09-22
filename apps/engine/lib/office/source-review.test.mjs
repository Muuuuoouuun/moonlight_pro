import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
import { officeSourceReviewSchema, readSourceReviewedOutput } from './source-review.ts';
import { generateOfficeResponse } from './service.ts';
import { generateOfficeWorkflow } from './workflow-service.ts';

test('the source-review schema requires bounded editing fields without changing the public schema', () => {
  const schema = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] };
  const before = structuredClone(schema);
  const wrapped = officeSourceReviewSchema(schema);
  assert.deepEqual(schema, before);
  assert.equal(wrapped.additionalProperties, false);
  assert.deepEqual(wrapped.required, ['sourceQuotes', 'corrections', 'answer']);
  assert.deepEqual(wrapped.properties.answer, schema.properties.answer);
  for (const field of ['sourceQuotes', 'corrections']) {
    assert.equal(wrapped.properties[field].type, 'array');
    assert.equal(wrapped.properties[field].maxItems, 5);
    assert.deepEqual(wrapped.properties[field].items, { type: 'string' });
  }
});

test('verbatim quotes may come from current text, nested source context and previous user turns', () => {
  const context = { facts: { rows: [{ statement: '중첩된 원문 그대로' }] }, missing: ['제공 여부 미확인'] };
  for (const historyField of ['history', 'boundedHistory']) {
    const request = { message: '현재 사용자 원문입니다.', [historyField]: [{ role: 'user', text: '이전 사용자 조건입니다.' }, { role: 'assistant', text: '허용되지 않은 AI 기록' }] };
    const answer = { answer: '검수가 끝난 답변', nextAction: '', evidence: [] };
    const raw = { ...answer, sourceQuotes: ['사용자 원문', '중첩된 원문 그대로', '제공 여부 미확인', '이전 사용자 조건'], corrections: ['원문에 없는 약속을 제거한다.'] };
    const before = structuredClone(raw);
    assert.deepEqual(readSourceReviewedOutput(raw, request, context), answer);
    assert.deepEqual(raw, before, 'validation must not mutate the provider response');
    assert.deepEqual(readSourceReviewedOutput({ ...answer, sourceQuotes: [], corrections: [] }, request, context), answer);
  }
});

test('both editing fields are required and reject malformed, oversized or NUL-containing values', () => {
  const request = { message: `valid ${'q'.repeat(301)}` };
  for (const raw of [null, undefined, [], 'answer', 7, {}, { sourceQuotes: [] }, { corrections: [] }]) {
    assert.throws(() => readSourceReviewedOutput(raw, request, {}), /invalid-source-review/);
  }
  for (const field of ['sourceQuotes', 'corrections']) {
    const max = field === 'sourceQuotes' ? 300 : 350;
    const invalid = [undefined, null, 'valid', {}, [null], [3], [''], [' \n\t'], ['valid\0'], Array(6).fill('valid'), ['q'.repeat(max + 1)]];
    for (const value of invalid) {
      assert.throws(() => readSourceReviewedOutput({ answer: 'public', sourceQuotes: [], corrections: [], [field]: value }, request, {}), /invalid-source-review/, `${field}: ${JSON.stringify(value)}`);
    }
  }
  const raw = { answer: 'public', sourceQuotes: Array(5).fill('q'.repeat(300)), corrections: Array(5).fill('c'.repeat(350)) };
  assert.deepEqual(readSourceReviewedOutput(raw, request, {}), { answer: 'public' });
});

test('assistant history, generated answers, invented text and stitched excerpts are not source evidence', () => {
  const request = { message: '정확히 이 문구를 보존합니다.', history: [{ role: 'assistant', text: 'ASSISTANT_ONLY_CLAIM' }] };
  const context = { first: '앞쪽 원문', second: '뒤쪽 원문' };
  for (const quote of ['ASSISTANT_ONLY_CLAIM', 'GENERATED_ANSWER_ONLY', '존재하지 않는 원문', '정확하게 이 문구', '앞쪽 원문뒤쪽 원문']) {
    const raw = { answer: 'GENERATED_ANSWER_ONLY', sourceQuotes: [quote], corrections: [] };
    assert.throws(() => readSourceReviewedOutput(raw, request, context), /untraceable-source-review/);
  }
});

const model = 'synthetic-source-review-model';
const assistantText = 'ASSISTANT_ONLY_CLAIM';
const previousUserText = '이전 사용자 조건: 승인 전에는 안내만 작성합니다.';
const message = '현재 원문: 기능 제공 여부는 미확인입니다.';
const contextText = 'CONTEXT_ONLY: 고객은 추가 설명을 요청했습니다.';
const draftText = 'UNREVIEWED_DRAFT_ONLY';
const correctionText = 'REVIEW_NOTE_ONLY: 확인되지 않은 약속을 제거한다.';
const conversation = [{ role: 'user', text: previousUserText }, { role: 'assistant', text: assistantText }];
const participants = ['flareon', 'umbreon'];

function inputs(surface, mode = 'chat') {
  if (surface === 'chat') {
    return {
      request: parseOfficeRequest({ ownerId: 'flareon', scope: 'classin', mode, participants: mode === 'council' ? participants : [], message, history: conversation }),
      context: { source: 'provided', scope: 'classin', projects: [], note: contextText },
    };
  }
  const request = parseOfficeWorkflowRequest({
    requestId: '10000000-0000-4000-8000-000000000001', intent: 'customer_reply', ownerId: 'flareon', scope: 'classin', mode, participants: mode === 'council' ? participants : [],
    originRef: { entityType: 'lead', entityId: '20000000-0000-4000-8000-000000000001' }, expectedContextHash: 'a'.repeat(64), message, boundedHistory: conversation,
  });
  const context = parseOfficeWorkflowContext({
    status: 'ready', scope: 'classin', originRef: request.originRef, originKey: `customer:lead:${request.originRef.entityId}`,
    facts: { statement: contextText }, sourceRefs: [{ id: 'customer-source', type: 'lead', entityId: request.originRef.entityId }], missing: [],
    asOf: '2026-09-22T00:00:00Z', contextHash: request.expectedContextHash, capabilities: { generate: true, applyTask: true },
  }, request);
  return { request, context };
}
function answer(surface, request, text = '검수한 공개 답변입니다.') {
  if (surface === 'chat') return { answer: text, nextAction: '추가 실행은 없습니다.', ...(request.mode === 'council' ? { recommendation: '확인된 범위로 답합니다.', evidence: [], dissent: [] } : {}) };
  return {
    summary: '검수한 답변입니다.', artifact: { kind: 'text', body: text }, evidence: [], uncertainties: [], dissent: [], nextStep: null,
    ...(request.mode === 'council' ? { council: { perspectives: request.participants.map(ownerId => ({ ownerId, judgment: '확인된 범위로 답합니다.', tradeoff: '제공 여부는 미확인입니다.' })), recommendation: '확인된 범위로 답합니다.' } } : {}),
  };
}
function turn(data) {
  return {
    position: `PEER_ONLY_${data.roleId}_${data.phase}`, evidence: [], objection: '', revisionCondition: '확인된 자료가 추가되면 수정합니다.', changed: false,
    replyTo: data.phase === 'response' ? [participants.find(id => id !== data.roleId)] : [], changeReason: data.phase === 'response' ? '새로운 원문이 없어 판단을 유지합니다.' : '',
  };
}
function providerReply(value) { return { ok: true, text: JSON.stringify(value), model }; }
function assertPrivateFieldsAbsent(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /"sourceQuotes"|"corrections"|REVIEW_NOTE_ONLY/);
}

for (const [surface, generate] of [['chat', generateOfficeResponse], ['workflow', generateOfficeWorkflow]]) {
  test(`${surface} keeps the initial contract and strips valid editing fields from the final response`, async () => {
    const { request, context } = inputs(surface);
    const calls = [];
    const result = await generate(request, context, async input => {
      calls.push(input);
      if (calls.length === 1) {
        assert.equal(input.responseJsonSchema.properties.sourceQuotes, undefined);
        assert.equal(input.responseJsonSchema.properties.corrections, undefined);
        return providerReply(answer(surface, request, draftText));
      }
      assert.ok(input.responseJsonSchema.required.includes('sourceQuotes'));
      assert.ok(input.responseJsonSchema.required.includes('corrections'));
      return providerReply({ ...answer(surface, request), sourceQuotes: [message, previousUserText, contextText], corrections: [correctionText] });
    });
    assert.equal(calls.length, 2);
    assert.equal(result.status, 'generated');
    assert.equal(surface === 'chat' ? result.answer : result.artifact.body, '검수한 공개 답변입니다.');
    assertPrivateFieldsAbsent(result);
    assert.doesNotMatch(JSON.stringify(result), /UNREVIEWED_DRAFT_ONLY/);
  });

  test(`${surface} rejects missing or forged final review evidence without publishing its initial draft`, async () => {
    const { request, context } = inputs(surface);
    for (const patch of [{}, { sourceQuotes: [] }, { corrections: [] }, { sourceQuotes: [assistantText], corrections: [] }, { sourceQuotes: [draftText], corrections: [] }, { sourceQuotes: [], corrections: ['bad\0note'] }]) {
      let calls = 0;
      const result = await generate(request, context, async () => providerReply(++calls === 1 ? answer(surface, request, draftText) : { ...answer(surface, request), ...patch }));
      assert.equal(calls, 2);
      assert.equal(result.status, 'error', JSON.stringify(patch));
      assert.equal(result.answer, undefined);
      assert.equal(result.artifact, undefined);
      assert.equal(result.discussion, undefined);
      assertPrivateFieldsAbsent(result);
      assert.doesNotMatch(JSON.stringify(result), /UNREVIEWED_DRAFT_ONLY|ASSISTANT_ONLY_CLAIM/);
    }
  });

  test(`${surface} strips review fields before exchanging council opinions and publishing the synthesis`, async () => {
    const { request, context } = inputs(surface, 'council');
    const calls = [];
    const result = await generate(request, context, async input => {
      const data = JSON.parse(input.prompt); calls.push(data);
      assert.ok(input.responseJsonSchema.required.includes('sourceQuotes'));
      assert.ok(input.responseJsonSchema.required.includes('corrections'));
      if (data.untrustedPositions) assertPrivateFieldsAbsent(data.untrustedPositions);
      if (data.untrustedDiscussion) assertPrivateFieldsAbsent(data.untrustedDiscussion);
      if (data.untrustedDraft) assertPrivateFieldsAbsent(data.untrustedDraft);
      return providerReply({ ...(data.phase ? turn(data) : answer(surface, request)), sourceQuotes: [message, previousUserText, contextText], corrections: [correctionText] });
    });
    assert.equal(calls.length, 5);
    assert.equal(result.status, 'generated');
    assert.equal(result.discussion.turns.length, 4);
    assertPrivateFieldsAbsent(result);
  });

  test(`${surface} rejects assistant or peer claims as council source quotes in every phase`, async () => {
    for (const [failedPhase, quote] of [['position', assistantText], ['response', 'PEER_ONLY_umbreon_position'], ['synthesis', 'PEER_ONLY_umbreon_response']]) {
      const { request, context } = inputs(surface, 'council');
      const calls = [];
      const result = await generate(request, context, async input => {
        const data = JSON.parse(input.prompt); calls.push(data);
        const shouldFail = (data.phase ?? 'synthesis') === failedPhase && (!data.phase || data.roleId === 'flareon');
        return providerReply({ ...(data.phase ? turn(data) : answer(surface, request)), sourceQuotes: [shouldFail ? quote : message], corrections: [] });
      });
      assert.equal(result.status, 'error', failedPhase);
      assert.equal(calls.length, { position: 2, response: 4, synthesis: 5 }[failedPhase]);
      assert.equal(result.answer, undefined);
      assert.equal(result.artifact, undefined);
      assert.equal(result.discussion, undefined);
      assertPrivateFieldsAbsent(result);
      assert.doesNotMatch(JSON.stringify(result), /PEER_ONLY_|ASSISTANT_ONLY_CLAIM/);
    }
  });

  test(`${surface} requires both review fields on each council round and the final synthesis`, async () => {
    for (const failedPhase of ['position', 'response', 'synthesis']) {
      for (const field of ['sourceQuotes', 'corrections']) {
        const { request, context } = inputs(surface, 'council');
        let calls = 0;
        const result = await generate(request, context, async input => {
          const data = JSON.parse(input.prompt); calls++;
          const value = { ...(data.phase ? turn(data) : answer(surface, request)), sourceQuotes: [], corrections: [] };
          if ((data.phase ?? 'synthesis') === failedPhase && (!data.phase || data.roleId === 'flareon')) delete value[field];
          return providerReply(value);
        });
        assert.equal(calls, { position: 2, response: 4, synthesis: 5 }[failedPhase]);
        assert.equal(result.status, 'error', `${failedPhase}: missing ${field}`);
        assert.equal(result.answer, undefined);
        assert.equal(result.artifact, undefined);
        assert.equal(result.discussion, undefined);
      }
    }
  });
}
