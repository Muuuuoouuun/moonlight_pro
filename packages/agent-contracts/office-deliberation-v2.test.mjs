import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as office from './office.js';

const request = (participants = ['eevee', 'umbreon', 'leafeon'], profile = 'balanced') => office.parseOfficeRequest({ ownerId: participants[0], mode: 'council', scope: 'personal', message: '검토할 조건을 비교해 주세요.', participants, deliberation: { profile } });
function transcript(r = request()) {
  const positions = r.participants.map(ownerId => ({ ownerId, round: 'position', turnRef: `position:${ownerId}`, position: `${ownerId}의 최초 판단`, evidence: [], objection: ownerId === 'umbreon' ? '미확인 조건이 남습니다.' : '', revisionCondition: '새 사실이 있으면 다시 판단합니다.', changed: false, replyTo: [], changeReason: '', peerReviews: [], sourceCheck: 'none', sourceCounts: { selected: 0, traced: 0, untraced: 0 } }));
  const responses = office.officeDiscussionRounds(r.deliberation) === 1 ? [] : positions.map((position, index) => {
    const target = positions[(index + 1) % positions.length];
    return { ...position, round: 'response', turnRef: `response:${position.ownerId}`, replyTo: [target.ownerId], changeReason: '동료의 공개 판단을 고려했습니다.', peerReviews: [{ ownerId: target.ownerId, field: 'position', quote: target.position, assessment: 'needs_evidence', reason: '현재 자료로 확인되지 않은 조건입니다.' }] };
  });
  const turns = [...positions, ...responses];
  return { version: '2026-10-04.v2', settings: r.deliberation, turns, modelCalls: turns.length + 1, resolutions: turns.filter(turn => turn.objection).map(turn => ({ turnRef: turn.turnRef, disposition: 'open', rationale: '추가 근거가 없어 남겨 둡니다.' })) };
}

test('v2 ring targets cover every role and validated summaries count structure only', () => {
  for (const ids of [['eevee', 'umbreon'], ['leafeon', 'eevee', 'umbreon']]) {
    const r = request(ids), value = transcript(r);
    assert.equal(office.OFFICE_DISCUSSION_VERSION, '2026-10-04.v2');
    assert.deepEqual(office.officeDiscussionReviewTargets(ids), Object.fromEntries(ids.map((id, index) => [id, ids[(index + 1) % ids.length]])));
    assert.deepEqual(office.parseOfficeDiscussion(value, r), value);
    const summary = office.evaluateOfficeDiscussion(value, r);
    assert.equal(summary.kind, 'structural-only');
    assert.equal(summary.peerReviews, ids.length);
    assert.deepEqual(summary.reviewedRoleIds, ids);
    assert.deepEqual(summary.unreviewedRoleIds, []);
    assert.deepEqual(summary.objections, { total: 2, addressed: 0, open: 2, notApplicable: 0 });
    assert.equal(Object.hasOwn(summary, 'score'), false);
  }
});

test('v2 rejects invented peer quotes, missing assigned targets, mismatched replyTo and metadata', () => {
  const r = request(), valid = transcript(r);
  const invalid = [
    value => { value.turns[3].peerReviews[0].quote = '존재하지 않는 발언'; },
    value => { value.turns[3].peerReviews[0].ownerId = 'leafeon'; value.turns[3].peerReviews[0].quote = valid.turns[2].position; value.turns[3].replyTo = ['leafeon']; },
    value => { value.turns[3].replyTo = ['leafeon']; },
    value => { value.turns[3].peerReviews[0].field = 'changeReason'; },
    value => { value.turns[3].peerReviews[0].assessment = 'verified'; },
    value => { value.turns[3].peerReviews.push(value.turns[3].peerReviews[0]); },
    value => { value.turns[0].changeReason = '아직 보지 않은 동료 의견에 답했습니다.'; },
    value => { value.turns[0].turnRef = 'response:eevee'; },
    value => { value.turns[0].sourceCounts = { selected: 2, traced: 1, untraced: 0 }; },
    value => { value.turns[0].sourceCheck = 'traced'; },
  ];
  for (const mutate of invalid) { const value = structuredClone(valid); mutate(value); assert.throws(() => office.parseOfficeDiscussion(value, r)); }
  const mixed = structuredClone(valid);
  Object.assign(mixed.turns[0], { sourceCheck: 'traced', sourceCounts: { selected: 2, traced: 1, untraced: 1 } });
  assert.equal(office.evaluateOfficeDiscussion(mixed, r).source.untraced, 1);
});

