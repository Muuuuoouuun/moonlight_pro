import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseOfficeRequest, parseOfficeContext, OFFICE_VERSION } from '@com-moon/agent-contracts/office';
import { getGeminiIntegrationStatus } from '../../apps/engine/lib/gemini.ts';
import { OFFICE_QUALITY_SCENARIOS, OFFICE_QUALITY_SUITE_VERSION, scenarioTurnMessage } from './scenarios.mjs';
import { OFFICE_QUALITY_RUBRIC_VERSION, OFFICE_QUALITY_ROLES, OFFICE_QUALITY_REQUIREMENTS } from './rubric.mjs';

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const qualityHash = value => createHash('sha256').update(stableJson(value)).digest('hex');
const rootUrl = new URL('../../', import.meta.url);

export async function collectOfficeQualityProvenance() {
  const directory = new URL('apps/engine/lib/office/', rootUrl);
  const contractsDirectory = new URL('packages/agent-contracts/', rootUrl);
  const files = [
    'apps/engine/lib/gemini.ts',
    ...(await readdir(contractsDirectory)).filter(name => name.startsWith('office') && name.endsWith('.js') && !name.includes('.test.')).map(name => `packages/agent-contracts/${name}`),
    ...(await readdir(directory)).filter(name => name.endsWith('.ts') && !name.includes('.test.')).map(name => `apps/engine/lib/office/${name}`),
  ].sort();
  const sources = {};
  for (const path of files) sources[path] = createHash('sha256').update(await readFile(new URL(path, rootUrl))).digest('hex');
  const { provider, model } = getGeminiIntegrationStatus();
  return { officeVersion: OFFICE_VERSION, modelConfiguration: { provider, model }, sources, bundleHash: qualityHash({ sources, provider, model }) };
}

export function createOfficeQualityRun(scenarios = OFFICE_QUALITY_SCENARIOS, { provenance, runId = randomUUID(), datasetStatus = 'held-out-before-first-use' } = {}) {
  if (!provenance?.bundleHash) throw new Error('A runtime source snapshot is required.');
  if (!['held-out-before-first-use', 'development', 'independent-holdout'].includes(datasetStatus)) throw new Error('Unknown dataset status.');
  const seen = new Set();
  for (const scenario of scenarios) {
    if (seen.has(scenario.id) || !scenario.turns?.length) throw new Error('Duplicate or empty evaluation scenario.');
    seen.add(scenario.id);
    if (!scenario.subjects?.length || scenario.subjects.some(id => !OFFICE_QUALITY_ROLES.includes(id))) throw new Error('Unknown evaluation subject.');
    const turns = new Set();
    const sources = new Set();
    for (let i = 0; i < scenario.turns.length; i++) {
      const step = scenario.turns[i];
      if (turns.has(step.id)) throw new Error('Duplicate evaluation turn.');
      turns.add(step.id);
      for (const item of [...(i === 0 ? scenario.sources : []), ...step.extraSources]) {
        if (sources.has(item.id) || !item.text?.trim()) throw new Error('Duplicate or empty evaluation source.');
        sources.add(item.id);
      }
      qualityEvaluationInput(scenario, i, []);
    }
  }
  return {
    type: 'office-quality-run', formatVersion: 1, runId, createdAt: new Date().toISOString(),
    suiteVersion: OFFICE_QUALITY_SUITE_VERSION, rubricVersion: OFFICE_QUALITY_RUBRIC_VERSION,
    kind: 'evaluation-only-synthetic-scenarios', datasetStatus,
    qualityClaim: 'not-scored', provenance, suiteHash: qualityHash(scenarios), scenarios,
    plan: { scenarios: scenarios.length, generationCalls: scenarios.reduce((sum, scenario) => sum + scenario.turns.length, 0), providerCalls: 'determined-by-runtime', maxConcurrency: 2 },
  };
}

