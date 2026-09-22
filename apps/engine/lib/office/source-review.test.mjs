import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext } from '@com-moon/agent-contracts/office-workflow';
import { buildOfficeSourceCatalog, officeSourceReviewPrompt, officeSourceReviewSchema, readSourceReviewedOutput } from './source-review.ts';
import { generateOfficeResponse } from './service.ts';
import { generateOfficeWorkflow } from './workflow-service.ts';
import { buildOfficeOperatingPolicy } from './operating-policy.ts';
import { OFFICE_WORKFLOW_POLICY_VERSION } from './workflow-prompt.ts';
import { OFFICE_ROLE_CARDS } from './role-cards.ts';

const publicSchema = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] };
const sourceChoices = (request, context) => buildOfficeSourceCatalog(request, context).map(entry => entry.quote);
const indexesFor = (catalog, quotes) => quotes.map(quote => {
  const index = catalog.findIndex(entry => entry.quote === quote);
  assert.notEqual(index, -1, `missing source quote: ${quote}`);
  return index;
});
const readReviewed = (raw, request, context, catalog = buildOfficeSourceCatalog(request, context)) => readSourceReviewedOutput(raw, request, context, catalog);

test('the private review schema selects bounded integer indexes without changing the public schema', () => {
  const before = structuredClone(publicSchema);
  const catalog = buildOfficeSourceCatalog({ message: '검수할 원문' }, {});
  const wrapped = officeSourceReviewSchema(publicSchema, catalog);
  assert.deepEqual(publicSchema, before);
  assert.equal(wrapped.additionalProperties, false);
  assert.deepEqual(wrapped.required, ['sourceIndexes', 'corrections', 'answer']);
  assert.deepEqual(wrapped.properties.answer, publicSchema.properties.answer);
  for (const field of ['sourceIndexes', 'corrections']) {
    assert.equal(wrapped.properties[field].type, 'array');
    assert.equal(wrapped.properties[field].maxItems, 5);
  }
  assert.deepEqual(wrapped.properties.sourceIndexes.items, { type: 'integer', minimum: 0, maximum: 0 });
  assert.equal(wrapped.properties.sourceQuotes, undefined);
  assert.deepEqual(wrapped.properties.corrections.items, { type: 'string' });
  assert.doesNotMatch(JSON.stringify(wrapped), /검수할 원문|"enum"/);
});

test('source catalogs contain only original context, current and previous user text, and the scope policy', () => {
  const roleExample = OFFICE_ROLE_CARDS.flareon.voice.examples[0].response;
  const reviewInstruction = '해당 목록의 정수 index만 쓰며 원문을 다시 쓰거나 sourceQuotes를 출력하지 않는다.';
  const context = { facts: { rows: [{ statement: '원장에 있는 사실' }] }, missing: ['확인되지 않은 범위'], noText: [null, false, 7] };
  for (const historyField of ['history', 'boundedHistory']) {
    const request = { message: '현재 사용자 원문', scope: 'personal', [historyField]: [{ role: 'user', text: '이전 사용자의 조건' }, { role: 'assistant', text: 'ASSISTANT_ONLY_EVIDENCE' }],
      untrustedDraft: { answer: 'DRAFT_ONLY_EVIDENCE' }, untrustedPositions: ['PEER_ONLY_EVIDENCE'], systemInstruction: `${reviewInstruction}\n${roleExample}`, policy: 'CALLER_POLICY_ONLY',
    };
    const catalog = buildOfficeSourceCatalog(request, context);
    const candidates = catalog.map(entry => entry.quote);
    for (const quote of ['현재 사용자 원문', '원장에 있는 사실', '확인되지 않은 범위', '이전 사용자의 조건']) assert.ok(candidates.includes(quote));
    for (const excluded of ['ASSISTANT_ONLY_EVIDENCE', 'DRAFT_ONLY_EVIDENCE', 'PEER_ONLY_EVIDENCE', 'CALLER_POLICY_ONLY', reviewInstruction, roleExample]) {
      assert.ok(candidates.every(quote => !quote.includes(excluded)), excluded);
      assert.throws(() => readReviewed({ answer: '공개 답변', sourceIndexes: [], sourceQuotes: [excluded], corrections: [] }, request, context, catalog), /invalid-source-review/);
    }
    assert.ok(candidates.some(quote => buildOfficeOperatingPolicy('personal').includes(quote) && quote.includes('[개인 범위]')));
    assert.ok(candidates.every(quote => !quote.includes('[ClassIn 업무에만 적용할 기준]')));
    for (const { index } of catalog) assert.deepEqual(readReviewed({ answer: '공개 답변', sourceIndexes: [index], corrections: [] }, request, context, catalog), { answer: '공개 답변' });
  }
});

