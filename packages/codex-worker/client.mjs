import { setTimeout as delay } from 'node:timers/promises';

export function createWorkerClient(config, dependencies = {}) {
  const fetcher = dependencies.fetch || globalThis.fetch, sleep = dependencies.sleep || delay;
  return { async call(action, input = {}) {
    // Claim is deliberately never retried after an uncertain response. The ledger expires that lease.
    const attempts = ['event', 'finish', 'heartbeat', 'pulse'].includes(action) ? 2 : 1;
    const body = JSON.stringify({ action, ...input });
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetcher(`${config.engineUrl}/api/agent/worker`, { method: 'POST', headers: { authorization: `Bearer ${config.workerToken}`, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(8000), redirect: 'error' });
        const text = await response.text();
        if (Buffer.byteLength(text) > 131072) throw new Error('oversized-worker-response');
        const data = JSON.parse(text);
        if (data?.status === 'error') return data;
        if (!response.ok || !data || typeof data.status !== 'string') throw new Error('worker-http-failed');
        return data;
      } catch {
        if (attempt === attempts) throw new Error('worker-transport-unavailable');
        await sleep(200);
      }
    }
  } };
}
