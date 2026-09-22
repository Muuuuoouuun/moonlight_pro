import { open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runOfficeResponse } from '../apps/engine/lib/office/response-core.ts';
import { createCodexCliProvider, CODEX_CLI_DEFAULT_MODEL } from './office-evaluation/codex-provider.mjs';
import { officeQualityCli } from './office-evaluation/cli.mjs';
import { collectOfficeQualityProvenance, qualityHash } from './office-evaluation/runner.mjs';

// Evaluation-only: this calls the orchestration core, never an HTTP endpoint or
// a durable production job. It cannot establish worker readiness or activate it.
export const OFFICE_CODEX_EVALUATION_EXECUTION = Object.freeze({
  kind: 'non-http-core-evaluation', jobBudgetMs: 600_000, providerCallCeilingMs: 45_000,
  httpEndpointInvoked: false, durableJobCreated: false, productionTransportActivated: false,
});

export function createOfficeCoreEvaluation(core = runOfficeResponse, parentSignal) {
  return async (request, context, generate, onDiagnostic) => ({
    ...await core(request, context, {
      signal: parentSignal
        ? AbortSignal.any([parentSignal, AbortSignal.timeout(OFFICE_CODEX_EVALUATION_EXECUTION.jobBudgetMs)])
        : AbortSignal.timeout(OFFICE_CODEX_EVALUATION_EXECUTION.jobBudgetMs),
      generate, onDiagnostic,
    }),
    evaluationExecution: OFFICE_CODEX_EVALUATION_EXECUTION,
  });
}

export async function withOfficeEvaluationCancellation(operation, events = process) {
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException('Evaluation interrupted.', 'AbortError'));
  // Keep both handlers installed through child-process cleanup and journal flush.
  // A repeated signal must not restore Node's immediate-termination behavior.
  events.on('SIGINT', abort);
  events.on('SIGTERM', abort);
  try { return await operation({ signal: controller.signal, abort }); }
  finally {
    abort();
    events.removeListener('SIGINT', abort);
    events.removeListener('SIGTERM', abort);
  }
}

export function describeOfficeCodexEvaluationError(error) {
  if (error instanceof SyntaxError) return 'Evaluation journal JSON is invalid. Raw contents were not copied.';
  if (['ENOENT', 'EEXIST', 'EACCES', 'ENOSPC'].includes(error?.code)) return `Evaluation file operation failed (${error.code}).`;
  const safeMessages = new Set([
    'codex-cli-preflight-failed', 'invalid-codex-provider-options',
    'Live execution requires distinct --output and --provider-output journals.',
    'The run and provider journals must be different files.',
    'Provider journal has an incomplete final line; preserve it before resuming.',
    'Provider journal runtime changed. Start a new run.',
    'Provider journal belongs to another evaluation run.',
    'Provider journal write failed; no further model calls are allowed.',
    'Unknown quality scenario. Run --suite quality to list cases.',
    '--concurrency must be 1 or 2.',
    'Scenarios or runtime changed. Start a new run; do not combine policies in one scorecard.',
    'Some calls were interrupted with unknown outcomes. Resume with --retry-incomplete only if another paid attempt is intended.',
    'Journal has an incomplete final line; preserve it and repair the trailing line before resuming.',
    'Invalid or modified quality run header.',
  ]);
  return safeMessages.has(error?.message) ? error.message : 'Office Codex evaluation failed. Raw error details were not copied.';
}

