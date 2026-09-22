import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentHash } from './index.js';
import { OFFICE_DISCUSSION_VERSION, parseOfficeRequest, parseOfficeDeliberation, parseOfficeDiscussion, parseOfficeDiscussionTurn, officeDiscussionRounds } from './office.js';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowResult, OFFICE_WORKFLOW_VERSION } from './office-workflow.js';

const participants = ['eevee', 'leafeon'];
const request = extra => parseOfficeRequest({ ownerId: 'eevee', mode: 'council', scope: 'personal', participants, message: '정해진 시간 안에서 비교해주세요.', ...extra });
const turn = (ownerId, round = 'position') => ({ ownerId, round, position: '확인한 조건에서 제안합니다.', evidence: ['가용 시간은 사용자 입력 기준이다.'], objection: '', revisionCondition: '가용 시간이 달라지면 재검토한다.', changed: false, replyTo: round === 'position' ? [] : participants.filter(id => id !== ownerId), changeReason: round === 'position' ? '' : '다른 관점도 시간 제약을 해소하지 못해 유지한다.' });
function discussion(r) {
  const settings = parseOfficeDeliberation(r.deliberation, r.participants);
  const turns = r.participants.map(id => turn(id));
  if (officeDiscussionRounds(settings) === 2) turns.push(...r.participants.map(id => turn(id, 'response')));
  return { version: OFFICE_DISCUSSION_VERSION, settings, turns, modelCalls: turns.length + 1 };
}

test('explicit controls bind selected roles and the actual number of review rounds', () => {
  const urgent = request({ deliberation: { profile: 'urgent', influence: { leafeon: 3 } } });
  assert.equal(urgent.deliberation.convergence, 3);
  assert.equal(urgent.deliberation.influence.eevee, 1);
  assert.equal(discussion(urgent).modelCalls, 3);
  const detailed = request({ deliberation: { profile: 'scrutiny' } });
  assert.equal(discussion(detailed).modelCalls, 5);
  assert.equal(discussion(request({ deliberation: { profile: 'scrutiny', challenge: 0 } })).modelCalls, 3);
  for (const deliberation of [null, [], { profile: '__proto__' }, { profile: null }, { depth: 0 }, { warmth: 4 }, { convergence: 1.5 }, { challenge: '2' }, { challenge: null }, { influence: null }, { influence: { umbreon: 3 } }, { influence: { leafeon: 0 } }, { influence: { leafeon: null } }, { execution: true }]) assert.throws(() => request({ deliberation }));
  assert.throws(() => parseOfficeRequest({ ownerId: 'eevee', mode: 'chat', message: '안녕', deliberation: {} }));
});

test('a transcript cannot invent, reorder, omit or attribute another role response', () => {
  const r = request(), valid = discussion(r);
  assert.deepEqual(parseOfficeDiscussion(valid, r), valid);
  for (const invalid of [
    { ...valid, version: 'prior' }, { ...valid, modelCalls: 2 },
    { ...valid, turns: valid.turns.slice(1) },
    { ...valid, turns: [valid.turns[1], valid.turns[0], ...valid.turns.slice(2)] },
    { ...valid, turns: [turn('umbreon'), ...valid.turns.slice(1)] },
    { ...valid, turns: [{ ...valid.turns[0], changed: true }, ...valid.turns.slice(1)] },
    { ...valid, turns: [...valid.turns.slice(0, 2), { ...valid.turns[2], replyTo: [] }, valid.turns[3]] },
    { ...valid, turns: [...valid.turns.slice(0, 2), { ...valid.turns[2], changeReason: '' }, valid.turns[3]] },
    { ...valid, settings: { ...valid.settings, warmth: 3 } },
    { ...valid, verifiedIndependent: true },
  ]) assert.throws(() => parseOfficeDiscussion(invalid, r));
  assert.throws(() => parseOfficeDiscussion(valid, { ...r, participants: [], ownerId: undefined }));
  assert.throws(() => parseOfficeDiscussionTurn({ ...turn('eevee'), round: 'invented' }, { ownerId: 'eevee', round: 'invented', participants }));
  assert.throws(() => parseOfficeDiscussionTurn({ ...turn('eevee'), position: '한'.repeat(601) }, { ownerId: 'eevee', round: 'position', participants }));
});

test('new controls enter immutable workflow identity; omitted controls retain the old snapshot shape', () => {
  const input = { requestId: '10000000-0000-4000-8000-000000000001', intent: 'freeform', scope: 'personal', ownerId: 'eevee', mode: 'council', participants, originRef: {}, message: '비교해 주세요.', expectedContextHash: 'a'.repeat(64) };
  const old = parseOfficeWorkflowRequest(input);
  assert.ok(!Object.hasOwn(old, 'deliberation'));
  const urgent = parseOfficeWorkflowRequest({ ...input, deliberation: { profile: 'urgent' } });
  const detailed = parseOfficeWorkflowRequest({ ...input, deliberation: { profile: 'scrutiny' } });
  assert.notEqual(agentHash(urgent), agentHash(detailed));
  assert.equal(agentHash(urgent), agentHash(parseOfficeWorkflowRequest({ ...input, deliberation: urgent.deliberation })));
  assert.notEqual(agentHash(old), agentHash(urgent));
});

test('new workflow results require the full matching discussion while old persisted outputs remain readable', () => {
  const r = parseOfficeWorkflowRequest({ requestId: '10000000-0000-4000-8000-000000000001', intent: 'freeform', scope: 'personal', ownerId: 'eevee', mode: 'council', participants, originRef: {}, message: '비교해 주세요.', expectedContextHash: 'a'.repeat(64) });
  const context = { scope: r.scope, asOf: '2026-09-22T00:00:00Z', contextHash: r.expectedContextHash, missing: [], sourceRefs: [] };
  const result = { version: OFFICE_WORKFLOW_VERSION, requestId: r.requestId, resultRevision: 1, status: 'generated', ownerId: r.ownerId, mode: r.mode, scope: r.scope, participants, summary: '조건 비교', artifact: { kind: 'text', body: '오늘은 제안 범위를 줄인다.' }, evidence: [], uncertainties: [], dissent: [], nextStep: null, council: { perspectives: participants.map(ownerId => ({ ownerId, judgment: '범위 축소', tradeoff: '진행 보류' })), recommendation: '범위 축소' }, context: { asOf: context.asOf, contextHash: context.contextHash, missing: [] }, generation: { policyVersion: 'contract-check', promptHash: 'b'.repeat(64), model: 'test-provider', usage: null, elapsedMs: 10 } };
  assert.equal(parseOfficeWorkflowResult(result, r, context).status, 'generated');
  const current = { ...r, deliberation: parseOfficeDeliberation({}, participants) };
  assert.throws(() => parseOfficeWorkflowResult(result, current, context));
  const recorded = { ...result, discussion: discussion(current) };
  assert.deepEqual(parseOfficeWorkflowResult(recorded, current, context).discussion, recorded.discussion);
  assert.throws(() => parseOfficeWorkflowResult({ ...recorded, discussion: { ...recorded.discussion, modelCalls: 9 } }, current, context));
});
