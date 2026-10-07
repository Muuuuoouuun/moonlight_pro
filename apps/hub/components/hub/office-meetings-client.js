import { OFFICE_MINIMUM_INSTRUCTION, loadOfficeTasks } from './office-session.js';

const BASE = '/api/hub/office/meetings';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const officeMeetingScope = scope => ['personal', 'classin'].includes(scope);
export const officeMeetingHref = (meetingId, scope) => `dashboard/agents/office-council?meeting=${encodeURIComponent(meetingId)}&scope=${scope}`;

export function officeMeetingNotice(status) {
  return ({ conflict: '다른 곳에서 회의가 바뀌었습니다. 입력을 유지했으니 저장된 회의를 다시 확인해 주세요.',
    unknown: '처리 여부를 확인하지 못했습니다. 입력을 유지했습니다. 다시 보내기 전에 저장된 회의를 확인해 주세요.',
    running: '이 회의의 응답이 처리 중입니다. 저장된 회의를 다시 확인해 주세요.',
    preview: '회의 저장 연결이 필요합니다. 입력은 이 화면에 유지됩니다.',
    error: '회의를 읽거나 저장하지 못했습니다. 입력을 유지한 채 다시 확인해 주세요.' })[status] || '';
}

function validDetail(data, scope, meetingId) {
  const meeting = data?.meeting;
  return Boolean(data.persisted === true && meeting && UUID.test(meeting.meetingId || '') && (!meetingId || meeting.meetingId === meetingId)
    && meeting.scope === scope && Number.isInteger(meeting.revision) && meeting.revision >= 0
    && ['open', 'closed'].includes(meeting.state) && Array.isArray(data.turns)
    && data.turns.every(turn => UUID.test(turn.id || '') && ['running', 'generated', 'error', 'unknown'].includes(turn.state)
      && (turn.state !== 'generated' || (turn.result?.scope === scope && typeof turn.result.answer === 'string' && turn.request?.scope === scope))));
}