test('catalog chunks preserve text, line boundaries, surrogate pairs and CRLF without duplication', () => {
  const original = `첫 줄\r\n${'가'.repeat(285)}\r\n${'😀'.repeat(160)}끝\r\n마지막 줄`;
  const request = { message: original };
  const catalog = buildOfficeSourceCatalog(request, { duplicate: original });
  const candidates = catalog.map(entry => entry.quote);
  assert.equal(candidates.join(''), original);
  assert.equal(candidates[0], `첫 줄\r\n${'가'.repeat(285)}\r\n`);
  assert.ok(candidates.every(quote => quote.length <= 300 && quote.trim() && quote.isWellFormed()));
  assert.ok(candidates.every(quote => !quote.endsWith('\r') && !quote.startsWith('\n')));
  assert.equal(new Set(candidates).size, candidates.length);
  assert.deepEqual(catalog.map(entry => entry.index), candidates.map((_, index) => index));
  for (const { index } of catalog) assert.deepEqual(readReviewed({ answer: '공개 답변', sourceIndexes: [index], corrections: [] }, request, { duplicate: original }, catalog), { answer: '공개 답변' });
  assert.deepEqual(sourceChoices({ message: '  원문 공백  ' }, { rows: ['  원문 공백  ', '\n\t', 'before\0after'] }), ['  원문 공백  ', 'before', 'after']);
});

test('an empty catalog requires an empty index array without an invalid integer range', () => {
  const request = { message: ' \n\0\t' };
  const catalog = buildOfficeSourceCatalog(request, { values: [null, false, 0, '\r\n'] });
  const quoteSchema = officeSourceReviewSchema(publicSchema, catalog).properties.sourceIndexes;
  assert.deepEqual(catalog, []);
  assert.equal(quoteSchema.maxItems, 0);
  assert.deepEqual(quoteSchema.items, { type: 'integer', minimum: 0 });
  assert.deepEqual(readReviewed({ answer: '공개 답변', sourceIndexes: [], corrections: [] }, request, {}, catalog), { answer: '공개 답변' });
  assert.throws(() => readReviewed({ answer: '공개 답변', sourceIndexes: [0], corrections: [] }, request, {}, catalog), /invalid-source-review/);
});

test('bounded workflow facts retain every catalog entry in the prompt while schema size stays bounded', () => {
  const { request, context } = inputs('workflow');
  const values = Array.from({ length: 2500 }, (_, index) => `q${index.toString(36)}`);
  const populated = parseOfficeWorkflowContext({ ...context, facts: { values } }, request);
  const projected = { facts: populated.facts, sourceRefs: populated.sourceRefs, missing: populated.missing, asOf: populated.asOf };
  const catalog = buildOfficeSourceCatalog(request, projected);
  assert.ok(catalog.length >= values.length);
  for (const value of values) assert.ok(catalog.some(entry => entry.quote === value));
  const schema = officeSourceReviewSchema(publicSchema, catalog);
  assert.equal(schema.properties.sourceIndexes.items.maximum, catalog.length - 1);
  assert.ok(JSON.stringify(schema).length < 1000);
  assert.doesNotMatch(JSON.stringify(schema), /"enum"/);
  const prompt = officeSourceReviewPrompt({ systemInstruction: 'unchanged', prompt: JSON.stringify({ sourceContext: projected }) }, catalog);
  assert.equal(prompt.systemInstruction, 'unchanged');
  assert.deepEqual(JSON.parse(prompt.prompt).sourceCatalog, catalog);
  assert.deepEqual(JSON.parse(prompt.prompt).sourceContext, projected);
});