// Preserve actual excerpts, never invented assistant history. Full originals remain
// in each result; truncation is disclosed both in the text and in provenance.
function replyHistory(response) {
  let text = response.answer || '';
  const roleTurns = response.discussion?.turns || [];
  if (roleTurns.length) {
    const latest = new Map();
    for (const item of roleTurns) latest.set(item.ownerId, item);
    const parts = [text.slice(0, 1500)];
    for (const item of latest.values()) parts.push(JSON.stringify({
      ownerId: item.ownerId, position: item.position?.slice(0, 650), objection: item.objection?.slice(0, 200),
      revisionCondition: item.revisionCondition?.slice(0, 160), changeReason: item.changeReason?.slice(0, 160),
    }));
    text = parts.join('\n');
  }
  const truncated = text !== response.answer || text.length > 5900;
  return { text: `${text.slice(0, 5900)}${truncated ? '\n[길이 제한에 따른 실제 이전 응답 발췌. 전체 원문은 평가 기록에 보존됨.]' : ''}`, truncated };
}

export function qualityEvaluationInput(scenario, stepIndex, previousResults = []) {
  let history = [];
  const historyExcerpts = [];
  for (const record of previousResults) {
    if (record.response?.status !== 'generated') throw new Error('Cannot build history from a failed generation.');
    const reply = replyHistory(record.response);
    history.push({ role: 'user', text: record.request.message }, { role: 'assistant', text: reply.text });
    if (reply.truncated) historyExcerpts.push(record.id);
  }
  let droppedTurns = 0;
  while (history.length > 8 || JSON.stringify(history).length > 20000) {
    history = history.slice(2);
    droppedTurns += 2;
  }
  const request = parseOfficeRequest({
    ownerId: scenario.ownerId, mode: scenario.mode, scope: scenario.scope,
    message: scenarioTurnMessage(scenario, stepIndex), participants: scenario.participants || [], history,
    ...(scenario.deliberation ? { deliberation: scenario.deliberation } : {}),
  });
  const context = parseOfficeContext({
    source: scenario.contextSource || 'provided', scope: scenario.scope, projects: [],
    note: scenario.contextSource === 'error'
      ? '평가용 가상 상황. 조회에 실패했으며 실제 원장·업무 유무를 확인하지 못함.'
      : '평가용 가상 상황의 제공 자료만 사용. 실제 고객·원장·일정을 조회하지 않음.',
  }, request.scope);
  return { request, context, historyProvenance: { excerptedRecordIds: historyExcerpts, droppedTurns } };
}

function safeFailure(error) {
  const code = typeof error?.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(error.code) ? error.code : 'generation_exception';
  return { status: 'error', errorCode: code, error: 'Evaluation generation failed. Provider error details are not copied into the report.' };
}

