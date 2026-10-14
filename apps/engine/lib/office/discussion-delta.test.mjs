import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeRequest, officeDiscussionReviewTargets } from '@com-moon/agent-contracts/office';
import { runOfficeResponse } from './response-core.ts';

async function run({ authoring = 'compact-v1', mutate = () => {}, mutateSynthesis = () => {}, cancelResponse = false } = {}) {
  const request = parseOfficeRequest({ ownerId: 'flareon', scope: 'personal', mode: 'council', participants: ['flareon', 'umbreon', 'sylveon'], message: '주어진 판단을 검토해 주세요.' });
  const context = { source: 'provided', scope: 'personal', projects: [], note: '계약 검사 입력' };
  const controller = new AbortController(), initial = new Map(), calls = [], diagnostics = [];
  let synthesis;
  const result = await runOfficeResponse(request, context, { authoring, signal: controller.signal, onDiagnostic: event => diagnostics.push(event), generate: async input => {
    const data = JSON.parse(input.prompt); calls.push({ data, schema: input.responseJsonSchema });
    let output;
    if (data.phase === 'position') {
      output = { position: `${data.roleId}의 첫 판단`, evidence: [`${data.roleId}의 제공 근거`], objection: `${data.roleId}의 미해결 조건`, revisionCondition: `${data.roleId}의 변경 조건`, peerReviews: [], replyTo: [], changeReason: '', changed: false };
      initial.set(data.roleId, structuredClone(output));
    } else if (data.phase === 'response') {
      const target = officeDiscussionReviewTargets(request.participants)[data.roleId];
      output = { position: null, evidence: null, objection: null, revisionCondition: null, changed: false,
        changeReason: `${target}의 쟁점을 검토했지만 근거가 추가되지 않아 판단을 유지합니다.`,
        peerReviewsByOwner: Object.fromEntries(request.participants.filter(id => id !== data.roleId).map(id => [id, id === target
          ? { quoteIndex: data.peerReviewCatalog.find(entry => entry.ownerId === id && entry.field === 'position').index, assessment: 'needs_evidence', reason: '제공된 판단을 바꿀 근거는 아직 없습니다.' } : null])),
      };
      mutate(output, data);
      if (cancelResponse) controller.abort();
    } else {
      synthesis = structuredClone(data.untrustedDiscussion);
      output = { answer: '미확인 조건을 남깁니다.', nextAction: '추가 행동 없음.', recommendation: '판단 유지', evidence: [], dissent: ['자료 미확인'],
        resolutionsByTurn: Object.fromEntries(data.objectionRefs.map(ref => [ref, { disposition: 'open', rationale: '추가 근거가 없습니다.' }])),
      };
      mutateSynthesis(output, data);
    }
    return { ok: true, model: 'discussion-delta-offline', text: JSON.stringify({ sourceIndexes: [], corrections: [], ...output }) };
  } });
  return { result, initial, calls, synthesis, diagnostics };
}

test('compact response nulls preserve each role initial content through synthesis and the public parser', async () => {
  const { result, initial, calls, synthesis } = await run();
  assert.equal(result.status, 'generated');
  assert.equal(calls.length, 7);
  assert.equal(result.discussion.turns.length, 6);
  for (const turn of result.discussion.turns.filter(turn => turn.round === 'response')) {
    const own = initial.get(turn.ownerId);
    for (const key of ['position', 'evidence', 'objection', 'revisionCondition']) assert.deepEqual(turn[key], own[key]);
    assert.equal(turn.changed, false);
    assert.equal(turn.peerReviews.length, 1);
    assert.equal(turn.peerReviews[0].quote, initial.get(turn.peerReviews[0].ownerId).position);
    assert.equal(turn.sourceCheck, 'none');
    assert.deepEqual(turn.sourceCounts, { selected: 0, traced: 0, untraced: 0 });
  }
  assert.deepEqual(synthesis, result.discussion.turns);
  assert.equal(result.discussion.resolutions.length, 6);
  for (const call of calls.filter(call => call.data.phase === 'response')) {
    assert.ok(call.schema.properties.position.anyOf.some(value => value.type === 'null'));
    assert.ok(call.schema.required.includes('position'));
  }
  assert.equal(calls[0].schema.properties.position.type, 'string');
});

test('compact response edits and explicit clears affect only that role while keeping its initial record', async () => {
  const { result, initial } = await run({ mutate(output, data) {
    if (data.roleId === 'umbreon') Object.assign(output, { position: '동료 근거에 따라 변경한 판단', evidence: [], objection: '', changed: true, changeReason: '공개 쟁점을 반영해 판단을 수정했습니다.' });
  } });
  assert.equal(result.status, 'generated');
  const positions = result.discussion.turns.filter(turn => turn.round === 'position');
  for (const turn of positions) assert.equal(turn.position, initial.get(turn.ownerId).position);
  const response = result.discussion.turns.find(turn => turn.round === 'response' && turn.ownerId === 'umbreon');
  assert.equal(response.position, '동료 근거에 따라 변경한 판단');
  assert.deepEqual(response.evidence, []);
  assert.equal(response.objection, '');
  assert.equal(response.revisionCondition, initial.get('umbreon').revisionCondition);
  assert.equal(response.changed, true);
  assert.equal(result.discussion.resolutions.length, 5);
});

