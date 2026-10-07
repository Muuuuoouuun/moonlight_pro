// One immutable write per card/flow survives this tab's navigation and reload.
// Restoring an intent never sends it: a changed form first restores the old input.
import { isQuickTaskContext, subscribeQuickTaskReset } from './quick-task-recovery.js';
import { sameJson } from './check-write-ack.js';

const PREFIX = 'moonlight.check-write.v1:';
const TTL = 15 * 60 * 1000;
const timers = new Map();
const sameContext = (a, b) => a?.ownerKey === b?.ownerKey && a?.workspaceId === b?.workspaceId && a?.expiresAt === b?.expiresAt;
const clone = value => JSON.parse(JSON.stringify(value));
export const UNKNOWN_WRITE = '저장 여부를 확인하지 못했습니다. 입력과 요청 ID를 유지했습니다. 같은 요청으로 다시 확인하세요.';
const EXPIRED = '이전 요청의 복구 시간이 지났습니다. 이미 저장됐을 수 있으니 대상 기록을 확인하세요. 이 로그인에서는 새 요청으로 바꾸지 않습니다.';
const BLOCKED = '로그인 또는 브라우저 복구 기록을 확인하지 못해 전송을 막았습니다. 입력을 유지하고 다시 확인하세요.';

async function readContext(fetchImpl) {
  const response = await fetchImpl('/api/operator/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || data?.status !== 'authenticated' || !isQuickTaskContext(data.recovery)) throw new Error('owner-unavailable');
  return data.recovery;
}

function checkpoint(storage, key, value, now) {
  const text = JSON.stringify(value);
  if (text.length > 24000) throw new Error('intent-too-large');
  storage.setItem(key, text);
  if (storage.getItem(key) !== text) throw new Error('checkpoint-not-durable');
  clearTimeout(timers.get(key));
  const at = value.state === 'pending' ? value.expiresAt : value.context.expiresAt;
  const timer = setTimeout(() => {
    try {
      const current = JSON.parse(storage.getItem(key) || 'null');
      if (!current || current.id !== value.id) return;
      if (now() >= current.context.expiresAt) storage.removeItem(key);
      else if (current.state === 'pending') checkpoint(storage, key, { ...current, state: 'expired', input: null, ids: null, progress: null }, now);
    } catch { /* Restoration fails closed if storage becomes unavailable. */ }
  }, Math.max(1, at - now()));
  timer.unref?.(); timers.set(key, timer);
}

function erase(storage, key) {
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw new Error('cleanup-failed');
  clearTimeout(timers.get(key)); timers.delete(key);
}

// Called even after a panel unmounts. The existing logout notification carries no text.
if (typeof window !== 'undefined') subscribeQuickTaskReset(() => {
  try {
    const storage = window.sessionStorage;
    for (const key of Object.keys(storage)) if (key.startsWith(PREFIX)) erase(storage, key);
  } catch { /* A storage denial is surfaced before any future write. */ }
});

export function createCheckWriteIntent(key, { storage = () => window.sessionStorage, now = () => Date.now(), getContext = readContext } = {}) {
  const storageKey = PREFIX + key;
  const store = () => typeof storage === 'function' ? storage() : storage;
  let intent = null, inFlight = false;
  async function verify(fetchImpl) {
    const context = await getContext(fetchImpl);
    if (!isQuickTaskContext(context, now())) throw new Error('owner-unavailable');
    if (intent && !sameContext(context, intent.context)) { erase(store(), storageKey); intent = null; throw new Error('owner-changed'); }
    return context;
  }
  return {
    async begin(fetchImpl, input, makeIds) {
      if (inFlight) return { ok: false, message: '같은 요청을 확인 중입니다.' };
      inFlight = true;
      try {
        const context = await verify(fetchImpl), raw = store().getItem(storageKey);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && (!saved.context || !['pending', 'expired', 'settled'].includes(saved.state) || !Number.isSafeInteger(saved.createdAt)
          || !Number.isSafeInteger(saved.expiresAt) || saved.expiresAt > saved.createdAt + TTL)) throw new Error('invalid-intent');
        if (saved && !sameContext(saved.context, context)) { erase(store(), storageKey); throw new Error('owner-changed'); }
        intent = saved || intent;
        if (intent?.state === 'settled') { erase(store(), storageKey); intent = null; }
        if (intent && (now() < intent.createdAt || now() >= intent.expiresAt)) {
          intent = { ...intent, state: 'expired', input: null, ids: null, progress: null }; checkpoint(store(), storageKey, intent, now);
        }
        if (intent?.state === 'expired') return { ok: false, message: EXPIRED };
        if (intent && !sameJson(intent.input, input)) return { ok: false, restore: clone(intent.input), message: '이전 요청의 입력을 복원했습니다. 내용을 확인한 뒤 같은 요청을 다시 확인하세요.' };
        if (!intent) {
          const createdAt = now();
          intent = { state: 'pending', id: crypto.randomUUID(), context, createdAt,
            expiresAt: Math.min(createdAt + TTL, context.expiresAt), input: clone(input), ids: makeIds(), progress: {} };
        }
        checkpoint(store(), storageKey, intent, now); // before any write
        return { ok: true, input: clone(intent.input), ids: clone(intent.ids), progress: clone(intent.progress), context };
      } catch { return { ok: false, message: BLOCKED }; }
      finally { inFlight = false; }
    },
    async ownedFetch(fetchImpl, url, init, stillCurrent = () => true) {
      await verify(fetchImpl);
      if (!stillCurrent()) throw new Error('panel-closed');
      if (!intent || intent.state !== 'pending' || now() < intent.createdAt || now() >= intent.expiresAt) throw new Error('intent-expired');
      const body = JSON.parse(init.body);
      return fetchImpl(url, { ...init, body: JSON.stringify({ ...body, expectedWorkspaceId: intent.context.workspaceId, recoveryOwner: intent.context.ownerKey }) });
    },
    async finish(fetchImpl, { ok, progress = {} }) {
      try {
        await verify(fetchImpl);
        if (!intent || now() < intent.createdAt || now() >= intent.expiresAt) return false;
        intent = { ...intent, progress: clone(progress), ...(ok ? { state: 'settled', input: null, ids: null, progress: null } : {}) };
        checkpoint(store(), storageKey, intent, now);
        if (ok) { erase(store(), storageKey); intent = null; }
        return true;
      } catch { return false; }
    },
  };
}
