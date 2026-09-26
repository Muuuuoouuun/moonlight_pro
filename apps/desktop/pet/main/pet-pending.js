'use strict';
// Moonlight Pet — 확인되지 않은 할 일·메모 저장 명령(Mac HubStore 의 pending 규칙 이식).
// 허브 origin 마다 `petHub.pending.v1.<origin>` 에 보관해 재시작 뒤에도 같은 명령(같은 UUID·requestId)으로만 재시도한다.
//   - 새 입력이 확인 안 된 이전 명령을 앞지르지 않는다(이전 것을 먼저 확인하고, 확인된 제목/본문을 돌려준다).
//   - 메모 충돌이 확인되면 명령을 버리고 conflict 표시만 남긴다 — 평소 저장은 막고 '새 항목으로 Hub에 저장'만 허용.
// store: { get(key) → value|null, set(key, value) } — 동기/비동기 모두 받는다(pet-store.json).

const { LIMITS } = require('../shared/contract');
const { fail } = require('./pet-hub-client');
const { taskCommand, memoCommand, validMemoBody, isUuid, validText } = require('./pet-hub-api');

const PENDING_PREFIX = 'petHub.pending.v1.';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function emptyPending() {
  return { task: null, memo: null, savedMemo: null, memoConflict: false };
}

// 저장소에서 읽은 값은 신뢰하지 않는다 — 모양이 틀린 칸은 버린다.
function sanitizePending(value) {
  const state = emptyPending();
  if (!isObject(value)) return state;
  const task = value.task;
  if (isObject(task) && isUuid(task.id) && validText(task.title, LIMITS.taskTitle)) {
    state.task = { id: task.id.toLowerCase(), title: task.title, status: 'todo', source: 'desktop-pet' };
  }
  const memo = value.memo;
  if (isObject(memo) && memo.action === 'save' && isUuid(memo.requestId) && isUuid(memo.entryId) && typeof memo.body === 'string'
    && Number.isInteger(memo.expectedRevision) && typeof memo.title === 'string' && typeof memo.occurredAt === 'string'
    && isObject(memo.noteMeta) && Array.isArray(memo.contexts)) {
    state.memo = { ...memo };
  }
  const saved = value.savedMemo;
  if (isObject(saved) && isUuid(saved.id) && typeof saved.body === 'string' && Number.isInteger(saved.revision)
    && typeof saved.title === 'string' && typeof saved.occurredAt === 'string' && isObject(saved.noteMeta) && Array.isArray(saved.contexts)) {
    state.savedMemo = { ...saved };
  }
  state.memoConflict = value.memoConflict === true;
  return state;
}

function callStoreSet(store, key, value) {
  try {
    const result = store.set(key, value);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // 보관 실패는 이번 실행의 메모리 상태로 계속한다.
  }
}

