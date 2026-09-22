import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OFFICE_IDS } from '@com-moon/agent-contracts/office';
import { OFFICE_QUALITY_AXES, OFFICE_QUALITY_ROLES, OFFICE_CRITICAL_GATES } from './office-evaluation/rubric.mjs';
import { OFFICE_QUALITY_SCENARIOS, scenarioTurnMessage } from './office-evaluation/scenarios.mjs';
import { collectOfficeQualityProvenance, createOfficeQualityRun, runOfficeQualityEvaluation, qualityEvaluationInput, buildOfficeQualityReport, qualityHash, openOfficeQualityJournal, readOfficeQualityJournal } from './office-evaluation/runner.mjs';
import { createOfficeQualityReviewTemplate, createOfficeQualityReviewPack, createOfficeRoleDossier, scoreOfficeQualityReview, validateQualityEvidence } from './office-evaluation/review.mjs';
import { createTracedOfficeGenerator } from './office-evaluation/trace.mjs';
import { officeQualityCli } from './office-evaluation/cli.mjs';

// Deliberately synthetic unit-test responses and ratings test bookkeeping only.
// They are not model generations and must never be published as quality evidence.
const testProvenance = { officeVersion: 'unit-test', sources: {}, bundleHash: 'unit-test-only' };
const makeRun = scenarios => createOfficeQualityRun(scenarios, { provenance: testProvenance, runId: 'unit-test-run', datasetStatus: 'development' });
function generated(request) {
  return {
    status: 'generated', ownerId: request.ownerId, answer: `${request.ownerId} 단위 테스트 전용 응답`, nextAction: '단위 테스트 종료', model: 'unit-test-no-provider',
    ...(request.mode === 'council' ? { recommendation: '단위 테스트 추천', discussion: { settings: request.deliberation, turns: request.participants.map(ownerId => ({ ownerId, round: 'position', position: `${ownerId} 단위 테스트 역할 발언`, evidence: ['단위 테스트 근거'], objection: '단위 테스트 이견', revisionCondition: '단위 테스트 변경 조건', changed: false, replyTo: [], changeReason: '' })), modelCalls: 0 } } : {}),
  };
}
async function fullReport() {
  const report = await runOfficeQualityEvaluation(makeRun(OFFICE_QUALITY_SCENARIOS), { generate: async request => generated(request) });
  report.runtimeIntegrity = 'verified';
  return report;
}
function evidenceFor(report, roleId, recordId) {
  const record = report.results.find(item => item.id === recordId);
  if (record.ownerId === roleId) return { recordId, pointer: '/answer', quote: record.response.answer };
  const index = record.response.discussion.turns.findIndex(item => item.ownerId === roleId);
  return { recordId, pointer: `/discussion/turns/${index}/position`, quote: record.response.discussion.turns[index].position };
}
function completedArithmeticReview(report) {
  const review = createOfficeQualityReviewTemplate(report, 'unit-test-reviewer');
  review.reviewer = { id: 'unit-test-reviewer', kind: 'agent', model: 'no-model-called', independentOfImplementation: true, independenceExplanation: 'Declaration used only to test validation; no actual semantic review occurred.' };
  for (const role of review.roles) {
    const recordId = `${role.roleId}-work/initial`;
    const scenario = report.scenarios.find(item => item.id === `${role.roleId}-work`);
    for (const item of role.ratings) {
      item.rating = 4; item.rationale = 'Unit-test arithmetic, not an actual quality judgment.';
      const council = report.scenarios.find(entry => entry.tags.includes('council') && entry.subjects.includes(role.roleId));
      item.evidence = [recordId, `${role.roleId}-evidence/initial`, `${role.roleId}-social/initial`, `${council.id}/initial`, `${council.id}/update`, `${council.id}/close`].map(id => evidenceFor(report, role.roleId, id));
      if (item.sourceEvidence) item.sourceEvidence = [{ scenarioId: scenario.id, sourceId: scenario.sources[0].id, quote: scenario.sources[0].text }];
    }
    for (const item of role.gates) {
      item.verdict = 'clear'; item.rationale = 'Unit-test declaration only.';
      item.checkedRecordIds = report.coverage.roles[role.roleId].recordIds;
    }
    for (const item of role.comparisons) {
      const comparison = report.coverage.comparisons.find(entry => entry.id === item.id);
      item.verdict = 'meets'; item.rationale = 'Unit-test comparison bookkeeping only.';
      item.evidence = [comparison.baselineRecordId, comparison.variantRecordId].map(id => evidenceFor(report, role.roleId, id));
    }
  }
  return review;
}

test('quality rubric is twenty semantic criteria with six anchored levels, not keyword scores', () => {
  assert.deepEqual(OFFICE_QUALITY_ROLES, OFFICE_IDS);
  assert.equal(OFFICE_QUALITY_AXES.length, 5);
  for (const axis of OFFICE_QUALITY_AXES) {
    assert.equal(axis.criteria.length, 4);
    for (const item of axis.criteria) {
      assert.equal(item.anchors.length, 6);
      assert.equal(new Set(item.anchors).size, 6);
    }
  }
  assert.equal(OFFICE_CRITICAL_GATES.length, 5);
});

