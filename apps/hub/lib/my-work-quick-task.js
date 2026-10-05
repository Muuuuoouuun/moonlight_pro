import { checkpointQuickTask, isQuickTaskContext, readQuickTaskRecovery, recoveryMarker, removeQuickTaskRecovery,
  subscribeQuickTaskReset, QUICK_TASK_RECOVERY_TTL, validQuickTaskPayload } from './quick-task-recovery.js';

export const QUICK_TASK_UNKNOWN = '저장 응답을 확인하지 못했어요. 이전 요청 확인을 누르면 같은 요청으로 확인합니다. 다음 입력은 유지합니다.';
const EXPIRED = '복구 시간이 지났거나 기기 시계가 바뀌어 이전 요청을 다시 보내지 않았습니다. 이미 저장됐을 수 있으니 내 작업에서 확인한 뒤 새 입력을 시작하세요.';
const STORAGE_ERROR = '브라우저 복구 기록을 확인하거나 정리하지 못해 이번 요청은 전송하지 않았습니다. 이전 요청은 이미 저장됐을 수 있으니 입력을 보관하고 저장 공간을 확인하세요.';
const sameContext = (a, b) => a?.ownerKey === b?.ownerKey && a?.workspaceId === b?.workspaceId && a?.expiresAt === b?.expiresAt;
const sameDue = (actual, requested) => requested ? typeof actual === 'string' && Number.isFinite(Date.parse(actual)) && new Date(actual).toISOString() === new Date(requested).toISOString() : actual === null;

async function fetchContext(fetchImpl) {
  const response = await fetchImpl('/api/operator/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || data?.status !== 'authenticated') {
    if (data?.status === 'anonymous' || response.status === 401) return null;
    throw new Error('quick-task-session-read-failed');
  }
  if (!isQuickTaskContext(data.recovery)) throw new Error('quick-task-owner-unavailable');
  return data.recovery;
}

