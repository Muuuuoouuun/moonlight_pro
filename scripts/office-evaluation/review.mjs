import { OFFICE_QUALITY_AXES, OFFICE_QUALITY_ROLES, OFFICE_CRITICAL_GATES, OFFICE_QUALITY_REQUIREMENTS, OFFICE_QUALITY_RUBRIC_VERSION, OFFICE_ROLE_QUALITY_FOCUS, qualityReviewInstructions } from './rubric.mjs';
import { scenarioSources } from './scenarios.mjs';
import { buildOfficeQualityReport } from './runner.mjs';

function atPointer(value, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  for (const part of pointer.slice(1).split('/').map(item => item.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

export function validateQualityEvidence(report, roleId, evidence) {
  if (!Array.isArray(evidence) || !evidence.length) return false;
  return evidence.every(item => {
    const record = report.results.find(result => result.id === item.recordId);
    if (!record || record.response.status !== 'generated' || typeof item.quote !== 'string' || !item.quote.trim()) return false;
    const actorMatch = /^\/discussion\/turns\/(\d+)\/(position|objection|revisionCondition|changeReason|evidence\/\d+)$/.exec(item.pointer);
    if (actorMatch) {
      if (record.response.discussion?.turns?.[Number(actorMatch[1])]?.ownerId !== roleId) return false;
    } else {
      if (record.ownerId !== roleId || !/^\/(answer|nextAction|recommendation|evidence\/\d+|dissent\/\d+)$/.test(item.pointer)) return false;
    }
    const actual = atPointer(record.response, item.pointer);
    return typeof actual === 'string' && actual.includes(item.quote);
  });
}

function validateSourceEvidence(report, evidence, responseEvidence) {
  return Array.isArray(evidence) && evidence.length > 0 && evidence.every(item => {
    const scenario = report.scenarios.find(entry => entry.id === item.scenarioId);
    const related = responseEvidence.map(reference => report.results.find(record => record.id === reference.recordId)).filter(record => record.caseId === scenario?.id);
    const sourceKnownAtResponse = related.some(record => scenarioSources(scenario, scenario.turns.findIndex(step => step.id === record.turnId)).some(source => source.id === item.sourceId));
    const actual = sourceKnownAtResponse && scenarioSources(scenario).find(entry => entry.id === item.sourceId)?.text;
    return typeof actual === 'string' && typeof item.quote === 'string' && item.quote.trim() && actual.includes(item.quote);
  });
}

// These requirements select where a behavior was observed. They never rate text.
const criterionCoverage = {
  expertise: ['work'], grounding: ['evidence'], voice: ['social'], utility: ['work'],
  'collaboration/distinctness': ['council-initial'], 'collaboration/dissent': ['council-initial'],
  'collaboration/update': ['council-update'], 'collaboration/control': ['council-close'],
};
function evidenceCoversCriterion(report, evidence, axisId, criterionId) {
  const required = criterionCoverage[`${axisId}/${criterionId}`] || criterionCoverage[axisId] || [];
  const observed = new Set();
  for (const reference of evidence) {
    const record = report.results.find(item => item.id === reference.recordId);
    const scenario = report.scenarios.find(item => item.id === record?.caseId);
    for (const tag of scenario?.tags || []) observed.add(tag === 'council' ? `council-${record.turnId}` : tag);
  }
  return required.every(tag => observed.has(tag));
}

function assertUnique(items, key, label) {
  if (!Array.isArray(items) || new Set(items.map(key)).size !== items.length) throw new Error(`Invalid or duplicate ${label}.`);
}

function independentReviewer(reviewer) {
  return typeof reviewer?.id === 'string' && !!reviewer.id.trim()
    && ['human', 'agent'].includes(reviewer.kind)
    && reviewer.independentOfImplementation === true
    && typeof reviewer.independenceExplanation === 'string' && !!reviewer.independenceExplanation.trim();
}

export function createOfficeQualityReviewTemplate(report, reviewerId = '') {
  return {
    formatVersion: 1, runId: report.runId, fingerprint: report.fingerprint, rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION,
    reviewer: { id: reviewerId, kind: 'human-or-agent', model: null, independentOfImplementation: false, independenceExplanation: '' },
    roles: OFFICE_QUALITY_ROLES.map(roleId => ({
      roleId, reviewer: null,
      ratings: OFFICE_QUALITY_AXES.flatMap(axis => axis.criteria.map(item => ({
        axisId: axis.id, criterionId: item.id, rating: null, rationale: '', evidence: [],
        ...(item.requiresSource ? { sourceEvidence: [] } : {}),
      }))),
      gates: OFFICE_CRITICAL_GATES.map(gate => ({ id: gate.id, verdict: 'unassessed', rationale: '', evidence: [], checkedRecordIds: [] })),
      comparisons: report.coverage.comparisons.filter(item => item.subjects.includes(roleId)).map(item => ({ id: item.id, verdict: 'unassessed', rationale: '', evidence: [] })),
    })),
  };
}

export function createOfficeQualityReviewPack(report) {
  return {
    kind: 'office-quality-semantic-review-pack', instructions: qualityReviewInstructions(),
    limits: 'A score is a reviewer judgment on these generated responses. Exact-quote validation checks traceability, not truth, independence, general ability, or a percentile rank.',
    rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION, axes: OFFICE_QUALITY_AXES, criticalGates: OFFICE_CRITICAL_GATES,
    roleFocus: OFFICE_ROLE_QUALITY_FOCUS, requirements: OFFICE_QUALITY_REQUIREMENTS,
    report, reviewTemplate: createOfficeQualityReviewTemplate(report),
  };
}

export function createOfficeRoleDossier(report, roleId) {
  if (!OFFICE_QUALITY_ROLES.includes(roleId)) throw new Error('Unknown Office role.');
  return {
    kind: 'office-role-review-dossier', roleId, roleFocus: OFFICE_ROLE_QUALITY_FOCUS[roleId],
    runId: report.runId, fingerprint: report.fingerprint, rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION,
    instructions: `${qualityReviewInstructions()}\n전문성/실용성은 work, 근거는 evidence, 말투는 social의 원문을 반드시 인용한다. 협의 항목은 initial, update, close의 해당 역할 발언을 구분해서 인용한다.`,
    axes: OFFICE_QUALITY_AXES, gates: OFFICE_CRITICAL_GATES, requirements: OFFICE_QUALITY_REQUIREMENTS,
    coverage: report.coverage.roles[roleId], comparisons: report.coverage.comparisons.filter(item => item.subjects.includes(roleId)),
    warning: 'A partial run fingerprint changes as more responses arrive. Preserve recordId and responseHash; verify both before attaching this review to the final artifact. Other actors and owner synthesis are context, not this role’s own speech.',
    cases: report.results.filter(record => report.scenarios.find(scenario => scenario.id === record.caseId)?.subjects.includes(roleId)).map(record => {
      const scenario = report.scenarios.find(item => item.id === record.caseId);
      return {
        recordId: record.id, responseHash: record.responseHash, inputHash: record.inputHash,
        scenarioId: scenario.id, tags: scenario.tags, turnId: record.turnId, expected: scenario.expected,
        request: record.request, context: record.context,
        sources: scenarioSources(scenario, scenario.turns.findIndex(step => step.id === record.turnId)),
        actorPointers: (record.response.discussion?.turns || []).flatMap((item, index) => item.ownerId === roleId ? [`/discussion/turns/${index}`] : []),
        synthesisBelongsToSubject: record.ownerId === roleId,
        response: record.response,
      };
    }),
    reviewTemplate: { ...createOfficeQualityReviewTemplate(report), roles: createOfficeQualityReviewTemplate(report).roles.filter(item => item.roleId === roleId) },
  };
}

export function scoreOfficeQualityReview(report, review) {
  // Recompute the artifact fingerprint; stale or edited responses cannot inherit scores.
  const current = buildOfficeQualityReport(report, report.results);
  if (current.fingerprint !== report.fingerprint || review?.fingerprint !== current.fingerprint || review.runId !== report.runId || review.rubricVersion !== OFFICE_QUALITY_RUBRIC_VERSION) throw new Error('Review does not match the current response artifact and rubric.');
  assertUnique(review.roles, item => item.roleId, 'role reviews');
  if (review.roles.some(item => !OFFICE_QUALITY_ROLES.includes(item.roleId))) throw new Error('Unknown reviewed role.');
  const roles = OFFICE_QUALITY_ROLES.map(roleId => {
    const role = review.roles.find(item => item.roleId === roleId);
    const reviewer = role?.reviewer || review.reviewer;
    const coverage = current.coverage.roles[roleId];
    const issues = [];
    if (!independentReviewer(reviewer)) issues.push('independent-review-not-declared');
    if (report.runtimeIntegrity !== 'verified') issues.push('runtime-snapshot-not-verified');
    if (coverage.missing.length) issues.push(`coverage-missing:${coverage.missing.join(',')}`);
    if (role) {
      assertUnique(role.ratings, item => `${item.axisId}/${item.criterionId}`, 'criterion ratings');
      assertUnique(role.gates, item => item.id, 'critical gates');
      assertUnique(role.comparisons, item => item.id, 'comparison judgments');
      if (role.ratings.some(item => !OFFICE_QUALITY_AXES.some(axis => axis.id === item.axisId && axis.criteria.some(criterion => criterion.id === item.criterionId)))) throw new Error('Unknown rubric criterion.');
      if (role.gates.some(item => !OFFICE_CRITICAL_GATES.some(gate => gate.id === item.id))) throw new Error('Unknown critical gate.');
    }
    const axes = OFFICE_QUALITY_AXES.map(axis => {
      const criteria = axis.criteria.map(criterion => {
        const item = role?.ratings.find(entry => entry.axisId === axis.id && entry.criterionId === criterion.id);
        let issue = null;
        if (!Number.isInteger(item?.rating) || item.rating < 0 || item.rating > 5) issue = 'unassessed';
        else if (typeof item.rationale !== 'string' || !item.rationale.trim()) issue = 'missing-rationale';
        else if (!validateQualityEvidence(current, roleId, item.evidence)) issue = 'missing-or-invalid-response-evidence';
        else if (!evidenceCoversCriterion(current, item.evidence, axis.id, criterion.id)) issue = 'required-behavior-not-cited';
        else if (criterion.requiresSource && !validateSourceEvidence(current, item.sourceEvidence, item.evidence)) issue = 'missing-or-invalid-source-evidence';
        if (issue) issues.push(`${axis.id}/${criterion.id}:${issue}`);
        return { id: criterion.id, rating: issue ? null : item.rating, issue, rationale: item?.rationale || null, evidence: item?.evidence || [], sourceEvidence: item?.sourceEvidence || [] };
      });
      const evaluated = criteria.filter(item => item.rating !== null).length;
      const points = evaluated === 4 ? criteria.reduce((sum, item) => sum + item.rating, 0) : null;
      return { id: axis.id, label: axis.label, points, maximum: 20, percent: points === null ? null : points * 5, evaluated, criteria };
    });
    const gates = OFFICE_CRITICAL_GATES.map(gate => {
      const item = role?.gates.find(entry => entry.id === gate.id);
      let verdict = item?.verdict;
      const reasoned = typeof item?.rationale === 'string' && item.rationale.trim();
      if (!reasoned || !['clear', 'failed'].includes(verdict)) verdict = 'unassessed';
      else if (verdict === 'failed' && !validateQualityEvidence(current, roleId, item.evidence)) verdict = 'unassessed';
      else if (verdict === 'clear' && (!coverage.recordIds.length || !Array.isArray(item.checkedRecordIds) || coverage.recordIds.some(id => !item.checkedRecordIds.includes(id)))) verdict = 'unassessed';
      if (verdict === 'unassessed') issues.push(`critical-gate-unassessed:${gate.id}`);
      return { id: gate.id, verdict, rationale: item?.rationale || null, evidence: item?.evidence || [], checkedRecordIds: item?.checkedRecordIds || [] };
    });
    const comparisons = current.coverage.comparisons.filter(item => item.subjects.includes(roleId)).map(comparison => {
      const item = role?.comparisons.find(entry => entry.id === comparison.id);
      const referenced = new Set(item?.evidence?.map(entry => entry.recordId) || []);
      const complete = comparison.generated && ['meets', 'needs-revision'].includes(item?.verdict)
        && typeof item.rationale === 'string' && item.rationale.trim()
        && validateQualityEvidence(current, roleId, item.evidence)
        && referenced.has(comparison.baselineRecordId) && referenced.has(comparison.variantRecordId);
      if (!complete) issues.push(`comparison-unassessed:${comparison.id}`);
      return { id: comparison.id, verdict: complete ? item.verdict : 'unassessed', rationale: item?.rationale || null, evidence: item?.evidence || [] };
    });
    if (!comparisons.length) issues.push('comparison-coverage-missing');
    const total = axes.every(axis => axis.points !== null) ? axes.reduce((sum, axis) => sum + axis.points, 0) : null;
    const failures = [
      ...gates.filter(item => item.verdict === 'failed').map(item => `critical:${item.id}`),
      ...axes.filter(axis => axis.percent !== null && axis.percent < OFFICE_QUALITY_REQUIREMENTS.axisMinimum).map(axis => `axis-below-threshold:${axis.id}`),
      ...comparisons.filter(item => item.verdict === 'needs-revision').map(item => `comparison-needs-revision:${item.id}`),
    ];
    if (total !== null && total < OFFICE_QUALITY_REQUIREMENTS.totalMinimum) failures.push('total-below-threshold');
    return { roleId, reviewer, status: failures.length ? 'needs-revision' : issues.length ? 'unverified' : 'passed', total, maximum: 100, axes, gates, comparisons, coverage, issues, failures };
  });
  return {
    kind: 'office-quality-reviewed-scorecard', runId: report.runId, fingerprint: report.fingerprint,
    rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION, datasetStatus: report.datasetStatus,
    reviewer: review.reviewer, independence: 'reviewer-declared-not-machine-proven',
    qualityClaim: 'semantic-review-of-this-sample-only', requirements: OFFICE_QUALITY_REQUIREMENTS,
    status: roles.every(role => role.status === 'passed') && !current.coverage.missingComparisons.length ? 'passed' : roles.some(role => role.status === 'needs-revision') ? 'needs-revision' : 'unverified',
    generation: current.summary,
    summary: { passed: roles.filter(role => role.status === 'passed').length, needsRevision: roles.filter(role => role.status === 'needs-revision').length, unverified: roles.filter(role => role.status === 'unverified').length },
    roles,
  };
}
