import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICE_AGENTS,
  OFFICE_AGENT_IDS,
  OFFICE_MODES,
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