test('frozen plan has all nine roles, 33 conversations, 39 turns, three controlled comparisons', async () => {
  const run = makeRun(OFFICE_QUALITY_SCENARIOS);
  assert.equal(run.plan.scenarios, 33);
  assert.equal(run.plan.generationCalls, 39);
  for (const role of OFFICE_IDS) {
    assert.deepEqual(OFFICE_QUALITY_SCENARIOS.filter(item => item.ownerId === role && item.mode !== 'council').map(item => item.tags[0]).sort(), ['evidence', 'social', 'work']);
    assert.ok(OFFICE_QUALITY_SCENARIOS.some(item => item.tags.includes('council') && item.subjects.includes(role) && item.turns.map(turn => turn.id).join(',') === 'initial,update,close'));
  }
  for (const scenario of OFFICE_QUALITY_SCENARIOS.filter(item => item.comparison)) {
    const baseline = OFFICE_QUALITY_SCENARIOS.find(item => item.id === scenario.comparison.baseline);
    assert.equal(scenarioTurnMessage(scenario, 0), scenarioTurnMessage(baseline, 0));
    assert.deepEqual(scenario.sources, baseline.sources);
    assert.notDeepEqual(scenario.deliberation, baseline.deliberation);
  }
  const provenance = await collectOfficeQualityProvenance();
  assert.ok(provenance.sources['apps/engine/lib/office/role-cards.ts']);
  assert.ok(provenance.sources['packages/agent-contracts/office-deliberation.js']);
  assert.equal(provenance.bundleHash.length, 64);
  assert.equal(typeof provenance.modelConfiguration.model, 'string');
  assert.doesNotMatch(JSON.stringify(provenance), /API_KEY|apiKey/);
});

test('runner keeps actual prior answers, council settings and all evidence without a score', async () => {
  let calls = 0, active = 0, peak = 0;
  const report = await runOfficeQualityEvaluation(makeRun(OFFICE_QUALITY_SCENARIOS), { generate: async request => {
    calls++; active++; peak = Math.max(peak, active);
    await Promise.resolve();
    if (request.history.length) assert.match(request.history[1].text, /단위 테스트/);
    active--;
    return generated(request);
  } });
  assert.equal(calls, 39); assert.equal(peak, 1);
  assert.equal(report.qualityClaim, 'not-scored');
  assert.deepEqual(report.summary, { planned: 39, recorded: 39, generated: 39, generationFailed: 0, preview: 0, blocked: 0, unevaluated: 0 });
  for (const role of OFFICE_IDS) assert.deepEqual(report.coverage.roles[role].missing, []);
  assert.deepEqual(report.coverage.missingComparisons, []);
  assert.equal(report.results.find(item => item.id === 'delivery-scrutiny/update').request.history.length, 2);
  assert.equal(report.results.find(item => item.id === 'delivery-scrutiny/close').request.history.length, 4);
  assert.equal(report.results.find(item => item.id === 'delivery-urgent/initial').request.deliberation.depth, 1);
  assert.ok(report.results.every(item => item.responseHash === qualityHash(item.response)));
});

test('missing actor speech is unobserved even if the owner answer is generated', async () => {
  const scenario = OFFICE_QUALITY_SCENARIOS.find(item => item.id === 'delivery-scrutiny');
  const report = await runOfficeQualityEvaluation(makeRun([scenario]), { generate: async request => ({ status: 'generated', answer: 'no role turns', ownerId: request.ownerId }) });
  assert.ok(report.coverage.roles.jolteon.missing.includes('council-initial'));
  assert.equal(report.summary.generated, 3);
  assert.equal(report.qualityClaim, 'not-scored');
});

test('failure codes survive; previews, dependent failures and unrun cases are distinct', async () => {
  const cases = [OFFICE_QUALITY_SCENARIOS.find(item => item.id === 'delivery-scrutiny'), OFFICE_QUALITY_SCENARIOS[0], OFFICE_QUALITY_SCENARIOS[1]];
  let calls = 0;
  const report = await runOfficeQualityEvaluation(makeRun(cases), { generate: async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('secret provider detail'), { code: 'ETIMEDOUT' });
    if (calls === 2) return { status: 'preview', errorCode: 'missing_api_key' };
    return { status: 'error', errorCode: 'synthesis-failed' };
  } });
  assert.equal(calls, 3);
  assert.deepEqual(report.summary, { planned: 5, recorded: 5, generated: 0, generationFailed: 2, preview: 1, blocked: 2, unevaluated: 0 });
  assert.equal(report.results[0].response.errorCode, 'ETIMEDOUT');
  assert.equal(report.results[1].response.errorCode, 'dependency_not_generated');
  assert.doesNotMatch(JSON.stringify(report), /secret provider detail/);
  assert.equal(buildOfficeQualityReport(makeRun(cases), []).summary.unevaluated, 5);
});