export async function runOfficeQualityEvaluation(run, { generate, priorResults = [], interruptedIds = [], retryIncomplete = false, concurrency = 1, onAttempt = async () => {}, onResult = async () => {}, onFatalError = async () => {} } = {}) {
  if (typeof generate !== 'function') throw new Error('An explicit generation function is required.');
  if (![1, 2].includes(concurrency)) throw new Error('Quality evaluation concurrency must be 1 or 2.');
  if (interruptedIds.length && !retryIncomplete) throw new Error('Interrupted calls have unknown outcomes. Use --retry-incomplete explicitly to permit another paid attempt.');
  buildOfficeQualityReport(run, priorResults);
  const records = new Map();
  for (const item of priorResults) {
    if (records.has(item.id)) throw new Error('Duplicate completed evaluation result.');
    records.set(item.id, item);
  }
  const known = new Set(run.scenarios.flatMap(scenario => scenario.turns.map(step => `${scenario.id}/${step.id}`)));
  if ([...records.keys()].some(id => !known.has(id))) throw new Error('Saved result is not in this run.');
  let cursor = 0, stopped = false;
  const save = async record => {
    try { await onResult(record); }
    catch (error) { stopped = true; throw error; }
    records.set(record.id, record);
  };
  const worker = async () => {
    while (!stopped && cursor < run.scenarios.length) {
      const scenario = run.scenarios[cursor++];
      const previous = [];
      for (let index = 0; index < scenario.turns.length && !stopped; index++) {
        const step = scenario.turns[index], id = `${scenario.id}/${step.id}`;
        if (records.has(id)) { previous.push(records.get(id)); continue; }
        const failedDependency = previous.find(record => record.response.status !== 'generated');
        if (failedDependency) {
          const response = { status: 'blocked', errorCode: 'dependency_not_generated', dependency: failedDependency.id };
          const record = { id, caseId: scenario.id, turnId: step.id, ownerId: scenario.ownerId, response, responseHash: qualityHash(response), elapsedMs: 0, reviewStatus: 'not-reviewable' };
          await save(record); previous.push(record); continue;
        }
        const input = qualityEvaluationInput(scenario, index, previous);
        const startedAt = new Date().toISOString(), started = Date.now(), attemptId = randomUUID();
        try { await onAttempt({ id, attemptId, startedAt, inputHash: qualityHash({ request: input.request, context: input.context }), retriesInterruptedCall: interruptedIds.includes(id) }); }
        catch (error) { stopped = true; throw error; }
        let response;
        try {
          response = await generate(input.request, input.context);
          if (!response || typeof response !== 'object' || typeof response.status !== 'string') response = { status: 'error', errorCode: 'invalid_generation_result' };
        } catch (error) { response = safeFailure(error); }
        const record = {
          id, caseId: scenario.id, turnId: step.id, ownerId: scenario.ownerId, attemptId, startedAt,
          ...input, inputHash: qualityHash({ request: input.request, context: input.context }),
          response, responseHash: qualityHash(response), elapsedMs: Date.now() - started,
          reviewStatus: response.status === 'generated' ? 'needs-semantic-review' : 'not-reviewable',
        };
        await save(record);
        previous.push(record);
      }
    }
  };
  let failed = false, firstFailure;
  // A journal failure must stop new work immediately, but must not release the
  // caller's journal handles while a sibling is still recording its outcome.
  await Promise.allSettled(Array.from({ length: concurrency }, async () => {
    try { await worker(); }
    catch (error) {
      stopped = true;
      if (!failed) {
        failed = true;
        firstFailure = error;
        try { await onFatalError(error); } catch { /* Preserve the original journal failure. */ }
      }
    }
  }));
  if (failed) throw firstFailure;
  return buildOfficeQualityReport(run, [...records.values()]);
}