test('indexes resolve only against the current server catalog and both private fields are removed', () => {
  const context = { facts: { rows: [{ statement: '중첩된 원문 그대로' }] }, missing: ['제공 여부 미확인'] };
  for (const historyField of ['history', 'boundedHistory']) {
    const request = { message: '현재 사용자 원문입니다.', [historyField]: [{ role: 'user', text: '이전 사용자 조건입니다.' }, { role: 'assistant', text: '허용되지 않은 AI 기록' }] };
    const catalog = buildOfficeSourceCatalog(request, context);
    const answer = { answer: '검수가 끝난 답변', nextAction: '', evidence: [] };
    const raw = { ...answer, sourceIndexes: indexesFor(catalog, [request.message, '중첩된 원문 그대로', '제공 여부 미확인', '이전 사용자 조건입니다.']), corrections: ['원문에 없는 약속을 제거한다.'] };
    const before = structuredClone(raw);
    assert.deepEqual(readReviewed(raw, request, context, catalog), answer);
    assert.deepEqual(raw, before);
    assert.deepEqual(readReviewed({ ...answer, sourceIndexes: [], corrections: [] }, request, context, catalog), answer);
    assert.throws(() => readReviewed({ ...raw, sourceQuotes: [request.message] }, request, context, catalog), /invalid-source-review/, 'even valid legacy text cannot bypass index selection');
    assert.throws(() => readReviewed({ ...raw, sourceCatalog: catalog }, request, context, catalog), /invalid-source-review/, 'the provider cannot supply its own catalog');
    assert.throws(() => readReviewed({ ...raw, sourceIndexes: [0] }, request, context, [{ index: 0, quote: '허용되지 않은 AI 기록' }]), /untraceable-source-review/, 'resolved text still crosses the original substring check');
  }
});

test('missing, noninteger, out-of-range indexes and malformed correction notes are rejected', () => {
  const request = { message: `valid ${'q'.repeat(301)}` };
  const catalog = buildOfficeSourceCatalog(request, {});
  for (const raw of [null, undefined, [], 'answer', 7, {}, { sourceIndexes: [] }, { corrections: [] }, { sourceQuotes: [], corrections: [] }]) assert.throws(() => readReviewed(raw, request, {}, catalog), /invalid-source-review/);
  for (const value of [undefined, null, '0', {}, [null], ['0'], [-1], [0.5], [catalog.length], [Number.MAX_SAFE_INTEGER + 1], [NaN], [Infinity], Array(6).fill(0)]) {
    assert.throws(() => readReviewed({ answer: 'public', sourceIndexes: value, corrections: [] }, request, {}, catalog), /invalid-source-review/);
  }
  for (const value of [undefined, null, 'note', {}, [null], [3], [''], [' \n\t'], ['valid\0'], Array(6).fill('valid'), ['q'.repeat(351)]]) {
    assert.throws(() => readReviewed({ answer: 'public', sourceIndexes: [], corrections: value }, request, {}, catalog), /invalid-source-review/);
  }
  assert.deepEqual(readReviewed({ answer: 'public', sourceIndexes: Array(5).fill(0), corrections: Array(5).fill('c'.repeat(350)) }, request, {}, catalog), { answer: 'public' });
});