test('v2 resolution references cover exactly actual objections, including both rounds', () => {
  const r = request(), valid = transcript(r);
  for (const resolutions of [[], valid.resolutions.slice(1), [...valid.resolutions, valid.resolutions[0]], [{ ...valid.resolutions[0], turnRef: 'position:eevee' }, valid.resolutions[1]], [{ ...valid.resolutions[0], disposition: 'verified' }, valid.resolutions[1]]]) {
    assert.throws(() => office.parseOfficeDiscussion({ ...valid, resolutions }, r));
  }
  assert.deepEqual(office.parseOfficeDiscussion(valid, r).resolutions, valid.resolutions);
  const urgent = request(undefined, 'urgent');
  const summary = office.evaluateOfficeDiscussion(transcript(urgent), urgent);
  assert.equal(summary.reviewRequired, false);
  assert.equal(summary.peerReviews, 0);
});

test('legacy v1 records remain readable without inferred v2 evidence', () => {
  const r = request(), current = transcript(r);
  const legacy = { version: '2026-09-22.v1', settings: current.settings, modelCalls: current.modelCalls, turns: current.turns.map(({ turnRef, peerReviews, sourceCheck, sourceCounts, ...turn }) => turn) };
  legacy.turns[0].changeReason = '기존 기록에 남은 설명';
  assert.deepEqual(office.parseOfficeDiscussion(legacy, r), legacy);
  const summary = office.evaluateOfficeDiscussion(legacy, r);
  assert.equal(summary.source.selected, null);
  assert.equal(summary.source.untrackedTurns, legacy.turns.length);
  assert.equal(summary.objections.addressed, null);
});

test('v2 applies a bounded serialized transcript budget', () => {
  const r = request(), value = transcript(r);
  for (const turn of value.turns) { turn.position = '가'.repeat(600); turn.evidence = ['나'.repeat(300), '다'.repeat(300)]; turn.revisionCondition = '라'.repeat(300); }
  for (const turn of value.turns.filter(turn => turn.round === 'response')) {
    turn.changeReason = '마'.repeat(400);
    turn.peerReviews = r.participants.filter(id => id !== turn.ownerId).map(ownerId => ({ ownerId, field: 'position', quote: '가'.repeat(400), assessment: 'supports', reason: '바'.repeat(400) }));
    turn.replyTo = turn.peerReviews.map(item => item.ownerId);
  }
  assert.throws(() => office.parseOfficeDiscussion(value, r), /너무 깁니다/);
});

test('v2 explicitly counts one final artifact review without inventing another participant turn', () => {
  for (const ids of [['eevee', 'umbreon'], ['eevee', 'umbreon', 'leafeon']]) {
    for (const profile of ['balanced', 'urgent']) {
      const r = request(ids, profile), original = transcript(r);
      const reviewed = { ...original, artifactReviewCalls: 1, modelCalls: original.modelCalls + 1 };
      const parsed = office.parseOfficeDiscussion(reviewed, r);
      assert.deepEqual(parsed, reviewed);
      assert.deepEqual(parsed.turns, original.turns);
      assert.deepEqual(parsed.resolutions, original.resolutions);
      const summary = office.evaluateOfficeDiscussion(reviewed, r);
      assert.equal(summary.artifactReviewCalls, 1);
      assert.equal(summary.modelCalls, original.modelCalls + 1);
      assert.equal(summary.kind, 'structural-only');
      assert.equal(Object.hasOwn(summary, 'score'), false);
      assert.equal(Object.hasOwn(office.parseOfficeDiscussion(original, r), 'artifactReviewCalls'), false);
      assert.equal(Object.hasOwn(office.evaluateOfficeDiscussion(original, r), 'artifactReviewCalls'), false);
    }
  }
});

test('v2 rejects unlabelled extra calls, invalid review counts and omitted participant evidence', () => {
  const r = request(), original = transcript(r);
  for (const changes of [
    { modelCalls: original.modelCalls + 1 },
    { artifactReviewCalls: 1 },
    { artifactReviewCalls: 1, modelCalls: original.modelCalls + 2 },
    ...[0, 2, -1, '1', true, null, undefined].map(artifactReviewCalls => ({ artifactReviewCalls, modelCalls: original.modelCalls + 1 })),
    { artifactReviewCalls: 1, modelCalls: original.modelCalls + 1, turns: original.turns.slice(1) },
    { artifactReviewCalls: 1, modelCalls: original.modelCalls + 1, resolutions: [] },
  ]) assert.throws(() => office.parseOfficeDiscussion({ ...original, ...changes }, r));
  const legacy = { version: '2026-09-22.v1', settings: original.settings, modelCalls: original.modelCalls, turns: original.turns.map(({ turnRef, peerReviews, sourceCheck, sourceCounts, ...turn }) => turn) };
  assert.deepEqual(office.parseOfficeDiscussion(legacy, r), legacy);
  assert.throws(() => office.parseOfficeDiscussion({ ...legacy, artifactReviewCalls: 1, modelCalls: legacy.modelCalls + 1 }, r));
});
