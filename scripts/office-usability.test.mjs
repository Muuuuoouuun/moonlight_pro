import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_QUALITY_AXES, OFFICE_QUALITY_ROLES } from './office-evaluation/rubric.mjs';
import { OFFICE_QUALITY_SCENARIOS } from './office-evaluation/scenarios.mjs';
import { createOfficeQualityRun, buildOfficeQualityReport, qualityHash, qualityEvaluationInput } from './office-evaluation/runner.mjs';
import { OFFICE_USABILITY_GROUPS, scoreOfficeLatency, summarizeOfficeUsability } from './office-evaluation/usability.mjs';

test('usability mapping covers all 20 semantic criteria exactly once', () => {
  const expected = OFFICE_QUALITY_AXES.flatMap(axis => axis.criteria.map(c => `${axis.id}/${c.id}`)).sort();
  const actual = Object.values(OFFICE_USABILITY_GROUPS).flat().sort();
  assert.deepEqual(actual, expected);
});

test('latency uses nearest rank, includes failures, and does not certify missing observations', () => {
  const records = [
    { request: { mode: 'chat' }, response: { status: 'generated' }, elapsedMs: 15000 },
    { request: { mode: 'chat' }, response: { status: 'error' }, elapsedMs: 48000 },
    { request: { mode: 'council' }, response: { status: 'generated' }, elapsedMs: 30000 },
  ];
  const result = scoreOfficeLatency(records);
  assert.equal(result.solo.p50, 15000);
  assert.equal(result.solo.p95, 48000);
  assert.equal(result.score, 0);
  assert.equal(result.complete, false);
  assert.equal(scoreOfficeLatency(records.slice(0, 1)).score, null);
  assert.equal(scoreOfficeLatency([{ ...records[0], elapsedMs: NaN }, records[2]]).score, null);
});

function inputs(rating = 4) {
  const scenarios = OFFICE_QUALITY_SCENARIOS.filter(s => ['eevee-work', 'delivery-urgent'].includes(s.id));
  const run = createOfficeQualityRun(scenarios, { provenance: { bundleHash: 'test-runtime' } });
  const records = scenarios.map((scenario, i) => {
    const {request, context} = qualityEvaluationInput(scenario, 0);
    const response = { status: 'generated' };
    return { id: `${scenario.id}/initial`, caseId: scenario.id, turnId: 'initial', attemptId: `attempt-${i}`, request, context, inputHash:qualityHash({request,context}), response, responseHash:qualityHash(response), elapsedMs:10000+i*8000 };
  });
  const report = { ...buildOfficeQualityReport(run, records), runtimeIntegrity: 'verified' };
  const { fingerprint } = report;
  const scorecard = { fingerprint, status: 'passed', roles: OFFICE_QUALITY_ROLES.map(roleId => ({
    roleId, axes: OFFICE_QUALITY_AXES.map(axis => ({ id: axis.id, criteria: axis.criteria.map(c => ({ id: c.id, rating })) })),
  })) };
  const journalEntries = records.flatMap(record => [{type:'attempt',id:record.id,attemptId:record.attemptId,inputHash:record.inputHash,retriesInterruptedCall:false},{type:'result',record}]);
  return { scorecard, report, journalEntries };
}

test('unknown recovery or UI evidence blocks a numerical pass instead of granting free points', () => {
  const {scorecard, report} = inputs();
  const result = summarizeOfficeUsability(scorecard, report);
  assert.equal(result.dimensions.problemSolving, 80);
  assert.equal(result.dimensions.reliability, null);
  assert.equal(result.average, null);
  assert.equal(result.status, 'unverified');
});

test('missing semantic criteria and mismatched evidence cannot be averaged away', () => {
  const {scorecard, report} = inputs();
  scorecard.roles[0].axes[0].criteria[0].rating = null;
  assert.equal(summarizeOfficeUsability(scorecard, report).dimensions.problemSolving, null);
  assert.throws(() => summarizeOfficeUsability({...scorecard, fingerprint:'wrong'}, report), /fingerprint/);
  assert.throws(() => summarizeOfficeUsability({...scorecard, roles:scorecard.roles.slice(1)}, report), /roles/);
});

test('removed observations cannot inherit an old fingerprint or generation counters', () => {
  const {scorecard, report, journalEntries} = inputs();
  assert.throws(() => summarizeOfficeUsability(scorecard, {...report,results:report.results.slice(1)}, {journalEntries}), /fingerprint/);
  assert.throws(() => summarizeOfficeUsability(scorecard, {...report,summary:{...report.summary,planned:39}}, {journalEntries}), /summary/);
  assert.throws(() => summarizeOfficeUsability(scorecard, {...report,results:report.results.map(r=>({...r,elapsedMs:0}))}, {journalEntries}), /journal/);
});

test('unknown first attempts remain failures after a later successful retry', () => {
  const {scorecard, report, journalEntries} = inputs();
  assert.equal(summarizeOfficeUsability(scorecard, report).successRate, null);
  assert.equal(summarizeOfficeUsability(scorecard, report, {journalEntries}).successRate, 100);
  journalEntries[0].retriesInterruptedCall = true;
  journalEntries.unshift({...journalEntries[0],attemptId:'lost-attempt',retriesInterruptedCall:false});
  const result = summarizeOfficeUsability(scorecard, report, {journalEntries});
  assert.equal(result.successRate, 50);
  assert.equal(result.latency.complete, false);
});

test('parallel completion order does not change attempt coverage', () => {
  const {scorecard, report, journalEntries} = inputs();
  const reordered = [...journalEntries.slice(2), ...journalEntries.slice(0,2)];
  assert.equal(summarizeOfficeUsability(scorecard, report, {journalEntries:reordered}).successRate, 100);
});