test('only the server-curated policy for the requested scope can be selected as policy evidence', () => {
  const companyRule = 'Moonlight는 개인 업무 정본이고 ClassIn에는 공식 객체·활동 요약만 보낸다(§13).';
  const personalRule = '개인 프로젝트·활동·개인 메모는 ClassIn 전송 대상이 아니다.';
  const commonRule = '이미 달성한 성과가 아니다.';
  for (const scope of ['classin', 'personal', 'all', undefined, 'unknown']) {
    const request = { message: '범위 확인', scope, policy: '방금 CRM 전송을 완료했습니다.' };
    const catalog = buildOfficeSourceCatalog(request, {});
    for (const [rule, allowed] of [[companyRule, scope === 'classin' || scope === 'all'], [personalRule, scope === 'personal' || scope === 'all'], [commonRule, ['classin', 'personal', 'all'].includes(scope)]]) {
      const index = catalog.findIndex(entry => entry.quote.includes(rule));
      assert.equal(index >= 0, allowed, `${scope}: ${rule}`);
      if (allowed) assert.deepEqual(readReviewed({ answer: '원문 범위의 답변', sourceIndexes: [index], corrections: [] }, request, {}, catalog), { answer: '원문 범위의 답변' });
    }
    assert.ok(catalog.every(entry => !entry.quote.includes(request.policy)));
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
  assert.doesNotMatch(serialized, /"sourceIndexes"|"sourceQuotes"|"sourceCatalog"|"corrections"|REVIEW_NOTE_ONLY/);
}
function assertSourceChoiceBoundary(input, request, context) {
  const data = JSON.parse(input.prompt);
  const catalog = data.sourceCatalog;
  const choices = catalog.map(entry => entry.quote);
  assert.deepEqual(catalog, buildOfficeSourceCatalog(request, data.sourceContext));
  assert.deepEqual(input.responseJsonSchema.properties.sourceIndexes.items, { type: 'integer', minimum: 0, maximum: catalog.length - 1 });
  assert.equal(input.responseJsonSchema.properties.sourceQuotes, undefined);
  for (const quote of [message, previousUserText, contextText]) assert.ok(choices.includes(quote));
  for (const excluded of [assistantText, draftText, '해당 목록의 정수 index만 쓰며 원문을 다시 쓰거나 sourceQuotes를 출력하지 않는다.', OFFICE_ROLE_CARDS[request.ownerId].voice.examples[0].response]) assert.ok(choices.every(quote => !quote.includes(excluded)));
  for (const peer of [...(data.untrustedPositions || []), ...(data.untrustedDiscussion || [])]) assert.ok(choices.every(quote => !quote.includes(peer.position)));
  if (context.contextHash) {
    for (const excluded of [context.contextHash, context.originKey, context.status]) assert.ok(!choices.includes(excluded));
    assert.equal(choices.includes(context.scope), Boolean(data.phase), 'only council role context includes the scope as a source string');
  }
  for (const { index } of catalog) assert.doesNotThrow(() => readReviewed({ sourceIndexes: [index], corrections: [], answer: '검수한 답변' }, request, data.sourceContext, catalog));
}
function assertWorkflowPromptHash(result, calls, council = false) {
  const promptOnly = ({ systemInstruction, prompt }) => ({ systemInstruction, prompt });
  const review = promptOnly(calls.at(-1));
  const recorded = council ? { roles: calls.slice(0, -1).map(promptOnly), review } : { prompt: promptOnly(calls[0]), review };
  const hash = value => createHash('sha256').update(JSON.stringify({ policyVersion: OFFICE_WORKFLOW_POLICY_VERSION, ...value })).digest('hex');
  assert.equal(result.generation.promptHash, hash(recorded));
  const data = JSON.parse(review.prompt);
  assert.ok(data.sourceCatalog.length > 0);
  delete data.sourceCatalog;
  assert.notEqual(result.generation.promptHash, hash({ ...recorded, review: { ...review, prompt: JSON.stringify(data) } }), 'the stored hash must include the catalog actually sent');
}

for (const [surface, generate] of [['chat', generateOfficeResponse], ['workflow', generateOfficeWorkflow]]) {
  test(`${surface} keeps the initial contract and strips valid editing fields from the final response`, async () => {
    const { request, context } = inputs(surface);
    const calls = [];
    const result = await generate(request, context, async input => {
      calls.push(input);
      if (calls.length === 1) {
        assert.equal(input.responseJsonSchema.properties.sourceQuotes, undefined);
        assert.equal(input.responseJsonSchema.properties.sourceIndexes, undefined);
        assert.equal(input.responseJsonSchema.properties.corrections, undefined);
        assert.equal(JSON.parse(input.prompt).sourceCatalog, undefined);
        return providerReply(answer(surface, request, draftText));
      }
      assert.ok(input.responseJsonSchema.required.includes('sourceIndexes'));
      assert.ok(input.responseJsonSchema.required.includes('corrections'));
      assertSourceChoiceBoundary(input, request, context);
      return providerReply({ ...answer(surface, request), sourceIndexes: indexesFor(JSON.parse(input.prompt).sourceCatalog, [message, previousUserText, contextText]), corrections: [correctionText] });
    });
    assert.equal(calls.length, 2);
    assert.equal(result.status, 'generated');
    assert.equal(surface === 'chat' ? result.answer : result.artifact.body, '검수한 공개 답변입니다.');
    assertPrivateFieldsAbsent(result);
    assert.doesNotMatch(JSON.stringify(result), /UNREVIEWED_DRAFT_ONLY/);
    if (surface === 'workflow') assertWorkflowPromptHash(result, calls);
  });

  test(`${surface} rejects missing or forged final review evidence without publishing its initial draft`, async () => {
    const { request, context } = inputs(surface);
    for (const patch of [{}, { sourceIndexes: [] }, { corrections: [] }, { sourceIndexes: [-1], corrections: [] }, { sourceIndexes: [0.5], corrections: [] }, { sourceIndexes: [1e9], corrections: [] }, { sourceQuotes: [assistantText], corrections: [] }, { sourceIndexes: [], sourceQuotes: [message], corrections: [] }, { sourceIndexes: [], sourceCatalog: [], corrections: [] }, { sourceIndexes: [], corrections: ['bad\0note'] }]) {
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
      const data = JSON.parse(input.prompt); calls.push(input);
      assert.ok(input.responseJsonSchema.required.includes('sourceIndexes'));
      assert.ok(input.responseJsonSchema.required.includes('corrections'));
      assertSourceChoiceBoundary(input, request, context);
      if (data.untrustedPositions) assertPrivateFieldsAbsent(data.untrustedPositions);
      if (data.untrustedDiscussion) assertPrivateFieldsAbsent(data.untrustedDiscussion);
      if (data.untrustedDraft) assertPrivateFieldsAbsent(data.untrustedDraft);
      return providerReply({ ...(data.phase ? turn(data) : answer(surface, request)), sourceIndexes: indexesFor(data.sourceCatalog, [message, previousUserText, contextText]), corrections: [correctionText] });
    });
    assert.equal(calls.length, 5);
    assert.equal(result.status, 'generated');
    assert.equal(result.discussion.turns.length, 4);
    assertPrivateFieldsAbsent(result);
    if (surface === 'workflow') assertWorkflowPromptHash(result, calls, true);
  });

  test(`${surface} rejects free-text attempts to cite assistant or peer claims in every council phase`, async () => {
    for (const [failedPhase, quote] of [['position', assistantText], ['response', 'PEER_ONLY_umbreon_position'], ['synthesis', 'PEER_ONLY_umbreon_response']]) {
      const { request, context } = inputs(surface, 'council');
      const calls = [];
      const result = await generate(request, context, async input => {
        const data = JSON.parse(input.prompt); calls.push(data);
        const shouldFail = (data.phase ?? 'synthesis') === failedPhase && (!data.phase || data.roleId === 'flareon');
        assert.ok(data.sourceCatalog.every(entry => !entry.quote.includes(quote)));
        return providerReply({ ...(data.phase ? turn(data) : answer(surface, request)), sourceIndexes: indexesFor(data.sourceCatalog, [message]), ...(shouldFail ? { sourceQuotes: [quote] } : {}), corrections: [] });
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
      for (const field of ['sourceIndexes', 'corrections']) {
        const { request, context } = inputs(surface, 'council');
        let calls = 0;
        const result = await generate(request, context, async input => {
          const data = JSON.parse(input.prompt); calls++;
          const value = { ...(data.phase ? turn(data) : answer(surface, request)), sourceIndexes: [], corrections: [] };
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

  test(`${surface} rejects out-of-range and noninteger source indexes in every council phase`, async () => {
    for (const failedPhase of ['position', 'response', 'synthesis']) {
      for (const invalidIndex of ['outside', 'fractional']) {
        const { request, context } = inputs(surface, 'council');
        let calls = 0;
        const result = await generate(request, context, async input => {
          const data = JSON.parse(input.prompt); calls++;
          const shouldFail = (data.phase ?? 'synthesis') === failedPhase && (!data.phase || data.roleId === 'flareon');
          return providerReply({ ...(data.phase ? turn(data) : answer(surface, request)), sourceIndexes: shouldFail ? [invalidIndex === 'outside' ? data.sourceCatalog.length : 0.5] : [0], corrections: [] });
        });
        assert.equal(calls, { position: 2, response: 4, synthesis: 5 }[failedPhase]);
        assert.equal(result.status, 'error', `${failedPhase}: ${invalidIndex}`);
        assert.equal(result.answer, undefined);
        assert.equal(result.artifact, undefined);
        assert.equal(result.discussion, undefined);
        assertPrivateFieldsAbsent(result);
      }
    }
  });
}
