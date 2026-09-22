import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICE_AGENTS,
  OFFICE_AGENT_IDS,
  OFFICE_MODES,
  OFFICE_GATES,
  OFFICE_HARSH_RUBRICS,
  isOfficeAgentId,
  isOfficeMode,
  parseOfficeChatInput,
  OfficeContractError,
} from './office.js';

test('office contracts exports all 9 personas and 4 modes', () => {
  assert.equal(OFFICE_AGENT_IDS.length, 9);
  assert.deepEqual(OFFICE_MODES, ['chat', 'task', 'critique', 'council']);

  const expected = [
    'eevee',
    'vaporeon',
    'jolteon',
    'flareon',
    'espeon',
    'umbreon',
    'leafeon',
    'glaceon',
    'sylveon',
  ];
  assert.deepEqual([...OFFICE_AGENT_IDS], expected);

  for (const id of expected) {
    assert.equal(isOfficeAgentId(id), true);
    assert.ok(OFFICE_AGENTS[id].nameKo);
    assert.ok(OFFICE_AGENTS[id].role);
    assert.ok(OFFICE_AGENTS[id].tagline);
    assert.ok(OFFICE_AGENTS[id].focus);
    assert.ok(OFFICE_AGENTS[id].boundary);
    assert.ok(OFFICE_AGENTS[id].resultFocus);
    assert.ok(OFFICE_AGENTS[id].directionFocus);
    assert.ok(OFFICE_AGENTS[id].decisionRubric);
    assert.ok(Array.isArray(OFFICE_AGENTS[id].tensionWith) && OFFICE_AGENTS[id].tensionWith.length > 0);
  }
  assert.equal(isOfficeAgentId('unknown'), false);
  assert.equal(isOfficeAgentId('order'), false); // ensure existing personas are not conflated
});

test('parseOfficeChatInput parses valid inputs and sets defaults', () => {
  const result = parseOfficeChatInput({
    agentId: 'flareon',
    message: '고객 반론 대응 초안 부탁해',
  });

  assert.equal(result.agentId, 'flareon');
  assert.equal(result.mode, 'chat');
  assert.equal(result.message, '고객 반론 대응 초안 부탁해');
  assert.equal(result.draft, null);
  assert.deepEqual(result.participants, []);
});

test('parseOfficeChatInput supports council mode and validates participants', () => {
  const result = parseOfficeChatInput({
    agentId: 'espeon',
    mode: 'council',
    message: '새로운 서비스 론칭 타당성 검토',
    participants: ['leafeon', 'glaceon'],
  });

  assert.equal(result.agentId, 'espeon');
  assert.equal(result.mode, 'council');
  assert.deepEqual(result.participants, ['leafeon', 'glaceon']);
});

test('parseOfficeChatInput rejects unknown agents, modes, and empty input', () => {
  assert.throws(
    () => parseOfficeChatInput({ agentId: 'unknown', message: '안녕' }),
    (err) => err instanceof OfficeContractError && err.code === 'unknown-agent',
  );

  assert.throws(
    () => parseOfficeChatInput({ agentId: 'eevee', mode: 'invalid', message: '안녕' }),
    (err) => err instanceof OfficeContractError && err.code === 'unknown-mode',
  );

  assert.throws(
    () => parseOfficeChatInput({ agentId: 'eevee', message: '   ' }),
    (err) => err instanceof OfficeContractError && err.code === 'empty-message',
  );

  assert.throws(
    () => parseOfficeChatInput({
      agentId: 'eevee',
      mode: 'council',
      message: '회의',
      participants: ['invalid_persona'],
    }),
    (err) => err instanceof OfficeContractError && err.code === 'invalid-participant',
  );
});

test('office contracts exports harsh rubrics and gates', () => {
  assert.deepEqual(OFFICE_GATES, ['PASS', 'REVISE', 'REJECT']);
  for (const id of OFFICE_AGENT_IDS) {
    const rubric = OFFICE_HARSH_RUBRICS[id];
    assert.ok(rubric, `Rubric for ${id} must exist`);
    assert.ok(rubric.metric, `Metric for ${id} must exist`);
    assert.ok(rubric.passingThreshold >= 70 && rubric.passingThreshold <= 90);
    assert.ok(Array.isArray(rubric.penalties) && rubric.penalties.length > 0);
  }

  // Critical gates check
  assert.equal(OFFICE_HARSH_RUBRICS.umbreon.criticalGate, true);
  assert.equal(OFFICE_HARSH_RUBRICS.glaceon.criticalGate, true);
  assert.equal(OFFICE_HARSH_RUBRICS.vaporeon.criticalGate, true);
});

test('parseOfficeChatInput parses evaluate flag', () => {
  const res1 = parseOfficeChatInput({
    agentId: 'umbreon',
    message: '보안 검토',
    evaluate: true,
  });
  assert.equal(res1.evaluate, true);

  const res2 = parseOfficeChatInput({
    agentId: 'umbreon',
    message: '보안 검토',
  });
  assert.equal(res2.evaluate, false);
});

test('office personas define recommendedTier and defaultTemperature', () => {
  for (const id of OFFICE_AGENT_IDS) {
    const meta = OFFICE_AGENTS[id];
    assert.ok(meta.recommendedTier === 'pro' || meta.recommendedTier === 'flash');
    assert.ok(typeof meta.defaultTemperature === 'number' && meta.defaultTemperature >= 0.1 && meta.defaultTemperature <= 1.0);
  }
  assert.equal(OFFICE_AGENTS.umbreon.recommendedTier, 'pro');
  assert.equal(OFFICE_AGENTS.umbreon.defaultTemperature, 0.1);
  assert.equal(OFFICE_AGENTS.sylveon.defaultTemperature, 0.7);
});

test('parseOfficeChatInput accepts and validates optional model parameter', () => {
  const res = parseOfficeChatInput({
    agentId: 'eevee',
    message: '안녕',
    model: 'gemini-2.5-pro',
  });
  assert.equal(res.model, 'gemini-2.5-pro');

  assert.throws(
    () => parseOfficeChatInput({ agentId: 'eevee', message: '안녕', model: 'invalid model name with spaces' }),
    (err) => err instanceof OfficeContractError && err.code === 'invalid-model',
  );
});

