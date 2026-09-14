import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Codex } from '@openai/codex-sdk';

test('pinned official SDK preserves sandbox/cwd on resume, streams usage, and really aborts its child', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moonlight-sdk-contract-'));
  try {
    const executable = join(dir, 'codex-shim.mjs'), capture = join(dir, 'capture.json');
    await writeFile(executable, `#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(process.env.CAPTURE,JSON.stringify(process.argv.slice(2)));process.stdin.resume();process.stdin.on('end',()=>{if(process.env.WAIT==='1'){setInterval(()=>{},1000);return;}for(const event of [{type:'thread.started',thread_id:'saved-thread'},{type:'turn.completed',usage:{input_tokens:10,output_tokens:2}}])process.stdout.write(JSON.stringify(event)+'\\n');});`, { mode: 0o700 });
    const sdk = new Codex({ codexPathOverride: executable, env: { CAPTURE: capture, PATH: process.env.PATH } });
    const options = { workingDirectory: dir, sandboxMode: 'read-only', approvalPolicy: 'never', networkAccessEnabled: false, webSearchMode: 'disabled' };
    const thread = sdk.resumeThread('saved-thread', options);
    const { events } = await thread.runStreamed('Review');
    const received = []; for await (const event of events) received.push(event);
    assert.equal(received.at(-1).usage.input_tokens, 10);
    const args = JSON.parse(await readFile(capture, 'utf8'));
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    assert.equal(args[args.indexOf('--cd') + 1], dir);
    assert.deepEqual(args.slice(-2), ['resume', 'saved-thread']);
    assert.ok(args.includes('approval_policy="never"'));
    const waiting = new Codex({ codexPathOverride: executable, env: { CAPTURE: capture, WAIT: '1', PATH: process.env.PATH } });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50);
    try {
      await assert.rejects(async () => { const turn = await waiting.startThread(options).runStreamed('Wait', { signal: controller.signal }); for await (const _event of turn.events) {} });
      assert.equal(controller.signal.aborted, true);
    } finally { clearTimeout(timer); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
