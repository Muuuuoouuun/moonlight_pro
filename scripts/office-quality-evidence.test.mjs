import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_QUALITY_SCENARIOS } from './office-evaluation/scenarios.mjs';
import { createOfficeQualityRun, runOfficeQualityEvaluation } from './office-evaluation/runner.mjs';
import { createOfficeQualityReviewTemplate, createOfficeRoleDossier, createOfficeQualityReviewPack,
  scoreOfficeQualityReview, validateQualityEvidence } from './office-evaluation/review.mjs';

// Handcrafted validator examples only. No provider or semantic quality claim.
const council = OFFICE_QUALITY_SCENARIOS.find(item => item.id === 'delivery-scrutiny');
const evidenceCase = OFFICE_QUALITY_SCENARIOS.find(item => item.id === 'eevee-evidence');
async function reportFor(version = '2026-10-04.v2') {
  const run = createOfficeQualityRun([council, evidenceCase], { runId: 'citation-unit-check',
    provenance: { bundleHash: 'unit-test-only', officeVersion: 'unit-test' }, datasetStatus: 'development' });
  const report = await runOfficeQualityEvaluation(run, { generate: async request => {
    const result = { status: 'generated', ownerId: request.ownerId, answer: '검증기 예시 답변', nextAction: '검증기 예시 다음 행동' };
    if (request.mode !== 'council') return result;
    const first = request.participants.map(ownerId => ({ ownerId, round: 'position', position: `${ownerId} 첫 입장`,
      objection: `${ownerId} 첫 반론`, revisionCondition: `${ownerId} 변경 조건`, evidence: [], changed: false, replyTo: [], changeReason: '',
      ...(version ? { turnRef: `position:${ownerId}`, peerReviews: [] } : {}) }));
    const response = request.participants.map((ownerId, index) => {
      const peer = first[(index + 1) % first.length];
      return { ownerId, round: 'response', position: `${ownerId} 검토 후 입장`, objection: `${ownerId} 남은 반론`,
        revisionCondition: `${ownerId} 변경 조건`, evidence: [], changed: false, replyTo: [peer.ownerId], changeReason: `${ownerId} 유지 이유`,
        ...(version ? { turnRef: `response:${ownerId}`, peerReviews: [{ ownerId: peer.ownerId, field: 'position',
          quote: peer.position, assessment: 'needs_evidence', reason: `${ownerId} 동료 검토 이유` }] } : {}) };
    });
    return { ...result, discussion: { ...(version ? { version, resolutions: [{ turnRef: first[1].turnRef,
      disposition: 'open', rationale: '종합 작성자가 남긴 보류 이유' }] } : {}), turns: [...first, ...response] } };
  } });
  report.runtimeIntegrity = 'verified';
  return report;
}
function citation(report, recordId, pointer) {
  const response = report.results.find(item => item.id === recordId).response;
  const quote = pointer.slice(1).split('/').reduce((value, part) => value[part], response);
  return { recordId, pointer, quote };
}
function reviewFor(report) {
  const review = createOfficeQualityReviewTemplate(report, 'unit-test-reviewer');
  review.evidencePolicyVersion = 2;
  review.reviewer = { id: 'unit-test-reviewer', kind: 'human', independentOfImplementation: true,
    independenceExplanation: 'Validator test declaration only.' };
  const roles = review.roles.find(item => item.roleId === 'eevee');
  const rating = id => roles.ratings.find(item => item.axisId === 'collaboration' && item.criterionId === id);
  const dissent = rating('dissent');
  const response = citation(report, `${council.id}/initial`, '/discussion/turns/3/peerReviews/0/reason');
  const target = citation(report, `${council.id}/initial`, '/discussion/turns/1/position');
  Object.assign(dissent, { rating: 4, rationale: 'Unit-test citation validation only.', evidence: [response], interactionEvidence: [{ response, target }] });
  const update = rating('update');
  const before = citation(report, `${council.id}/update`, '/discussion/turns/0/position');
  const after = citation(report, `${council.id}/update`, '/discussion/turns/3/position');
  const reason = citation(report, `${council.id}/update`, '/discussion/turns/3/changeReason');
  Object.assign(update, { rating: 4, rationale: 'Unit-test citation validation only.',
    evidence: [citation(report, `${council.id}/initial`, '/discussion/turns/3/position'), before, after, reason],
    changeEvidence: { before, after, reason } });
  return review;
}
const itemFor = (review, axisId, criterionId) => review.roles.find(item => item.roleId === 'eevee').ratings.find(item => item.axisId === axisId && item.criterionId === criterionId);
const scoredItem = (report, review, axisId, criterionId) => scoreOfficeQualityReview(report, review).roles.find(item => item.roleId === 'eevee').axes.find(item => item.id === axisId).criteria.find(item => item.id === criterionId);

