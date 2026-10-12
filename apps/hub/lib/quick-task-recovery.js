import { isCanonicalUuid } from './uuid.js';

export const QUICK_TASK_RECOVERY_KEY = 'moonlight.quick-task-recovery.v1';
export const QUICK_TASK_RECOVERY_TTL = 15 * 60 * 1000;
const CHANNEL = 'moonlight-quick-task-recovery';
const resetListeners = new Set();
const expiryTimers = new WeakMap();
const allowedKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

export function isQuickTaskContext(value, now = Date.now()) {
  return Boolean(allowedKeys(value, ['ownerKey', 'workspaceId', 'expiresAt']) && typeof value.ownerKey === 'string' && /^[a-f0-9]{64}$/.test(value.ownerKey)
    && isCanonicalUuid(value.workspaceId) && Number.isSafeInteger(value.expiresAt) && value.expiresAt > now);
}

export function validQuickTaskPayload(value) {
  return Boolean(allowedKeys(value, ['id', 'title', 'dueAt', 'priority', 'expectedWorkspaceId', 'recoveryOwner'])
    && isCanonicalUuid(value.id) && typeof value.title === 'string' && value.title.trim() === value.title && value.title.length > 0 && value.title.length <= 300 && !value.title.includes('\0')
    && isCanonicalUuid(value.expectedWorkspaceId) && typeof value.recoveryOwner === 'string' && /^[a-f0-9]{64}$/.test(value.recoveryOwner)
    && (value.priority === undefined || ['low', 'medium', 'high', 'critical'].includes(value.priority))
    && (value.dueAt === undefined || (typeof value.dueAt === 'string' && value.dueAt.length <= 100 && Number.isFinite(Date.parse(value.dueAt))
      && (!/^\d{4}-\d{2}-\d{2}$/.test(value.dueAt) || new Date(value.dueAt).toISOString().slice(0, 10) === value.dueAt))));
}

export function recoveryMarker(record, state) {
  return { version: 1, state, ownerKey: record.ownerKey, workspaceId: record.workspaceId, id: record.id,
    createdAt: record.createdAt, expiresAt: record.expiresAt, sessionExpiresAt: record.sessionExpiresAt };
}

// Privacy cleanup belongs to the tab, not to a mounted MyWork component. Timers
// may be delayed by a suspended browser; every restore also enforces expiry.
function armExpiry(storage, record, clock) {
  clearTimeout(expiryTimers.get(storage));
  const at = record.state === 'pending' ? record.expiresAt : record.sessionExpiresAt;
  const timer = setTimeout(() => {
    try {
      const raw = storage.getItem(QUICK_TASK_RECOVERY_KEY);
      const current = raw ? JSON.parse(raw) : null;
      if (current?.id !== record.id || current.ownerKey !== record.ownerKey) return;
      if (clock() >= record.sessionExpiresAt) removeQuickTaskRecovery(storage);
      else if (current.state === 'pending' && clock() >= current.expiresAt) checkpointQuickTask(storage, recoveryMarker(current, 'expired'), clock);
      else armExpiry(storage, current, clock);
    } catch { /* An unavailable storage API cannot be cleaned; restore fails closed. */ }
  }, Math.max(1, at - clock()));
  timer.unref?.(); expiryTimers.set(storage, timer);
}

export function checkpointQuickTask(storage, record, clock = () => Date.now()) {
  const text = JSON.stringify(record);
  if (text.length > 4096) throw new Error('quick-task-storage-too-large');
  storage.setItem(QUICK_TASK_RECOVERY_KEY, text);
  armExpiry(storage, record, clock);
  if (storage.getItem(QUICK_TASK_RECOVERY_KEY) !== text) throw new Error('quick-task-storage-readback-failed');
}

export function removeQuickTaskRecovery(storage = window.sessionStorage) {
  storage.removeItem(QUICK_TASK_RECOVERY_KEY);
  if (storage.getItem(QUICK_TASK_RECOVERY_KEY) !== null) throw new Error('quick-task-storage-remove-failed');
  clearTimeout(expiryTimers.get(storage)); expiryTimers.delete(storage);
}

export function readQuickTaskRecovery(storage, context, now = Date.now(), clock = () => Date.now()) {
  const text = storage.getItem(QUICK_TASK_RECOVERY_KEY);
  if (text === null) return null;
  let value;
  try { value = text.length <= 4096 ? JSON.parse(text) : null; } catch { value = null; }
  const valid = allowedKeys(value, ['version', 'state', 'ownerKey', 'workspaceId', 'id', 'createdAt', 'expiresAt', 'sessionExpiresAt', 'payload', 'attempted'])
    && value.version === 1 && ['pending', 'expired', 'settled'].includes(value.state) && isCanonicalUuid(value.id)
    && typeof value.ownerKey === 'string' && /^[a-f0-9]{64}$/.test(value.ownerKey) && isCanonicalUuid(value.workspaceId)
    && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.expiresAt) && Number.isSafeInteger(value.sessionExpiresAt)
    && value.expiresAt > value.createdAt && value.expiresAt <= value.createdAt + QUICK_TASK_RECOVERY_TTL
    && value.expiresAt <= value.sessionExpiresAt
    && (value.state === 'pending' ? validQuickTaskPayload(value.payload) && value.payload.id === value.id
      && value.payload.expectedWorkspaceId === value.workspaceId && value.payload.recoveryOwner === value.ownerKey
      && typeof value.attempted === 'boolean'
      : !Object.hasOwn(value, 'payload') && !Object.hasOwn(value, 'attempted'));
  if (!valid) { removeQuickTaskRecovery(storage); throw new Error('quick-task-recovery-invalid'); }
  if (!isQuickTaskContext(context, now) || value.ownerKey !== context.ownerKey || value.workspaceId !== context.workspaceId
    || value.sessionExpiresAt !== context.expiresAt || now >= value.sessionExpiresAt) {
    removeQuickTaskRecovery(storage);
    return null;
  }
  // A wall-clock rollback is not proof that a valid uncertain write never
  // happened. Scrub text but retain its ID fence until an explicit restart.
  if (value.state === 'pending' && (now < value.createdAt || now >= value.expiresAt)) {
    value = recoveryMarker(value, 'expired');
    checkpointQuickTask(storage, value, clock);
  }
  if (value.state === 'pending') Object.freeze(value.payload);
  armExpiry(storage, value, clock);
  return value;
}

// Notify before clearing storage; other tabs receive no capture text or IDs.
export function resetQuickTasks(storage) {
  for (const listener of resetListeners) listener();
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try { const channel = new BroadcastChannel(CHANNEL); channel.postMessage('logout'); channel.close(); }
    catch { /* Session validation and the server assertion remain the fences. */ }
  }
  // Accessing sessionStorage itself can throw; invalidate generations first.
  removeQuickTaskRecovery(storage === undefined ? window.sessionStorage : storage);
}

export function subscribeQuickTaskReset(listener) {
  resetListeners.add(listener);
  let channel;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try { channel = new BroadcastChannel(CHANNEL); channel.onmessage = event => { if (event.data === 'logout') listener(); }; }
    catch { /* Optional cross-tab notification may be unavailable. */ }
  }
  return () => { resetListeners.delete(listener); channel?.close(); };
}
