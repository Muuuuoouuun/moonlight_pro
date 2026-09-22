import { readFile, writeFile } from 'node:fs/promises';
import { OFFICE_QUALITY_SCENARIOS } from './scenarios.mjs';
import { OFFICE_QUALITY_AXES, OFFICE_CRITICAL_GATES, qualityReviewInstructions } from './rubric.mjs';
import { collectOfficeQualityProvenance, createOfficeQualityRun, qualityHash, runOfficeQualityEvaluation, openOfficeQualityJournal, readOfficeQualityJournal } from './runner.mjs';
import { createOfficeQualityReviewPack, createOfficeRoleDossier, scoreOfficeQualityReview } from './review.mjs';
import { createTracedOfficeGenerator } from './trace.mjs';

const outputJson = async (path, value) => {
  if (!path) throw new Error('An --output path is required.');
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
};

const requireGeminiConfiguration = async () => {
  if (!(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim())) throw new Error('Gemini is not configured. No evaluation calls were made.');
};

const resultPrefixHash = records => qualityHash(records.map(({ id, inputHash = null, responseHash }) => ({ id, inputHash, responseHash })));

function runtimeCoverage(run, entries) {
  const records = [];
  let verifiedResultCount = 0, invalid = false, scoped = false, checkCount = 0, legacyCheckCount = 0;
  for (const entry of entries) {
    if (entry.type === 'result') records.push(entry.record);
    if (entry.type !== 'runtime-check') continue;
    checkCount++;
    if (entry.unchanged !== true || entry.bundleHash !== run.provenance.bundleHash || entry.officeVersion !== run.provenance.officeVersion) invalid = true;
    if (!Object.hasOwn(entry, 'coverage')) {
      // Legacy checks only bind the result prefix preceding them. Their original
      // segment starts were not recorded, so historical gaps cannot be inferred.
      // Once scoped checks exist, an older writer cannot erase their boundaries.
      legacyCheckCount++;
      if (scoped) invalid = true;
      if (!invalid) verifiedResultCount = records.length;
      continue;
    }
    scoped = true;
    const coverage = entry.coverage;
    const validBounds = coverage?.version === 1 && Number.isSafeInteger(coverage.priorResultCount)
      && coverage.priorResultCount >= 0 && coverage.priorResultCount <= records.length
      && coverage.resultCount === records.length
      && coverage.priorResultsHash === resultPrefixHash(records.slice(0, coverage.priorResultCount))
      && coverage.resultsHash === resultPrefixHash(records);
    if (!validBounds || coverage.priorResultCount !== verifiedResultCount) invalid = true;
    const nextVerifiedCount = invalid ? verifiedResultCount : records.length;
    if (coverage?.verifiedResultCount !== nextVerifiedCount || coverage?.runtimeIntegrity !== (invalid ? 'unverified' : 'verified')) invalid = true;
    if (!invalid) verifiedResultCount = nextVerifiedCount;
  }
  return {
    runtimeIntegrity: checkCount > 0 && !invalid && verifiedResultCount === records.length ? 'verified' : 'unverified',
    coverage: { version: 1, resultCount: records.length, verifiedResultCount, legacyCheckCount }, invalid,
  };
}

function attachRuntimeCoverage(report, run, entries) {
  const state = runtimeCoverage(run, entries);
  report.runtimeIntegrity = state.runtimeIntegrity;
  report.runtimeCoverage = state.coverage;
}