// One bounded recovery intent survives this tab's reload, with no automatic POST.
export function createMyWorkQuickTask({ createId = () => crypto.randomUUID(),
  storage = () => window.sessionStorage, now = () => Date.now(), getContext = fetchContext } = {}) {
  let pending = null, submittedDraft = null, context = null, inFlight = null, generation = 0, verification = 0, active = true, timer = null;
  let listener = () => {}, unsubscribe = null;
  let snapshot = { status: 'loading', recoverable: false, message: '' };
  const store = () => typeof storage === 'function' ? storage() : storage;
  const publish = (status, message = '') => {
    snapshot = { status, recoverable: pending?.state === 'pending', message };
    if (active) listener(snapshot);
  };
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  function invalidate() {
    generation++; pending = null; submittedDraft = null; context = null; clearTimer(); publish('loading');
  }
  function scheduleExpiry() {
    clearTimer();
    if (!pending || !context) return;
    const fence = generation;
    const at = pending.state === 'pending' ? pending.expiresAt : pending.sessionExpiresAt;
    timer = setTimeout(() => {
      if (!active || generation !== fence) return;
      try {
        if (now() >= context.expiresAt) {
          invalidate(); removeQuickTaskRecovery(store()); publish('unauthorized', '로그인 시간이 만료되어 복구 입력을 삭제했습니다.'); return;
        }
        pending = readQuickTaskRecovery(store(), context, now(), now); submittedDraft = null;
        publish(pending?.state === 'expired' ? 'expired' : 'ready', pending?.state === 'expired' ? EXPIRED : '');
        scheduleExpiry();
      } catch { publish('blocked', STORAGE_ERROR); }
    }, Math.max(1, at - now()));
    timer.unref?.();
  }
  async function verify(fetchImpl, fence) {
    const ticket = ++verification;
    const next = await getContext(fetchImpl);
    if (!active || generation !== fence || verification !== ticket) return false;
    if (!next || !isQuickTaskContext(next, now())) {
      invalidate(); publish('unauthorized', '로그인과 작업 범위를 다시 확인하세요. 이전 요청 전송을 막았습니다.');
      try { removeQuickTaskRecovery(store()); } catch { publish('blocked', STORAGE_ERROR); return false; }
      publish('unauthorized', '로그인과 작업 범위를 다시 확인하세요. 이전 복구 입력은 삭제했습니다.'); return false;
    }
    if (context && !sameContext(context, next)) {
      invalidate(); publish('changed', '로그인 또는 작업 범위가 바뀌어 이전 요청 전송을 막았습니다.');
      try { removeQuickTaskRecovery(store()); } catch { publish('blocked', STORAGE_ERROR); return false; }
      context = next;
      publish('changed', '로그인 또는 작업 범위가 바뀌어 이전 요청을 다시 보내지 않았습니다.'); return false;
    }
    context = next;
    const stored = readQuickTaskRecovery(store(), context, now(), now);
    if (pending?.state === 'pending' && stored && stored.id !== pending.id) throw new Error('quick-task-recovery-replaced');
    // A denied/missing checkpoint must never rotate an already uncertain ID.
    let record = !stored && pending?.state === 'pending' ? pending : stored;
    if (record?.state === 'pending' && now() >= record.expiresAt) {
      record = recoveryMarker(record, 'expired'); checkpointQuickTask(store(), record, now);
    }
    if (pending?.id !== record?.id) submittedDraft = null;
    pending = record;
    if (pending?.state === 'settled') { removeQuickTaskRecovery(store()); pending = null; }
    scheduleExpiry(); return true;
  }
  function settled(attempt) {
    // Remove capture text even when removing the marker is later denied.
    try { checkpointQuickTask(store(), recoveryMarker(attempt, 'settled'), now); } catch { /* still try removing */ }
    try { removeQuickTaskRecovery(store()); pending = null; clearTimer(); return false; }
    catch { pending = recoveryMarker(attempt, 'settled'); scheduleExpiry(); return true; }
  }
  async function initialize(fetchImpl = fetch) {
    const fence = generation;
    try {
      if (!await verify(fetchImpl, fence)) return snapshot;
      publish(pending?.state === 'expired' ? 'expired' : 'ready', pending?.state === 'expired' ? EXPIRED : pending ? `이전 요청 · ${pending.payload.title} · ${QUICK_TASK_UNKNOWN}` : '');
    } catch { if (active && generation === fence) publish('blocked', STORAGE_ERROR); }
    return snapshot;
  }
  async function perform(draft, { details = false, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
    const fence = generation;
    try {
      if (!await verify(fetchImpl, fence)) return { status: 'stale' };
      if (pending?.state === 'expired') { publish('expired', EXPIRED); return { status: 'expired', message: EXPIRED }; }
      if (!pending) {
        const payload = { id: createId(), title: draft.title?.trim(), expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey };
        if (details && draft.dueAt) payload.dueAt = draft.dueAt;
        if (details && draft.priority && draft.priority !== 'medium') payload.priority = draft.priority;
        if (!validQuickTaskPayload(payload)) return { status: 'invalid-input', message: '할 일 제목은 1~300자, 기한·우선순위는 유효한 값으로 입력해 주세요.' };
        const createdAt = now();
        pending = { version: 1, state: 'pending', ownerKey: context.ownerKey, workspaceId: context.workspaceId, id: payload.id,
          createdAt, expiresAt: Math.min(createdAt + QUICK_TASK_RECOVERY_TTL, context.expiresAt), sessionExpiresAt: context.expiresAt,
          payload: Object.freeze(payload), attempted: false };
        submittedDraft = draft;
      }
      const attempt = pending, previouslyUncertain = attempt.attempted;
      // Persistence/read-back precede the first byte of the write.
      checkpointQuickTask(store(), { ...attempt, attempted: true }, now);
      pending = { ...attempt, attempted: true }; scheduleExpiry(); publish('saving');
      const response = await fetchImpl('/api/hub/tasks', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attempt.payload), signal: AbortSignal.timeout(timeoutMs) });
      const data = await response.json();
      if (!active || generation !== fence) return { status: 'stale' };
      if (!await verify(fetchImpl, fence)) return { status: 'stale' };
      if (pending?.state !== 'pending' || pending.id !== attempt.id) return { status: 'stale' };
      const task = data?.task || data?.entity;
      if (response.ok && ['saved', 'duplicate'].includes(data?.status) && task?.id === attempt.id
        && task.workspace_id === attempt.workspaceId && task.title === attempt.payload.title
        && task.status === 'todo' && task.priority === (attempt.payload.priority || 'medium') && sameDue(task.due_at, attempt.payload.dueAt)) {
        const originalDraft = submittedDraft, cleanupWarning = settled(attempt); submittedDraft = null;
        publish(cleanupWarning ? 'blocked' : 'ready', cleanupWarning ? '할 일 저장은 확인했습니다. 브라우저 복구 기록 정리가 필요합니다.' : '');
        return { status: data.status, task, submittedDraft: originalDraft, title: attempt.payload.title, cleanupWarning };
      }
      if (!previouslyUncertain && (['invalid-input', 'forbidden', 'unauthorized'].includes(data?.status) || [400, 401, 403].includes(response.status))) {
        removeQuickTaskRecovery(store()); pending = null; submittedDraft = null; clearTimer();
      }
      const message = data?.status === 'conflict' ? '이 요청 ID의 기존 기록이 달라졌거나 로그인·범위가 바뀌었습니다. 내 작업에서 확인하세요. 새 요청으로 바꾸지 않았습니다.'
        : data?.status === 'preview' ? '서버 저장이 연결되지 않았어요. 입력을 유지했으니 연결 후 이전 요청을 확인하세요.' : QUICK_TASK_UNKNOWN;
      publish('ready', message);
      return { status: data?.status === 'preview' ? 'preview' : 'error', message };
    } catch {
      if (!active || generation !== fence) return { status: 'stale' };
      const message = pending?.attempted ? QUICK_TASK_UNKNOWN : STORAGE_ERROR;
      publish(pending?.attempted ? 'ready' : 'blocked', message);
      return { status: 'error', message };
    }
  }
  return {
    getPending: () => pending?.state === 'pending' ? pending : null,
    snapshot: () => snapshot, initialize,
    activate(onChange) {
      active = true; listener = onChange || (() => {});
      unsubscribe?.(); unsubscribe = subscribeQuickTaskReset(() => {
        invalidate(); publish('unauthorized', '로그아웃되어 이전 요청 전송을 막았습니다.');
        try { removeQuickTaskRecovery(store()); publish('unauthorized', '로그아웃되어 이전 복구 입력을 삭제했습니다.'); }
        catch { publish('blocked', STORAGE_ERROR); }
      });
      return initialize();
    },
    deactivate() { active = false; generation++; unsubscribe?.(); unsubscribe = null; clearTimer(); listener = () => {}; },
    startAfterExpiry() {
      if (pending?.state !== 'expired') return false;
      try { removeQuickTaskRecovery(store()); generation++; pending = null; submittedDraft = null; clearTimer(); publish('ready'); return true; }
      catch { publish('blocked', STORAGE_ERROR); return false; }
    },
    submit(draft, options) {
      if (inFlight) return inFlight;
      inFlight = perform(draft, options).finally(() => { inFlight = null; }); return inFlight;
    },
  };
}
