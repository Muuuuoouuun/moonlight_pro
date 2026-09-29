import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexCliProvider, CODEX_CLI_DEFAULT_MODEL, CODEX_CLI_PROVIDER_VERSION } from './office-evaluation/codex-provider.mjs';

const schema = { type: 'object', properties: { answer: { type: 'string' }, sourceIndexes: { type: 'array', maxItems: 5, items: { type: 'integer', minimum: 0, maximum: 4315 } } }, required: ['answer', 'sourceIndexes'], additionalProperties: false };
const input = { systemInstruction: '역할 지침 원문\nBackticks `stay`; $(not-a-command); "quote" \\ 경로', prompt: '{"userRequest":"원문 그대로 😀"}\n', responseJsonSchema: schema, maxOutputTokens: 8192, thinkingLevel: 'high' };
const finalText = '{\n  "answer": "직접 작성한 답변", "sourceIndexes": [0]\n}';
const requiredHelp = '--ignore-user-config --ephemeral --sandbox --skip-git-repo-check --cd --config --output-schema --json';

// A local, offline JSONL process exercises actual spawn/stdio/process-group
// behavior. It cannot invoke a model and never reads CLI credentials.
async function setup(t, mode = 'success') {
  const directory = await mkdtemp(join(tmpdir(), 'office-cli-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, 'protocol.mjs');
  const capture = join(directory, 'capture.json');
  await writeFile(script, `
    import fs from 'node:fs';
    import { spawn } from 'node:child_process';
    const args = process.argv.slice(2), mode = args[0], capture = args[1];
    if (args.includes('--version')) { console.log('codex-cli 0.154.0'); process.exit(0); }
    if (args.includes('--help')) { console.log(${JSON.stringify(requiredHelp)}); process.exit(0); }
    let source = ''; for await (const chunk of process.stdin) source += chunk;
    const schemaPath = args[args.indexOf('--output-schema') + 1];
    fs.writeFileSync(capture, JSON.stringify({ args, source, schema: fs.readFileSync(schemaPath, 'utf8'), cwd: process.cwd(), files: fs.readdirSync(process.cwd()), appSecretsPresent: ['OPENAI_API_KEY','CODEX_API_KEY','GEMINI_API_KEY'].some(key => key in process.env) }));
    const emit = value => process.stdout.write(JSON.stringify(value) + '\\n');
    const final = ${JSON.stringify(finalText)};
    const message = text => emit({ type: 'item.completed', item: { type: 'agent_message', text } });
    const done = () => emit({ type: 'turn.completed', usage: { input_tokens: 17, cached_input_tokens: 3, output_tokens: 11, private: 'SENSITIVE_DIAGNOSTIC' } });
    const internalItems = () => {
      for (const type of ['item.started', 'item.updated', 'item.completed']) {
        emit({ type, item: { id: 'PRIVATE_PLAN_ID', type: 'todo_list', items: [{ text: 'PRIVATE_PLAN_BODY', completed: type === 'item.completed' }] } });
        emit({ type, item: { id: 'PRIVATE_ERROR_ID', type: 'error', message: 'PRIVATE_ERROR_BODY' } });
      }
    };
    const laterAnswer = () => setTimeout(() => { message(final); done(); }, 2000);
    emit({ type: 'thread.started', thread_id: 'omit-this-thread' });
    emit({ type: 'turn.started', ...(mode === 'reported-model' ? { model_version: 'reported-model-v1' } : {}) });
    if (mode.startsWith('nonfatal-')) {
      internalItems();
      if (mode.startsWith('nonfatal-tool-')) {
        const toolType = mode.slice('nonfatal-tool-'.length);
        const type = toolType === 'file_change' ? 'item.completed' : toolType === 'mcp_tool_call' ? 'item.updated' : 'item.started';
        emit({ type, item: { type: toolType, command: 'SENSITIVE_DIAGNOSTIC', arguments: { secret: 'PRIVATE_TOOL_BODY' } } });
        laterAnswer();
      } else if (mode === 'nonfatal-turn-failed' || mode === 'nonfatal-error') {
        emit({ type: mode === 'nonfatal-error' ? 'error' : 'turn.failed', message: 'PRIVATE_ERROR_BODY', error: { message: 'PRIVATE_ERROR_BODY' } });
        laterAnswer();
      } else if (mode === 'nonfatal-overflow') {
        for (let index = 0; index < 2001; index++) emit({ type: 'item.updated', item: { type: 'todo_list', items: [{ text: 'PRIVATE_PLAN_BODY', completed: false }] } });
      } else {
        if (mode !== 'nonfatal-no-final') message(mode === 'nonfatal-bad-json' ? 'PRIVATE_ERROR_BODY' : final);
        if (mode !== 'nonfatal-incomplete') done();
        if (mode === 'nonfatal-nonzero') process.exitCode = 3;
        if (mode === 'nonfatal-after-completion') internalItems();
      }
    } else if (mode.startsWith('unknown-type-')) {
      const types = { string: 'SENSITIVE_DIAGNOSTIC', object: { secret: 'SENSITIVE_DIAGNOSTIC' }, array: ['SENSITIVE_DIAGNOSTIC'], number: 71, boolean: true, null: null };
      const value = types[mode.slice('unknown-type-'.length)];
      emit({ type: 'item.updated', item: { ...(value === undefined ? {} : { type: value }), message: 'PRIVATE_ERROR_BODY' } });
      laterAnswer();
    } else if (mode === 'tool' || mode === 'tool-updated' || mode === 'unknown-item') {
      emit({ type: mode === 'tool-updated' ? 'item.updated' : 'item.started', item: { type: mode === 'unknown-item' ? 'new_unknown_tool' : 'command_execution', command: 'SENSITIVE_DIAGNOSTIC', status: 'in_progress' } });
      laterAnswer();
    } else if (mode.startsWith('group')) {
      internalItems();
      const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); process.send?.("ready"); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      fs.writeFileSync(capture + '.pid', String(child.pid));
      child.once('message', () => setTimeout(() => emit(mode === 'group-error' ? { type: 'error', message: 'PRIVATE_ERROR_BODY' } : mode === 'group-turn-failed' ? { type: 'turn.failed', error: { message: 'PRIVATE_ERROR_BODY' } } : { type: 'item.started', item: { type: 'command_execution' } }), 80));
      process.on('SIGTERM', () => process.exit(0));
      setInterval(() => {}, 1000);
    } else if (mode === 'abort-cleanup') {
      emit({ type: 'item.started', item: { type: 'reasoning' } });
      process.on('SIGTERM', () => setTimeout(() => process.exit(0), 80));
      setInterval(() => {}, 1000);
    } else if (mode === 'ignore-term') {
      emit({ type: 'item.started', item: { type: 'reasoning' } });
      process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);
    } else if (mode === 'turn-failed') {
      process.stderr.write('SENSITIVE_DIAGNOSTIC'); emit({ type: 'turn.failed', error: { message: 'SENSITIVE_DIAGNOSTIC' } });
    } else if (mode === 'error') {
      emit({ type: 'error', message: 'SENSITIVE_DIAGNOSTIC' });
    } else if (mode === 'invalid-event') {
      process.stdout.write('SENSITIVE_DIAGNOSTIC\\n');
    } else if (mode === 'unknown-event') {
      emit({ type: 'SENSITIVE_DIAGNOSTIC', message: 'private' });
    } else if (mode === 'overflow') {
      process.stdout.write('x'.repeat(4 * 1024 * 1024 + 1));
    } else if (mode === 'no-final') {
      done();
    } else if (mode === 'incomplete') {
      message(final);
    } else if (mode === 'bad-final-json') {
      message('SENSITIVE_DIAGNOSTIC'); done();
    } else {
      emit({ type: 'item.completed', item: { type: 'reasoning', text: 'DO_NOT_RECORD_REASONING' } });
      message(final); done();
      if (mode === 'nonzero') process.exitCode = 3;
      if (mode === 'after-completion') message(final);
    }
  `);
  return { command: process.execPath, argv: [script, mode, capture], capture };
}

test('the CLI adapter preserves both instruction channels and schema, uses the chosen command prefix, and reports real completion only', async t => {
  const options = await setup(t);
  const { generate, provenance } = await createCodexCliProvider(options);
  const before = structuredClone(input);
  const result = await generate(input);
  const captured = JSON.parse(await readFile(options.capture, 'utf8'));
  assert.equal(result.ok, true);
  assert.equal(result.text, finalText);
  assert.equal(result.model, CODEX_CLI_DEFAULT_MODEL);
  assert.equal(result.modelVersion, null);
  assert.equal(result.finishReason, null);
  assert.deepEqual(input, before);
  assert.equal(captured.source, input.prompt);
  assert.equal(captured.schema, JSON.stringify(schema));
  assert.equal(captured.args.find(arg => arg.startsWith('developer_instructions=')), `developer_instructions=${JSON.stringify(input.systemInstruction)}`);
  assert.ok(captured.args.includes('model_reasoning_effort="high"'));
  assert.ok(!captured.args.includes('--model'));
  assert.ok(!captured.args.some(arg => arg.startsWith('model=')));
  for (const flag of requiredHelp.split(' ')) assert.ok(captured.args.includes(flag));
  for (const setting of provenance.config) assert.ok(captured.args.includes(setting));
  assert.equal(captured.args[captured.args.indexOf('--sandbox') + 1], 'read-only');
  assert.deepEqual(captured.files, []);
  assert.equal(captured.appSecretsPresent, false);
  await assert.rejects(readdir(captured.cwd), { code: 'ENOENT' });
  assert.equal(provenance.cliVersion, '0.154.0');
  assert.equal(provenance.adapterVersion, CODEX_CLI_PROVIDER_VERSION);
  assert.equal(provenance.outputTokenCapApplied, null);
  assert.equal(provenance.adapterRetries, 0);
  assert.equal(provenance.cliInternalRetries, 'uncontrolled-built-in-provider');
  assert.equal(result.adapterMetadata.turnCompleted, true);
  assert.equal(result.adapterMetadata.finalJsonParsed, true);
  assert.equal(result.adapterMetadata.exitCode, 0);
  assert.deepEqual(result.usageMetadata, { promptTokenCount: 17, candidatesTokenCount: 11, totalTokenCount: 28, cachedContentTokenCount: 3 });
  assert.doesNotMatch(JSON.stringify(result), /SENSITIVE_DIAGNOSTIC|DO_NOT_RECORD_REASONING|omit-this-thread/);
  assert.equal((await generate({ ...input, model: result.model })).ok, true, 'the returned default label can be reused by review/council calls without selecting a model');
});

test('SDK internal plans and nonfatal error items are observed without their contents and still require real completion', async t => {
  const provider = await createCodexCliProvider(await setup(t, 'nonfatal-success'));
  const result = await provider.generate(input);
  assert.equal(result.ok, true);
  assert.equal(result.text, finalText);
  assert.equal(result.adapterMetadata.turnCompleted, true);
  assert.equal(result.adapterMetadata.exitCode, 0);
  assert.equal(result.adapterMetadata.finalJsonParsed, true);
  assert.equal(result.adapterMetadata.internalPlanEventsObserved, 3);
  assert.equal(result.adapterMetadata.nonfatalErrorEventsObserved, 3);
  assert.equal(result.adapterMetadata.externalToolEventsObserved, 0);
  assert.equal(result.adapterMetadata.toolEventsObserved, 0);
  assert.equal(result.adapterMetadata.unsupportedItemEventsObserved, 0);
  assert.equal(provider.provenance.adapterVersion, 'office-codex-cli-eval-v2');
  assert.equal(provider.provenance.itemProtocolContract, '@openai/codex-sdk@0.154.0/dist/index.d.ts');
  assert.equal(provider.provenance.toolEventsObservedMeaning, 'legacy-alias-of-externalToolEventsObserved');
  assert.deepEqual(result.adapterMetadata.events.filter(event => event.itemType === 'todo_list'), ['item.started', 'item.updated', 'item.completed'].map(type => ({ type, itemType: 'todo_list', itemCategory: 'internal-plan' })));
  assert.deepEqual(result.adapterMetadata.events.filter(event => event.itemType === 'error'), ['item.started', 'item.updated', 'item.completed'].map(type => ({ type, itemType: 'error', itemCategory: 'nonfatal-error' })));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SENSITIVE_DIAGNOSTIC|omit-this-thread/);
});

test('nonfatal items never replace completion, exit success or JSON, and do not make later fatal events nonfatal', async t => {
  for (const [mode, reason] of [['nonfatal-no-final', 'empty-output'], ['nonfatal-incomplete', 'incomplete-output'], ['nonfatal-bad-json', 'invalid-json'], ['nonfatal-nonzero', 'cli-exit-nonzero'], ['nonfatal-after-completion', 'events-after-completion'], ['nonfatal-turn-failed', 'cli-turn-failed'], ['nonfatal-error', 'cli-turn-failed']]) {
    const provider = await createCodexCliProvider(await setup(t, mode));
    const result = await provider.generate(input);
    assert.equal(result.ok, false, mode);
    assert.equal(result.reason, reason, mode);
    assert.equal(result.text, '');
    assert.ok(result.adapterMetadata.internalPlanEventsObserved >= 3);
    assert.ok(result.adapterMetadata.nonfatalErrorEventsObserved >= 3);
    assert.equal(result.adapterMetadata.externalToolEventsObserved, 0);
    assert.ok(result.adapterMetadata.elapsedMs < 1500, 'fatal events must stop before the delayed answer');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SENSITIVE_DIAGNOSTIC/);
  }
});

