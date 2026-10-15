import { OFFICE_QUALITY_ROLES } from './rubric.mjs';
import { buildOfficeQualityReport, qualityHash } from './runner.mjs';

// Evaluation-only aggregation. Semantic ratings must come from the existing
// quote-validated review; this module never guesses ratings from model text.
export const OFFICE_USABILITY_GROUPS = Object.freeze({
  problemSolving: ['expertise/problem', 'grounding/reasoning', 'utility/decision', 'utility/feasibility'],
  roleExpertise: ['expertise/method', 'expertise/deliverable', 'expertise/boundaries'],
  communication: ['collaboration/distinctness', 'collaboration/dissent', 'collaboration/update', 'collaboration/control'],
  instructions: ['grounding/facts', 'grounding/uncertainty', 'grounding/verification', 'utility/acceptance'],
  usability: ['voice/identity', 'voice/naturalness', 'voice/empathy', 'voice/proportion', 'utility/next'],
});
export const OFFICE_RECOVERY_CHECKS = Object.freeze(['provider-timeout', 'invalid-json', 'invalid-peer-quote', 'untraced-source', 'scope-isolation', 'duplicate-turn', 'unknown-result', 'meeting-restore', 'stale-assignment', 'read-error']);
export const OFFICE_UI_CHECKS = Object.freeze(['mobile-390', 'desktop', 'complete-flow', 'input-preserved-on-error']);
const latencyBounds = {
  solo: { p50: [10000, 15000, 20000, 30000, 48000], p95: [20000, 28000, 35000, 45000, 48000] },
  council: { p50: [18000, 24000, 30000, 40000, 48000], p95: [28000, 36000, 45000, 47000, 48000] },
};
const points = [100, 90, 80, 60, 0];
function latencyScore(value, bounds) {
  if (value <= bounds[0]) return 100;
  if (value >= bounds.at(-1)) return 0;
  const end = bounds.findIndex(bound => value <= bound), start = end - 1;
  return points[start] + (points[end] - points[start]) * (value - bounds[start]) / (bounds[end] - bounds[start]);
}
const mean = values => values.length && values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function scoreOfficeLatency(records) {
  const output = {};
  let complete = records.length > 0;
  const scores = [];
  for (const [kind, bounds] of Object.entries(latencyBounds)) {
    const observed = records.filter(r => r.request && (r.request.mode === 'council') === (kind === 'council'));
    const valid = observed.length > 0 && observed.every(r => Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0);
    if (!valid) { output[kind] = null; scores.push(null); complete = false; continue; }
    const times = observed.map(r => r.elapsedMs).sort((a, b) => a - b);
    const p50 = times[Math.ceil(times.length * 0.5) - 1], p95 = times[Math.ceil(times.length * 0.95) - 1];
    output[kind] = { count: times.length, p50, p95 };
    scores.push(latencyScore(p50, bounds.p50), latencyScore(p95, bounds.p95));
  }
  complete &&= records.every(r => r.request && r.response?.status === 'generated');
  return { ...output, score: scores.every(Number.isFinite) ? Math.min(...scores) : null, complete };
}

function observations(required, checks) {
  if (!Array.isArray(checks) || new Set(checks.map(c => c.id)).size !== checks.length || checks.some(c => !required.includes(c.id))) throw new Error('Invalid observation checks.');
  const results = required.map(id => {
    const check = checks.find(c => c.id === id);
    return typeof check?.passed === 'boolean' && Array.isArray(check.evidence) && check.evidence.length && check.evidence.every(e => typeof e === 'string' && e.trim()) ? check.passed : null;
  });
  return { complete: results.every(v => v !== null), passed: results.every(v => v === true), failed: results.some(v => v === false), rate: results.every(v => v !== null) ? results.filter(Boolean).length / results.length * 100 : null };
}