// api: createHubApi() 결과. origin: 정규화된 허브 origin.
function createPending({ api, store, origin, now = Date.now }) {
  const key = PENDING_PREFIX + origin;
  let state = emptyPending();
  let savingTask = false;
  let savingMemo = false;

  async function load() {
    let value = null;
    try {
      value = store ? await store.get(key) : null;
    } catch {
      value = null;
    }
    state = sanitizePending(value);
    return summary();
  }

  function persist() {
    if (store) callStoreSet(store, key, JSON.parse(JSON.stringify(state)));
  }

  function summary() {
    return {
      hasPendingTask: Boolean(state.task),
      pendingTaskTitle: state.task ? state.task.title : null,
      hasPendingMemo: Boolean(state.memo),
      memoConflict: state.memoConflict,
      savedMemoId: state.memoConflict || !state.savedMemo ? null : state.savedMemo.id,
      savedMemoRevision: state.memoConflict || !state.savedMemo ? null : state.savedMemo.revision,
      savedMemoBody: state.memoConflict || !state.savedMemo ? null : state.savedMemo.body,
      canSaveMemoAsNew: !state.memo,
    };
  }

  // 반환 { task, title, replayed, recovered } — title 은 이번에 확인된 명령의 제목(현재 입력과 다를 수 있다).
  async function addTask({ title, id } = {}) {
    const normalized = typeof title === 'string' ? title.trim() : '';
    if (!state.task && !validText(normalized, LIMITS.taskTitle)) throw fail('error', 'invalid-input');
    if (savingTask) throw fail('error', 'busy');
    savingTask = true;
    const command = state.task || taskCommand(normalized, id);
    state.task = command;
    persist();
    try {
      const task = await api.createTask(command);
      state.task = null;
      persist();
      return { task, title: command.title, replayed: command.title !== normalized, recovered: false };
    } catch (error) {
      if (error && error.kind === 'conflict') {
        // 생성이 이미 반영된 뒤 응답을 잃었을 수 있다. 같은 id 를 목록에서 확인한다(옛 필드를 다시 쓰지 않는다).
        let existing = null;
        try {
          const page = await api.tasks();
          existing = page.tasks.find((t) => t.id === command.id) || null;
        } catch {
          existing = null;
        }
        if (existing) {
          state.task = null;
          persist();
          return { task: existing, title: command.title, replayed: command.title !== normalized, recovered: true };
        }
      }
      throw error;
    } finally {
      savingTask = false;
    }
  }

  // payload: { body, asNew?, finish?, entryId?, expectedRevision?, requestId?, title?, occurredAt? }
  // 반환 { entry, verified:true, replayed, unchanged }
  async function saveMemo(payload = {}) {
    const body = payload.body;
    if (payload.asNew) {
      if (state.memo) throw fail('error', 'pending-memo');
      if (!validMemoBody(body)) throw fail('error', 'invalid-input');
      state.savedMemo = null;
      state.memoConflict = false;
      persist();
    }
    if (state.memoConflict) throw fail('conflict', 'memo-conflict');
    if (!state.memo && !validMemoBody(body)) throw fail('error', 'invalid-input');
    if (savingMemo) throw fail('error', 'busy');
    savingMemo = true;
    try {
      let command = state.memo;
      if (!command) {
        let prior = state.savedMemo;
        if (prior) {
          // 저장된 뒤 Hub 에서 바뀌었으면 덮어쓰지 않는다.
          const remote = await api.memo(prior.id);
          if (remote.revision !== prior.revision || remote.body !== prior.body) throw fail('conflict', 'memo-conflict');
          prior = remote; // 전체 상세에서 제목·태그·맥락을 보존
          if (remote.body === body) return { entry: remote, verified: true, replayed: false, unchanged: true };
        } else if (isUuid(payload.entryId) && Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0) {
          // 렌더러가 읽어 둔 기존 메모를 고친다 — 다시 읽어 revision 을 확인하고 메타를 보존한다.
          const remote = await api.memo(payload.entryId);
          if (remote.revision !== payload.expectedRevision) throw fail('conflict', 'memo-conflict');
          prior = remote;
        }
        command = memoCommand(body, prior, {
          requestId: payload.requestId, entryId: payload.entryId, title: payload.title, occurredAt: payload.occurredAt, now: now(),
        });
        state.memo = command;
        persist();
      }
      const saved = await api.saveMemo(command);
      state.savedMemo = saved;
      state.memo = null;
      persist();
      if (payload.finish) finishMemoCapture(saved);
      return { entry: saved, verified: true, replayed: saved.body !== body, unchanged: false };
    } catch (error) {
      if (error && error.kind === 'conflict') {
        // 충돌이 확인된 명령은 다시 보내지 않는다. 복구는 명시적 '새 항목으로 Hub에 저장'.
        state.memo = null;
        state.memoConflict = true;
        persist();
      }
      throw error;
    } finally {
      savingMemo = false;
    }
  }

  // 빠른 캡처가 확인되면 그 문서는 끝난다 — 다음 입력은 새 id 를 받는다.
  function finishMemoCapture(entry) {
    if (!entry || state.memo || !state.savedMemo || state.savedMemo.id !== entry.id || state.savedMemo.revision !== entry.revision) return false;
    state.savedMemo = null;
    persist();
    return true;
  }

  return {
    key, load, summary, addTask, saveMemo, finishMemoCapture,
    savedMemoId: () => (state.savedMemo ? state.savedMemo.id : null),
    state: () => JSON.parse(JSON.stringify(state)),
  };
}

module.exports = { createPending, sanitizePending, emptyPending, PENDING_PREFIX };