test('every external tool class still stops immediately after allowed internal items', async t => {
  for (const itemType of ['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call', 'tool_call', 'function_call']) {
    const provider = await createCodexCliProvider(await setup(t, `nonfatal-tool-${itemType}`));
    const result = await provider.generate(input);
    assert.equal(result.reason, 'unexpected-tool-use', itemType);
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.equal(result.adapterMetadata.turnCompleted, false);
    assert.equal(result.adapterMetadata.internalPlanEventsObserved, 3);
    assert.equal(result.adapterMetadata.nonfatalErrorEventsObserved, 3);
    assert.equal(result.adapterMetadata.externalToolEventsObserved, 1);
    assert.equal(result.adapterMetadata.toolEventsObserved, 1);
    assert.equal(result.adapterMetadata.events.at(-1).itemType, itemType);
    assert.equal(result.adapterMetadata.events.at(-1).itemCategory, 'external-tool');
    assert.ok(result.adapterMetadata.elapsedMs < 1500);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SENSITIVE_DIAGNOSTIC/);
  }
});

test('unknown item types retain only fixed classifications and string fingerprints, never arbitrary type text', async t => {
  for (const itemTypeKind of ['string', 'object', 'array', 'number', 'boolean', 'null', 'missing']) {
    const provider = await createCodexCliProvider(await setup(t, `unknown-type-${itemTypeKind}`));
    const result = await provider.generate(input);
    assert.equal(result.reason, 'unsupported-item');
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.equal(result.adapterMetadata.unsupportedItemEventsObserved, 1);
    assert.equal(result.adapterMetadata.externalToolEventsObserved, 0);
    const summary = result.adapterMetadata.events.at(-1);
    assert.deepEqual(summary, {
      type: 'item.updated', itemType: 'unknown', itemCategory: 'unsupported', itemTypeKind,
      ...(itemTypeKind === 'string' ? { itemTypeHash: createHash('sha256').update('SENSITIVE_DIAGNOSTIC').digest('hex') } : {}),
    });
    assert.ok(result.adapterMetadata.elapsedMs < 1500);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SENSITIVE_DIAGNOSTIC/);
  }
});

