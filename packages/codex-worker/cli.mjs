#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { readWorkerConfig, prepareJob } from './config.mjs';
import { createWorkerClient } from './client.mjs';
import { runJobProcess } from './process.mjs';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  const config = readWorkerConfig();
  // Preflight every enabled execution directory before advertising the worker as online.
  for (const [projectId, project] of Object.entries(config.projects)) {
    for (const mode of project.modes) await prepareJob({ projectId, mode, prompt: 'Configuration check', contextRefs: [] }, config);
  }
  if (process.argv.includes('--check')) {
    process.stdout.write(`${JSON.stringify({ status: 'configured', sdk: '0.154.0', projects: Object.keys(config.projects), authenticated: 'not-checked', executionStarted: false })}\n`);
  } else {
    const client = createWorkerClient(config);
    process.stdout.write('Local Codex worker started; concurrency is one.\n');
    while (!controller.signal.aborted) {
      try {
        const heartbeat = await client.call('pulse');
        if (heartbeat.status === 'error') throw new Error(heartbeat.code || 'worker-registration-failed');
        if (controller.signal.aborted) break;
        const claimed = await client.call('claim');
        if (claimed.status === 'error') throw new Error(claimed.code || 'job-claim-failed');
        if (claimed.job) {
          await runJobProcess(claimed.job, config, { client, signal: controller.signal });
          continue;
        }
      } catch { process.stderr.write('Worker connection or execution unavailable; the durable lease controls recovery.\n'); }
      await delay(5000, undefined, { signal: controller.signal }).catch(() => {});
    }
  }
} catch (error) {
  process.stderr.write(`Codex worker configuration failed: ${error.message}\n`);
  process.exitCode = 1;
}
