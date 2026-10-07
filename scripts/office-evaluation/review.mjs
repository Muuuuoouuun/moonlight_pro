import { OFFICE_QUALITY_AXES, OFFICE_QUALITY_ROLES, OFFICE_CRITICAL_GATES, OFFICE_QUALITY_REQUIREMENTS, OFFICE_QUALITY_RUBRIC_VERSION, OFFICE_ROLE_QUALITY_FOCUS, qualityReviewInstructions } from './rubric.mjs';
import { scenarioSources } from './scenarios.mjs';
import { buildOfficeQualityReport } from './runner.mjs';

export const OFFICE_EVIDENCE_POLICY_VERSION = 2;
const DISCUSSION_V2 = '2026-10-04.v2';
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const sameCitation = (left, right) => left && right && ['recordId', 'pointer', 'quote'].every(key => left[key] === right[key]);
const containsCitation = (evidence, reference) => Array.isArray(evidence) && evidence.some(item => sameCitation(item, reference));

function evidencePolicy(report, version = 1) {
  if (![1, OFFICE_EVIDENCE_POLICY_VERSION].includes(version)) throw new Error('Unknown evidence policy version.');
  if (version === 1 && report.results.some(record => record.response.discussion?.version === DISCUSSION_V2)) {
    throw new Error('Legacy evidence policy cannot review v2 discussion records.');
  }
  return version;
}

function citationPolicyInstructions() {
  return [
    '인용 정책 v2: sourceEvidence에는 recordId/scenarioId/sourceId/quote를 적는다. 그 recordId가 해당 응답 인용에 포함되고 그 응답 시점에 알려진 자료여야 한다.',
    'dissent의 interactionEvidence에는 {response,target} 인용 쌍을 적는다. response는 본인의 response 발언 peerReviews/N/reason, target은 같은 기록에서 그 peerReview가 지목한 동료의 첫 position 발언 필드다. target.quote는 peerReview.quote 전체를 그대로 인용한다.',
    'update의 changeEvidence에는 {before,after,reason} 인용을 적는다. 같은 update 기록에서 본인의 첫 position, response의 position과 changeReason을 인용하고, evidence에는 같은 시나리오의 이전 initial 발언도 포함한다.',
    'interactionEvidence.response와 changeEvidence의 인용은 evidence에도 포함한다. target은 문맥이며 다른 역할의 전문성 증거로 대체하지 않는다. changed=false, sourceCounts, 반론 개수는 의미 점수를 결정하지 않는다.',
  ].join('\n');
}