test('allowed internal item telemetry remains bounded without saving plan or error bodies', async t => {
  const provider = await createCodexCliProvider(await setup(t, 'nonfatal-overflow'));
  const result = await provider.generate(input);
  assert.equal(result.reason, 'output-limit');
  assert.equal(result.ok, false);
  assert.equal(result.adapterMetadata.events.length, 2000);
  assert.equal(result.adapterMetadata.internalPlanEventsObserved, 1995);
  assert.equal(result.adapterMetadata.nonfatalErrorEventsObserved, 3);
  assert.equal(result.adapterMetadata.externalToolEventsObserved, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SENSITIVE_DIAGNOSTIC/);
});

test('an actual model version is preserved only when present in structured CLI metadata', async t => {
  const provider = await createCodexCliProvider(await setup(t, 'reported-model'));
  assert.equal((await provider.generate(input)).modelVersion, 'reported-model-v1');
});

test('exit success alone, final text alone, malformed JSON, failure events and nonzero exit cannot become ok', async t => {
  for (const [mode, reason] of [['no-final', 'empty-output'], ['incomplete', 'incomplete-output'], ['bad-final-json', 'invalid-json'], ['turn-failed', 'cli-turn-failed'], ['error', 'cli-turn-failed'], ['invalid-event', 'invalid-event-json'], ['unknown-event', 'unsupported-event'], ['nonzero', 'cli-exit-nonzero'], ['after-completion', 'events-after-completion'], ['overflow', 'output-limit']]) {
    const provider = await createCodexCliProvider(await setup(t, mode));
    const result = await provider.generate(input);
    assert.equal(result.ok, false, mode);
    assert.equal(result.reason, reason, mode);
    assert.equal(result.text, '');
    assert.doesNotMatch(JSON.stringify(result), /SENSITIVE_DIAGNOSTIC|DO_NOT_RECORD_REASONING/);
  }
});