test('at most two independent conversations run in parallel; their turn order stays intact', async () => {
  const cases = OFFICE_QUALITY_SCENARIOS.filter(item => item.tags.includes('council'));
  let active = 0, peak = 0;
  const lengths = new Map();
  await runOfficeQualityEvaluation(makeRun(cases), { concurrency: 2, generate: async request => {
    active++; peak = Math.max(peak, active);
    const seen = lengths.get(request.ownerId) || []; seen.push(request.history.length); lengths.set(request.ownerId, seen);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--; return generated(request);
  } });
  assert.equal(peak, 2);
  for (const value of lengths.values()) assert.deepEqual(value, [0, 2, 4]);
  await assert.rejects(runOfficeQualityEvaluation(makeRun(cases), { concurrency: 3, generate: async request => generated(request) }), /1 or 2/);
});

test('JSONL flush preserves completed work; interrupted calls require an explicit retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'office-quality-journal-'));
  try {
    const path = join(directory, 'run.jsonl'), run = makeRun(OFFICE_QUALITY_SCENARIOS.slice(0, 2));
    let journal = await openOfficeQualityJournal(path, { run });
    await assert.rejects(runOfficeQualityEvaluation(run, {
      generate: async request => generated(request),
      onAttempt: attempt => journal.append({ type: 'attempt', ...attempt }),
      onResult: async record => { if (record.caseId === run.scenarios[1].id) throw new Error('interruption'); await journal.append({ type: 'result', record }); },
    }), /interruption/);
    await journal.close();
    const saved = await readOfficeQualityJournal(path);
    assert.equal(saved.results.length, 1);
    assert.deepEqual(saved.interruptedIds, [`${run.scenarios[1].id}/initial`]);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(openOfficeQualityJournal(path, { run }), /EEXIST/);
    await assert.rejects(runOfficeQualityEvaluation(run, { generate: async () => assert.fail('must not call'), priorResults: saved.results, interruptedIds: saved.interruptedIds }), /unknown outcomes/);
    journal = await openOfficeQualityJournal(path, { run, resume: true });
    let calls = 0;
    await runOfficeQualityEvaluation(run, { priorResults: saved.results, interruptedIds: saved.interruptedIds, retryIncomplete: true,
      generate: async request => { calls++; return generated(request); },
      onAttempt: attempt => journal.append({ type: 'attempt', ...attempt }), onResult: record => journal.append({ type: 'result', record }),
    });
    await journal.close();
    assert.equal(calls, 1);
    const resumed = await readOfficeQualityJournal(path);
    assert.equal(resumed.results.length, 2); assert.deepEqual(resumed.interruptedIds, []);
    await runOfficeQualityEvaluation(run, { priorResults: resumed.results, generate: async () => assert.fail('completed call must not repeat') });
    assert.ok((await readFile(path, 'utf8')).endsWith('\n'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('long real answers use disclosed excerpts in bounded history while original is preserved', () => {
  const scenario = OFFICE_QUALITY_SCENARIOS.find(item => item.id === 'delivery-scrutiny');
  const first = qualityEvaluationInput(scenario, 0);
  const original = { id: `${scenario.id}/initial`, request: first.request, response: { status: 'generated', answer: '긴'.repeat(10000) } };
  const next = qualityEvaluationInput(scenario, 1, [original]);
  assert.equal(original.response.answer.length, 10000);
  assert.ok(next.request.history[1].text.length <= 6000);
  assert.deepEqual(next.historyProvenance.excerptedRecordIds, [original.id]);
  assert.match(next.request.history[1].text, /실제 이전 응답 발췌/);
});

test('numerical ratings without exact quotes remain unevaluated, not zero or passed', async () => {
  const report = await fullReport();
  const review = completedArithmeticReview(report);
  for (const role of review.roles) for (const item of role.ratings) item.evidence = [];
  const scored = scoreOfficeQualityReview(report, review);
  assert.equal(scored.status, 'unverified');
  assert.equal(scored.summary.passed, 0);
  assert.ok(scored.roles.every(role => role.total === null && role.axes.every(axis => axis.percent === null)));
  assert.ok(createOfficeQualityReviewPack(report).instructions.includes('단어 수'));
});

test('all five axes need 70 percent and a high total cannot hide a weak axis or critical failure', async () => {
  const report = await fullReport();
  const review = completedArithmeticReview(report);
  const scored = scoreOfficeQualityReview(report, review);
  assert.ok(scored.roles.every(role => role.total === 80 && role.axes.every(axis => axis.percent === 80)));
  const weak = structuredClone(review);
  for (const item of weak.roles[0].ratings) item.rating = item.axisId === 'grounding' ? 2 : 5;
  const first = scoreOfficeQualityReview(report, weak).roles[0];
  assert.equal(first.total, 88); assert.equal(first.status, 'needs-revision');
  assert.ok(first.failures.includes('axis-below-threshold:grounding'));
  const critical = structuredClone(review);
  critical.roles[0].gates[0] = { id: 'fabrication', verdict: 'failed', rationale: 'Unit-test gate routing, not a real finding.', evidence: [evidenceFor(report, 'eevee', 'eevee-work/initial')] };
  assert.ok(scoreOfficeQualityReview(report, critical).roles[0].failures.includes('critical:fabrication'));
});

test('stale quotes, wrong role attribution, missing source citations and missing comparison sides cannot pass', async () => {
  const report = await fullReport();
  assert.equal(validateQualityEvidence(report, 'jolteon', [evidenceFor(report, 'eevee', 'delivery-scrutiny/initial')]), false);
  assert.equal(validateQualityEvidence(report, 'jolteon', [evidenceFor(report, 'jolteon', 'delivery-scrutiny/initial')]), true);
  const review = completedArithmeticReview(report);
  review.roles[0].ratings[0].evidence[0].quote = 'this was never generated';
  review.roles[0].ratings.find(item => item.axisId === 'grounding').sourceEvidence[0].quote = 'invented source';
  review.roles[0].comparisons[0].evidence.pop();
  const first = scoreOfficeQualityReview(report, review).roles[0];
  assert.equal(first.status, 'unverified'); assert.equal(first.total, null);
  assert.ok(first.issues.some(issue => issue.startsWith('comparison-unassessed')));
  const modified = structuredClone(report); modified.results[0].response.answer += 'modified';
  assert.throws(() => scoreOfficeQualityReview(modified, review), /modified response/);
  const stale = structuredClone(review); stale.fingerprint = 'stale';
  assert.throws(() => scoreOfficeQualityReview(report, stale), /does not match/);
});

test('missing independent review, runtime integrity or role coverage is explicitly unverified', async () => {
  const report = await fullReport(), review = completedArithmeticReview(report);
  review.reviewer.independentOfImplementation = false;
  assert.ok(scoreOfficeQualityReview(report, review).roles.every(role => role.status === 'unverified'));
  review.reviewer.independentOfImplementation = true;
  report.runtimeIntegrity = 'unverified';
  assert.ok(scoreOfficeQualityReview(report, review).roles.every(role => role.issues.includes('runtime-snapshot-not-verified')));
  const partial = await runOfficeQualityEvaluation(makeRun([OFFICE_QUALITY_SCENARIOS[0]]), { generate: async request => generated(request) });
  assert.equal(scoreOfficeQualityReview(partial, createOfficeQualityReviewTemplate(partial)).status, 'unverified');
});

test('criterion citations must cover its behavior and cannot use facts introduced in a later turn', async () => {
  const report = await fullReport(), review = completedArithmeticReview(report);
  const first = review.roles[0];
  const voice = first.ratings.find(item => item.axisId === 'voice');
  voice.evidence = [evidenceFor(report, 'eevee', 'eevee-work/initial')];
  assert.ok(scoreOfficeQualityReview(report, review).roles[0].issues.some(issue => issue.includes('required-behavior-not-cited')));
  const grounding = first.ratings.find(item => item.axisId === 'grounding');
  grounding.evidence = [evidenceFor(report, 'eevee', 'eevee-evidence/initial'), evidenceFor(report, 'eevee', 'delivery-scrutiny/initial')];
  const scenario = report.scenarios.find(item => item.id === 'delivery-scrutiny');
  grounding.sourceEvidence = [{ scenarioId: scenario.id, sourceId: 'new-deadline', quote: scenario.turns[1].extraSources[0].text }];
  assert.ok(scoreOfficeQualityReview(report, review).roles[0].issues.some(issue => issue.includes('missing-or-invalid-source-evidence')));
});

test('role dossiers keep attribution and per-role independent reviewers override the coordinator', async () => {
  const report = await fullReport(), review = completedArithmeticReview(report);
  const dossier = createOfficeRoleDossier(report, 'jolteon');
  assert.equal(dossier.reviewTemplate.roles.length, 1);
  const council = dossier.cases.find(item => item.recordId === 'delivery-scrutiny/initial');
  assert.equal(council.synthesisBelongsToSubject, false);
  assert.deepEqual(council.actorPointers, ['/discussion/turns/2']);
  const reviewer = structuredClone(review.reviewer);
  review.reviewer.independentOfImplementation = false;
  review.roles[0].reviewer = reviewer;
  const score = scoreOfficeQualityReview(report, review);
  assert.equal(score.roles[0].status, 'passed');
  assert.equal(score.roles[1].status, 'unverified');
  assert.ok(score.roles[0].axes[0].criteria[0].evidence.length);
});

test('provider tracing retains settings and failure codes without copying private errors', async () => {
  const run = createTracedOfficeGenerator(async (request, context, provider) => {
    const result = await provider({ prompt: 'unit test prompt', systemInstruction: 'unit test policy', maxOutputTokens: 19, thinkingLevel: 'high', responseJsonSchema: { type: 'object' } });
    return { status: result.ok ? 'generated' : 'error' };
  }, async () => ({ ok: false, reason: 'timeout', status: 503, model: 'test-model', text: 'private-provider-text' }), 'configured-test-model');
  const response = await run({}, {});
  assert.equal(response.errorCode, 'timeout');
  assert.deepEqual(response.evaluationTrace.failureCodes, ['timeout']);
  assert.equal(response.evaluationTrace.calls[0].settings.modelRequested, 'configured-test-model');
  assert.equal(response.evaluationTrace.calls[0].result.httpStatus, 503);
  assert.equal(response.evaluationTrace.calls[0].result.failureCategory, 'timeout');
  assert.equal(response.evaluationTrace.calls[0].promptHash.length, 64);
  assert.doesNotMatch(JSON.stringify(response), /private-provider-text/);
});

test('provider tracing preserves actual version, finish, numeric usage, and block reason only', async () => {
  const run = createTracedOfficeGenerator(async (_request, _context, provider) => {
    await provider({ prompt: 'private prompt' });
    return { status: 'error' };
  }, async () => ({
    ok: false, model: 'requested-alias', modelVersion: 'served-version-001', status: 200,
    reason: 'private provider message', finishReason: 'SAFETY', text: 'private partial output',
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 0, totalTokenCount: 20, thoughtsTokenCount: 8, cachedContentTokenCount: 'bad count', privateField: 'private usage text' },
    promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'private block explanation' },
  }), 'configured-alias');
  const response = await run({}, {});
  const result = response.evaluationTrace.calls[0].result;
  assert.equal(result.model, 'requested-alias');
  assert.equal(result.modelVersion, 'served-version-001');
  assert.equal(result.finishReason, 'SAFETY');
  assert.equal(result.failureCategory, 'blocked-prompt');
  assert.deepEqual(result.usageMetadata, { promptTokenCount: 12, candidatesTokenCount: 0, totalTokenCount: 20, thoughtsTokenCount: 8 });
  assert.deepEqual(result.promptFeedback, { blockReason: 'SAFETY' });
  assert.doesNotMatch(JSON.stringify(response), /private prompt|private provider message|private partial output|private usage text|private block explanation/);
});

test('provider tracing classifies thrown aborts and ignores arbitrary exception codes', async () => {
  for (const [error, category] of [
    [new DOMException('private abort message', 'AbortError'), 'aborted'],
    [new DOMException('private timeout message', 'TimeoutError'), 'timeout'],
    [Object.assign(new Error('private error message'), { code: 'PRIVATE_SECRET_SHAPED_AS_CODE' }), 'provider-error'],
  ]) {
    const run = createTracedOfficeGenerator(async (_request, _context, provider) => {
      await provider({ prompt: 'unit test' });
    }, async () => { throw error; });
    const response = await run({}, {});
    assert.equal(response.errorCode, category);
    assert.equal(response.evaluationTrace.calls[0].result.failureCategory, category);
    assert.doesNotMatch(JSON.stringify(response), /private.*message|PRIVATE_SECRET_SHAPED_AS_CODE/);
  }
});

test('provider tracing records bounded generation diagnostics when provider calls succeeded', async () => {
  const run = createTracedOfficeGenerator(async (_request, _context, provider, diagnostic) => {
    await provider({ prompt: 'unit test' });
    diagnostic({ phase: 'review', category: 'source-review', ownerId: 'umbreon', error: 'private parse error' });
    diagnostic({ phase: 'private phase', category: 'contract' });
    diagnostic({ phase: 'draft', category: 'private category' });
    diagnostic({ phase: 'review', category: 'contract', ownerId: 'private owner', raw: 'private response' });
    return { status: 'error' };
  }, async () => ({ ok: true, model: 'requested-alias', modelVersion: 'served-version-001', reason: 'ok', finishReason: 'STOP', status: 200, text: 'unit answer' }));
  const response = await run({}, {});
  assert.equal(response.errorCode, 'review_contract');
  assert.deepEqual(response.evaluationTrace.failureCodes, []);
  assert.deepEqual(response.evaluationTrace.diagnostics, [
    { phase: 'review', category: 'source-review', ownerId: 'umbreon' },
    { phase: 'review', category: 'contract' },
  ]);
  assert.doesNotMatch(JSON.stringify(response), /private/);
});

test('provider failure codes precede diagnostic fallback and existing error codes remain compatible', async () => {
  for (const existingErrorCode of [undefined, 'existing-runtime-code']) {
    const run = createTracedOfficeGenerator(async (_request, _context, provider, diagnostic) => {
      await provider({ prompt: 'unit test' });
      diagnostic({ phase: 'position', category: 'provider', ownerId: 'eevee' });
      return { status: 'error', ...(existingErrorCode ? { errorCode: existingErrorCode } : {}) };
    }, async () => ({ ok: false, reason: 'http-503', failureCategory: 'provider-unavailable', status: 503, text: '' }));
    const response = await run({}, {});
    assert.equal(response.errorCode, existingErrorCode || 'http-503');
    assert.deepEqual(response.evaluationTrace.failureCodes, ['http-503']);
    assert.equal(response.evaluationTrace.calls[0].result.failureCategory, 'provider-unavailable');
  }
});

test('a failed generation stage remains the cause when its sibling is cancelled', async () => {
  for (const category of ['json', 'source-review', 'contract', 'model-mismatch']) {
    const run = createTracedOfficeGenerator(async (_request, _context, provider, diagnostic) => {
      const sibling = provider({ prompt: 'unit sibling call' });
      diagnostic({ phase: 'position', category, ownerId: 'eevee' });
      await sibling;
      diagnostic({ phase: 'position', category: 'deadline', ownerId: 'umbreon' });
      return { status: 'error' };
    }, async () => ({ ok: false, reason: 'aborted', failureCategory: 'aborted', text: '' }));
    const response = await run({}, {});
    assert.equal(response.errorCode, `position_${category}`);
    assert.deepEqual(response.evaluationTrace.failureCodes, ['aborted']);
    assert.deepEqual(response.evaluationTrace.diagnostics, [
      { phase: 'position', category, ownerId: 'eevee' },
      { phase: 'position', category: 'deadline', ownerId: 'umbreon' },
    ]);
  }
});

test('real provider failures outrank cancellation and stage diagnostics regardless of call order', async () => {
  for (const [reason, category, status] of [['http-503', 'provider-unavailable', 503], ['timeout', 'timeout', null]]) {
    let calls = 0;
    const run = createTracedOfficeGenerator(async (_request, _context, provider, diagnostic) => {
      await provider({ prompt: 'unit cancelled sibling' });
      diagnostic({ phase: 'position', category: 'json', ownerId: 'eevee' });
      await provider({ prompt: 'unit provider failure' });
      diagnostic({ phase: 'position', category: 'deadline', ownerId: 'umbreon' });
      return { status: 'error' };
    }, async () => ++calls === 1
      ? { ok: false, reason: 'aborted', failureCategory: 'aborted', text: '' }
      : { ok: false, reason, failureCategory: category, status, text: '' });
    const response = await run({}, {});
    assert.equal(response.errorCode, reason);
    assert.deepEqual(response.evaluationTrace.failureCodes, ['aborted', reason]);
  }
});

test('listing and rubric CLI modes never invoke a generator', async () => {
  const output = [];
  await officeQualityCli({ live: false }, { generate: async () => assert.fail('unexpected model call'), log: line => output.push(line) });
  assert.match(output.join('\n'), /39 Office generation calls planned\. No model calls/);
  await officeQualityCli({ rubric: true }, { generate: async () => assert.fail('unexpected model call'), log: () => {} });
});

test('provider-specific live evaluation binds the run and both provenance snapshots without a Gemini gate', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-provider-provenance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl');
  const events = [];
  const provenance = { ...testProvenance, modelConfiguration: { provider: 'offline-unit-process', model: 'unit-test-no-provider' } };
  const result = await officeQualityCli({ live: true, only: ['eevee-work'], output: path, 'dataset-status': 'development' }, {
    requireLiveConfiguration: async () => { events.push('configuration'); },
    collectProvenance: async () => { events.push('snapshot'); return provenance; },
    onRun: async run => { events.push('run'); assert.equal(run.bundleHash, provenance.bundleHash); assert.ok(run.runId); },
    generate: async request => { events.push('generation'); return generated(request); }, log: () => {},
  });
  assert.deepEqual(events, ['configuration', 'snapshot', 'run', 'generation', 'snapshot']);
  const saved = await readOfficeQualityJournal(path);
  assert.deepEqual(saved.run.provenance, provenance);
  assert.equal(saved.run.runId, result.runId);
  assert.equal(saved.runtimeChecks[0].unchanged, true);
  assert.equal(result.qualityClaim, 'not-scored');
});

test('configuration failure and sidecar binding failure stop before any model or run journal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-provider-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const stopAt of ['configuration', 'binding']) {
    const path = join(directory, `${stopAt}.jsonl`);
    await assert.rejects(officeQualityCli({ live: true, only: ['eevee-work'], output: path }, {
      requireLiveConfiguration: async () => { if (stopAt === 'configuration') throw new Error('preflight denied'); },
      collectProvenance: async () => ({ ...testProvenance, modelConfiguration: { model: 'unit-test-no-provider' } }),
      onRun: async () => { throw new Error('sidecar belongs to another run'); },
      generate: async () => assert.fail('generation must not start'), log: () => {},
    }), /preflight denied|sidecar belongs/);
    await assert.rejects(stat(path), { code: 'ENOENT' });
  }
  await officeQualityCli({ live: false }, {
    requireLiveConfiguration: async () => assert.fail('listing must not preflight a provider'),
    collectProvenance: async () => assert.fail('listing must not collect a live snapshot'),
    onRun: async () => assert.fail('listing must not open a provider journal'), log: () => {},
  });
});

