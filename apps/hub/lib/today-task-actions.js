import { applyTodayTaskRow, applyTodayTaskDeletion, todayTaskRows, dateKeyInZone, focusDatesOf, focusLimitMessage, isFocusedOn, MAX_FOCUS_PER_DAY } from './task-today.js';

const has = (row, key) => Object.prototype.hasOwnProperty.call(row, key);
const field = (row, camel, snake = camel) => has(row, snake) ? row[snake] : row[camel];
const text = value => typeof value === 'string' ? value.trim() : '';
export function todayTaskAcknowledges(row, task, patch, date) {
  if (!row || row.id !== task.id) return false;
  if (patch.status && row.status !== patch.status) return false;
  if (patch.status === 'done' && !Number.isFinite(Date.parse(row.completed_at ?? row.completedAt))) return false;
  if (patch.focus && !Array.isArray(row.focusDates) && !Array.isArray(row.meta?.focus_dates)) return false;
  if (patch.focus && focusDatesOf(row).includes(date) !== patch.focus.on) return false;
  if (has(patch, 'dueAt')) {
    if (!has(row, 'due_at') && !has(row, 'dueAt')) return false;
    const actual = field(row, 'dueAt', 'due_at');
    if (patch.dueAt == null || patch.dueAt === '') { if (actual !== null && actual !== '') return false; }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(patch.dueAt)) { if (dateKeyInZone(actual) !== patch.dueAt) return false; }
    else if (!Number.isFinite(Date.parse(actual)) || Date.parse(actual) !== Date.parse(patch.dueAt)) return false;
  }
  for (const [key, snake, max] of [['title', 'title', 300], ['description', 'description', 4000], ['nextAction', 'next_action', 1000]]) {
    if (has(patch, key)) {
      const actual = field(row, key, snake);
      if ((!has(row, key) && !has(row, snake)) || (typeof actual !== 'string' && actual !== null)
        || text(actual) !== text(patch[key]).slice(0, max)) return false;
    }
  }
  if (has(patch, 'priority') && row.priority !== text(patch.priority).toLowerCase()) return false;
  if (has(patch, 'expectedUpdatedAt') && !Number.isFinite(Date.parse(field(row, 'updatedAt', 'updated_at')))) return false;
  return true;
}

// One queue serves capture, candidate selection and all three slots. Requests
// with the same identity join synchronously, before React can disable a button.
export function createTodayTaskActions({ fetchImpl = (...args) => fetch(...args), now = () => new Date(), onChanged = () => {} } = {}) {
  let source = null, version = 0, queue = Promise.resolve();
  let snapshot = { version, pendingIds: [], message: '', status: 'idle' };
  const pending = new Map(), rows = new Map(), listeners = new Set();
  const refresh = () => { try { Promise.resolve(onChanged()).catch(() => {}); } catch { /* The acknowledged write remains authoritative. */ } };
  const publish = (status, message = '') => {
    snapshot = { version: ++version, status, message, pendingIds: [...new Set([...pending.values()].map(item => item.id))] };
    listeners.forEach(listener => listener());
  };
  function view() {
    const date = dateKeyInZone(now());
    if (source?.focus?.date && source.focus.date !== date) return { ...source, state: 'loading', stale: true, items: [], later: [], queueItems: [], queueCount: 0, focusItems: [], focusCompletedItems: [], focus: { date, picked: 0, done: 0, limit: MAX_FOCUS_PER_DAY } };
    let projected = source;
    for (const entry of rows.values()) if (entry.date === date && projected) projected = (entry.deleted ? applyTodayTaskDeletion : applyTodayTaskRow)(projected, entry.row, { now: now() });
    return projected;
  }
  async function execute(task, patch, date, deleted) {
    const current = view();
    const actualDate = dateKeyInZone(now());
    if (date !== actualDate || (source?.focus?.date && source.focus.date !== date)) {
      refresh();
      return { ok: false, status: 'stale', message: '날짜가 바뀌어 오늘 할 일을 다시 확인하고 있습니다. 새 목록에서 다시 선택하세요.' };
    }
    if (rows.get(task.id)?.deleted) return { ok: false, status: 'missing', message: '이미 삭제한 할 일입니다. 목록을 다시 읽어 확인하세요.' };
    const selected = todayTaskRows(current).find(row => row.id === task.id) || task;
    if (patch.focus?.on && (!current || current.state !== 'live' || current.stale)) {
      refresh();
      return { ok: false, status: 'unverified', message: '오늘 3개를 다시 읽은 뒤 선택하세요. 등록한 할 일은 목록에 남아 있습니다.' };
    }
    if (patch.focus?.on && !isFocusedOn(selected, date) && current.focus?.picked >= MAX_FOCUS_PER_DAY) {
      return { ok: false, status: 'full', message: focusLimitMessage() };
    }
    try {
      const body = deleted ? { id: task.id } : { id: task.id, ...patch, ...(patch.focus ? { focus: { ...patch.focus, date } } : {}) };
      const response = await fetchImpl('/api/hub/tasks', { method: deleted ? 'DELETE' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data = await response.json().catch(() => null);
      if (response.status === 409 && data?.error === 'focus-limit') {
        refresh();
        return { ok: false, status: 'full', message: focusLimitMessage(data.limit) };
      }
      if (response.status === 409 || data?.status === 'conflict') {
        refresh();
        return { ok: false, status: 'conflict', message: '다른 곳에서 이 할 일이 바뀌었습니다. 입력은 유지했습니다. 최신 목록을 확인한 뒤 다시 열어 수정하세요.' };
      }
      if (!response.ok || data?.status !== 'saved' || (!deleted && !todayTaskAcknowledges(data.task, task, patch, date))) {
        return { ok: false, status: 'error', message: data?.status === 'preview' ? '저장소가 연결되지 않아 변경을 저장하지 않았습니다.' : '저장 결과를 확인하지 못했습니다. 목록을 다시 읽거나 같은 항목에서 다시 시도하세요.' };
      }
      if (dateKeyInZone(now()) === date) rows.set(task.id, { row: deleted ? selected : { ...selected, ...data.task,
        ...(has(data.task, 'priority') ? { priorityRaw: data.task.priority } : {}) }, deleted, date, source });
      publish('saved');
      refresh();
      return { ok: true, status: 'saved', ...(deleted ? { deletedId: task.id } : { task: data.task }) };
    } catch {
      return { ok: false, status: 'error', message: '저장 응답을 확인하지 못했습니다. 입력과 선택은 유지했습니다. 같은 항목에서 다시 시도하세요.' };
    }
  }
  function enqueue(task, patch, deleted = false) {
    const date = dateKeyInZone(now()), key = JSON.stringify([date, task.id, deleted ? 'DELETE' : patch]);
    if (pending.has(key)) return pending.get(key).promise;
    const promise = queue.then(() => execute(task, patch, date, deleted)).then(result => { publish(result.ok ? 'saved' : 'error', result.message || ''); return result; })
      .finally(() => { pending.delete(key); publish(snapshot.status, snapshot.message); });
    pending.set(key, { id: task.id, promise });
    queue = promise.catch(() => {});
    publish('saving');
    return promise;
  }
  return {
    observe(next) {
      source = next;
      const date = dateKeyInZone(now());
      for (const [id, entry] of rows) if (entry.date !== date || (next !== entry.source && next?.state === 'live' && !next.stale)) rows.delete(id);
      return view();
    },
    view, snapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    run: (task, patch) => enqueue(task, patch),
    remove: task => enqueue(task, {}, true),
  };
}
