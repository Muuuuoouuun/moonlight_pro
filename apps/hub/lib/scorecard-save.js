import { createGoalCommandClient, goalReadState, goalWriteErrorMessage } from './goal-client.js';
import { isJournalEntry } from './journal-client.js';

const STEP_LABEL = { journal: '회고 메모', link: '목표 연결', archive: '목표 보관' };
const storageKey = objective => `moonlight.scorecard-save.v1:${objective.scope}:${objective.id}`;

// Unlike an ordinary draft, these IDs must survive a reload before any write.
export function readScorecardSave(objective, storage = window.sessionStorage) {
  const text = storage.getItem(storageKey(objective));
  const value = text ? JSON.parse(text) : null;
  if (value && (value.version !== 1 || value.objective?.id !== objective.id || value.objective?.scope !== objective.scope
    || typeof value.draft?.retro !== 'string' || typeof value.draft?.change !== 'string' || !value.requests || !value.done || !value.uncertain
    || ['journal', 'link', 'archive'].some(step => typeof value.done[step] !== 'boolean'))) throw new Error('invalid-scorecard-recovery');
  return value;
}
export function writeScorecardSave(objective, value, storage = window.sessionStorage) {
  storage.setItem(storageKey(objective), JSON.stringify(value));
}

export function buildScorecardSave({ objective, draft, body, retroRequired = false }, { makeId = () => crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  if (retroRequired && !draft.retro.trim()) return { state: 'error', message: '지키는 약속을 어긴 달은 회고를 먼저 적어야 합니다.' };
  if (!['personal', 'company'].includes(objective.scope)) return { state: 'error', message: '목표 소속을 확인한 뒤 다시 저장하세요.' };
  const journal = draft.retro.trim() ? { action: 'save', requestId: makeId(), entryId: makeId(), expectedRevision: 0,
    body, title: `${objective.title} · 채점 회고`, occurredAt: now(), noteMeta: { kind: 'decision', enhancement: '', scope: objective.scope }, contexts: [] } : null;
  return { version: 1, objective: { id: objective.id, scope: objective.scope }, draft: { ...draft },
    requests: { journal, link: null, archive: null }, done: { journal: !journal, link: !journal || objective.scope !== 'personal', archive: false },
    uncertain: {}, state: 'idle', step: journal ? 'journal' : 'archive', message: '' };
}

export function scorecardSaveMessage(state) {
  const completed = state.requests.journal && state.done.journal ? `회고 메모는 저장됐습니다.${state.requests.link && state.done.link ? ' 목표 연결도 완료됐습니다.' : ''} ` : '';
  if (state.state === 'saved') return '채점을 저장했습니다.';
  if (state.state === 'saving') return `${STEP_LABEL[state.step]} 저장 중…`;
  if (state.state === 'unknown') return `${completed}${STEP_LABEL[state.step]} 저장 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요. 회고는 유지됩니다.`;
  if (state.state === 'conflict') return `${completed}다른 변경이 먼저 저장됐습니다. 목표를 다시 확인하고 남은 단계만 저장하세요. 회고는 유지됩니다.`;
  return `${completed}${state.message || goalWriteErrorMessage(state.error)} 회고는 유지됩니다.`;
}

export async function readScorecardObjective(objective, fetchImpl = fetch) {
  const response = await fetchImpl(`/api/hub/goals?objectiveId=${encodeURIComponent(objective.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => null);
  const row = data?.objectives?.find(item => item.id === objective.id);
  if (!['live', 'partial'].includes(goalReadState(response, data)) || !row || row.scope !== objective.scope || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('goal-read-unavailable');
  return row;
}

// Journal and goal RPCs each commit a receipt with their own mutation. This
// coordinator preserves their IDs and acknowledgements; it is not one DB transaction.
export function createScorecardSaver({ get, persist, update = () => {}, isCurrent = () => true,
  fetchImpl = fetch, readObjective = objective => readScorecardObjective(objective, fetchImpl),
  makeId = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  let inFlight = null;
  const publish = state => { if (isCurrent()) update(state); };
  function checkpoint(state) { persist(state); publish(state); return state; }
  function failed(state, patch) { return checkpoint({ ...state, ...patch, message: patch.message || '' }); }
  async function perform(input) {
    let state;
    try {
      state = get() || buildScorecardSave(input, { makeId, now });
      if (!state.version) { publish(state); return state; }
      if (state.objective.id !== input.objective.id || state.objective.scope !== input.objective.scope) throw new Error('wrong-scorecard');
      if (!isCurrent()) return { state: 'stale' };
      if (state.state === 'saved') { publish(state); return state; }
      state = checkpoint({ ...state, state: 'saving', message: '' });
      for (const step of ['journal', 'link', 'archive']) {
        if (!isCurrent()) return { state: 'stale' };
        if (state.done[step]) continue;
        state = checkpoint({ ...state, step, state: 'saving' });
        let request = state.requests[step];
        if (!request) {
          const objective = await readObjective(state.objective);
          if (!isCurrent()) return { state: 'stale' };
          // Only change the lifecycle field; a newer title/description must survive.
          if (objective.status !== 'active') return failed(state, { state: 'conflict', message: '목표가 이미 보관됐습니다. 현재 목표와 저장된 회고를 확인하세요.' });
          request = { commandId: makeId(), expectedRevision: objective.revision,
            action: step === 'link' ? 'link_entity' : 'update_objective',
            input: step === 'link' ? { objectiveId: objective.id, entityType: 'journal_entries', entityId: state.requests.journal.entryId } : { id: objective.id, status: 'archived' } };
          state = checkpoint({ ...state, requests: { ...state.requests, [step]: request } });
        }
        // Store an uncertain outcome before sending. Reloads and lost responses
        // replay the exact payload, even if saving an acknowledgement later fails.
        const previouslyUncertain = Boolean(state.uncertain[step]);
        state = checkpoint({ ...state, uncertain: { ...state.uncertain, [step]: true } });
        let result;
        if (step === 'journal') {
          const response = await fetchImpl('/api/hub/journal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(20000) });
          const data = await response.json().catch(() => null);
          result = ['saved', 'duplicate'].includes(data?.status) && response.ok && isJournalEntry(data.entry, request.entryId) && data.entry.noteMeta?.scope === state.objective.scope
            ? { state: 'saved' }
            : { state: data?.status === 'conflict' ? 'conflict' : ['invalid-input', 'forbidden', 'unauthorized', 'payload-too-large'].includes(data?.status) && !previouslyUncertain ? 'error' : 'unknown', error: data?.error };
        } else {
          const client = createGoalCommandClient({ fetchImpl, pending: previouslyUncertain ? request : null, makeId: () => request.commandId });
          result = previouslyUncertain ? await client.retry() : await client.submit(request.action, request.input, request.expectedRevision);
          const matches = result.commandId === request.commandId && Number.isSafeInteger(result.entity?.revision) && result.entity.revision > request.expectedRevision
            && (step === 'link' ? result.entity.objectiveId === state.objective.id && result.entity.entityId === state.requests.journal.entryId && result.entity.entityType === 'journal_entries' && result.entity.linked === true
              : result.entity.id === state.objective.id && result.entity.status === 'archived');
          if ((result.state === 'saved' && !matches) || result.error === 'command-id-reused') result = { state: 'unknown' };
        }
        if (!isCurrent()) return { state: 'stale' };
        if (result.state !== 'saved') {
          const definitive = ['conflict', 'error'].includes(result.state);
          // A rejected goal command may be rebuilt after re-reading its revision.
          // A journal request/entry ID is never replaced in this logical save.
          return failed(state, { state: result.state, error: result.error,
            requests: definitive && step !== 'journal' ? { ...state.requests, [step]: null } : state.requests,
            uncertain: { ...state.uncertain, [step]: !definitive } });
        }
        state = checkpoint({ ...state, done: { ...state.done, [step]: true }, uncertain: { ...state.uncertain, [step]: false } });
      }
      return checkpoint({ ...state, state: 'saved', message: '' });
    } catch {
      const result = { ...(state || {}), state: state?.uncertain?.[state.step] ? 'unknown' : 'error',
        message: state?.uncertain?.[state.step] ? '' : '복구 기록이나 목표 상태를 확인하지 못했습니다. 입력을 복사하고 브라우저 저장 공간·연결을 확인하세요.' };
      publish(result);
      return result;
    }
  }
  return { run(input) {
    if (inFlight) return inFlight;
    inFlight = perform(input).finally(() => { inFlight = null; });
    return inFlight;
  } };
}