test('a changed custom provider snapshot invalidates integrity and cannot be resumed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-provider-changed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl'), exitCode = process.exitCode;
  let snapshots = 0;
  try {
    const result = await officeQualityCli({ live: true, only: ['eevee-work'], output: path }, {
      requireLiveConfiguration: async () => {},
      collectProvenance: async () => ({ ...testProvenance, bundleHash: snapshots++ ? 'changed-policy' : 'initial-policy', modelConfiguration: { model: 'unit-test-no-provider' } }),
      generate: async request => generated(request), log: () => {},
    });
    assert.equal(result.runtimeIntegrity, 'unverified');
    assert.equal(process.exitCode, 1);
    const saved = await readOfficeQualityJournal(path);
    assert.equal(saved.runtimeChecks[0].unchanged, false);
    await assert.rejects(officeQualityCli({ live: true, resume: true, output: path }, {
      requireLiveConfiguration: async () => {},
      collectProvenance: async () => ({ ...testProvenance, bundleHash: 'changed-policy' }),
      generate: async () => assert.fail('changed snapshot must not resume'), log: () => {},
    }), /runtime changed/);
  } finally { process.exitCode = exitCode; }
});

const offlineQualityDependencies = {
  requireLiveConfiguration: async () => {}, collectProvenance: async () => testProvenance,
  generate: async request => generated(request), log: () => {},
};
const legacyRuntimeCheck = () => ({ type: 'runtime-check', unchanged: true, bundleHash: testProvenance.bundleHash, officeVersion: testProvenance.officeVersion });
async function writeQualityEntries(path, run, entries) {
  const journal = await openOfficeQualityJournal(path, { run });
  try { for (const entry of entries) await journal.append(entry); }
  finally { await journal.close(); }
}