export function buildOfficeQualityReport(run, results) {
  if (run.suiteHash !== qualityHash(run.scenarios)) throw new Error('Modified scenario plan.');
  const scenarioMap = new Map(run.scenarios.map(scenario => [scenario.id, scenario]));
  const recordMap = new Map();
  for (const record of results) {
    const scenario = scenarioMap.get(record.caseId);
    if (!scenario?.turns.some(step => record.id === `${scenario.id}/${step.id}` && record.turnId === step.id)) throw new Error('Result is not in the run plan.');
    if (recordMap.has(record.id) || record.responseHash !== qualityHash(record.response)) throw new Error('Duplicate or modified response.');
    if (record.request && record.inputHash !== qualityHash({ request: record.request, context: record.context })) throw new Error('Modified evaluation input.');
    recordMap.set(record.id, record);
  }
  const ordered = run.scenarios.flatMap(scenario => scenario.turns.map(step => recordMap.get(`${scenario.id}/${step.id}`)).filter(Boolean));
  const roles = {};
  for (const roleId of OFFICE_QUALITY_ROLES) {
    const observed = new Set();
    const recordIds = [];
    for (const record of ordered) {
      const scenario = scenarioMap.get(record.caseId);
      if (!scenario.subjects.includes(roleId) || record.response.status !== 'generated') continue;
      if (scenario.mode === 'council' && !record.response.discussion?.turns?.some(item => item.ownerId === roleId && typeof item.position === 'string' && item.position.trim())) continue;
      recordIds.push(record.id);
      for (const tag of scenario.tags) {
        if (tag === 'council') observed.add(`council-${record.turnId}`);
        else if (['work', 'evidence', 'social'].includes(tag)) observed.add(tag);
      }
    }
    roles[roleId] = { observed: [...observed], missing: OFFICE_QUALITY_REQUIREMENTS.tags.filter(tag => !observed.has(tag)), recordIds };
  }
  const comparisons = run.scenarios.filter(scenario => scenario.comparison).map(scenario => {
    const baseline = recordMap.get(`${scenario.comparison.baseline}/initial`), variant = recordMap.get(`${scenario.id}/initial`);
    return { ...scenario.comparison, scenarioId: scenario.id, subjects: scenario.subjects, baselineRecordId: baseline?.id || null, variantRecordId: variant?.id || null, generated: baseline?.response.status === 'generated' && variant?.response.status === 'generated' };
  });
  const statuses = ordered.map(record => record.response.status);
  return {
    ...run, results: ordered, qualityClaim: 'not-scored',
    fingerprint: qualityHash({ runId: run.runId, suiteHash: run.suiteHash, provenance: run.provenance, results: ordered.map(record => ({ id: record.id, inputHash: record.inputHash || null, responseHash: record.responseHash })) }),
    summary: {
      planned: run.plan.generationCalls, recorded: ordered.length,
      generated: statuses.filter(status => status === 'generated').length,
      generationFailed: statuses.filter(status => !['generated', 'blocked', 'preview'].includes(status)).length,
      preview: statuses.filter(status => status === 'preview').length,
      blocked: statuses.filter(status => status === 'blocked').length,
      unevaluated: run.plan.generationCalls - ordered.length,
    },
    coverage: { roles, comparisons, missingComparisons: OFFICE_QUALITY_REQUIREMENTS.comparisons.filter(id => !comparisons.some(item => item.id === id && item.generated)) },
  };
}

export async function readOfficeQualityJournal(path) {
  const raw = await readFile(path, 'utf8');
  if (!raw.endsWith('\n')) throw new Error('Journal has an incomplete final line; preserve it and repair the trailing line before resuming.');
  const entries = raw.trimEnd().split('\n').map(line => JSON.parse(line));
  const run = entries.shift();
  if (run?.type !== 'office-quality-run' || run.formatVersion !== 1 || run.suiteHash !== qualityHash(run.scenarios)) throw new Error('Invalid or modified quality run header.');
  const results = [], pending = new Set();
  for (const entry of entries) {
    if (entry.type === 'attempt') pending.add(entry.id);
    else if (entry.type === 'result') { results.push(entry.record); pending.delete(entry.record.id); }
    else if (entry.type !== 'runtime-check') throw new Error('Unknown quality journal entry.');
  }
  const report = buildOfficeQualityReport(run, results);
  const runtimeChecks = entries.filter(entry => entry.type === 'runtime-check');
  return { run, results, interruptedIds: [...pending], report, runtimeChecks, entries };
}

export async function openOfficeQualityJournal(path, { run, resume = false } = {}) {
  const handle = await open(path, resume ? 'a' : 'wx', 0o600);
  let queue = Promise.resolve();
  const append = entry => {
    queue = queue.then(async () => { await handle.write(`${JSON.stringify(entry)}\n`); await handle.sync(); });
    return queue;
  };
  try { if (!resume) await append(run); }
  catch (error) { await handle.close(); throw error; }
  return { append, async close() { try { await queue; } finally { await handle.close(); } } };
}

export const OFFICE_QUALITY_ROOT = fileURLToPath(rootUrl);