function atPointer(value, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  for (const part of pointer.slice(1).split('/').map(item => item.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function responseCitation(report, item) {
  if (!item || !nonempty(item.quote) || typeof item.pointer !== 'string') return null;
  const record = report.results.find(result => result.id === item.recordId);
  if (!record || record.response.status !== 'generated') return null;
  const actual = atPointer(record.response, item.pointer);
  if (typeof actual !== 'string' || !actual.includes(item.quote)) return null;
  const match = /^\/discussion\/turns\/(0|[1-9]\d*)\/(.+)$/.exec(item.pointer);
  return { record, turn: match ? record.response.discussion?.turns?.[Number(match[1])] : null,
    turnIndex: match ? Number(match[1]) : null, field: match?.[2] };
}

export function validateQualityEvidence(report, roleId, evidence) {
  if (!Array.isArray(evidence) || !evidence.length) return false;
  return evidence.every(item => {
    const ref = responseCitation(report, item);
    if (!ref) return false;
    const { record, turn, field } = ref;
    if (turn) {
      if (turn.ownerId !== roleId) return false;
      if (/^(position|objection|revisionCondition|changeReason|evidence\/\d+)$/.test(field)) return true;
      return record.response.discussion.version === DISCUSSION_V2 && turn.round === 'response'
        && /^peerReviews\/(0|[1-9]\d*)\/reason$/.test(field);
    }
    if (record.ownerId !== roleId) return false;
    if (/^\/(answer|nextAction|recommendation|evidence\/\d+|dissent\/\d+)$/.test(item.pointer)) return true;
    const resolution = /^\/discussion\/resolutions\/(0|[1-9]\d*)\/rationale$/.exec(item.pointer);
    if (!resolution || record.response.discussion?.version !== DISCUSSION_V2) return false;
    const turnRef = record.response.discussion.resolutions[Number(resolution[1])]?.turnRef;
    return nonempty(turnRef) && record.response.discussion.turns.some(speech => speech.turnRef === turnRef && nonempty(speech.objection));
  });
}

function validateSourceEvidence(report, evidence, responseEvidence, policy) {
  return Array.isArray(evidence) && evidence.length > 0 && evidence.every(item => {
    if (!item || !nonempty(item.quote)) return false;
    const scenario = report.scenarios.find(entry => entry.id === item.scenarioId);
    if (!scenario) return false;
    const related = responseEvidence.map(reference => report.results.find(record => record.id === reference.recordId))
      .filter(record => record?.caseId === scenario.id && (policy === 1 || record.id === item.recordId));
    return related.some(record => {
      const index = scenario.turns.findIndex(step => step.id === record.turnId);
      const actual = index < 0 ? null : scenarioSources(scenario, index).find(source => source.id === item.sourceId)?.text;
      return typeof actual === 'string' && actual.includes(item.quote);
    });
  });
}

function isCouncilStep(report, record, step) {
  return record.turnId === step && report.scenarios.some(scenario => scenario.id === record.caseId && scenario.tags.includes('council'));
}

// These checks establish who responded to which original claim, not whether
// their answer is persuasive, correct, independent, or deserving of points.
function validInteractionEvidence(report, roleId, item) {
  return Array.isArray(item.interactionEvidence) && item.interactionEvidence.length > 0 && item.interactionEvidence.every(pair => {
    if (!pair || !containsCitation(item.evidence, pair.response) || !validateQualityEvidence(report, roleId, [pair.response])) return false;
    const response = responseCitation(report, pair.response), target = responseCitation(report, pair.target);
    const peerIndex = /^peerReviews\/(0|[1-9]\d*)\/reason$/.exec(response?.field);
    if (!peerIndex || response.turn.round !== 'response' || !target?.turn || target.turn.round !== 'position'
      || target.record.id !== response.record.id || !isCouncilStep(report, response.record, 'initial')) return false;
    const peer = response.turn.peerReviews?.[Number(peerIndex[1])];
    const firstTarget = response.record.response.discussion.turns.find(turn => turn.ownerId === peer?.ownerId && turn.round === 'position');
    return peer && peer.ownerId !== roleId && peer.ownerId === target.turn.ownerId && firstTarget === target.turn
      && ['position', 'objection', 'revisionCondition'].includes(peer.field) && target.field === peer.field
      && pair.target.quote === peer.quote;
  });
}

function validChangeEvidence(report, roleId, item) {
  const change = item.changeEvidence;
  if (!change || !['before', 'after', 'reason'].every(key => containsCitation(item.evidence, change[key])
    && validateQualityEvidence(report, roleId, [change[key]]))) return false;
  const before = responseCitation(report, change.before), after = responseCitation(report, change.after), reason = responseCitation(report, change.reason);
  if (!before?.turn || !after?.turn || !reason?.turn || before.record.id !== after.record.id || reason.record.id !== after.record.id
    || before.turn.round !== 'position' || before.field !== 'position' || after.turn.round !== 'response' || after.field !== 'position'
    || reason.turnIndex !== after.turnIndex || reason.field !== 'changeReason' || !isCouncilStep(report, after.record, 'update')) return false;
  const first = after.record.response.discussion.turns.find(turn => turn.ownerId === roleId && turn.round === 'position');
  return before.turn === first && item.evidence.some(reference => {
    const prior = responseCitation(report, reference);
    return prior?.turn?.ownerId === roleId && prior.field === 'position' && prior.record.caseId === after.record.caseId
      && isCouncilStep(report, prior.record, 'initial');
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

export function createOfficeQualityReviewTemplate(report, reviewerId = '', { evidencePolicyVersion = OFFICE_EVIDENCE_POLICY_VERSION } = {}) {
  const policy = evidencePolicy(report, evidencePolicyVersion);
  return {
    formatVersion: 1, runId: report.runId, fingerprint: report.fingerprint, rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION,
    evidencePolicyVersion: policy,
    reviewer: { id: reviewerId, kind: 'human-or-agent', model: null, independentOfImplementation: false, independenceExplanation: '' },
    roles: OFFICE_QUALITY_ROLES.map(roleId => ({
      roleId, reviewer: null,
      ratings: OFFICE_QUALITY_AXES.flatMap(axis => axis.criteria.map(item => ({
        axisId: axis.id, criterionId: item.id, rating: null, rationale: '', evidence: [],
        ...(item.requiresSource ? { sourceEvidence: [] } : {}),
        ...(policy === 2 && axis.id === 'collaboration' && item.id === 'dissent' ? { interactionEvidence: [] } : {}),
        ...(policy === 2 && axis.id === 'collaboration' && item.id === 'update' ? { changeEvidence: { before: null, after: null, reason: null } } : {}),
      }))),
      gates: OFFICE_CRITICAL_GATES.map(gate => ({ id: gate.id, verdict: 'unassessed', rationale: '', evidence: [], checkedRecordIds: [] })),
      comparisons: report.coverage.comparisons.filter(item => item.subjects.includes(roleId)).map(item => ({ id: item.id, verdict: 'unassessed', rationale: '', evidence: [] })),
    })),
  };
}

export function createOfficeQualityReviewPack(report) {
  return {
    kind: 'office-quality-semantic-review-pack', instructions: `${qualityReviewInstructions()}\n${citationPolicyInstructions()}`,
    evidencePolicyVersion: OFFICE_EVIDENCE_POLICY_VERSION,
    limits: 'A score is a reviewer judgment on these generated responses. Exact-quote validation checks traceability, not truth, independence, general ability, or a percentile rank.',
    rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION, axes: OFFICE_QUALITY_AXES, criticalGates: OFFICE_CRITICAL_GATES,
    roleFocus: OFFICE_ROLE_QUALITY_FOCUS, requirements: OFFICE_QUALITY_REQUIREMENTS,
    report, reviewTemplate: createOfficeQualityReviewTemplate(report),
  };
}

function interactionPointers(record, roleId) {
  const discussion = record.response.discussion;
  if (discussion?.version !== DISCUSSION_V2 || !Array.isArray(discussion.turns)) return [];
  return discussion.turns.flatMap((turn, index) => {
    if (turn.ownerId !== roleId || turn.round !== 'response' || !Array.isArray(turn.peerReviews)) return [];
    return turn.peerReviews.flatMap((peer, peerIndex) => {
      const target = discussion.turns.findIndex(speech => speech.ownerId === peer.ownerId && speech.round === 'position');
      if (target < 0 || !['position', 'objection', 'revisionCondition'].includes(peer.field)) return [];
      return [{ response: `/discussion/turns/${index}/peerReviews/${peerIndex}/reason`, target: `/discussion/turns/${target}/${peer.field}` }];
    });
  });
}

export function createOfficeRoleDossier(report, roleId) {
  if (!OFFICE_QUALITY_ROLES.includes(roleId)) throw new Error('Unknown Office role.');
  return {
    kind: 'office-role-review-dossier', roleId, roleFocus: OFFICE_ROLE_QUALITY_FOCUS[roleId],
    runId: report.runId, fingerprint: report.fingerprint, rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION,
    evidencePolicyVersion: OFFICE_EVIDENCE_POLICY_VERSION,
    instructions: `${qualityReviewInstructions()}\n${citationPolicyInstructions()}\n전문성/실용성은 work, 근거는 evidence, 말투는 social의 원문을 반드시 인용한다. 협의 항목은 initial, update, close의 해당 역할 발언을 구분해서 인용한다.`,
    axes: OFFICE_QUALITY_AXES, gates: OFFICE_CRITICAL_GATES, requirements: OFFICE_QUALITY_REQUIREMENTS,
    coverage: report.coverage.roles[roleId], comparisons: report.coverage.comparisons.filter(item => item.subjects.includes(roleId)),
    warning: 'A partial run fingerprint changes as more responses arrive. Preserve recordId and responseHash; verify both before attaching this review to the final artifact. Other actors and owner synthesis are context, not this role’s own speech.',
    cases: report.results.filter(record => report.scenarios.find(scenario => scenario.id === record.caseId)?.subjects.includes(roleId)).map(record => {
      const scenario = report.scenarios.find(item => item.id === record.caseId);
      return {
        recordId: record.id, responseHash: record.responseHash, inputHash: record.inputHash,
        scenarioId: scenario.id, tags: scenario.tags, turnId: record.turnId, expected: scenario.expected,
        request: record.request, context: record.context,
        sources: scenarioSources(scenario, scenario.turns.findIndex(step => step.id === record.turnId)).map(source => ({ ...source, recordId: record.id })),
        actorPointers: (record.response.discussion?.turns || []).flatMap((item, index) => item.ownerId === roleId ? [`/discussion/turns/${index}`] : []),
        interactionPointers: interactionPointers(record, roleId),
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
  const policy = evidencePolicy(current, review.evidencePolicyVersion);
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
        else if (criterion.requiresSource && !validateSourceEvidence(current, item.sourceEvidence, item.evidence, policy)) issue = 'missing-or-invalid-source-evidence';
        else if (policy === 2 && axis.id === 'collaboration' && criterion.id === 'dissent' && !validInteractionEvidence(current, roleId, item)) issue = 'missing-or-invalid-interaction-evidence';
        else if (policy === 2 && axis.id === 'collaboration' && criterion.id === 'update' && !validChangeEvidence(current, roleId, item)) issue = 'missing-or-invalid-change-evidence';
        if (issue) issues.push(`${axis.id}/${criterion.id}:${issue}`);
        return { id: criterion.id, rating: issue ? null : item.rating, issue, rationale: item?.rationale || null, evidence: item?.evidence || [], sourceEvidence: item?.sourceEvidence || [],
          ...(policy === 2 && axis.id === 'collaboration' && criterion.id === 'dissent' ? { interactionEvidence: item?.interactionEvidence || [] } : {}),
          ...(policy === 2 && axis.id === 'collaboration' && criterion.id === 'update' ? { changeEvidence: item?.changeEvidence || null } : {}) };
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
    evidencePolicyVersion: policy, evidencePolicy: policy === 1 ? 'legacy-v1' : 'record-bound-v2',
    evidenceLimitations: policy === 1 ? 'Historical citation checks only; peer-response pairs, before/after evidence and exact source-to-record binding were not required.' : 'Citation structure and exact excerpts are checked; semantic quality remains the reviewer judgment.',
    rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION, datasetStatus: report.datasetStatus,
    reviewer: review.reviewer, independence: 'reviewer-declared-not-machine-proven',
    qualityClaim: 'semantic-review-of-this-sample-only', requirements: OFFICE_QUALITY_REQUIREMENTS,
    status: roles.every(role => role.status === 'passed') && !current.coverage.missingComparisons.length ? 'passed' : roles.some(role => role.status === 'needs-revision') ? 'needs-revision' : 'unverified',
    generation: current.summary,
    summary: { passed: roles.filter(role => role.status === 'passed').length, needsRevision: roles.filter(role => role.status === 'needs-revision').length, unverified: roles.filter(role => role.status === 'unverified').length },
    roles,
  };
}
