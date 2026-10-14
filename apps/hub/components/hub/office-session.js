// Unsent drafts stay in the mounted Hub session. Submitted meeting rounds are
// restored from the server; raw drafts are never serialized to localStorage.
import { officeHistory } from './office-client.js';
import { officeDeliberationForParticipants } from './office-deliberation-client.js';
import { officeConnectionBoundary } from './office-connection-inbox.js';
import { normalizeOfficeSkillRequests } from './office-skill-request.js';

export const OFFICE_MINIMUM_INSTRUCTION = '[오늘은 최소한만: 이미 정한 약속을 지키는 데 필요한 내용만 남겨 주세요. 추가 과제가 필요 없으면 추가 행동 없음으로 답해 주세요.]\n\n';

// Routing must see the current question even when this meeting began from a task.
// Never shorten that question. Only supporting context uses the remaining budget.
export function officeAssignmentInput(session) {
  const draft = session.draft?.trim() || '';
  const context = session.decisionContext?.trim() || '';
  const block = session.agenda?.block?.trim() || '';
  const key = JSON.stringify([session.meetingId, draft, context, block, session.minimumOnly,
    session.ownerId, session.reviewers, session.mode]);
  let message = (session.minimumOnly ? OFFICE_MINIMUM_INSTRUCTION : '') + (draft || block || context);
  if (!draft && !block && !context) return { message: '', truncated: false, key };
  let truncated = false;
  const support = [
    context && context !== (draft || block || context) ? '[운영자가 적은 결정 맥락]\n' + context : '',
    draft && block && !draft.includes(block) ? '[회의 시작 시 안건 복사본]\n' + block : '',
  ].filter(Boolean).join('\n\n');
  if (support) {
    const suffix = '\n[부가 맥락 일부 생략]';
    const remaining = 6000 - message.length - 2;
    if (support.length <= remaining) message += '\n\n' + support;
    else {
      truncated = true;
      if (remaining >= suffix.length) {
        const cut = support.slice(0, remaining - suffix.length).replace(/[\uD800-\uDBFF]$/, '');
        message += '\n\n' + cut + suffix;
      }
    }
  }
  return { message, truncated, key };
}

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

