import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOfficeAnswer } from '@com-moon/agent-contracts/office';
import { readOfficeSynthesisOutput } from './deliberation.ts';
import { compactSynthesisPrompt, compactSynthesisSchema, expandCompactSynthesis } from './synthesis-references.ts';

function turn(ownerId, round, objection, turnRef = `${round}:${ownerId}`) {
  return { ownerId, round, turnRef, objection };
}

const turns = [
  turn('flareon', 'position', '자료 제공 범위를 확인해야 합니다.'),
  turn('umbreon', 'position', '자료 제공 범위를 확인해야 합니다.'),
  turn('flareon', 'response', '자료 제공 범위를 확인해야 합니다.'),
  turn('umbreon', 'response', '자료 제공 범위를 확인해야 합니다.'),
];

function schema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string', minLength: 1, maxLength: 10000 },
      recommendation: { type: 'string', minLength: 1, maxLength: 2000, description: '추천 문장' },
      resolutionsByTurn: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(turns.map(({ turnRef }) => [turnRef, {
          type: 'object', additionalProperties: false,
          properties: { disposition: { type: 'string', enum: ['addressed', 'open', 'not_applicable'] }, rationale: { type: 'string', minLength: 1, maxLength: 400 } },
          required: ['disposition', 'rationale'],
        }])),
        required: turns.map(({ turnRef }) => turnRef),
      },
    },
    required: ['answer', 'recommendation', 'resolutionsByTurn'],
  };
}

test('prompt and schema expose only earlier same-owner exact objection aliases', () => {
  const prompt = { systemInstruction: '기존 지시', prompt: JSON.stringify({ phase: 'synthesis', untrustedDiscussion: turns }) };
  const beforePrompt = structuredClone(prompt);
  const compactPrompt = compactSynthesisPrompt(prompt, turns);
  const promptData = JSON.parse(compactPrompt.prompt);
  assert.deepEqual(promptData.resolutionAliases, {
    'position:flareon': [],
    'position:umbreon': [],
    'response:flareon': ['position:flareon'],
    'response:umbreon': ['position:umbreon'],
  });
  assert.match(compactPrompt.systemInstruction, /같은 최종 disposition과 rationale/);
  assert.match(compactPrompt.systemInstruction, /recommendation=null/);
  assert.match(compactPrompt.systemInstruction, /사실이나 합의를 추가하지 않는다/);
  assert.deepEqual(prompt, beforePrompt);

  const original = schema();
  const beforeSchema = structuredClone(original);
  const compactSchema = compactSynthesisSchema(original, turns);
  assert.deepEqual(compactSchema.required, original.required);
  assert.deepEqual(compactSchema.properties.recommendation.anyOf[0], original.properties.recommendation);
  assert.deepEqual(compactSchema.properties.recommendation.anyOf[1], { type: 'null' });
  const refs = compactSchema.properties.resolutionsByTurn.properties;
  for (const ref of ['position:flareon', 'position:umbreon']) {
    const option = refs[ref];
    assert.equal(option.type, 'object');
  }
  assert.deepEqual(refs['response:flareon'].anyOf[0], original.properties.resolutionsByTurn.properties['response:flareon']);
  assert.deepEqual(refs['response:flareon'].anyOf[1], { type: 'string', enum: ['position:flareon'] });
  assert.deepEqual(refs['response:umbreon'].anyOf[1], { type: 'string', enum: ['position:umbreon'] });
  assert.equal(refs['position:umbreon'].anyOf, undefined);
  assert.deepEqual(original, beforeSchema);
  assert.throws(() => compactSynthesisSchema({ ...structuredClone(original), properties: { ...original.properties, resolutionsByTurn: { ...original.properties.resolutionsByTurn, required: ['extra'] } } }, turns));
});

test('expansion copies an eligible earlier decision while preserving an explicit different decision', () => {
  const decision = { disposition: 'addressed', rationale: '문안을 고쳤습니다.' };
  const raw = {
    answer: '고객에게 확인 절차를 안내합니다.', nextAction: '자료 제공 여부를 확인합니다.', recommendation: '추천 문장', evidence: [], dissent: [],
    resolutionsByTurn: {
      'position:flareon': decision,
      'response:flareon': 'position:flareon',
      'position:umbreon': { disposition: 'open', rationale: '별도 근거가 필요합니다.' },
      'response:umbreon': { disposition: 'not_applicable', rationale: '이 반론은 이번 답에 적용되지 않습니다.' },
    },
    providerMetadata: { kept: true },
  };
  const beforeRaw = structuredClone(raw);
  const beforeTurns = structuredClone(turns);
  const expanded = expandCompactSynthesis(raw, turns);
  assert.deepEqual(expanded.resolutionsByTurn['response:flareon'], decision);
  assert.notEqual(expanded.resolutionsByTurn['response:flareon'], expanded.resolutionsByTurn['position:flareon']);
  assert.equal(expanded.resolutionsByTurn['response:umbreon'].disposition, 'not_applicable');
  assert.deepEqual(expanded.providerMetadata, { kept: true });
  assert.deepEqual(raw, beforeRaw);
  assert.deepEqual(turns, beforeTurns);

  const parsed = readOfficeSynthesisOutput(expanded, turns);
  assert.equal(parsed.resolutions.length, 4);
  const { providerMetadata: _providerMetadata, ...publicAnswer } = parsed.answer;
  assert.deepEqual(parseOfficeAnswer(publicAnswer, 'council'), {
    answer: raw.answer, nextAction: raw.nextAction, recommendation: raw.recommendation, evidence: [], dissent: [],
  });
});