test('new templates and dossiers explain paired record-bound citations without assigning ratings', async () => {
  const report = await reportFor(), template = createOfficeQualityReviewTemplate(report);
  assert.equal(template.evidencePolicyVersion, 2);
  assert.deepEqual(itemFor(template, 'collaboration', 'dissent').interactionEvidence, []);
  assert.deepEqual(itemFor(template, 'collaboration', 'update').changeEvidence, { before: null, after: null, reason: null });
  assert.ok(template.roles.every(role => role.ratings.every(item => item.rating === null)));
  const dossier = createOfficeRoleDossier(report, 'eevee');
  assert.match(dossier.instructions, /recordId/);
  const initial = dossier.cases.find(item => item.turnId === 'initial' && item.scenarioId === council.id);
  assert.deepEqual(initial.interactionPointers[0], { response: '/discussion/turns/3/peerReviews/0/reason', target: '/discussion/turns/1/position' });
  assert.ok(initial.sources.every(source => source.recordId === initial.recordId));
  assert.equal(createOfficeQualityReviewPack(report).evidencePolicyVersion, 2);
});

test('v2 dissent requires own response reason paired to the exact peer first-position field', async () => {
  const report = await reportFor(), review = reviewFor(report);
  assert.equal(scoredItem(report, review, 'collaboration', 'dissent').rating, 4);
  const dissent = itemFor(review, 'collaboration', 'dissent');
  dissent.evidence = [citation(report, `${council.id}/initial`, '/discussion/turns/0/position')];
  dissent.interactionEvidence = [];
  assert.equal(scoredItem(report, review, 'collaboration', 'dissent').rating, null);
});

test('same quote in another record, another peer, a response turn, or the wrong field cannot be the target', async () => {
  const report = await reportFor();
  for (const [recordId, pointer] of [
    [`${council.id}/update`, '/discussion/turns/1/position'],
    [`${council.id}/initial`, '/discussion/turns/2/position'],
    [`${council.id}/initial`, '/discussion/turns/4/position'],
    [`${council.id}/initial`, '/discussion/turns/1/objection'],
  ]) {
    const review = reviewFor(report);
    itemFor(review, 'collaboration', 'dissent').interactionEvidence[0].target = citation(report, recordId, pointer);
    assert.equal(scoredItem(report, review, 'collaboration', 'dissent').rating, null, `${recordId}${pointer}`);
  }
  assert.equal(validateQualityEvidence(report, 'eevee', [citation(report, `${council.id}/initial`, '/discussion/turns/1/position')]), false);
});

test('a paired citation must use the evaluated role response and its own reason rather than only the peer quote', async () => {
  const report = await reportFor();
  for (const pointer of ['/discussion/turns/4/peerReviews/0/reason', '/discussion/turns/3/peerReviews/0/quote']) {
    const review = reviewFor(report), dissent = itemFor(review, 'collaboration', 'dissent');
    const response = citation(report, `${council.id}/initial`, pointer);
    dissent.evidence = [response]; dissent.interactionEvidence[0].response = response;
    assert.equal(scoredItem(report, review, 'collaboration', 'dissent').rating, null);
  }
});

test('update requires own before, after, reason and an earlier same-scenario record', async () => {
  const report = await reportFor(), review = reviewFor(report);
  assert.equal(scoredItem(report, review, 'collaboration', 'update').rating, 4);
  for (const mutate of [
    item => { delete item.changeEvidence; },
    item => { item.changeEvidence.before = item.changeEvidence.after; },
    item => { item.changeEvidence.reason = citation(report, `${council.id}/update`, '/discussion/turns/4/changeReason'); },
    item => { item.evidence = item.evidence.filter(ref => ref.recordId.endsWith('/update')); },
  ]) {
    const changed = structuredClone(review); mutate(itemFor(changed, 'collaboration', 'update'));
    assert.equal(scoredItem(report, changed, 'collaboration', 'update').rating, null);
  }
});