export async function loadOfficeTasks({ fetcher = fetch, signal } = {}) {
  try {
    const response = await fetcher('/api/hub/tasks', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
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

export function officeMessageLength(session, { durable = false } = {}) {
  return durable ? ((session.minimumOnly ? OFFICE_MINIMUM_INSTRUCTION : '') + session.draft.trim()).length : officeRequestMessage(session).length;
}

function blankSession() {
  return { meetingId: null, revision: null, meeting: null, decisionContext: '', skillRequests: [], unresolvedTurns: [], failedTurns: [],
    ownerId: 'eevee', mode: 'chat', reviewers: [], includeProjects: false, brandId: null,
    minimumOnly: false, presetId: null, deliberation: officeDeliberationForParticipants(undefined, ['eevee']), agenda: null, draft: '', turns: [], pending: null, error: null };
}

export function createOfficeSessionStore() {
  const sessions = new Map();
  const meetingDrafts = new Map();
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
    meetingDrafts.delete(`${scope}:${next.meetingId || 'new'}`);
    for (const listener of listeners) listener();
    return get(scope);
  };
  return {
    get, update,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsentDrafts() { return [...sessions.values(), ...meetingDrafts.values()].some(session => session.draft.trim()
      || session.decisionContext !== (session.meeting?.decisionContext || '')); },
    reset(scope) {
      if (get(scope).pending) return false;
      const current = get(scope);
      if (current.meetingId) meetingDrafts.set(`${scope}:${current.meetingId}`, { ...current, draft: '', decisionContext: current.meeting?.decisionContext || '' });
      update(scope, { ...blankSession(), ownerId: current.ownerId, reviewers: current.reviewers, mode: current.mode });
      return true;
    },
    restoreMeeting(scope, detail, { requestId, keepSettings = false } = {}) {
      if (!detail?.meeting || detail.meeting.scope !== scope || !Array.isArray(detail.turns)) return false;
      const current = get(scope);
      if (requestId && current.pending?.id !== requestId) return false;
      const meeting = detail.meeting;
      const switched = current.meetingId !== meeting.meetingId;
      if (switched) meetingDrafts.set(`${scope}:${current.meetingId || 'new'}`, current);
      const local = switched ? meetingDrafts.get(`${scope}:${meeting.meetingId}`) : current;
      const submitted = requestId ? current.pending.rawDraft : null;
      const draft = requestId ? (current.draft === submitted && detail.status === 'generated' ? '' : current.draft) : local?.draft || '';
      const source = meeting.sourceTask;
      const latest = detail.turns.at(-1)?.request;
      const editable = keepSettings ? current : (switched ? local : null);
      // Retain edits, but adopt remote changes to fields left untouched locally.
      // A read must not turn the previous baseline into a new write.
      const rolesDirty = editable?.meeting && ['ownerId', 'reviewers', 'mode'].some(key =>
        JSON.stringify(editable[key]) !== JSON.stringify(editable.meeting[key]));
      const contextDirty = editable && editable.decisionContext !== (editable.meeting?.decisionContext || '');
      const settings = {
        ownerId: rolesDirty ? editable.ownerId : meeting.ownerId,
        reviewers: rolesDirty ? editable.reviewers : meeting.reviewers || [],
        mode: rolesDirty ? editable.mode : meeting.mode,
        decisionContext: contextDirty ? editable.decisionContext : meeting.decisionContext || '',
        includeProjects: editable ? editable.includeProjects : latest?.includeProjects === true,
        ...(editable?.deliberation ? { deliberation: editable.deliberation }
          : latest?.deliberation ? { deliberation: latest.deliberation } : {}),
      };
      update(scope, { ...blankSession(), ...settings, meetingId: meeting.meetingId, revision: meeting.revision,
        meeting, draft, minimumOnly: local?.minimumOnly || current.minimumOnly,
        pending: requestId ? null : (switched ? null : current.pending), error: null,
        agenda: source ? { title: meeting.title, source: 'task', taskId: source.id, taskWorkspace: source.workspace,
          importedAt: source.importedAt, block: officeTaskAgendaBlock(source) }
          : { title: meeting.title, source: 'manual', block: '' },
        turns: detail.turns.filter(turn => turn.state === 'generated' && turn.result).map(turn => ({
          ...turn, message: turn.request?.message || '', request: turn.request, result: turn.result,
        })),
        unresolvedTurns: detail.turns.filter(turn => ['running', 'unknown'].includes(turn.state)),
        failedTurns: detail.turns.filter(turn => turn.state === 'error'),
        skillRequests: normalizeOfficeSkillRequests(detail.skillRequests, { meetingId: meeting.meetingId }),
      });
      return true;
    },
    begin(scope, requestId, { mode, durable = false } = {}) {
      const session = get(scope);
      if (session.pending || !session.draft.trim()) return null;
      const requestMode = mode === 'chat' ? 'chat' : session.mode;
      const request = {
        ownerId: session.ownerId, mode: requestMode, scope, lens: null,
        message: durable ? (session.minimumOnly ? OFFICE_MINIMUM_INSTRUCTION : '') + session.draft.trim() : officeRequestMessage(session),
        participants: requestMode === 'council' ? [session.ownerId, ...session.reviewers.filter(id => id !== session.ownerId)] : [],
        history: durable ? [] : officeHistory(session.turns), includeProjects: session.includeProjects,
      };
      if (request.message.length > 6000) {
        update(scope, { error: { status: 'error', error: '요청이 깁니다. 안건과 최소 업무 지침을 포함해 6,000자 안으로 줄여 주세요.' } });
        return null;
      }
      if (request.mode === 'council' && request.participants.length < 2) return null;
      if (request.mode === 'council') request.deliberation = officeDeliberationForParticipants(session.deliberation, request.participants);
      const officeBoundary = officeConnectionBoundary(scope, session.brandId);
      const pending = { id: requestId, rawDraft: session.draft, request, officeBoundary };
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
        turns: [...session.turns, { id: requestId, message: pending.rawDraft.trim(), request: pending.request, result, officeBoundary: pending.officeBoundary }],
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

export { officeUnloadGuard } from './office-unload.js';
