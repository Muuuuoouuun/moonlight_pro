import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOfficeRequest, parseOfficeContext } from '@com-moon/agent-contracts/office';
import { runOfficeResponse } from '../apps/engine/lib/office/response-core.ts';
import { createOfficeCoreEvaluation, describeOfficeCodexEvaluationError } from './eval-office-codex-async.mjs';
import { createOfficeQualityRun, runOfficeQualityEvaluation } from './office-evaluation/runner.mjs';
import { OFFICE_QUALITY_SCENARIOS } from './office-evaluation/scenarios.mjs';

test('one caller cancellation settles simultaneous core evaluations without starting reviews', async () => {
  const request = parseOfficeRequest({ ownerId: 'eevee', mode: 'chat', scope: 'personal', message: '중단 경계 단위 테스트입니다.' });
  const context = parseOfficeContext({ source: 'provided', scope: 'personal', projects: [], note: '단위 테스트 전용 문맥' }, 'personal');
  const parent = new AbortController();
  const pending = [];
  let calls = 0;
  const provider = async input => {
    calls++;
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    pending.push(ready);
    return new Promise((resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
      started();
    });
  };
  const execute = createOfficeCoreEvaluation(runOfficeResponse, parent.signal);
  const first = execute(request, context, provider), second = execute(request, context, provider);
  await Promise.all(pending);
  assert.equal(calls, 2);
  parent.abort(new DOMException('operator cancellation', 'AbortError'));
  const results = await Promise.all([first, second]);
  assert.ok(results.every(result => result.status === 'error'));
  assert.equal(calls, 2, 'cancelled drafts must never start reviews');
  assert.ok(results.every(result => result.evaluationExecution.httpEndpointInvoked === false && result.evaluationExecution.durableJobCreated === false));
  const alreadyCancelled = await execute(request, context, async () => assert.fail('cancelled run must not call a provider'));
  assert.equal(alreadyCancelled.status, 'error');
});

test('the standalone CLI lists cases without creating either live journal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-codex-dry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'run.jsonl'), providerOutput = join(directory, 'provider.jsonl');
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import', './scripts/register-hub-alias.mjs', 'scripts/eval-office-codex-async.mjs',
    '--only', 'eevee-work', '--output', output, '--provider-output', providerOutput,
  ], { cwd: new URL('../', import.meta.url), timeout: 5_000 });
  assert.match(stdout, /1 Office generation calls planned\. No model calls/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
  await assert.rejects(stat(providerOutput), { code: 'ENOENT' });
});

test('malformed journals and arbitrary exception codes cannot leak text to CLI diagnostics', () => {
  let parseError;
  try { JSON.parse('PRIVATE_JOURNAL_CONTENT'); } catch (error) { parseError = error; }
  assert.ok(parseError instanceof SyntaxError);
  assert.match(describeOfficeCodexEvaluationError(parseError), /journal JSON is invalid/);
  for (const error of [parseError, new Error('PRIVATE_PROVIDER_CONTENT'), { message: 'PRIVATE_JOURNAL_CONTENT', code: 'PRIVATE_CODE_CONTENT' }, { message: 'PRIVATE_PATH', code: 'ENOENT' }]) {
    assert.doesNotMatch(describeOfficeCodexEvaluationError(error), /PRIVATE_/);
  }
  assert.equal(describeOfficeCodexEvaluationError(new Error('Provider journal belongs to another evaluation run.')), 'Provider journal belongs to another evaluation run.');
});

for (const signalName of ['SIGINT', 'SIGTERM']) test(`repeated ${signalName} keeps the process alive until evaluation cleanup finishes`, { timeout: 10_000 }, async t => {
  const entry = new URL('./eval-office-codex-async.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--import', './scripts/register-hub-alias.mjs', '--input-type=module', '-e', `
    import { withOfficeEvaluationCancellation } from ${JSON.stringify(entry)};
    let finish;
    process.on('message', message => {
      if (message === 'probe') process.send('alive-during-cleanup');
      if (message === 'finish') finish();
    });
    await withOfficeEvaluationCancellation(async ({ signal }) => {
      await new Promise(resolve => {
        signal.addEventListener('abort', resolve, { once: true });
        process.send('ready');
      });
      await new Promise(resolve => { finish = resolve; process.send('cleanup-started'); });
      process.send('cleanup-finished');
    });
    process.disconnect();
  `], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'exit');
  assert.deepEqual(await once(child, 'message'), ['ready', undefined]);
  let message = once(child, 'message');
  child.kill(signalName);
  assert.equal((await message)[0], 'cleanup-started');
  message = once(child, 'message');
  child.kill(signalName);
  child.send('probe');
  assert.equal((await message)[0], 'alive-during-cleanup');
  message = once(child, 'message');
  child.send('finish');
  assert.equal((await message)[0], 'cleanup-finished');
  assert.deepEqual(await exited, [0, null], stderr);
});

for (const failureStage of ['attempt', 'result']) test(`a ${failureStage} journal failure cancels and drains the sibling before rejecting`, async () => {
  const cases = OFFICE_QUALITY_SCENARIOS.slice(0, 3);
  const run = createOfficeQualityRun(cases, { provenance: { bundleHash: 'offline-drain-test' } });
  const cancellation = new AbortController();
  let siblingStarted, fatalObserved, releaseCleanup;
  const ready = new Promise(resolve => { siblingStarted = resolve; });
  const fatal = new Promise(resolve => { fatalObserved = resolve; });
  const cleanup = new Promise(resolve => { releaseCleanup = resolve; });
  const writeFailure = new Error('journal-write-failed');
  let journalOpen = true, settled = false, calls = 0, cleanupFinished = false, fatalCalls = 0;
  const saved = [];
  const execution = runOfficeQualityEvaluation(run, {
    concurrency: 2,
    generate: async request => {
      const call = ++calls;
      const waitsForCancellation = failureStage === 'attempt' ? call === 1 : call === 2;
      if (!waitsForCancellation) { await ready; return { status: 'generated', ownerId: request.ownerId }; }
      const aborted = new Promise(resolve => cancellation.signal.addEventListener('abort', resolve, { once: true }));
      siblingStarted();
      await aborted;
      await cleanup;
      assert.equal(journalOpen, true, 'raw provider outcome must still be writable');
      cleanupFinished = true;
      return { status: 'error', errorCode: 'aborted' };
    },
    onAttempt: async attempt => {
      if (failureStage === 'attempt' && attempt.id.startsWith(`${cases[1].id}/`)) { await ready; throw writeFailure; }
    },
    onResult: async record => {
      if (failureStage === 'result' && record.caseId === cases[0].id) throw writeFailure;
      assert.equal(journalOpen, true);
      saved.push(record);
    },
    onFatalError: () => { fatalCalls++; cancellation.abort(); fatalObserved(); },
  });
  const rejected = execution.then(() => assert.fail('write failure must reject'), error => {
    assert.equal(error, writeFailure);
    assert.equal(cleanupFinished, true);
    settled = true;
    journalOpen = false;
  });
  await fatal;
  assert.equal(cancellation.signal.aborted, true);
  assert.equal(settled, false, 'the caller must retain its handles until cleanup settles');
  releaseCleanup();
  await rejected;
  assert.equal(calls, failureStage === 'attempt' ? 1 : 2, 'no third scenario may start');
  assert.equal(fatalCalls, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].response.errorCode, 'aborted');
});
