import { Codex } from '@openai/codex-sdk';
import { executeLeasedJob } from './runtime.mjs';
import { createWorkerClient } from './client.mjs';
const controller = new AbortController();
let running = false;
process.on('message', async message => {
  if (message?.type === 'abort') controller.abort(new Error(message.reason || 'worker-stopped'));
  if (message?.type !== 'run' || running) return;
  running = true;
  try {
    const transport = createWorkerClient(message.config);
    // The parent persists terminal state only after this process exits and its group is cleaned up.
    const client = { call: (action, input) => action === 'finish' ? Promise.resolve({ status: 'pending-finish', finish: input }) : transport.call(action, input) };
    const result = await executeLeasedJob(message.job, { config: message.config, client, createSdk: options => new Codex(options), signal: controller.signal });
    process.send?.({ type: 'finished', result }, () => process.disconnect());
  } catch { process.exitCode = 1; process.disconnect(); }
});
