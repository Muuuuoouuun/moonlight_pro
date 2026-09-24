// Drafts and pending freeform requests live only in the mounted Hub session.
// They are deliberately never serialized to localStorage or sent across scopes.
import { officeHistory } from './office-client.js';
import { officeDeliberationForParticipants } from './office-deliberation-client.js';

export const OFFICE_MINIMUM_INSTRUCTION = '[오늘은 최소한만: 이미 정한 약속을 지키는 데 필요한 내용만 남겨 주세요. 추가 과제가 필요 없으면 추가 행동 없음으로 답해 주세요.]\n\n';

export function officeTasksForScope(tasks, scope) {
  return (Array.isArray(tasks) ? tasks : []).filter(task => task && task.status !== 'done' && task.done !== true
    && (scope === 'all' || task.workspace === (scope === 'classin' ? 'classin' : 'brand')));
}

export function officeTaskAgendaBlock(task) {
  const lines = ['[할 일 안건]', `제목: ${String(task.title || '').trim()}`];
  if (task.nextAction?.trim()) lines.push(`다음 행동: ${task.nextAction.trim()}`);
  if (task.due?.trim() || task.dueAt?.trim()) lines.push(`마감: ${String(task.due || task.dueAt).trim()}`);
  if (task.description?.trim()) lines.push(`설명: ${task.description.trim()}`);
  return lines.join('\n').slice(0, 1500);
}

export async function loadOfficeTasks({ fetcher = fetch } = {}) {
  try {
    const response = await fetcher('/api/hub/tasks', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.status === 'error') return { status: 'error', tasks: [], error: data?.error || '할 일을 읽지 못했습니다.' };
    if (data.status === 'preview') return { status: 'preview', tasks: [] };
    if (!['live', 'partial'].includes(data.status)) return { status: 'error', tasks: [], error: '할 일 읽기 상태를 확인하지 못했습니다.' };
    return { status: data.status, tasks: Array.isArray(data.tasks) ? data.tasks : [] };
  } catch { return { status: 'error', tasks: [], error: '할 일을 읽지 못했습니다.' }; }
}

function officeRequestMessage(session) {
  const draft = session.draft.trim();
  const block = session.agenda?.block;
  const recentHasAgenda = block && session.turns.slice(-4).some(turn => turn.message.includes(block));
  const prefix = block && !recentHasAgenda && !draft.includes(block) ? `${block}\n\n` : '';
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
      const firstLine = session.draft.trim().split('\n')[0].trim();
      const agenda = session.agenda || (session.turns.length === 0 ? { title: firstLine.slice(0, 40), source: 'manual', block: session.draft.trim().slice(0, 1500) } : null);
      update(scope, { pending, error: null, agenda });
      return pending;
    },
    complete(scope, requestId, result) {
      const session = get(scope);
      if (session.pending?.id !== requestId) return false;
      const pending = session.pending;
      update(scope, result.status === 'generated' ? {
        pending: null, error: null,
        draft: session.draft === pending.rawDraft ? '' : session.draft,
        turns: [...session.turns, { id: requestId, message: pending.rawDraft.trim(), request: pending.request, result }],
      } : { pending: null, error: result });
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