test('runtime coverage cannot promote the first interrupted segment after a successful resume or score', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-runtime-first-interruption-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl'), exitCode = process.exitCode;
  let fatalErrors = 0, resumedCalls = 0;
  try {
    await assert.rejects(officeQualityCli({ live: true, output: path }, {
      ...offlineQualityDependencies,
      log: () => { throw new Error('interrupted after result sync'); },
      onFatalError: async error => { assert.match(error.message, /interrupted/); fatalErrors++; },
    }), /interrupted/);
    const interrupted = await readOfficeQualityJournal(path);
    assert.equal(interrupted.results.length, 1);
    assert.equal(interrupted.runtimeChecks.length, 0);
    assert.equal(fatalErrors, 1);
    const result = await officeQualityCli({ live: true, resume: true, output: path }, {
      ...offlineQualityDependencies,
      generate: async request => { resumedCalls++; return generated(request); },
    });
    assert.equal(resumedCalls, 38);
    assert.equal(result.summary.generated, 39);
    assert.equal(result.runtimeIntegrity, 'unverified');
    assert.equal(process.exitCode, 1);
    assert.deepEqual(result.results[0], interrupted.results[0]);
    const check = (await readOfficeQualityJournal(path)).runtimeChecks[0];
    assert.equal(check.unchanged, true);
    assert.equal(check.coverage.priorResultCount, 1);
    assert.equal(check.coverage.resultCount, 39);
    assert.equal(check.coverage.verifiedResultCount, 0);
    assert.equal(check.coverage.runtimeIntegrity, 'unverified');
    const pack = await officeQualityCli({ 'review-pack': true, input: path, output: join(directory, 'pack.json') }, offlineQualityDependencies);
    assert.equal(pack.report.runtimeIntegrity, 'unverified');
    await writeFile(join(directory, 'reviews.json'), JSON.stringify(completedArithmeticReview(pack.report)));
    const scored = await officeQualityCli({ score: true, input: path, reviews: join(directory, 'reviews.json'), output: join(directory, 'score.json') }, offlineQualityDependencies);
    assert.equal(scored.status, 'unverified');
    assert.ok(scored.roles.every(role => role.issues.includes('runtime-snapshot-not-verified')));
  } finally { process.exitCode = exitCode; }
});

