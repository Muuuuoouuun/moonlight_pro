import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acceptedDecisionProposal, collectAcceptedDecision } from './meeting-decision-log.js';
import { decisionSourceKey } from './decision-sources.js';

// 회의 리뷰에서 수락한 결정을 결정 일지에 참조 행으로 모은다(확인할 것 스펙 §6, Q-CF4).
const ENTRY = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '22222222-2222-4222-8222-222222222222';
const input = { action: 'review', entryId: ENTRY, proposalId: PROPOSAL, decision: 'accepted' };
const result = (proposal) => ({ status: 'saved', entryId: ENTRY, proposals: [proposal] });
const decisionProposal = { id: PROPOSAL, kind: 'decision', text: '원안', review: { status: 'accepted', text: '가격은 월 3만 원으로', edited: true, reviewedAt: '2026-10-01T03:00:00Z' } };

function fakeForward(responses) {
  const calls = [];
  return { calls, forward: async (command) => { calls.push(command); return { data: responses.shift() || { status: 'saved' } }; } };
}

test('결정 종류를 수락했을 때만 — 행동·거절·대기·다른 제안은 모으지 않는다', () => {
  assert.equal(acceptedDecisionProposal(input, result(decisionProposal)).title, '가격은 월 3만 원으로');
  assert.equal(acceptedDecisionProposal(input, result({ ...decisionProposal, kind: 'action' })), null);
  assert.equal(acceptedDecisionProposal({ ...input, decision: 'rejected' }, result(decisionProposal)), null);
  assert.equal(acceptedDecisionProposal(input, { ...result(decisionProposal), status: 'conflict' }), null);
  assert.equal(acceptedDecisionProposal({ ...input, proposalId: 'other' }, result(decisionProposal)), null);
});

test('결정 id는 제안 id, 출처는 회의 메모를 가리키는 참조 — 재시도는 duplicate', async () => {
  const { calls, forward } = fakeForward([{ status: 'duplicate' }]);
  const logged = await collectAcceptedDecision(input, result(decisionProposal), { forward, workspaceId: 'ws' });
  assert.deepEqual(logged, { status: 'duplicate', decisionId: PROPOSAL });
  assert.deepEqual(calls[0], {
    action: 'create_decision', id: PROPOSAL, title: '가격은 월 3만 원으로', decidedAt: '2026-10-01T03:00:00Z',
    source: 'meeting-review', sourceRef: { type: 'meeting', id: ENTRY }, workspaceId: 'ws',
  });
  assert.equal(decisionSourceKey('meeting-review'), 'meeting');
});

test('수락 뒤 문구를 고쳐 다시 수락하면 같은 결정을 고친다, 실패는 리뷰를 막지 않고 상태로만 알린다', async () => {
  const edited = fakeForward([{ status: 'conflict', error: 'id-reuse-payload-mismatch' }, { status: 'saved' }]);
  assert.equal((await collectAcceptedDecision(input, result(decisionProposal), { forward: edited.forward, workspaceId: 'ws' })).status, 'saved');
  assert.equal(edited.calls[1].action, 'update_decision');
  assert.equal(edited.calls[1].title, '가격은 월 3만 원으로');

  const down = fakeForward([{ status: 'preview', error: 'engine-not-configured' }]);
  assert.equal((await collectAcceptedDecision(input, result(decisionProposal), { forward: down.forward, workspaceId: 'ws' })).status, 'preview');
});
