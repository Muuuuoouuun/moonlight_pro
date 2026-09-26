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
  // memoConflictId: 충돌이 확인된 메모 id. 충돌은 그 메모에만 걸린다(다른 메모를 명시해 저장하는 것은 막지 않는다).
  return { task: null, memo: null, savedMemo: null, memoConflict: false, memoConflictId: null };
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
  state.memoConflictId = state.memoConflict && isUuid(value.memoConflictId) ? value.memoConflictId.toLowerCase() : null;
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
      memoConflictId: state.memoConflict ? state.memoConflictId : null,
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
  // 대상 결정(위에서부터):
  //   1) 확인 안 된 보류 명령 — 같은 명령으로만 다시 보낸다(새 입력이 앞지르지 않는다).
  //   2) asNew — 새 id 로 새 메모.
  //   3) 렌더러가 명시한 다른 메모(entryId 가 UUID 이고 이 펫이 마지막으로 저장한 메모와 다름) — expectedRevision 필수, 다시 읽어 확인.
  //   4) 이 펫이 마지막으로 저장한 메모(entryId 가 그 메모이거나 없음) — 다시 읽어 저장 뒤 Hub 에서 바뀌지 않았는지 확인.
  //   5) 없으면 새 메모(entryId 가 UUID 면 그 id, expectedRevision 0).
  //   충돌 표시는 그 메모에만 걸린다: 충돌 뒤 4)·5)는 막고, 충돌 없는 다른 메모의 3)과 2)는 허용한다.
  async function saveMemo(payload) {
    const input = isObject(payload) ? payload : {};
    const body = input.body;
    if (savingMemo) throw fail('error', 'busy');
    const asNew = input.asNew === true;
    const explicitId = !asNew && isUuid(input.entryId) ? input.entryId.toLowerCase() : null;
    const hasExpected = Number.isInteger(input.expectedRevision) && input.expectedRevision > 0;
    const savedId = state.savedMemo ? state.savedMemo.id.toLowerCase() : null;
    const explicitOther = Boolean(explicitId && explicitId !== savedId && hasExpected);
    if (asNew) {
      if (state.memo) throw fail('error', 'pending-memo');
      if (!validMemoBody(body)) throw fail('error', 'invalid-input');
    } else if (state.memo) {
      // 보류 명령이 먼저다. 다른 메모를 명시했으면 섞지 않고 거절한다(렌더러는 보류분이 확인된 뒤 다시 보낸다).
      if (explicitId && explicitId !== state.memo.entryId.toLowerCase()) throw fail('error', 'pending-memo');
    } else {
      if (explicitId && explicitId !== savedId && !hasExpected) {
        // 기존 메모를 고치려면 읽어 둔 revision 이 있어야 한다. 새 메모의 id 로 쓰는 경우는 저장된 메모가 없을 때만.
        if (savedId) throw fail('error', 'invalid-input');
      }
      // 충돌 뒤에는 평소 저장(대상 미지정·마지막 메모)을 막는다. 충돌 없는 다른 메모를 명시한 저장만 통과한다.
      if (state.memoConflict && (!explicitOther || explicitId === state.memoConflictId)) throw fail('conflict', 'memo-conflict');
      if (!validMemoBody(body)) throw fail('error', 'invalid-input');
    }
    savingMemo = true;
    let targetId = null;
    try {
      let command = state.memo;
      if (!command) {
        let prior = null;
        if (asNew) {
          prior = null;
        } else if (explicitOther) {
          // 렌더러가 읽어 둔 다른 메모를 고친다 — 다시 읽어 revision 을 확인하고 메타를 보존한다.
          targetId = explicitId;
          const remote = await api.memo(explicitId);
          if (remote.revision !== input.expectedRevision) throw fail('conflict', 'memo-conflict');
          prior = remote;
          if (remote.body === body) return { entry: remote, verified: true, replayed: false, unchanged: true };
        } else if (state.savedMemo) {
          // 저장된 뒤 Hub 에서 바뀌었으면 덮어쓰지 않는다.
          targetId = savedId;
          const remote = await api.memo(state.savedMemo.id);
          if (remote.revision !== state.savedMemo.revision || remote.body !== state.savedMemo.body) throw fail('conflict', 'memo-conflict');
          prior = remote; // 전체 상세에서 제목·태그·맥락을 보존
          if (remote.body === body) return { entry: remote, verified: true, replayed: false, unchanged: true };
        }
        command = memoCommand(body, prior, {
          requestId: input.requestId, entryId: asNew ? null : explicitId, title: input.title, occurredAt: input.occurredAt, now: now(),
        });
        state.memo = command;
        persist();
      }
      targetId = command.entryId.toLowerCase();
      const saved = await api.saveMemo(command);
      state.memo = null;
      state.savedMemo = saved;
      // 다른 메모(또는 새 메모) 저장이 확인되면 이전 메모의 충돌 표시는 더 이상 이 캡처의 대상이 아니다.
      if (state.memoConflict && state.memoConflictId !== targetId) {
        state.memoConflict = false;
        state.memoConflictId = null;
      }
      persist();
      if (input.finish) finishMemoCapture(saved);
      return { entry: saved, verified: true, replayed: saved.body !== body, unchanged: false };
    } catch (error) {
      if (error && error.kind === 'conflict') {
        // 충돌이 확인된 명령은 다시 보내지 않는다. 복구는 명시적 '새 항목으로 Hub에 저장'.
        state.memo = null;
        state.memoConflict = true;
        state.memoConflictId = targetId;
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