test('runtime coverage preserves a gap when the second resumed segment is interrupted', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-runtime-resume-interruption-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl'), exitCode = process.exitCode;
  const run = makeRun(OFFICE_QUALITY_SCENARIOS.slice(0, 3));
  const recorded = await runOfficeQualityEvaluation(run, offlineQualityDependencies);
  await writeQualityEntries(path, run, [{ type: 'result', record: recorded.results[0] }, legacyRuntimeCheck()]);
  try {
    await assert.rejects(officeQualityCli({ live: true, resume: true, output: path }, {
      ...offlineQualityDependencies, log: () => { throw new Error('second segment interrupted'); },
    }), /second segment/);
    const interrupted = await readOfficeQualityJournal(path);
    assert.equal(interrupted.results.length, 2);
    assert.equal(interrupted.runtimeChecks.length, 1);
    const pack = await officeQualityCli({ 'review-pack': true, input: path, output: join(directory, 'interrupted-pack.json') }, offlineQualityDependencies);
    assert.equal(pack.report.runtimeIntegrity, 'unverified', 'a prior check cannot cover later results');
    const resumed = await officeQualityCli({ live: true, resume: true, output: path }, offlineQualityDependencies);
    assert.equal(resumed.runtimeIntegrity, 'unverified');
    const check = (await readOfficeQualityJournal(path)).runtimeChecks.at(-1);
    assert.equal(check.coverage.priorResultCount, 2);
    assert.equal(check.coverage.resultCount, 3);
    assert.equal(check.coverage.verifiedResultCount, 1);
    const repeated = await officeQualityCli({ live: true, resume: true, output: path }, {
      ...offlineQualityDependencies, generate: async () => assert.fail('all results already exist'),
    });
    assert.equal(repeated.runtimeIntegrity, 'unverified', 'another empty resume must not repair the gap');
  } finally { process.exitCode = exitCode; }
});

