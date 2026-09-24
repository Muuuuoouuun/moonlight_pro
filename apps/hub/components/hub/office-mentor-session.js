import { buildOfficeMentorQuestion, buildOfficeMentorRequest, OFFICE_MENTOR_FIRST_QUESTION } from './office-mentor-client.js';

// Intentionally in memory only. Reopening the drawer in this browser session
// keeps the conversation, but a reload or a new browser session does not restore it.
export function createOfficeMentorSessionStore() {
  const sessions = new Map();
  const listeners = new Set();
  const get = id => sessions.get(id) || null;
  const update = (id, patch) => {
    const current = get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    sessions.set(id, next);
    for (const listener of listeners) listener();
    return next;
  };

  return {
    get,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    open({ result, officeSource, scope = result?.scope, lane = null, ref = null, initialAdvice = null }) {
      // The same source identity owns one conversation, so reopening cannot
      // accidentally reset a drafted follow-up or change the chosen mentor.
      buildOfficeMentorQuestion({ result, officeSource });
      if (!['all', 'personal', 'classin'].includes(scope) || result.scope !== scope) throw new Error('office-scope-mismatch');
      const id = officeSource.requestId;
      if (sessions.has(id)) {
        if (get(id).scope !== scope) throw new Error('office-session-conflict');
        return id;
      }
      const selectedLane = scope === 'all' ? (['personal', 'classin'].includes(lane) ? lane : null) : scope;
      if (scope === 'all' && initialAdvice?.status === 'generated' && !selectedLane) throw new Error('lane-required');
      const first = initialAdvice?.status === 'generated' && typeof initialAdvice.text === 'string' && initialAdvice.text.trim()
        ? [{ id: 'initial', question: OFFICE_MENTOR_FIRST_QUESTION, answer: initialAdvice.text.trim(), mentorRunId: initialAdvice.mentorRunId || null }]
        : [];
      sessions.set(id, { id, result, officeSource: { requestId: id, runId: officeSource.runId ?? null }, scope,
        lane: selectedLane, ref: typeof ref === 'string' && ref.trim() ? ref.trim() : null,
        draft: '', turns: first, pending: null, error: null });
      for (const listener of listeners) listener();
      return id;
    },
    chooseLane(id, lane) {
      const session = get(id);
      if (!session || session.scope !== 'all' || session.pending || session.turns.length || !['personal', 'classin'].includes(lane)) return false;
      update(id, { lane, error: null });
      return true;
    },
    setDraft(id, draft) {
      if (typeof draft !== 'string') return null;
      return update(id, { draft, error: null });
    },
    begin(id, requestId) {
      const session = get(id);
      if (!session || session.pending) return null;
      if (session.scope === 'all' && !session.lane) {
        update(id, { error: { status: 'error', code: 'lane-required', note: '회사 또는 개인 멘토를 먼저 골라 주세요.' } });
        return null;
      }
      const question = session.turns.length ? session.draft.trim() : session.draft.trim() || OFFICE_MENTOR_FIRST_QUESTION;
      let request;
      try {
        request = buildOfficeMentorRequest({ result: session.result, officeSource: session.officeSource,
          scope: session.scope, lane: session.lane, ref: session.ref, question, turns: session.turns });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'invalid-question';
        update(id, { error: { status: 'error', code, note: code === 'question-too-long' ? '질문을 1,200자 안으로 줄여 주세요.' : '질문을 확인해 주세요.' } });
        return null;
      }
      const pending = { id: requestId, question, rawDraft: session.draft, request };
      update(id, { pending, error: null });
      return pending;
    },
    complete(id, requestId, response) {
      const session = get(id);
      if (!session || session.pending?.id !== requestId) return false;
      const pending = session.pending;
      if (response?.status === 'generated' && typeof response.text === 'string' && response.text.trim()) {
        update(id, { pending: null, error: null,
          draft: session.draft === pending.rawDraft ? '' : session.draft,
          turns: [...session.turns, { id: requestId, question: pending.question, answer: response.text.trim(), mentorRunId: response.mentorRunId || null }],
        });
      } else {
        update(id, { pending: null, error: response?.status === 'preview' || response?.status === 'error'
          ? response : { status: 'error', note: '멘토 답변을 확인하지 못했습니다.' } });
      }
      return true;
    },
    hasUnsentDrafts() { return [...sessions.values()].some(session => session.draft.trim()); },
  };
}

export const officeMentorSessions = createOfficeMentorSessionStore();
