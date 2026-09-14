import { boundedText, bytes } from './contracts.mjs';
import { prepareJob } from './config.mjs';

export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const number = key => Number.isSafeInteger(usage[key]) && usage[key] >= 0 ? usage[key] : null;
  const result = { inputTokens: number('input_tokens'), outputTokens: number('output_tokens'), cachedInputTokens: number('cached_input_tokens'), cacheWriteInputTokens: number('cache_write_input_tokens'), reasoningOutputTokens: number('reasoning_output_tokens') };
  return Object.values(result).every(n => n === null) ? null : result;
}

function projectEvent(event) {
  if (event.type === 'thread.started') return { threadId: event.thread_id };
  if (event.type === 'turn.completed') return { usage: normalizeUsage(event.usage) };
  if (event.item) {
    const item = event.item;
    const payload = { itemId: boundedText(item.id, 200), itemType: boundedText(item.type, 100), status: item.status || null };
    if (item.type === 'agent_message') payload.text = boundedText(item.text, 8192);
    if (item.type === 'file_change') payload.changes = (item.changes || []).slice(0, 30).map(c => ({ path: boundedText(c.path, 200), kind: c.kind }));
    // Command bodies, environment, tool arguments/results and reasoning are not a shared event log.
    return payload;
  }
  return {};
}

export async function executeLeasedJob(job, dependencies) {
  const { client, sdk, createSdk, config, prepare = prepareJob, heartbeatMs = 15000, wallClockMs = job.budget.wallClockSeconds * 1000, signal: parentSignal } = dependencies;
  const controller = new AbortController();
  let stopReason = null, leaseLost = false, threadId = job.threadId || null, usage = null, resultText = '', completed = false, eventCount = 0;
  const checkpoint = { ...(job.checkpoint || {}), completedItems: 0, changedFiles: [], lastEventType: 'preparing' };
  const abort = reason => { if (!controller.signal.aborted) { stopReason = reason; controller.abort(new Error(reason)); } };
  const onParentAbort = () => abort(parentSignal.reason?.message === 'wall-clock-limit' ? 'wall-clock-limit' : 'worker-stopped');
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  if (parentSignal?.aborted) onParentAbort();
  const lease = { id: job.id, leaseToken: job.leaseToken };
  let heartbeatTimer, heartbeatPending = Promise.resolve();
  const beat = async () => {
    try {
      const reply = await client.call('heartbeat', lease);
      if (reply.status === 'error') { leaseLost = true; abort(reply.code === 'lease-lost' ? 'lease-lost' : 'heartbeat-failed'); }
      else if (reply.cancelRequestedAt) abort('cancel-requested');
    } catch { leaseLost = true; abort('heartbeat-failed'); }
    if (!controller.signal.aborted) heartbeatTimer = setTimeout(() => { heartbeatPending = beat(); }, heartbeatMs);
  };
  const timer = setTimeout(() => abort('wall-clock-limit'), wallClockMs);
  heartbeatTimer = setTimeout(() => { heartbeatPending = beat(); }, heartbeatMs);
  try {
    const ready = await prepare(job, config);
    controller.signal.throwIfAborted();
    const codex = sdk || await createSdk(ready.sdkOptions);
    const options = { workingDirectory: ready.workingDirectory, sandboxMode: job.mode === 'apply' ? 'workspace-write' : 'read-only', approvalPolicy: 'never', networkAccessEnabled: false, webSearchMode: 'disabled', skipGitRepoCheck: false, ...(config?.model ? { model: config.model } : {}) };
    const thread = threadId ? codex.resumeThread(threadId, options) : codex.startThread(options);
    const { events } = await thread.runStreamed(ready.prompt, { signal: controller.signal });
    for await (const event of events) {
      controller.signal.throwIfAborted();
      if (++eventCount > 200) { abort('event-limit'); break; }
      if (event.type === 'thread.started') threadId = event.thread_id;
      if (event.type === 'turn.completed') { completed = true; usage = normalizeUsage(event.usage); }
      if (event.type === 'turn.failed' || event.type === 'error') { stopReason = 'sdk-turn-failed'; }
      if (event.type === 'item.completed') {
        checkpoint.completedItems++;
        if (event.item.type === 'agent_message') resultText = boundedText(event.item.text, 16384);
        if (event.item.type === 'file_change') checkpoint.changedFiles = [...new Set([...checkpoint.changedFiles, ...(event.item.changes || []).map(c => boundedText(c.path, 200))])].slice(0, 20);
      }
      checkpoint.lastEventType = event.type;
      const reply = await client.call('event', { ...lease, eventId: String(eventCount), type: event.type, payload: projectEvent(event), ...(threadId ? { threadId } : {}), checkpoint });
      if (reply.status === 'error') { leaseLost = reply.code === 'lease-lost'; abort(leaseLost ? 'lease-lost' : 'event-save-failed'); break; }
      if (usage && job.budget.maxTokens && (usage.inputTokens || 0) + (usage.outputTokens || 0) > job.budget.maxTokens) { abort('token-budget-exceeded'); break; }
    }
  } catch {
    stopReason ||= 'sdk-execution-failed';
  } finally {
    clearTimeout(timer); clearTimeout(heartbeatTimer);
    // Stop any in-flight heartbeat scheduling before clearing the final timer.
    if (!controller.signal.aborted) controller.abort(new Error('turn-finished'));
    await heartbeatPending;
    clearTimeout(heartbeatTimer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
  if (leaseLost) return { status: 'lease-lost' };
  let state = completed && !stopReason ? 'succeeded' : (job.mode === 'apply' ? 'needs_attention' : 'failed');
  if (stopReason === 'cancel-requested') state = 'cancelled';
  return client.call('finish', { ...lease, state, threadId, usage, usageReason: usage ? 'reported' : 'not-reported', checkpoint,
    result: resultText ? { text: resultText, truncated: bytes(resultText) >= 16381 } : null, error: stopReason || (completed ? null : 'incomplete-stream') });
}
