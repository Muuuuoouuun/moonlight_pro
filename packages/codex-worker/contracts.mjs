import { createHash } from 'node:crypto';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
export function boundedText(value, maxBytes) {
  let text = String(value ?? '');
  if (bytes(text) <= maxBytes) return text;
  text = Buffer.from(text).subarray(0, maxBytes).toString('utf8');
  return text.replace(/\uFFFD$/, '');
}
function requireValue(ok, error = 'invalid-input') { if (!ok) throw new Error(error); }
export function strictKeys(value, keys) { requireValue(record(value) && Object.keys(value).every(key => keys.includes(key))); }
export function readProjects(raw) {
  if (!raw) return {};
  const projects = JSON.parse(raw);
  requireValue(record(projects) && Object.keys(projects).length <= 50, 'invalid-project-registry');
  for (const [id, p] of Object.entries(projects)) {
    requireValue(KEY.test(id) && record(p) && typeof p.path === 'string' && p.path.startsWith('/') && !p.path.includes('\0'), 'invalid-project-registry');
    requireValue(Array.isArray(p.modes) && p.modes.length > 0 && p.modes.every(m => ['read', 'draft', 'apply'].includes(m)), 'invalid-project-modes');
    requireValue(!p.modes.includes('apply') || (typeof p.applyPath === 'string' && p.applyPath.startsWith('/') && p.applyPath !== p.path), 'apply-worktree-required');
    requireValue(p.label === undefined || (typeof p.label === 'string' && bytes(p.label) <= 200), 'invalid-project-label');
    requireValue(p.contextRefs === undefined || (record(p.contextRefs) && Object.keys(p.contextRefs).length <= 50 && Object.entries(p.contextRefs).every(([key, path]) => KEY.test(key) && typeof path === 'string' && path.length <= 500 && !path.startsWith('/') && !path.split(/[\\/]/).includes('..') && !path.includes('\0'))), 'invalid-context-registry');
  }
  return projects;
}
export const publicProjects = projects => Object.entries(projects).map(([id, p]) => ({ id, label: p.label || id, modes: [...new Set(p.modes)], contextRefs: Object.keys(p.contextRefs || {}) }));
export function normalizeJobInput(action, input, projects = {}) {
  const keys = { submit: ['requestId', 'projectId', 'prompt', 'mode', 'contextRefs', 'budget', 'queueIfOffline'], get: ['id'], events: ['id', 'after', 'limit'], cancel: ['id', 'expectedTurnCount'], resume: ['id', 'requestId', 'expectedTurnCount', 'prompt', 'reconciliation', 'queueIfOffline'], list: ['limit'], projects: [], availability: [] };
  requireValue(action in keys);
  strictKeys(input, keys[action]);
  if (['get', 'events', 'cancel', 'resume'].includes(action)) requireValue(typeof input.id === 'string' && UUID.test(input.id));
  if (action === 'submit') {
    requireValue(typeof input.requestId === 'string' && UUID.test(input.requestId));
    const project = projects[input.projectId];
    requireValue(project && project.modes.includes(input.mode), 'project-or-mode-not-allowed');
    requireValue(typeof input.prompt === 'string' && input.prompt.trim() && bytes(input.prompt) <= 16384, 'invalid-prompt');
    const refs = input.contextRefs ?? [];
    requireValue(Array.isArray(refs) && refs.length <= 8 && new Set(refs).size === refs.length && refs.every(id => typeof id === 'string' && Object.hasOwn(project.contextRefs || {}, id)), 'context-ref-not-allowed');
    const budget = input.budget ?? {};
    strictKeys(budget, ['wallClockSeconds', 'maxTokens', 'maxTurns']);
    const normalizedBudget = { wallClockSeconds: budget.wallClockSeconds ?? 600, maxTokens: budget.maxTokens ?? null, maxTurns: budget.maxTurns ?? 3 };
    requireValue(Number.isInteger(normalizedBudget.wallClockSeconds) && normalizedBudget.wallClockSeconds >= 10 && normalizedBudget.wallClockSeconds <= 3600, 'invalid-wall-clock-budget');
    requireValue(normalizedBudget.maxTokens === null || (Number.isInteger(normalizedBudget.maxTokens) && normalizedBudget.maxTokens >= 100 && normalizedBudget.maxTokens <= 1000000), 'invalid-token-budget');
    requireValue(Number.isInteger(normalizedBudget.maxTurns) && normalizedBudget.maxTurns >= 1 && normalizedBudget.maxTurns <= 10, 'invalid-turn-budget');
    requireValue(input.queueIfOffline === undefined || typeof input.queueIfOffline === 'boolean');
    const normalized = { requestId: input.requestId.toLowerCase(), projectId: input.projectId, mode: input.mode, prompt: input.prompt.trim(), contextRefs: [...refs].sort(), budget: normalizedBudget };
    return { ...normalized, requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'), queueIfOffline: input.queueIfOffline ?? false };
  }
  if (action === 'events') {
    const after = input.after === undefined ? 0 : Number(input.after), limit = input.limit === undefined ? 50 : Number(input.limit);
    requireValue((typeof input.after === 'number' || input.after === undefined || /^\d+$/.test(input.after)) && Number.isSafeInteger(after) && after >= 0);
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 100);
    return { id: input.id, after, limit };
  }
  if (action === 'list') { requireValue(input.limit === undefined || Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 20); return { limit: input.limit ?? 20 }; }
  if (['resume', 'cancel'].includes(action)) requireValue(Number.isInteger(input.expectedTurnCount) && input.expectedTurnCount >= 1 && input.expectedTurnCount <= 10, 'expected-turn-required');
  if (action === 'resume') {
    requireValue(typeof input.requestId === 'string' && UUID.test(input.requestId), 'resume-request-id-required');
    requireValue(input.prompt === undefined || typeof input.prompt === 'string' && input.prompt.trim() && bytes(input.prompt) <= 16384);
    requireValue(input.queueIfOffline === undefined || typeof input.queueIfOffline === 'boolean');
    if (input.reconciliation !== undefined) {
      const r = input.reconciliation;
      strictKeys(r, ['confirmed', 'note', 'checkedThreadId']);
      requireValue(r.confirmed === true && typeof r.note === 'string' && r.note.trim().length >= 16 && bytes(r.note) <= 2048 && (r.checkedThreadId === null || typeof r.checkedThreadId === 'string' && r.checkedThreadId.length <= 200), 'invalid-reconciliation');
    }
    const normalized = { id: input.id, requestId: input.requestId.toLowerCase(), expectedTurnCount: input.expectedTurnCount, prompt: input.prompt?.trim() ?? null, reconciliation: input.reconciliation ? { confirmed: true, note: input.reconciliation.note.trim(), checkedThreadId: input.reconciliation.checkedThreadId } : null };
    return { ...normalized, requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'), queueIfOffline: input.queueIfOffline ?? false };
  }
  return input;
}
export function jobHttpStatus(data) {
  if (data?.status === 'accepted') return 202;
  if (data?.status !== 'error') return 200;
  if (['lease-lost', 'request-conflict', 'worker-offline', 'job-not-resumable', 'reconciliation-required', 'turn-limit', 'job-busy', 'stale-job-turn'].includes(data.code)) return 409;
  if (data.code === 'not-found') return 404;
  if (data.code === 'invalid-input') return 400;
  return 502;
}