for (const defect of ['missing-field', 'empty-position', 'empty-revision-condition', 'claimed-change-without-edit', 'whitespace-only-change', 'peer-review-missing', 'forged-owner']) test(`compact delta rejects ${defect} before synthesis`, async () => {
  const { result, calls, diagnostics } = await run({ mutate(output, data) {
    if (data.roleId !== 'flareon') return;
    if (defect === 'missing-field') delete output.position;
    if (defect === 'empty-position') output.position = '';
    if (defect === 'empty-revision-condition') output.revisionCondition = '';
    if (defect === 'claimed-change-without-edit') output.changed = true;
    if (defect === 'whitespace-only-change') { output.changed = true; output.position = ` ${data.untrustedPositions.find(turn => turn.ownerId === data.roleId).position} `; }
    if (defect === 'peer-review-missing') output.peerReviewsByOwner = {};
    if (defect === 'forged-owner') output.ownerId = 'umbreon';
  } });
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.ok(calls.every(call => call.data.phase));
  assert.ok(diagnostics.some(event => event.phase === 'response' && event.category === 'contract'));
});

for (const authoring of ['compact-v1', 'reviewed-v25']) test(`${authoring} provider schemas declare public turn text bounds`, async () => {
  const { result, calls } = await run({ authoring, mutate(output, data) {
    if (authoring === 'reviewed-v25') {
      const own = data.untrustedPositions.find(turn => turn.ownerId === data.roleId);
      for (const key of ['position', 'evidence', 'objection', 'revisionCondition']) output[key] = own[key];
    }
  } });
  assert.equal(result.status, 'generated');
  for (const { data, schema } of calls.filter(call => call.data.phase)) {
    const field = key => schema.properties[key].anyOf?.find(option => option.type !== 'null') ?? schema.properties[key];
    for (const key of ['position', 'revisionCondition']) assert.equal(field(key).minLength, 1, `${data.phase}/${key} cannot be cleared`);
    assert.equal(field('position').maxLength, 600);
    assert.equal(field('revisionCondition').maxLength, 300);
    assert.equal(field('evidence').items.minLength, 1);
    assert.equal(field('evidence').items.maxLength, 300);
    assert.equal(field('objection').maxLength, 400);
    assert.ok(!field('objection').minLength, 'empty objection explicitly clears dissent');
    if (data.phase === 'response') {
      assert.equal(field('changeReason').minLength, 1);
      assert.equal(field('changeReason').maxLength, 400);
    }
  }
});

test('reviewed-v25 still rejects null content rather than adopting compact reconstruction', async () => {
  const { result, calls } = await run({ authoring: 'reviewed-v25' });
  assert.equal(result.status, 'error');
  assert.equal(calls.find(call => call.data.phase === 'response').schema.properties.position.type, 'string');
});

test('cancellation wins over a valid compact delta response and prevents synthesis', async () => {
  const { result, calls } = await run({ cancelResponse: true });
  assert.equal(result.status, 'error');
  assert.equal(result.answer, undefined);
  assert.ok(calls.every(call => call.data.phase));
});

test('compact synthesis references expand before the public contract without removing role calls', async () => {
  const { result, calls } = await run({ mutateSynthesis(output) {
    output.recommendation = null;
    for (const role of ['flareon', 'umbreon', 'sylveon']) output.resolutionsByTurn[`response:${role}`] = `position:${role}`;
  } });
  assert.equal(result.status, 'generated');
  assert.equal(calls.length, 7);
  assert.equal(result.discussion.turns.length, 6);
  assert.equal(result.discussion.resolutions.length, 6);
  assert.equal(result.recommendation, result.answer);
  for (const resolution of result.discussion.resolutions) {
    assert.equal(resolution.disposition, 'open');
    assert.equal(resolution.rationale, '추가 근거가 없습니다.');
  }
  assert.deepEqual(calls.at(-1).data.resolutionAliases['response:flareon'], ['position:flareon']);
  assert.ok(calls.at(-1).schema.properties.recommendation.anyOf.some(value => value.type === 'null'));
});

test('compact synthesis refuses a resolution alias when that role changed its objection', async () => {
  const { result, calls, diagnostics } = await run({
    mutate(output, data) {
      if (data.roleId === 'flareon') Object.assign(output, { objection: '동료 검토 뒤 달라진 조건', changed: true, changeReason: '새 쟁점을 반영해 반론을 바꿉니다.' });
    },
    mutateSynthesis(output) { output.resolutionsByTurn['response:flareon'] = 'position:flareon'; },
  });
  assert.equal(calls.length, 7);
  assert.equal(result.status, 'error');
  assert.ok(diagnostics.some(event => event.phase === 'synthesis' && event.category === 'contract'));
});

test('reviewed-v25 rejects synthesis references after completing its normal role rounds', async () => {
  const { result, calls } = await run({ authoring: 'reviewed-v25',
    mutate(output, data) {
      const own = data.untrustedPositions.find(turn => turn.ownerId === data.roleId);
      for (const key of ['position', 'evidence', 'objection', 'revisionCondition']) output[key] = own[key];
    },
    mutateSynthesis(output) { output.recommendation = null; output.resolutionsByTurn['response:flareon'] = 'position:flareon'; },
  });
  assert.equal(calls.length, 7);
  assert.equal(result.status, 'error');
  assert.equal(calls.at(-1).schema.properties.recommendation.type, 'string');
  assert.equal(calls.at(-1).data.resolutionAliases, undefined);
});
