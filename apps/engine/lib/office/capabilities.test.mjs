import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_IDS } from '@com-moon/agent-contracts/office';
import { OFFICE_ROLE_CARDS, OFFICE_ROLE_CARD_VERSION } from './role-cards.ts';
import { OFFICE_CAPABILITY_VERSION, OFFICE_ROUTING_CAPABILITIES } from './capabilities.ts';

test('all nine routing capabilities preserve their existing job contract and exclude voice material', () => {
  assert.equal(OFFICE_CAPABILITY_VERSION, OFFICE_ROLE_CARD_VERSION);
  assert.deepEqual(OFFICE_ROUTING_CAPABILITIES.map(role => role.id), OFFICE_IDS);
  const fields = ['mission', 'ownership', 'expertise', 'deliverables', 'boundaries', 'handoffs', 'deliberation'];
  for (const capability of OFFICE_ROUTING_CAPABILITIES) {
    const card = OFFICE_ROLE_CARDS[capability.id];
    assert.deepEqual(Object.keys(capability).sort(), ['id', 'name', 'role', ...fields].sort());
    for (const field of fields) assert.deepEqual(capability[field], card[field], `${capability.id}.${field}`);
    for (const example of card.voice.examples) assert.equal(JSON.stringify(capability).includes(example.response), false);
  }
  assert.ok(JSON.stringify(OFFICE_ROUTING_CAPABILITIES).length < 18000, 'nine role contracts must fit the routing prompt budget');
});

test('routing projection cannot mutate the frozen role cards or introduce runtime permissions', () => {
  const before = JSON.stringify(OFFICE_ROLE_CARDS);
  assert.ok(Object.isFrozen(OFFICE_ROUTING_CAPABILITIES));
  for (const capability of OFFICE_ROUTING_CAPABILITIES) {
    assert.ok(Object.isFrozen(capability));
    assert.throws(() => { capability.mission = 'replacement'; }, TypeError);
    assert.throws(() => { capability.deliverables.push({ when: 'any', produce: 'execute' }); }, TypeError);
    assert.throws(() => { capability.handoffs[0].to = capability.id; }, TypeError);
    assert.equal(capability.tools, undefined);
    assert.equal(capability.canExecute, undefined);
  }
  assert.equal(JSON.stringify(OFFICE_ROLE_CARDS), before);
});