export async function officeQualityCli(values, {
  generate, generateProvider, log = console.log,
  collectProvenance = collectOfficeQualityProvenance,
  requireLiveConfiguration = requireGeminiConfiguration,
  onRun = async () => {},
  onFatalError = async () => {},
} = {}) {
  if (values.rubric) {
    if (values.live) throw new Error('--rubric cannot be combined with --live.');
    log(JSON.stringify({ instructions: qualityReviewInstructions(), axes: OFFICE_QUALITY_AXES, criticalGates: OFFICE_CRITICAL_GATES }, null, 2));
    return;
  }
  if (values['review-pack'] || values.score) {
    if (values.live || values.resume) throw new Error('Review and scoring never call generation. Remove live/resume flags.');
    if (!values.input) throw new Error('Review requires --input <run.jsonl>.');
    const saved = await readOfficeQualityJournal(values.input);
    attachRuntimeCoverage(saved.report, saved.run, saved.entries);
    const result = values.score
      ? scoreOfficeQualityReview(saved.report, JSON.parse(await readFile(values.reviews || '', 'utf8')))
      : values.role ? createOfficeRoleDossier(saved.report, values.role) : createOfficeQualityReviewPack(saved.report);
    await outputJson(values.output, result);
    log(values.score ? `${result.status}: ${result.summary.passed}/9 roles passed this sample. ${values.output}` : `Unscored review pack written: ${values.output}`);
    if (values.score && result.status !== 'passed') process.exitCode = 1;
    return result;
  }
  const all = OFFICE_QUALITY_SCENARIOS;
  if (values.only?.some(id => !all.some(scenario => scenario.id === id))) throw new Error('Unknown quality scenario. Run --suite quality to list cases.');
  let scenarios = values.only?.length ? all.filter(scenario => values.only.includes(scenario.id)) : all;
  if (!values.live) {
    if (values.resume || values['retry-incomplete']) throw new Error('Resume requires an explicit --live flag. No calls were made.');
    log(scenarios.map(scenario => `${scenario.id}: ${scenario.subjects.join(',')} / ${scenario.mode} / ${scenario.turns.length} turn(s)`).join('\n'));
    log(`\n${scenarios.length} scenarios, ${scenarios.reduce((count, scenario) => count + scenario.turns.length, 0)} Office generation calls planned. No model calls. Quality is not scored. Freeze runtime first; --live --output <run.jsonl> records actual responses. --concurrency 1 is default (maximum 2).`);
    return;
  }
  if (!values.output) throw new Error('--live requires --output <run.jsonl>.');
  const concurrency = Number(values.concurrency || 1);
  if (![1, 2].includes(concurrency)) throw new Error('--concurrency must be 1 or 2.');
  await requireLiveConfiguration();
  const provenance = await collectProvenance();
  let run, saved = { results: [], interruptedIds: [] };
  if (values.resume) {
    saved = await readOfficeQualityJournal(values.output);
    run = saved.run;
    if (!values.only?.length) scenarios = all.filter(scenario => run.scenarios.some(previous => previous.id === scenario.id));
    if (run.suiteHash !== qualityHash(scenarios) || run.provenance.bundleHash !== provenance.bundleHash || run.provenance.officeVersion !== provenance.officeVersion) throw new Error('Scenarios or runtime changed. Start a new run; do not combine policies in one scorecard.');
    if (saved.interruptedIds.length && !values['retry-incomplete']) throw new Error('Some calls were interrupted with unknown outcomes. Resume with --retry-incomplete only if another paid attempt is intended.');
  } else {
    if (values['retry-incomplete']) throw new Error('--retry-incomplete requires --resume.');
    run = createOfficeQualityRun(scenarios, { provenance, datasetStatus: values['dataset-status'] || 'held-out-before-first-use' });
  }
  await onRun({ runId: run.runId, bundleHash: provenance.bundleHash });
  const journal = await openOfficeQualityJournal(values.output, { run, resume: values.resume });
  const entries = [...(saved.entries || [])], priorCoverage = runtimeCoverage(run, entries);
  const records = [...saved.results];
  let report;
  try {
    report = await runOfficeQualityEvaluation(run, {
      generate: generateProvider ? createTracedOfficeGenerator(generate, generateProvider, provenance.modelConfiguration.model) : generate,
      priorResults: saved.results, interruptedIds: saved.interruptedIds,
      retryIncomplete: values['retry-incomplete'], concurrency,
      onFatalError,
      onAttempt: attempt => journal.append({ type: 'attempt', ...attempt }),
      onResult: async record => {
        await journal.append({ type: 'result', record });
        entries.push({ type: 'result', record }); records.push(record);
        log(`${record.id}: ${record.response.status}${record.response.errorCode ? ` (${record.response.errorCode})` : ''}, ${record.elapsedMs}ms — ${record.reviewStatus}`);
      },
    });
    const end = await collectProvenance();
    const unchanged = provenance.bundleHash === end.bundleHash && provenance.officeVersion === end.officeVersion;
    const verified = unchanged && !priorCoverage.invalid && priorCoverage.coverage.verifiedResultCount === saved.results.length;
    const check = {
      type: 'runtime-check', at: new Date().toISOString(), unchanged, bundleHash: end.bundleHash, officeVersion: end.officeVersion,
      coverage: {
        version: 1, priorResultCount: saved.results.length, priorResultsHash: resultPrefixHash(saved.results),
        resultCount: records.length, resultsHash: resultPrefixHash(records),
        verifiedResultCount: verified ? records.length : priorCoverage.coverage.verifiedResultCount,
        runtimeIntegrity: verified ? 'verified' : 'unverified',
      },
    };
    await journal.append(check); entries.push(check);
    attachRuntimeCoverage(report, run, entries);
    if (report.runtimeIntegrity !== 'verified') process.exitCode = 1;
  } finally { await journal.close(); }
  log(`${report.summary.generated}/${report.summary.planned} generated; ${report.summary.generationFailed} failures, ${report.summary.preview} previews, ${report.summary.blocked} dependent turns blocked. Quality: unscored. Journal: ${values.output}`);
  if (report.summary.generated !== report.summary.planned) process.exitCode = 1;
  return report;
}