test('the first tool event or unknown item stops the process before any later answer is accepted', async t => {
  for (const mode of ['tool', 'tool-updated', 'unknown-item']) {
    const provider = await createCodexCliProvider(await setup(t, mode));
    const result = await provider.generate(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, mode === 'unknown-item' ? 'unsupported-item' : 'unexpected-tool-use');
    assert.equal(result.adapterMetadata.turnCompleted, false);
    assert.equal(result.adapterMetadata.toolEventsObserved, mode === 'unknown-item' ? 0 : 1);
    assert.equal(result.text, '');
    assert.ok(result.adapterMetadata.elapsedMs < 1500);
  }
});

test('abort waits for process exit and a terminated process group includes pipe-holding descendants', async t => {
  for (const mode of ['group', 'group-error', 'group-turn-failed']) {
    const options = await setup(t, mode);
    const { generate } = await createCodexCliProvider(options);
    const result = await generate(input);
    assert.equal(result.reason, mode === 'group' ? 'unexpected-tool-use' : 'cli-turn-failed');
    assert.equal(result.adapterMetadata.exitCode, 0, 'the group leader exits on TERM while its descendant keeps stdout open');
    assert.ok(result.adapterMetadata.elapsedMs >= 250, 'the adapter waits for KILL and pipe closure');
    const pid = Number(await readFile(options.capture + '.pid', 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SENSITIVE_DIAGNOSTIC/);
  }
});

test('the shared AbortSignal cancels concurrent calls and preserves their completed cleanup metadata', async t => {
  const options = await setup(t, 'abort-cleanup');
  const controller = new AbortController();
  let ready = 0;
  const provider = await createCodexCliProvider(options, { spawnImpl: (...args) => {
    const child = spawn(...args);
    let announced = false;
    child.stdout.on('data', chunk => { if (!announced && chunk.toString().includes('reasoning')) { announced = true; if (++ready === 2) controller.abort(); } });
    return child;
  } });
  const results = await Promise.all([provider.generate({ ...input, signal: controller.signal }), provider.generate({ ...input, signal: controller.signal })]);
  assert.equal(ready, 2);
  for (const result of results) {
    assert.equal(result.reason, 'aborted');
    assert.equal(result.adapterMetadata.exitCode, 0);
    assert.ok(result.adapterMetadata.elapsedMs >= 80);
    assert.equal(result.text, '');
  }
});

test('the local wall-clock cap escalates from TERM to KILL and never exceeds the configurable 45-second ceiling', async t => {
  const options = await setup(t, 'ignore-term');
  const provider = await createCodexCliProvider({ ...options, timeoutMs: 150 });
  const result = await provider.generate(input);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.adapterMetadata.exitSignal, 'SIGKILL');
  assert.ok(result.adapterMetadata.elapsedMs >= 350 && result.adapterMetadata.elapsedMs < 1500);
  await assert.rejects(createCodexCliProvider({ timeoutMs: 45_001 }), /invalid-codex-provider-options/);
});