test('runtime coverage binds both result prefixes and extends a checked segment through normal resumes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-runtime-normal-resume-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl');
  const run = makeRun(OFFICE_QUALITY_SCENARIOS.slice(0, 3));
  const recorded = await runOfficeQualityEvaluation(run, offlineQualityDependencies);
  await writeQualityEntries(path, run, [{ type: 'result', record: recorded.results[0] }, legacyRuntimeCheck()]);
  let calls = 0;
  const resumed = await officeQualityCli({ live: true, resume: true, output: path, concurrency: 2 }, {
    ...offlineQualityDependencies, generate: async request => {
      if (++calls === 1) await new Promise(resolve => setTimeout(resolve, 10));
      return generated(request);
    },
  });
  assert.equal(calls, 2);
  assert.equal(resumed.runtimeIntegrity, 'verified');
  const saved = await readOfficeQualityJournal(path), check = saved.runtimeChecks.at(-1);
  assert.notDeepEqual(saved.results.map(record => record.id), resumed.results.map(record => record.id), 'hashes bind journal order despite concurrent result order');
  const prefixHash = records => qualityHash(records.map(({ id, inputHash = null, responseHash }) => ({ id, inputHash, responseHash })));
  assert.deepEqual(check.coverage, {
    version: 1, priorResultCount: 1, priorResultsHash: prefixHash(saved.results.slice(0, 1)),
    resultCount: 3, resultsHash: prefixHash(saved.results), verifiedResultCount: 3, runtimeIntegrity: 'verified',
  });
  const repeated = await officeQualityCli({ live: true, resume: true, output: path }, {
    ...offlineQualityDependencies, generate: async () => assert.fail('completed results must not repeat'),
  });
  assert.equal(repeated.runtimeIntegrity, 'verified');
  const pack = await officeQualityCli({ 'review-pack': true, input: path, output: join(directory, 'pack.json') }, offlineQualityDependencies);
  assert.equal(pack.report.runtimeIntegrity, 'verified');
});

