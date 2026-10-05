import { isCanonicalUuid } from './uuid.js';

export const QUICK_TASK_UNKNOWN = '저장 응답을 확인하지 못했어요. 다시 추가하면 이전 요청부터 확인하며 입력은 유지합니다.';

// The task ID is the existing Engine create/dedup key. An uncertain request is
// immutable until acknowledged; edits made meanwhile belong to the next draft.
export function createMyWorkQuickTask({ createId = () => crypto.randomUUID() } = {}) {
  let pending = null, inFlight = null;
  return {
    getPending: () => pending,
    submit(draft, { details = false, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
      if (inFlight) return inFlight;
      if (!pending) {
        const title = draft.title?.trim();
        if (!title) return Promise.resolve({ status: 'invalid-input', message: '할 일 제목을 입력해 주세요.' });
        const id = createId();
        if (!isCanonicalUuid(id)) return Promise.resolve({ status: 'invalid-input', message: '저장 요청을 준비하지 못했어요.' });
        const payload = { id, title };
        if (details && draft.dueAt) payload.dueAt = draft.dueAt;
        if (details && draft.priority && draft.priority !== 'medium') payload.priority = draft.priority;
        pending = { payload: Object.freeze(payload), draft };
      }
      const attempt = pending;
      const previouslyUncertain = Boolean(attempt.uncertain);
      attempt.uncertain = true;
      inFlight = (async () => {
        try {
          const response = await fetchImpl('/api/hub/tasks', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(attempt.payload), signal: AbortSignal.timeout(timeoutMs),
          });
          const data = await response.json();
          const task = data?.task || data?.entity;
          if (response.ok && ['saved', 'duplicate'].includes(data?.status) && task?.id === attempt.payload.id) {
            pending = null;
            return { status: data.status, task, submittedDraft: attempt.draft, title: attempt.payload.title };
          }
          // A definitive rejection did not create this task. Conflict retains its
          // ID: a payload mismatch must never be sidestepped with a fresh UUID.
          if (!previouslyUncertain && (['invalid-input', 'forbidden', 'unauthorized'].includes(data?.status) || [400, 401, 403].includes(response.status))) pending = null;
          return { status: data?.status === 'preview' ? 'preview' : 'error',
            message: data?.status === 'conflict' ? '이 요청 ID에 다른 할 일이 있어요. 입력을 보관하고 기존 기록을 확인해 주세요.'
              : data?.status === 'preview' ? '서버 저장이 연결되지 않았어요. 입력을 유지했으니 연결 후 다시 추가하세요.' : QUICK_TASK_UNKNOWN };
        } catch { return { status: 'error', message: QUICK_TASK_UNKNOWN }; }
        finally { inFlight = null; }
      })();
      return inFlight;
    },
  };
}