test('invalid inputs and already aborted calls never launch a generation process or leak raw process errors', async () => {
  let spawns = 0;
  const dependencies = { execFileImpl: async (_command, args) => ({ stdout: args.includes('--version') ? 'codex-cli 0.154.0' : requiredHelp }), spawnImpl: () => { spawns++; throw new Error('SENSITIVE_DIAGNOSTIC'); } };
  const provider = await createCodexCliProvider({}, dependencies);
  for (const value of [null, {}, { ...input, model: 'arbitrary-model' }, { ...input, responseJsonSchema: null }, { ...input, media: [{}] }, { ...input, maxOutputTokens: -1 }, { ...input, thinkingLevel: 'arbitrary' }]) assert.equal((await provider.generate(value)).reason, 'invalid-request');
  assert.equal((await provider.generate({ ...input, signal: AbortSignal.abort() })).reason, 'aborted');
  assert.equal(spawns, 0);
  const result = await provider.generate(input);
  assert.equal(spawns, 1, 'there is no provider retry');
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify(result), /SENSITIVE_DIAGNOSTIC/);
  await assert.rejects(createCodexCliProvider({}, { execFileImpl: async () => { throw new Error('SENSITIVE_DIAGNOSTIC'); } }), error => error.message === 'codex-cli-preflight-failed');
});