test('valid citations preserve human zero ratings and do not reward changed flags', async () => {
  const report = await reportFor(), review = reviewFor(report);
  itemFor(review, 'collaboration', 'dissent').rating = 0;
  itemFor(review, 'collaboration', 'update').rating = 0;
  assert.equal(scoredItem(report, review, 'collaboration', 'dissent').rating, 0);
  assert.equal(scoredItem(report, review, 'collaboration', 'update').rating, 0);
});

test('source citations bind the exact response record and reject borrowing a later source through another citation', async () => {
  const report = await reportFor(), review = reviewFor(report), item = itemFor(review, 'grounding', 'facts');
  Object.assign(item, { rating: 4, rationale: 'Unit-test source binding only.', evidence: [
    citation(report, `${evidenceCase.id}/initial`, '/answer'),
    citation(report, `${council.id}/initial`, '/discussion/turns/0/position'),
    citation(report, `${council.id}/update`, '/discussion/turns/0/position'),
  ], sourceEvidence: [{ recordId: `${council.id}/initial`, scenarioId: council.id, sourceId: 'new-deadline', quote: council.turns[1].extraSources[0].text }] });
  assert.equal(scoredItem(report, review, 'grounding', 'facts').rating, null);
  item.sourceEvidence[0].recordId = `${council.id}/update`;
  assert.equal(scoredItem(report, review, 'grounding', 'facts').rating, 4);
  for (const patch of [{ recordId: undefined }, { recordId: `${council.id}/close` }, { scenarioId: evidenceCase.id }, { recordId: 'unknown/initial' }]) {
    const changed = structuredClone(review); Object.assign(itemFor(changed, 'grounding', 'facts').sourceEvidence[0], patch);
    assert.equal(scoredItem(report, changed, 'grounding', 'facts').rating, null);
  }
});

test('historical reviews retain explicit legacy policy while v2 discussion cannot downgrade', async () => {
  const report = await reportFor(null), review = createOfficeQualityReviewTemplate(report, '', { evidencePolicyVersion: 1 });
  delete review.evidencePolicyVersion; // Existing archived review format.
  const result = scoreOfficeQualityReview(report, review);
  assert.equal(result.evidencePolicyVersion, 1);
  assert.equal(result.evidencePolicy, 'legacy-v1');
  const modern = await reportFor(), downgrade = reviewFor(modern);
  delete downgrade.evidencePolicyVersion;
  assert.throws(() => scoreOfficeQualityReview(modern, downgrade), /legacy.*v2/i);
  downgrade.evidencePolicyVersion = 1;
  assert.throws(() => scoreOfficeQualityReview(modern, downgrade), /legacy.*v2/i);
  downgrade.evidencePolicyVersion = 99;
  assert.throws(() => scoreOfficeQualityReview(modern, downgrade), /evidence policy/i);
});

test('malformed nested citations become unassessed without crashing scoring', async () => {
  const report = await reportFor();
  for (const value of [null, 7, {}, { response: null, target: {} }]) {
    const review = reviewFor(report); itemFor(review, 'collaboration', 'dissent').interactionEvidence = [value];
    assert.equal(scoredItem(report, review, 'collaboration', 'dissent').rating, null);
  }
  assert.equal(validateQualityEvidence(report, 'eevee', [null]), false);
});

test('resolution rationale belongs to synthesis owner and requires a real referenced objection', async () => {
  const report = await reportFor(), ref = citation(report, `${council.id}/initial`, '/discussion/resolutions/0/rationale');
  assert.equal(validateQualityEvidence(report, 'eevee', [ref]), true);
  assert.equal(validateQualityEvidence(report, 'vaporeon', [ref]), false);
  const record = report.results.find(item => item.id === ref.recordId);
  record.response.discussion.resolutions[0].turnRef = 'position:missing';
  assert.equal(validateQualityEvidence(report, 'eevee', [ref]), false);
});