function firstAttemptEvidence(report, journalEntries) {
  if (!Array.isArray(journalEntries)) return { rate: null, complete: false, retried: null };
  const saved = journalEntries.filter(e => e.type === 'result').map(e => e.record);
  const byId = records => [...records].sort((a,b)=>a.id.localeCompare(b.id));
  if (qualityHash(byId(saved)) !== qualityHash(byId(report.results))) throw new Error('Mismatched journal result evidence.');
  const attempts = journalEntries.filter(e => e.type === 'attempt');
  const plannedIds = new Set(report.scenarios.flatMap(s => s.turns.map(t => `${s.id}/${t.id}`)));
  if (attempts.some(a => !plannedIds.has(a.id) || !a.attemptId) || new Set(attempts.map(a => a.attemptId)).size !== attempts.length) throw new Error('Invalid journal attempts.');
  let succeeded = 0, retried = 0, complete = true;
  for (const record of report.results) {
    if (record.response.status === 'blocked') continue;
    const history = attempts.filter(a => a.id === record.id);
    const matched = history.find(a => a.attemptId === record.attemptId && a.inputHash === record.inputHash);
    if (!matched || history.at(-1) !== matched) { complete = false; continue; }
    if (history.length > 1 || matched.retriesInterruptedCall) { retried++; continue; }
    if (record.response.status === 'generated') succeeded++;
  }
  return { rate: complete ? succeeded / report.summary.planned * 100 : null, complete, retried };
}

export function summarizeOfficeUsability(scorecard, report, { recoveryChecks = [], uiChecks = [], journalEntries } = {}) {
  const current = buildOfficeQualityReport(report, report.results);
  if (!scorecard.fingerprint || scorecard.fingerprint !== current.fingerprint || report.fingerprint !== current.fingerprint) throw new Error('Mismatched evaluation fingerprint.');
  if (qualityHash(current.summary) !== qualityHash(report.summary) || current.summary.planned !== report.scenarios.reduce((n,s)=>n+s.turns.length,0)) throw new Error('Mismatched evaluation summary.');
  if (scorecard.roles?.length !== OFFICE_QUALITY_ROLES.length || new Set(scorecard.roles.map(r => r.roleId)).size !== OFFICE_QUALITY_ROLES.length || OFFICE_QUALITY_ROLES.some(id => !scorecard.roles.some(r => r.roleId === id))) throw new Error('Expected all nine unique roles.');
  const dimensions = Object.fromEntries(Object.entries(OFFICE_USABILITY_GROUPS).map(([id, keys]) => [id, mean(scorecard.roles.map(role => mean(keys.map(key => {
    const [axis, criterion] = key.split('/');
    const value = role.axes.find(a => a.id === axis)?.criteria.find(c => c.id === criterion)?.rating;
    return Number.isInteger(value) && value >= 0 && value <= 5 ? value * 20 : null;
  }))))]));
  const latency = scoreOfficeLatency(report.results);
  const firstAttempts = firstAttemptEvidence(report, journalEntries);
  latency.complete &&= current.summary.recorded === current.summary.planned && firstAttempts.complete && firstAttempts.retried === 0;
  const recovery = observations(OFFICE_RECOVERY_CHECKS, recoveryChecks), ui = observations(OFFICE_UI_CHECKS, uiChecks);
  const successRate = firstAttempts.rate;
  dimensions.speed = latency.score;
  dimensions.reliability = mean([successRate, recovery.rate]);
  const average = mean(Object.values(dimensions));
  const complete = average !== null && latency.complete && recovery.complete && ui.complete && report.runtimeIntegrity === 'verified';
  const belowTarget = Object.values(dimensions).some(value => value !== null && value < 80) || (average !== null && average < 84);
  const failed = belowTarget || scorecard.status === 'needs-revision' || recovery.failed || ui.failed;
  return {
    kind: 'office-usability-evaluation', version: '2026-10-05.v1', fingerprint: report.fingerprint,
    dimensions, average, thresholds: { average: 84, minimum: 80 }, latency, successRate, firstAttempts,
    observations: { recovery, ui }, semanticStatus: scorecard.status, runtimeIntegrity: report.runtimeIntegrity,
    status: failed ? 'needs-revision' : complete && scorecard.status === 'passed' && recovery.passed && ui.passed ? 'passed' : 'unverified',
    limitations: 'Semantic scores are reviewer judgments on this sample; observation references and reviewer independence are declarations, not independently proven by this aggregator.',
  };
}
