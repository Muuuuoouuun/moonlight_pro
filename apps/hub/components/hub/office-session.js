// Drafts and pending freeform requests live only in the mounted Hub session.
// They are deliberately never serialized to localStorage or sent across scopes.
import { officeHistory } from './office-client.js';
import { officeDeliberationForParticipants } from './office-deliberation-client.js';

export const OFFICE_MINIMUM_INSTRUCTION = '[오늘은 최소한만: 이미 정한 약속을 지키는 데 필요한 내용만 남겨 주세요. 추가 과제가 필요 없으면 추가 행동 없음으로 답해 주세요.]\n\n';

export function officeTasksForScope(tasks, scope) {
  return (Array.isArray(tasks) ? tasks : []).filter(task => task && task.status !== 'done' && task.done !== true
    && (scope === 'all' || task.workspace === (scope === 'classin' ? 'classin' : 'brand')));
}

// V4 회의실 왼쪽 레일: 완료 전 할 일을 막힘 → 오래 그대로인 순으로 몇 개만 보인다.
// "막혔다"는 기록된 상태(blocked)만 뜻하고, 나머지는 마지막 수정 뒤 지난 날수로만 말한다.
export function officeRailTasks(tasks, scope, { now = Date.now(), limit = 6 } = {}) {
  const day = 24 * 60 * 60 * 1000;
  const staleDays = task => {
    const at = Date.parse(task.updatedAt || '');
    return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / day)) : null;
  };
  return officeTasksForScope(tasks, scope)
    .map(task => ({ task, staleDays: staleDays(task) }))
    .sort((a, b) => (b.task.status === 'blocked') - (a.task.status === 'blocked')
      || (b.staleDays ?? -1) - (a.staleDays ?? -1))
    .slice(0, limit);
}

export function officeTaskAgendaBlock(task) {
  const lines = ['[할 일 안건]', `제목: ${String(task.title || '').trim()}`];
  if (task.nextAction?.trim()) lines.push(`다음 행동: ${task.nextAction.trim()}`);
  if (task.due?.trim() || task.dueAt?.trim()) lines.push(`마감: ${String(task.due || task.dueAt).trim()}`);
  if (task.description?.trim()) lines.push(`설명: ${task.description.trim()}`);
  return lines.join('\n').slice(0, 1500);
}

// /api/hub/tasks reports failures as internal codes (project-ledger-core-read-failed,
// task-ledger-unexpected-error, …) — never show those verbatim to the operator.
const TASK_READ_ERROR_LABELS = Object.freeze({
  'project-ledger-core-read-failed': '업무 저장소에 연결하지 못했습니다.',
  'task-ledger-unexpected-error': '할 일을 불러오는 중 오류가 발생했습니다.',
});
function taskReadErrorMessage(code) {
  return TASK_READ_ERROR_LABELS[code] || '할 일을 읽지 못했습니다.';
}

export async function loadOfficeTasks({ fetcher = fetch } = {}) {
  try {
    const response = await fetcher('/api/hub/tasks', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.status === 'error') return { status: 'error', tasks: [], error: taskReadErrorMessage(data?.error) };
    if (data.status === 'preview') return { status: 'preview', tasks: [] };
    if (!['live', 'partial'].includes(data.status)) return { status: 'error', tasks: [], error: '할 일 읽기 상태를 확인하지 못했습니다.' };
    return { status: data.status, tasks: Array.isArray(data.tasks) ? data.tasks : [] };
  } catch { return { status: 'error', tasks: [], error: '할 일을 읽지 못했습니다.' }; }
}

function officeRequestMessage(session) {
  const draft = session.draft.trim();
  const block = session.agenda?.block;
  const recentHasAgenda = block && session.turns.slice(-4).some(turn => turn.message.includes(block));
  // Nothing has scrolled out of history yet on the very first turn — never reattach then.
  const prefix = session.turns.length > 0 && block && !recentHasAgenda && !draft.includes(block) ? `${block}\n\n` : '';
  return (session.minimumOnly ? OFFICE_MINIMUM_INSTRUCTION : '') + prefix + draft;
}

