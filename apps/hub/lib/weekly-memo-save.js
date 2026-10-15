import { createGoalCommandClient } from './goal-client.js';
import { isJournalEntry } from './journal-client.js';
import { validateJournalInput } from './journal.js';
import { readScorecardObjective } from './scorecard-save.js';
import { isGoalUuid, validateGoalCommand } from '@com-moon/goal-contracts';

const keyFor = (objective, week) => `moonlight.weekly-memo-save.v1:${objective.scope}:${objective.id}:${week}`;
export function readWeeklyMemoSave(objective, week, storage = window.sessionStorage) {
  const raw = storage.getItem(keyFor(objective, week));
  const value = raw ? JSON.parse(raw) : null;
  if (value && (value.version !== 1 || value.objective?.id !== objective.id || value.objective?.scope !== objective.scope
    || value.week !== week || !validateJournalInput(value.requests?.journal).ok
    || value.requests.journal.noteMeta?.scope !== objective.scope || value.requests.journal.noteMeta?.kind !== 'learning'
    || !value.done || !value.uncertain || typeof value.done.journal !== 'boolean' || typeof value.done.link !== 'boolean'
    || !['idle', 'saving', 'saved', 'unknown', 'conflict', 'error'].includes(value.state)
    || (value.done.link && (!value.done.journal || !value.requests.link)) || (value.state === 'saved' && !value.done.link)
    || (value.requests.link && (!validateGoalCommand(value.requests.link).ok || value.requests.link.action !== 'link_entity'
      || value.requests.link.input.objectiveId !== objective.id || value.requests.link.input.entityType !== 'journal_entries'
      || value.requests.link.input.entityId !== value.requests.journal.entryId)))) throw new Error('invalid-weekly-memo-recovery');
  return value;
}
export function writeWeeklyMemoSave(objective, week, value, storage = window.sessionStorage) {
  if (value === null) storage.removeItem(keyFor(objective, week));
  else storage.setItem(keyFor(objective, week), JSON.stringify(value));
}

function buildSave({ objective, week, body, weekLabel }, makeId, now) {
  if (!isGoalUuid(objective?.id) || objective.scope !== 'personal' || typeof objective.title !== 'string'
    || !objective.title.trim() || objective.title.length > 300 || typeof body !== 'string' || !body.trim()) return null;
  const suffix = ` · ${weekLabel || '이번 주'} 메모`;
  let title = objective.title;
  if (title.length + suffix.length > 200) {
    title = '';
    for (const { segment } of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(objective.title)) {
      if (title.length + segment.length + suffix.length + 1 > 200) break;
      title += segment;
    }
    title += '…';
  }
  const journal = { action: 'save', requestId: makeId(), entryId: makeId(), expectedRevision: 0,
    title: title + suffix, body: body.trim(), occurredAt: now(), noteMeta: { kind: 'learning', enhancement: '', scope: objective.scope }, contexts: [] };
  if (!validateJournalInput(journal).ok) return null;
  return { version: 1, objective: { id: objective.id, scope: objective.scope }, week,
    requests: { journal, link: null }, done: { journal: false, link: false }, uncertain: {}, step: 'journal', state: 'idle' };
}

export function weeklyMemoSaveMessage(value) {
  if (value.state === 'saved') return '메모를 저장하고 목표에 연결했습니다.';
  const saved = value.done?.journal ? '메모는 저장됐습니다. ' : '';
  if (value.state === 'saving') return `${saved}${value.step === 'link' ? '목표 연결' : '메모'} 저장 중…`;
  if (value.state === 'unknown') return `${saved}저장 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요. 입력은 유지됩니다.`;
  if (value.state === 'conflict') return `${saved}목표 상태가 바뀌었습니다. 다시 확인하면 남은 연결만 저장합니다. 입력은 유지됩니다.`;
  return `${saved}${value.message || '입력·목표 상태·브라우저 저장 공간을 확인해 주세요. 입력은 유지됩니다.'}`;
}