async function main() {
  const { values } = parseArgs({ options: {
    live: { type: 'boolean', default: false }, only: { type: 'string', multiple: true },
    output: { type: 'string' }, 'provider-output': { type: 'string' },
    concurrency: { type: 'string', default: '1' },
    resume: { type: 'boolean', default: false }, 'retry-incomplete': { type: 'boolean', default: false },
    'dataset-status': { type: 'string', default: 'development' },
    input: { type: 'string' }, reviews: { type: 'string' },
    'review-pack': { type: 'boolean', default: false }, score: { type: 'boolean', default: false },
    rubric: { type: 'boolean', default: false }, role: { type: 'string' },
  } });
  // Listing and grading do not even instantiate the CLI provider.
  if (!values.live || values.rubric || values['review-pack'] || values.score) return officeQualityCli(values);
  if (!values.output || !values['provider-output']) throw new Error('Live execution requires distinct --output and --provider-output journals.');
  if (fileURLToPath(pathToFileURL(values.output)) === fileURLToPath(pathToFileURL(values['provider-output']))) throw new Error('The run and provider journals must be different files.');

  const command = process.execPath;
  const argv = [fileURLToPath(new URL('../node_modules/@openai/codex/bin/codex.js', import.meta.url))];
  const provider = await createCodexCliProvider({ command, argv });
  const collectProvenance = async () => {
    const base = await collectOfficeQualityProvenance();
    const sources = { ...base.sources };
    for (const path of ['scripts/eval-office-codex-async.mjs', 'scripts/office-evaluation/codex-provider.mjs', 'scripts/office-evaluation/cli.mjs', 'scripts/office-evaluation/runner.mjs', 'scripts/office-evaluation/trace.mjs']) {
      sources[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
    }
    const modelConfiguration = { provider: 'codex-cli', model: CODEX_CLI_DEFAULT_MODEL, adapter: provider.provenance, execution: OFFICE_CODEX_EVALUATION_EXECUTION };
    return { ...base, sources, modelConfiguration, bundleHash: qualityHash({ sources, modelConfiguration }) };
  };

  // A separate append-only journal retains actual requests/results without
  // changing the common grading format. It is never a source of model retries.
  const path = values['provider-output'];
  let nextId = 0, previousHeader;
  if (values.resume) {
    const raw = await readFile(path, 'utf8');
    if (!raw.endsWith('\n')) throw new Error('Provider journal has an incomplete final line; preserve it before resuming.');
    const entries = raw.trimEnd().split('\n').map(line => JSON.parse(line));
    const provenance = await collectProvenance();
    if (entries[0]?.type !== 'office-codex-provider-run' || entries[0].bundleHash !== provenance.bundleHash) throw new Error('Provider journal runtime changed. Start a new run.');
    previousHeader = entries[0];
    nextId = entries.reduce((maximum, entry) => Math.max(maximum, Number.isSafeInteger(entry.id) ? entry.id : 0), 0);
  }
  const journal = await open(path, values.resume ? 'a' : 'wx', 0o600);
  return withOfficeEvaluationCancellation(async cancellation => {
    let queue = Promise.resolve(), writeFailed = false;
    const append = entry => {
      queue = queue.then(async () => { await journal.write(`${JSON.stringify(entry)}\n`); await journal.sync(); });
      queue = queue.catch(() => {
        writeFailed = true;
        cancellation.abort();
        throw new Error('Provider journal write failed; no further model calls are allowed.');
      });
      return queue;
    };
    try {
      await officeQualityCli(values, {
        generate: createOfficeCoreEvaluation(runOfficeResponse, cancellation.signal), collectProvenance,
        requireLiveConfiguration: async () => {}, // The actual CLI preflight already succeeded above.
        onFatalError: cancellation.abort,
        onRun: async ({ runId, bundleHash }) => {
          if (values.resume) {
            if (previousHeader.runId !== runId) throw new Error('Provider journal belongs to another evaluation run.');
          } else await append({ type: 'office-codex-provider-run', runId, at: new Date().toISOString(), bundleHash, execution: OFFICE_CODEX_EVALUATION_EXECUTION });
        },
        generateProvider: async input => {
          if (writeFailed) throw new Error('Provider journal write failed; no further model calls are allowed.');
          const id = ++nextId, started = Date.now(), { signal, ...request } = input;
          await append({ type: 'provider-attempt', id, at: new Date().toISOString(), request });
          const response = await provider.generate(input);
          await append({ type: 'provider-result', id, elapsedMs: Date.now() - started, response });
          return response;
        },
      });
    } finally {
      cancellation.abort();
      try { await queue; } finally { await journal.close(); }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(describeOfficeCodexEvaluationError(error)); process.exitCode = 1; });
}