export function officeMessageLength(session) {
  return officeRequestMessage(session).length;
}

function blankSession() {
  return { ownerId: 'eevee', mode: 'chat', reviewers: [], includeProjects: false,
    minimumOnly: false, presetId: null, deliberation: officeDeliberationForParticipants(undefined, ['eevee']), agenda: null, draft: '', turns: [], pending: null, error: null };
}

export function createOfficeSessionStore() {
  const sessions = new Map();
  const listeners = new Set();
  const get = scope => {
    if (!sessions.has(scope)) sessions.set(scope, blankSession());
    return sessions.get(scope);
  };
  const update = (scope, patch) => {
    const current = get(scope);
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
    next.reviewers = [...new Set(next.reviewers.filter(id => id !== next.ownerId))].slice(0, 2);
    next.mode = next.reviewers.length ? 'council' : (['chat', 'draft', 'review'].includes(next.mode) ? next.mode : 'chat');
    next.deliberation = officeDeliberationForParticipants(next.deliberation, [next.ownerId, ...next.reviewers.filter(id => id !== next.ownerId)]);
    sessions.set(scope, next);
    for (const listener of listeners) listener();
    return get(scope);
  };
  return {
    get, update,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsentDrafts() { return [...sessions.values()].some(session => session.draft.trim()); },
    reset(scope) {
      if (get(scope).pending) return false;
      update(scope, { turns: [], agenda: null, draft: '', error: null });
      return true;
    },
    begin(scope, requestId, { mode } = {}) {
      const session = get(scope);
      if (session.pending || !session.draft.trim()) return null;
      const requestMode = mode === 'chat' ? 'chat' : session.mode;
      const request = {
        ownerId: session.ownerId, mode: requestMode, scope, lens: null,
        message: officeRequestMessage(session),
        participants: requestMode === 'council' ? [session.ownerId, ...session.reviewers.filter(id => id !== session.ownerId)] : [],
        history: officeHistory(session.turns), includeProjects: session.includeProjects,
      };
      if (request.message.length > 6000) {
        update(scope, { error: { status: 'error', error: '요청이 깁니다. 안건과 최소 업무 지침을 포함해 6,000자 안으로 줄여 주세요.' } });
        return null;
      }
      if (request.mode === 'council' && request.participants.length < 2) return null;
      if (request.mode === 'council') request.deliberation = officeDeliberationForParticipants(session.deliberation, request.participants);
      const pending = { id: requestId, rawDraft: session.draft, request };
      // Do not pin a manual agenda here — a failed first request must not leave a stale
      // agenda/block behind (see complete()'s generated branch, which pins it on success only).
      update(scope, { pending, error: null });
      return pending;
    },
    complete(scope, requestId, result) {
      const session = get(scope);
      if (session.pending?.id !== requestId) return false;
      const pending = session.pending;
      if (result.status !== 'generated') {
        update(scope, { pending: null, error: result });
        return true;
      }
      const firstLine = pending.rawDraft.trim().split('\n')[0].trim();
      const agenda = session.agenda || (session.turns.length === 0 ? { title: firstLine.slice(0, 40), source: 'manual', block: pending.rawDraft.trim().slice(0, 1500) } : null);
      update(scope, {
        pending: null, error: null, agenda,
        draft: session.draft === pending.rawDraft ? '' : session.draft,
        turns: [...session.turns, { id: requestId, message: pending.rawDraft.trim(), request: pending.request, result }],
      });
      return true;
    },
  };
}

export function shouldSubmitOfficeKey(event) {
  return event.key === 'Enter' && Boolean(event.metaKey || event.ctrlKey)
    && !event.isComposing && !event.nativeEvent?.isComposing
    && event.keyCode !== 229 && event.nativeEvent?.keyCode !== 229;
}

export async function copyOfficeText(text, clipboard) {
  try {
    if (typeof clipboard?.writeText !== 'function') return false;
    await clipboard.writeText(text);
    return true;
  } catch { return false; }
}