test('expansion resolves an eligible chain of earlier references in turn order', () => {
  const chainTurns = [
    turn('flareon', 'position', '같은 반론', 'first:flareon'),
    turn('flareon', 'response', '같은 반론', 'second:flareon'),
    turn('flareon', 'response', '같은 반론', 'third:flareon'),
  ];
  const decision = { disposition: 'addressed', rationale: '같은 결정을 유지합니다.' };
  const expanded = expandCompactSynthesis({
    answer: '답', recommendation: '추천',
    resolutionsByTurn: {
      'first:flareon': decision,
      'second:flareon': 'first:flareon',
      'third:flareon': 'second:flareon',
    },
  }, chainTurns);
  assert.deepEqual(expanded.resolutionsByTurn['second:flareon'], decision);
  assert.deepEqual(expanded.resolutionsByTurn['third:flareon'], decision);
  assert.notEqual(expanded.resolutionsByTurn['first:flareon'], expanded.resolutionsByTurn['second:flareon']);
  assert.notEqual(expanded.resolutionsByTurn['second:flareon'], expanded.resolutionsByTurn['third:flareon']);
});

test('only exact required objection keys and eligible earlier references expand', () => {
  const base = {
    answer: '답', recommendation: '추천', evidence: [], dissent: [],
    resolutionsByTurn: Object.fromEntries(turns.map(({ turnRef }) => [turnRef, { disposition: 'open', rationale: '근거가 더 필요합니다.' }])),
  };
  for (const reference of ['response:flareon', 'position:umbreon']) {
    const raw = structuredClone(base);
    raw.resolutionsByTurn['response:flareon'] = reference;
    assert.throws(() => expandCompactSynthesis(raw, turns));
  }
  const changedObjectionTurns = [turns[0], { ...turns[2], objection: `${turns[0].objection} ` }, turns[1], turns[3]];
  const changedRaw = { ...structuredClone(base), resolutionsByTurn: Object.fromEntries(changedObjectionTurns.map(({ turnRef }) => [turnRef, { disposition: 'open', rationale: '근거가 더 필요합니다.' }])) };
  changedRaw.resolutionsByTurn['response:flareon'] = 'position:flareon';
  assert.throws(() => expandCompactSynthesis(changedRaw, changedObjectionTurns));
  for (const mutate of [
    value => { delete value.resolutionsByTurn['position:flareon']; },
    value => { value.resolutionsByTurn.extra = { disposition: 'open', rationale: '추가 키' }; },
  ]) {
    const raw = structuredClone(base);
    mutate(raw);
    assert.throws(() => expandCompactSynthesis(raw, turns));
  }
  assert.throws(() => compactSynthesisPrompt({ systemInstruction: '', prompt: '{}' }, [turn('flareon', 'position', '반론', 'same'), turn('flareon', 'response', '반론', 'same')]));
  assert.throws(() => compactSynthesisSchema(schema(), [turn('flareon', 'position', '반론', '')]));
});

test('recommendation null copies only a nonempty NUL-free answer within the public limit', () => {
  const base = { nextAction: '확인합니다.', recommendation: null, evidence: [], dissent: [], resolutionsByTurn: Object.fromEntries(turns.map(({ turnRef }) => [turnRef, { disposition: 'open', rationale: '확인이 필요합니다.' }])) };
  for (const answer of ['가'.repeat(2000), '  답  ']) {
    const expanded = expandCompactSynthesis({ ...base, answer }, turns);
    assert.equal(expanded.recommendation, answer);
    const { resolutionsByTurn: _resolutionsByTurn, ...publicAnswer } = expanded;
    assert.equal(parseOfficeAnswer(publicAnswer, 'council').recommendation, answer.trim());
  }
  for (const answer of ['가'.repeat(2001), '   ', '문장\0끝']) {
    assert.throws(() => expandCompactSynthesis({ ...base, answer }, turns));
  }
  const explicit = expandCompactSynthesis({ ...base, answer: '답', recommendation: '별도 추천' }, turns);
  assert.equal(explicit.recommendation, '별도 추천');
});