// Existing weekly capture has two independently receipted writes. A reload or
// lost acknowledgement replays their stored payloads; it never creates a second note.
export function createWeeklyMemoSaver({ get, persist, update = () => {}, isCurrent = () => true,
  fetchImpl = fetch, readObjective = objective => readScorecardObjective(objective, fetchImpl),
  makeId = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  let inFlight = null;
  const publish = value => { if (isCurrent()) update(value); };
  const checkpoint = value => { persist(value); publish(value); return value; };
  async function perform(input) {
    let state;
    try {
      state = get() || buildSave(input, makeId, now);
      if (!state) { const result = { state: 'error', message: '목표와 메모 입력을 확인해 주세요. 입력은 유지됩니다.' }; publish(result); return result; }
      if (state.objective.id !== input.objective.id || state.objective.scope !== input.objective.scope || state.week !== input.week) throw new Error('wrong-weekly-memo');
      if (!isCurrent()) return { state: 'stale' };
      if (state.state === 'saved') { publish(state); return state; }
      state = checkpoint({ ...state, state: 'saving', message: '' });
      for (const step of ['journal', 'link']) {
        if (!isCurrent()) return { state: 'stale' };
        if (state.done[step]) continue;
        state = checkpoint({ ...state, step, state: 'saving' });
        let request = state.requests[step];
        if (!request) {
          const objective = await readObjective(state.objective);
          if (!isCurrent()) return { state: 'stale' };
          if (objective.status !== 'active') return checkpoint({ ...state, state: 'conflict' });
          request = { commandId: makeId(), expectedRevision: objective.revision, action: 'link_entity',
            input: { objectiveId: objective.id, entityType: 'journal_entries', entityId: state.requests.journal.entryId } };
          if (objective.id !== state.objective.id || objective.scope !== state.objective.scope || !validateGoalCommand(request).ok) throw new Error('invalid-link');
          state = checkpoint({ ...state, requests: { ...state.requests, [step]: request } });
        }
        const previouslyUncertain = Boolean(state.uncertain[step]);
        state = checkpoint({ ...state, uncertain: { ...state.uncertain, [step]: true } });
        let result;
        if (step === 'journal') {
          const response = await fetchImpl('/api/hub/journal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(20000) });
          const data = await response.json().catch(() => null);
          const matches = isJournalEntry(data?.entry, request.entryId) && data.entry.body === request.body
            && data.entry.title === request.title && Date.parse(data.entry.occurredAt) === Date.parse(request.occurredAt)
            && data.entry.noteMeta?.kind === 'learning' && data.entry.noteMeta?.scope === state.objective.scope;
          result = response.ok && ['saved', 'duplicate'].includes(data?.status) && matches ? { state: 'saved' }
            : { state: !previouslyUncertain && ['invalid-input', 'forbidden', 'unauthorized', 'payload-too-large'].includes(data?.status) ? 'error' : 'unknown' };
        } else {
          const client = createGoalCommandClient({ fetchImpl, pending: previouslyUncertain ? request : null, makeId: () => request.commandId });
          result = previouslyUncertain ? await client.retry() : await client.submit(request.action, request.input, request.expectedRevision);
          const matches = result.commandId === request.commandId && Number.isSafeInteger(result.entity?.revision) && result.entity.revision > request.expectedRevision
            && result.entity.objectiveId === state.objective.id && result.entity.entityId === state.requests.journal.entryId
            && result.entity.entityType === 'journal_entries' && result.entity.linked === true;
          if ((result.state === 'saved' && !matches) || result.error === 'command-id-reused') result = { state: 'unknown' };
        }
        if (!isCurrent()) return { state: 'stale' };
        if (result.state !== 'saved') {
          const definitive = ['error', 'conflict'].includes(result.state);
          return checkpoint({ ...state, state: result.state, uncertain: { ...state.uncertain, [step]: !definitive },
            requests: definitive && step === 'link' ? { ...state.requests, link: null } : state.requests });
        }
        state = checkpoint({ ...state, done: { ...state.done, [step]: true }, uncertain: { ...state.uncertain, [step]: false } });
      }
      return checkpoint({ ...state, state: 'saved' });
    } catch {
      const result = { ...(state || {}), state: state?.uncertain?.[state.step] ? 'unknown' : 'error' };
      publish(result); return result;
    }
  }
  return { run(input) {
    if (inFlight) return inFlight;
    inFlight = perform(input).finally(() => { inFlight = null; });
    return inFlight;
  } };
}
