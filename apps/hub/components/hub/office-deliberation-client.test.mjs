import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_DISCUSSION_VERSION } from '@com-moon/agent-contracts/office';
import { officeDeliberationForParticipants, officeDiscussionState, officeRemainingDissent } from './office-deliberation-client.js';
import { buildOfficeMentorDraft } from './office-mentor-client.js';

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
  const discussion = { version: OFFICE_DISCUSSION_VERSION, settings, modelCalls: 3, resolutions: [], turns: participants.map(ownerId => ({
    turnRef: `position:${ownerId}`, peerReviews: [], sourceCheck: 'traced', sourceCounts: { selected: 2, traced: 1, untraced: 1 },
    ownerId, round: 'position', position: '제공한 조건 안에서 판단합니다.', evidence: ['사용자가 전달한 조건'], objection: '',
    revisionCondition: '조건이 달라지면 다시 검토합니다.', changed: false, replyTo: [], changeReason: '',
  })) };
  const result = { status: 'generated', ownerId: 'eevee', mode: 'council', participants, discussion };
  assert.equal(officeDiscussionState(result, request).state, 'current');
  assert.equal(officeDiscussionState(result, request).evaluation.source.untraced, 2);
  const old = { ...discussion, version: '2026-09-22.v1', turns: discussion.turns.map(({ turnRef, peerReviews, sourceCheck, sourceCounts, ...turn }) => turn) };
  delete old.resolutions;
  const previous = officeDiscussionState({ ...result, discussion: old }, request);
  assert.equal(previous.state, 'current');
  assert.equal(previous.evaluation.source.selected, null);
  assert.equal(previous.evaluation.objections.open, null);
  assert.equal(officeDiscussionState({ ...result, discussion: undefined }).state, 'legacy');
  assert.equal(officeDiscussionState({ ...result, discussion: undefined }, request).state, 'invalid');
  assert.equal(officeDiscussionState({ ...result, status: 'error' }).state, 'none');
  assert.equal(officeDiscussionState({ ...result, mode: 'draft' }).state, 'none');
  assert.equal(officeDiscussionState({ ...result, discussion: { ...discussion, turns: [] } }).state, 'invalid');
  assert.equal(officeDiscussionState(result, { ...request, deliberation: { ...settings, warmth: 3 } }).state, 'invalid');
});

test('open objections stay in result and requested mentor review when free-text dissent is empty', () => {
  const participants = ['eevee', 'umbreon'];
  const settings = officeDeliberationForParticipants({ profile: 'urgent' }, participants);
  const turns = participants.map(ownerId => ({ ownerId, round: 'position', turnRef: `position:${ownerId}`,
    position: '현재 조건에서 판단합니다.', evidence: [], objection: `${ownerId} 예산이 미확인`, revisionCondition: '예산 확인 후',
    changed: false, replyTo: [], changeReason: '', peerReviews: [], sourceCheck: 'none', sourceCounts: { selected: 0, traced: 0, untraced: 0 } }));
  const result = { status: 'generated', ownerId: 'eevee', mode: 'council', scope: 'personal', participants, answer: '조건을 확인합니다.', dissent: [],
    discussion: { version: OFFICE_DISCUSSION_VERSION, settings, modelCalls: 3, turns, resolutions: turns.map(turn => ({ turnRef: turn.turnRef, disposition: 'open', rationale: '예산 자료가 없습니다.' })) } };
  const original = structuredClone(result);
  assert.deepEqual(officeRemainingDissent(result), turns.map(turn => turn.objection));
  assert.deepEqual(officeRemainingDissent({ ...result, dissent: [turns[0].objection] }), turns.map(turn => turn.objection));
  const draft = buildOfficeMentorDraft({ result, officeSource: { requestId: '10000000-0000-4000-8000-000000000001' } });
  for (const turn of turns) assert.ok(draft.draft.includes(turn.objection));
  assert.deepEqual(result, original);
  result.discussion.resolutions[0].turnRef = 'forged';
  assert.deepEqual(officeRemainingDissent(result), []);
});