async function request(path, { method = 'GET', body, fetcher = fetch, signal } = {}) {
  try {
    const response = await fetcher(path, { method, cache: 'no-store', signal: signal || AbortSignal.timeout(method === 'GET' ? 20000 : 90000),
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (!data || data.source === 'error' || data.status === 'error' || (!response.ok && response.status !== 409)) {
      const status = method !== 'GET' && (!data || response.status >= 500) ? 'unknown' : 'error';
      return { status, error: officeMeetingNotice(status) };
    }
    if (response.status === 409 || data.status === 'conflict') return { ...data, status: 'conflict', error: officeMeetingNotice('conflict') };
    if (['preview', 'running', 'unknown'].includes(data.status)) return { ...data, error: officeMeetingNotice(data.status) };
    return data;
  } catch {
    const status = method === 'GET' ? 'error' : 'unknown';
    return { status, error: officeMeetingNotice(status) };
  }
}

export async function listOfficeMeetings(scope, { cursor, ...options } = {}) {
  if (!officeMeetingScope(scope)) return { status: 'error', error: '개인 또는 회사 범위를 골라 주세요.', meetings: [] };
  const query = new URLSearchParams({ scope, limit: '20', ...(cursor ? { cursor } : {}) });
  const data = await request(`${BASE}?${query}`, options);
  if (data.status === 'ready' && Array.isArray(data.meetings) && data.meetings.every(item => item.scope === scope && UUID.test(item.meetingId || ''))) return data;
  return { ...data, status: data.status === 'preview' ? 'preview' : 'error', meetings: [], error: data.error || officeMeetingNotice('error') };
}

export async function readOfficeMeeting(meetingId, scope, options = {}) {
  if (!UUID.test(meetingId || '') || !officeMeetingScope(scope)) return { status: 'error', error: '회의 주소와 업무 범위를 확인해 주세요.' };
  const data = await request(`${BASE}/${meetingId}`, options);
  if (data.status === 'ready' && validDetail(data, scope, meetingId)) return data;
  return { status: data.status === 'preview' ? 'preview' : 'error', error: data.error || officeMeetingNotice('error') };
}

const settings = session => ({ ownerId: session.ownerId, reviewers: session.reviewers, mode: session.mode, decisionContext: session.decisionContext });
const changedSettings = session => Object.entries(settings(session)).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(session.meeting?.[key] ?? (key === 'decisionContext' ? '' : undefined)));

export async function saveOfficeMeetingSettings(store, scope, { fetcher = fetch, patch = {} } = {}) {
  const session = store.get(scope);
  if (!session.meetingId) return { status: 'error', error: '첫 요청을 보낸 뒤 회의 맥락을 저장할 수 있습니다.' };
  const data = await request(`${BASE}/${session.meetingId}`, { method: 'PATCH', fetcher, body: { expectedRevision: session.revision, ...settings(session), ...patch } });
  if (store.get(scope).meetingId !== session.meetingId) return { status: 'error', error: '회의 선택이 바뀌었습니다. 저장된 회의에서 결과를 확인해 주세요.' };
  if (data.status === 'ready' && validDetail(data, scope, session.meetingId)) {
    // Keep any input/settings edited while the request was in flight.
    store.update(scope, { meeting: data.meeting, revision: data.meeting.revision, error: null });
    return data;
  }
  const result = { status: data.status === 'ready' ? 'unknown' : ['conflict', 'unknown', 'preview'].includes(data.status) ? data.status : 'error', error: data.error || officeMeetingNotice(data.status === 'ready' ? 'unknown' : 'error') };
  store.update(scope, { error: result });
  return result;
}

// Only an explicit send reaches this function. A dropped response leaves a read-
// before-retry state; refreshing saved rounds never invokes the model again.
export async function sendOfficeMeeting(store, scope, { requestId, meetingId = crypto.randomUUID(), mode, fetcher = fetch } = {}) {
  const initial = store.get(scope);
  if (!officeMeetingScope(scope)) return { status: 'error', error: '개인 또는 회사 범위를 먼저 골라 주세요.' };
  if (initial.pending || initial.unresolvedTurns.length || ['unknown', 'running'].includes(initial.error?.status)) return { status: 'running', error: officeMeetingNotice('running') };
  if (initial.meeting?.state === 'closed') return { status: 'error', error: '보관된 회의입니다. 설정에서 회의를 다시 열어 주세요.' };
  const pending = store.begin(scope, requestId, { mode, durable: true });
  if (!pending) return { status: 'error', error: '보낼 내용을 확인해 주세요.' };
  const fail = data => {
    const result = { status: ['conflict', 'unknown', 'running', 'preview'].includes(data.status) ? data.status : 'error', error: data.error || officeMeetingNotice('error') };
    store.complete(scope, requestId, result); return result;
  };
  if (!initial.meetingId) {
    // Pin the id before the call so an uncertain create can be read without
    // producing a second meeting or resending its unsent first question.
    store.update(scope, { meetingId });
    const created = await request(BASE, { method: 'POST', fetcher, body: { meetingId, scope,
      title: (initial.agenda?.title || pending.rawDraft.trim().split('\n')[0]).slice(0, 120),
      ...(initial.agenda?.taskId ? { sourceTaskId: initial.agenda.taskId } : {}), ...settings(initial) } });
    if (store.get(scope).pending?.id !== requestId) return { status: 'error', error: '회의 선택이 바뀌었습니다. 첫 질문을 보내지 않았습니다.' };
    if (created.status !== 'ready' || !validDetail(created, scope, meetingId)) {
      if (created.status === 'ready') return fail({ status: 'unknown', error: officeMeetingNotice('unknown') });
      if (!['unknown', 'running'].includes(created.status)) store.update(scope, { meetingId: null });
      return fail(created);
    }
    store.update(scope, { meeting: created.meeting, revision: created.meeting.revision });
  } else if (changedSettings(initial)) {
    const saved = await saveOfficeMeetingSettings(store, scope, { fetcher });
    if (saved.status !== 'ready') return fail(saved);
  }
  const current = store.get(scope);
  if (current.pending?.id !== requestId) return { status: 'error', error: '회의 선택이 바뀌었습니다. 질문을 보내지 않았습니다.' };
  const result = await request(`${BASE}/${current.meetingId}/turns`, { method: 'POST', fetcher, body: {
    requestId, expectedRevision: current.revision,
    message: (initial.minimumOnly ? OFFICE_MINIMUM_INSTRUCTION : '') + pending.rawDraft.trim(),
    mode: pending.request.mode, includeProjects: initial.includeProjects,
    ...(pending.request.mode === 'council' ? { deliberation: pending.request.deliberation } : {}),
  } });
  const submittedTurn = result.turns?.find(turn => turn.id === requestId && turn.state === 'generated');
  const matchesRequest = submittedTurn && ['request', 'result'].every(field => submittedTurn[field]?.ownerId === pending.request.ownerId && submittedTurn[field]?.mode === pending.request.mode);
  if (result.status === 'generated' && validDetail(result, scope, current.meetingId) && matchesRequest) {
    store.restoreMeeting(scope, result, { requestId, keepSettings: true });
    return result;
  }
  if (result.status === 'generated') return fail({ status: 'unknown', error: officeMeetingNotice('unknown') });
  return fail(result);
}

export async function applyOfficeTaskAction(task, nextAction, { fetcher = fetch } = {}) {
  if (!UUID.test(task?.id || '') || !task.updatedAt || typeof nextAction !== 'string' || !nextAction.trim() || nextAction.length > 1000) return { status: 'error', error: '최신 할 일과 1,000자 이내 다음 행동을 확인해 주세요.' };
  try {
    const response = await fetcher('/api/hub/tasks', { method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: task.id, nextAction: nextAction.trim(), expectedUpdatedAt: task.updatedAt }) });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.status === 'saved' && data.task?.id === task.id) return data;
    if (response.status === 409 || data?.status === 'conflict') return { status: 'conflict', error: '할 일이 다시 바뀌었습니다. 입력을 유지했으니 최신 내용을 확인한 뒤 저장해 주세요.' };
    return { status: data?.status === 'preview' ? 'preview' : 'error', error: '다음 행동을 저장하지 못했습니다. 입력을 유지했습니다.' };
  } catch { return { status: 'unknown', error: '저장 여부를 확인하지 못했습니다. 최신 할 일을 다시 읽어 확인해 주세요.' }; }
}

