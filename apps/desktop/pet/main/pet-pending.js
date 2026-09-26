'use strict';
// Moonlight Pet — 확인되지 않은 할 일·메모 저장 명령(Mac HubStore 의 pending 규칙 이식).
// 허브 origin 마다 `petHub.pending.v1.<origin>` 에 보관해 재시작 뒤에도 같은 명령(같은 UUID·requestId)으로만 재시도한다.
//   - 새 입력이 확인 안 된 이전 명령을 앞지르지 않는다(이전 것을 먼저 확인하고, 확인된 제목/본문을 돌려준다).
//   - 메모 충돌이 확인되면 명령을 버리고 conflict 표시만 남긴다 — 캡처 메모 충돌은 대상 없는 저장을 막고 '새 항목으로 Hub에 저장'만,
//     명시 편집 충돌은 그 메모만 막고 다시 읽으면(journal-read) 풀린다.
// store: { get(key) → value|null, set(key, value) } — 동기/비동기 모두 받는다(pet-store.json).

const { LIMITS } = require('../shared/contract');
const { fail } = require('./pet-hub-client');
const { taskCommand, memoCommand, validMemoBody, isUuid, validText } = require('./pet-hub-api');

const PENDING_PREFIX = 'petHub.pending.v1.';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 메모 역할:
//   capture  — 빠른 캡처(대상 없는 저장·Ctrl+S)가 쓰는 메모. state.savedMemo 가 그 대상이다.
//   explicit — 렌더러가 journal-read 로 열어 entryId·expectedRevision 을 붙여 고치는 메모. 캡처 대상을 바꾸지 않는다.
// 충돌도 역할별로 따로 둔다:
//   captureConflict   — 캡처 메모가 Hub 에서 바뀌었다. 대상 없는 저장을 막고 '새 항목으로 Hub에 저장'만 허용(Mac 규칙).
//   explicitConflicts — 명시 편집이 낡은 revision 이었던 메모 id 들. 그 id 로의 명시 저장만 막고, 캡처는 막지 않는다.
//                       렌더러가 그 메모를 다시 읽으면(journal-read) 풀린다.
const MAX_EXPLICIT_CONFLICTS = 20;

