import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_DISCUSSION_VERSION } from '@com-moon/agent-contracts/office';
import { officeDeliberationForParticipants, officeDiscussionState } from './office-deliberation-client.js';

test('participant changes retain axis values and reset only newly selected weights', () => {
  const before = officeDeliberationForParticipants({ profile: 'explore', warmth: 3, influence: { eevee: 2, umbreon: 3 } }, ['eevee', 'umbreon']);
  const after = officeDeliberationForParticipants(before, ['eevee', 'vaporeon']);
  assert.equal(after.profile, 'explore');
  assert.equal(after.warmth, 3);
  assert.deepEqual(after.influence, { eevee: 2, vaporeon: 1 });
  assert.deepEqual(before.influence, { eevee: 2, umbreon: 3 });
  after.influence.eevee = 1;
  assert.equal(before.influence.eevee, 2);
});

test('old, failed, incomplete and mismatched discussions cannot masquerade as current role turns', () => {
  const participants = ['eevee', 'umbreon'];
  const settings = officeDeliberationForParticipants({ profile: 'urgent' }, participants);
  const request = { ownerId: 'eevee', mode: 'council', participants, deliberation: settings };
  const discussion = { version: OFFICE_DISCUSSION_VERSION, settings, modelCalls: 3, turns: participants.map(ownerId => ({
    ownerId, round: 'position', position: '제공한 조건 안에서 판단합니다.', evidence: ['사용자가 전달한 조건'], objection: '',
    revisionCondition: '조건이 달라지면 다시 검토합니다.', changed: false, replyTo: [], changeReason: '',
  })) };
  const result = { status: 'generated', ownerId: 'eevee', mode: 'council', participants, discussion };
  assert.equal(officeDiscussionState(result, request).state, 'current');
  assert.equal(officeDiscussionState({ ...result, discussion: undefined }).state, 'legacy');
  assert.equal(officeDiscussionState({ ...result, discussion: undefined }, request).state, 'invalid');
  assert.equal(officeDiscussionState({ ...result, status: 'error' }).state, 'none');
  assert.equal(officeDiscussionState({ ...result, mode: 'draft' }).state, 'none');
  assert.equal(officeDiscussionState({ ...result, discussion: { ...discussion, turns: [] } }).state, 'invalid');
  assert.equal(officeDiscussionState(result, { ...request, deliberation: { ...settings, warmth: 3 } }).state, 'invalid');
});
