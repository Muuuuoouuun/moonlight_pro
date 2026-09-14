import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function runJobProcess(job, config, { client, signal, childModule = fileURLToPath(new URL('./sdk-child.mjs', import.meta.url)), wallClockMs = job.budget.wallClockSeconds * 1000, graceMs = 5000 } = {}) {
  if (process.platform === 'win32') throw new Error('worker-requires-posix-process-supervision');
  let result, timedOut = false, forced = false, childError = false, killTimer;
  const child = fork(childModule, [], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { PATH: process.env.PATH || '/usr/bin:/bin' }, execArgv: [] });
  const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') childError = true; } };
  const stop = reason => {
    if (child.connected) child.send({ type: 'abort', reason }, () => {});
    if (!killTimer) killTimer = setTimeout(() => { forced = true; killGroup(); }, graceMs);
  };
  const timer = setTimeout(() => { timedOut = true; stop('wall-clock-limit'); }, wallClockMs);
  const onAbort = () => stop('worker-stopped');
  signal?.addEventListener('abort', onAbort, { once: true });
  const exited = new Promise(resolve => {
    child.on('message', message => { if (message?.type === 'finished') result = message.result; });
    child.once('error', () => { childError = true; resolve(); });
    child.once('exit', resolve);
  });
  child.send({ type: 'run', job, config }, () => {});
  if (signal?.aborted) onAbort();
  await exited;
  clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort);
  // Any descendants of this dedicated job group are stopped before a subsequent claim.
  killGroup();
  if (result?.status === 'pending-finish' && !childError && !forced) return client.call('finish', result.finish);
  if (result?.status === 'lease-lost' && !childError) return result;
  return client.call('finish', { id: job.id, leaseToken: job.leaseToken, state: job.mode === 'apply' ? 'needs_attention' : 'failed', usage: null, usageReason: 'not-reported',
    error: timedOut || forced ? 'worker-process-timeout' : 'worker-process-stopped' });
}