function matchesTaskComparison(session, comparison) {
  return Boolean(comparison?.meetingId && comparison.sourceTaskId
    && session.meetingId === comparison.meetingId
    && session.meeting?.sourceTask?.id === comparison.sourceTaskId);
}

export async function readOfficeMeetingTask(store, scope, { fetcher = fetch } = {}) {
  const session = store.get(scope);
  const target = { meetingId: session.meetingId, sourceTaskId: session.meeting?.sourceTask?.id };
  if (!matchesTaskComparison(session, target)) return { status: 'discarded' };
  const result = await loadOfficeTasks({ fetcher });
  // A late read belongs to the meeting that initiated it, even within one lane.
  if (!matchesTaskComparison(store.get(scope), target)) return { status: 'discarded' };
  const task = result.tasks.find(item => item.id === target.sourceTaskId);
  const taskScope = task?.workspace === 'classin' ? 'classin' : 'personal';
  if (!['live', 'partial'].includes(result.status) || !task || taskScope !== scope || !task.updatedAt) {
    return { ...target, status: 'error', error: result.error || '현재 범위에서 최신 할 일을 확인하지 못했습니다.' };
  }
  return { ...target, status: 'ready', current: task, error: null };
}

export async function applyOfficeMeetingTaskAction(store, scope, comparison, options = {}) {
  if (!matchesTaskComparison(store.get(scope), comparison) || comparison.current?.id !== comparison.sourceTaskId) {
    return { status: 'discarded' };
  }
  return applyOfficeTaskAction(comparison.current, comparison.nextAction, options);
}