function emptyPending() {
  return {
    task: null, memo: null, memoRole: null, memoRecovers: null, savedMemo: null, captureConflict: false, captureConflictId: null, explicitConflicts: [],
  };
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
    state.memoRole = value.memoRole === 'explicit' ? 'explicit' : 'capture';
    state.memoRecovers = isUuid(value.memoRecovers) ? value.memoRecovers.toLowerCase() : null;
  }
  const saved = value.savedMemo;
  if (isObject(saved) && isUuid(saved.id) && typeof saved.body === 'string' && Number.isInteger(saved.revision)
    && typeof saved.title === 'string' && typeof saved.occurredAt === 'string' && isObject(saved.noteMeta) && Array.isArray(saved.contexts)) {
    state.savedMemo = { ...saved };
  }
  const savedId = state.savedMemo ? state.savedMemo.id.toLowerCase() : null;
  const explicit = Array.isArray(value.explicitConflicts) ? value.explicitConflicts.filter(isUuid).map((id) => id.toLowerCase()) : [];
  let captureConflict = value.captureConflict === true;
  // 이전 형식(memoConflict + memoConflictId) — 캡처 메모 id 면 캡처 충돌, 다른 id 면 명시 충돌.
  if (value.memoConflict === true) {
    const legacyId = isUuid(value.memoConflictId) ? value.memoConflictId.toLowerCase() : null;
    if (!legacyId || legacyId === savedId) captureConflict = true;
    else explicit.push(legacyId);
  }
  const conflictId = isUuid(value.captureConflictId) ? value.captureConflictId.toLowerCase() : savedId;
  state.captureConflict = captureConflict && Boolean(conflictId);
  state.captureConflictId = state.captureConflict ? conflictId : null;
  state.explicitConflicts = [...new Set(explicit)].slice(-MAX_EXPLICIT_CONFLICTS);
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
    const capture = state.savedMemo && !state.captureConflict ? state.savedMemo : null;
    const conflictIds = [...(state.captureConflict && state.captureConflictId ? [state.captureConflictId] : []), ...state.explicitConflicts];
    return {
      hasPendingTask: Boolean(state.task),
      pendingTaskTitle: state.task ? state.task.title : null,
      hasPendingMemo: Boolean(state.memo),
      pendingMemoEntryId: state.memo ? state.memo.entryId : null,
      pendingMemoRole: state.memo ? state.memoRole : null,
      // memoConflict: 어느 메모든 충돌 표시가 있다. captureConflict: 캡처 메모가 막혔다(대상 없는 저장 불가 → 새 항목으로만).
      memoConflict: conflictIds.length > 0,
      memoConflictId: conflictIds.length ? conflictIds[0] : null,
      memoConflictIds: conflictIds,
      captureConflict: Boolean(state.captureConflict),
      // 캡처 메모(대상 없는 저장이 쓰는 곳). 캡처 충돌 중에는 숨긴다.
      savedMemoId: capture ? capture.id : null,
      savedMemoRevision: capture ? capture.revision : null,
      savedMemoBody: capture ? capture.body : null,
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

  function addExplicitConflict(id) {
    state.explicitConflicts = [...state.explicitConflicts.filter((x) => x !== id), id].slice(-MAX_EXPLICIT_CONFLICTS);
  }
  function clearExplicitConflict(id) {
    const before = state.explicitConflicts.length;
    state.explicitConflicts = state.explicitConflicts.filter((x) => x !== id);
    return state.explicitConflicts.length !== before;
  }

  // payload: { body, asNew?, finish?, entryId?, expectedRevision?, requestId?, title?, occurredAt? }
  // 반환 { entry, verified:true, replayed, unchanged, role:'capture'|'explicit' }
  // 대상 결정(위에서부터):
  //   1) 확인 안 된 보류 명령 — 같은 명령으로만 다시 보낸다(새 입력이 앞지르지 않는다, replayed:true).
  //      다른 메모를 명시했거나 asNew 면 섞지 않고 'pending-memo'.
  //   2) asNew — 새 id 로 새 메모. entryId 가 캡처 메모가 아닌 다른 메모면 그 메모의 명시 편집 복구(캡처 대상 불변),
  //      아니면 캡처 복구(새 메모가 캡처 대상이 된다).
  //   3) entryId(UUID) + expectedRevision(>0) — 명시 편집. 다시 읽어 revision 이 같을 때만 쓰고 제목·메타를 보존한다.
  //      캡처 대상은 바뀌지 않는다(그 메모가 곧 캡처 메모였다면 캡처 기록만 새 revision 으로 맞춘다).
  //   4) entryId 가 없거나 캡처 메모 — 캡처 메모. 다시 읽어 펫이 쓴 뒤 Hub 에서 바뀌지 않았는지 확인.
  //   5) 캡처 메모가 없으면 새 캡처 메모(entryId 가 UUID 면 그 id). 캡처 메모가 있는데 다른 entryId 를 revision 없이 주면 invalid-input.
  async function saveMemo(payload) {
    const input = isObject(payload) ? payload : {};
    const body = input.body;
    if (savingMemo) throw fail('error', 'busy');
    const asNew = input.asNew === true;
    const explicitId = isUuid(input.entryId) ? input.entryId.toLowerCase() : null;
    const hasExpected = Number.isInteger(input.expectedRevision) && input.expectedRevision > 0;
    const savedId = state.savedMemo ? state.savedMemo.id.toLowerCase() : null;
    let role;
    let recovers = null;
    if (state.memo) {
      if (asNew) throw fail('error', 'pending-memo');
      if (explicitId && explicitId !== state.memo.entryId.toLowerCase()) throw fail('error', 'pending-memo');
      role = state.memoRole || 'capture';
    } else if (asNew) {
      if (!validMemoBody(body)) throw fail('error', 'invalid-input');
      role = explicitId && explicitId !== savedId && explicitId !== state.captureConflictId ? 'explicit' : 'capture';
      recovers = role === 'explicit' ? explicitId : savedId || state.captureConflictId;
    } else if (explicitId && hasExpected) {
      role = 'explicit';
      if (state.explicitConflicts.includes(explicitId)) throw fail('conflict', 'memo-conflict');
      if (!validMemoBody(body)) throw fail('error', 'invalid-input');
    } else {
      // 기존 메모를 고치려면 읽어 둔 revision 이 있어야 한다. 새 메모의 id 로 쓰는 경우는 캡처 메모가 없을 때만.
      if (explicitId && savedId && explicitId !== savedId) throw fail('error', 'invalid-input');
      role = 'capture';
      if (state.captureConflict) throw fail('conflict', 'memo-conflict');
      if (!validMemoBody(body)) throw fail('error', 'invalid-input');
    }
    savingMemo = true;
    let targetId = null;
    let targetRole = role;
    try {
      let command = state.memo;
      if (!command) {
        let prior = null;
        if (asNew) {
          prior = null;
        } else if (role === 'explicit') {
          // 렌더러가 읽어 둔 메모를 고친다 — 다시 읽어 revision 을 확인하고 메타를 보존한다.
          targetId = explicitId;
          const remote = await api.memo(explicitId);
          if (remote.revision !== input.expectedRevision) throw fail('conflict', 'memo-conflict');
          prior = remote;
          if (remote.body === body) {
            if (clearExplicitConflict(explicitId)) persist();
            return { entry: remote, verified: true, replayed: false, unchanged: true, role };
          }
        } else if (state.savedMemo) {
          // 저장된 뒤 Hub 에서 바뀌었으면 덮어쓰지 않는다.
          targetId = savedId;
          const remote = await api.memo(state.savedMemo.id);
          if (remote.revision !== state.savedMemo.revision || remote.body !== state.savedMemo.body) throw fail('conflict', 'memo-conflict');
          prior = remote; // 전체 상세에서 제목·태그·맥락을 보존
          if (remote.body === body) return { entry: remote, verified: true, replayed: false, unchanged: true, role };
        }
        command = memoCommand(body, prior, {
          requestId: input.requestId, entryId: asNew || role === 'explicit' ? null : explicitId, title: input.title, occurredAt: input.occurredAt, now: now(),
        });
        state.memo = command;
        state.memoRole = role;
        state.memoRecovers = recovers;
        persist();
      }
      targetRole = state.memoRole || 'capture';
      targetId = command.entryId.toLowerCase();
      const saved = await api.saveMemo(command);
      const savedEntryId = String(saved.id).toLowerCase();
      const recovered = state.memoRecovers;
      state.memo = null;
      state.memoRole = null;
      state.memoRecovers = null;
      if (targetRole === 'capture') {
        state.savedMemo = saved;
        state.captureConflict = false;
    state.captureConflictId = null;
      } else if (state.savedMemo && state.savedMemo.id.toLowerCase() === savedEntryId) {
        // 캡처 메모를 명시 편집으로 고쳤다 — 캡처 기록을 새 revision 으로 맞춘다(Hub 와 같아졌으니 캡처 충돌도 풀린다).
        state.savedMemo = saved;
        state.captureConflict = false;
        state.captureConflictId = null;
      }
      clearExplicitConflict(savedEntryId);
      if (recovered) clearExplicitConflict(recovered);
      persist();
      if (input.finish && targetRole === 'capture') finishMemoCapture(saved);
      return { entry: saved, verified: true, replayed: saved.body !== body, unchanged: false, role: targetRole };
    } catch (error) {
      if (error && error.kind === 'conflict') {
        // 충돌이 확인된 명령은 다시 보내지 않는다. 복구는 '새 항목으로 Hub에 저장'(캡처) 또는 다시 읽기(명시 편집).
        state.memo = null;
        state.memoRole = null;
        state.memoRecovers = null;
        if (targetRole === 'capture' && targetId && (!state.savedMemo || targetId === savedId)) {
          // 캡처 대상(저장된 캡처 메모 또는 막 새로 만들던 캡처 메모)이 Hub 에서 부딪혔다 — 대상 없는 저장을 막는다(Mac 규칙).
          state.captureConflict = true;
          state.captureConflictId = targetId;
        }
        else if (targetId) addExplicitConflict(targetId);
        persist();
      }
      throw error;
    } finally {
      savingMemo = false;
    }
  }

  // 렌더러가 그 메모를 Hub 에서 다시 읽었다 — 명시 편집 충돌 표시를 거둔다(다음 저장은 새 revision 으로 다시 확인된다).
  // 캡처 충돌은 Mac 규칙대로 '새 항목으로 Hub에 저장'으로만 푼다.
  function noteMemoRead(entryId) {
    if (!isUuid(entryId)) return false;
    if (!clearExplicitConflict(entryId.toLowerCase())) return false;
    persist();
    return true;
  }

  // 빠른 캡처가 확인되면 그 문서는 끝난다 — 다음 입력은 새 id 를 받는다.
  function finishMemoCapture(entry) {
    if (!entry || state.memo || !state.savedMemo || state.savedMemo.id !== entry.id || state.savedMemo.revision !== entry.revision) return false;
    state.savedMemo = null;
    state.captureConflict = false;
        state.captureConflictId = null;
    persist();
    return true;
  }

  return {
    key, load, summary, addTask, saveMemo, finishMemoCapture, noteMemoRead,
    savedMemoId: () => (state.savedMemo ? state.savedMemo.id : null),
    state: () => JSON.parse(JSON.stringify(state)),
  };
}

module.exports = { createPending, sanitizePending, emptyPending, PENDING_PREFIX };
