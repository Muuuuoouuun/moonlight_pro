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

export async function officeQualityCli(values, { generate, generateProvider, log = console.log } = {}) {
  if (values.rubric) {
    if (values.live) throw new Error('--rubric cannot be combined with --live.');
    log(JSON.stringify({ instructions: qualityReviewInstructions(), axes: OFFICE_QUALITY_AXES, criticalGates: OFFICE_CRITICAL_GATES }, null, 2));
    return;
  }
  if (values['review-pack'] || values.score) {
    if (values.live || values.resume) throw new Error('Review and scoring never call generation. Remove live/resume flags.');
    if (!values.input) throw new Error('Review requires --input <run.jsonl>.');
    const saved = await readOfficeQualityJournal(values.input);
    saved.report.runtimeIntegrity = saved.runtimeChecks.length && saved.runtimeChecks.every(entry => entry.unchanged === true) ? 'verified' : 'unverified';
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
  if (!(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim())) throw new Error('Gemini is not configured. No evaluation calls were made.');
  const concurrency = Number(values.concurrency || 1);
  if (![1, 2].includes(concurrency)) throw new Error('--concurrency must be 1 or 2.');
  const provenance = await collectOfficeQualityProvenance();
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
  const journal = await openOfficeQualityJournal(values.output, { run, resume: values.resume });
  let report;
  try {
    report = await runOfficeQualityEvaluation(run, {
      generate: generateProvider ? createTracedOfficeGenerator(generate, generateProvider, provenance.modelConfiguration.model) : generate,
      priorResults: saved.results, interruptedIds: saved.interruptedIds,
      retryIncomplete: values['retry-incomplete'], concurrency,
      onAttempt: attempt => journal.append({ type: 'attempt', ...attempt }),
      onResult: async record => {
        await journal.append({ type: 'result', record });
        log(`${record.id}: ${record.response.status}${record.response.errorCode ? ` (${record.response.errorCode})` : ''}, ${record.elapsedMs}ms — ${record.reviewStatus}`);
      },
    });
    const end = await collectOfficeQualityProvenance();
    const unchanged = provenance.bundleHash === end.bundleHash && provenance.officeVersion === end.officeVersion;
    await journal.append({ type: 'runtime-check', at: new Date().toISOString(), unchanged, bundleHash: end.bundleHash, officeVersion: end.officeVersion });
    report.runtimeIntegrity = unchanged ? 'verified' : 'unverified';
    if (!unchanged) process.exitCode = 1;
  } finally { await journal.close(); }
  log(`${report.summary.generated}/${report.summary.planned} generated; ${report.summary.generationFailed} failures, ${report.summary.preview} previews, ${report.summary.blocked} dependent turns blocked. Quality: unscored. Journal: ${values.output}`);
  if (report.summary.generated !== report.summary.planned) process.exitCode = 1;
  return report;
}
