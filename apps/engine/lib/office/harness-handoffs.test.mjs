import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_IDS } from '@com-moon/agent-contracts/office';
import { OFFICE_HANDOFFS, OFFICE_WORK_KINDS } from '@com-moon/agent-contracts/office-harness';
import { OFFICE_ROLE_CARDS } from './role-cards.ts';

// The browser-safe harness keeps a copy of the role-card handoffs. The cards stay the source.
test('harness handoff table is an exact copy of the role-card handoffs', () => {
  assert.deepEqual(Object.keys(OFFICE_HANDOFFS).sort(), [...OFFICE_IDS].sort());
  for (const id of OFFICE_IDS) assert.deepEqual([...OFFICE_HANDOFFS[id]], OFFICE_ROLE_CARDS[id].handoffs.map(handoff => handoff.to), id);
});

test('every work kind is owned by a specialist, not by the intake role', () => {
  for (const [kind, { ownerId }] of Object.entries(OFFICE_WORK_KINDS)) {
    assert.ok(OFFICE_IDS.includes(ownerId), kind);
    assert.notEqual(ownerId, 'eevee', kind);
  }
});