test('complete legacy runtime checks remain score-compatible but lack historical segment start boundaries', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-runtime-legacy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl'), report = await fullReport();
  // Old checks have no start count/hash. They can cover the prefix at their
  // position, but cannot reveal an interrupted segment before that old check.
  await writeQualityEntries(path, report, report.results.flatMap((record, index) => [
    { type: 'result', record }, ...(index === 0 || index === report.results.length - 1 ? [legacyRuntimeCheck()] : []),
  ]));
  const pack = await officeQualityCli({ 'review-pack': true, input: path, output: join(directory, 'pack.json') }, offlineQualityDependencies);
  assert.equal(pack.report.runtimeIntegrity, 'verified');
  assert.equal(pack.report.runtimeCoverage.legacyCheckCount, 2);
  await writeFile(join(directory, 'reviews.json'), JSON.stringify(completedArithmeticReview(pack.report)));
  const scored = await officeQualityCli({ score: true, input: path, reviews: join(directory, 'reviews.json'), output: join(directory, 'score.json') }, offlineQualityDependencies);
  assert.equal(scored.status, 'passed');
});

test('runtime coverage fails closed on malformed bounds, false checks, and a legacy downgrade after scoped checks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-runtime-invalid-check-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'run.jsonl');
  await officeQualityCli({ live: true, only: ['eevee-work'], output: path }, offlineQualityDependencies);
  const saved = await readOfficeQualityJournal(path);
  for (const [name, change] of Object.entries({
    'wrong-prefix': entry => { entry.coverage.priorResultsHash = 'wrong'; },
    'wrong-results': entry => { entry.coverage.resultsHash = 'wrong'; },
    'invalid-bound': entry => { entry.coverage.priorResultCount = -1; },
    'invalid-version': entry => { entry.coverage.version = 2; },
    'wrong-cumulative-count': entry => { entry.coverage.verifiedResultCount = 0; },
    'wrong-cumulative-status': entry => { entry.coverage.runtimeIntegrity = 'unverified'; },
    'changed-source': entry => { entry.unchanged = false; },
    'wrong-source-binding': entry => { entry.bundleHash = 'other-policy'; },
    'legacy-downgrade': () => {},
  })) {
    const entries = structuredClone(saved.entries), lastCheck = entries.at(-1);
    change(lastCheck);
    entries.push(legacyRuntimeCheck());
    const changedPath = join(directory, `${name}.jsonl`);
    await writeQualityEntries(changedPath, saved.run, entries);
    const pack = await officeQualityCli({ 'review-pack': true, input: changedPath, output: join(directory, `${name}.json`) }, offlineQualityDependencies);
    assert.equal(pack.report.runtimeIntegrity, 'unverified', name);
  }
});
