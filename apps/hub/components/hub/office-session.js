// Drafts and pending freeform requests live only in the mounted Hub session.
// They are deliberately never serialized to localStorage or sent across scopes.
import { officeHistory } from './office-client.js';
import { officeDeliberationForParticipants } from './office-deliberation-client.js';

export const OFFICE_MINIMUM_INSTRUCTION = '[오늘은 최소한만: 이미 정한 약속을 지키는 데 필요한 내용만 남겨 주세요. 추가 과제가 필요 없으면 추가 행동 없음으로 답해 주세요.]\n\n';

function blankSession() {
  return { ownerId: 'eevee', mode: 'chat', reviewers: ['umbreon'], includeProjects: false,
    minimumOnly: false, presetId: null, deliberation: officeDeliberationForParticipants(undefined, ['eevee', 'umbreon']), draft: '', turns: [], pending: null, error: null };
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
    next.deliberation = officeDeliberationForParticipants(next.deliberation, [next.ownerId, ...next.reviewers.filter(id => id !== next.ownerId)]);
    sessions.set(scope, next);
    for (const listener of listeners) listener();
    return get(scope);
  };
  return {
    get, update,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsentDrafts() { return [...sessions.values()].some(session => session.draft.trim()); },
    begin(scope, requestId) {
      const session = get(scope);
      if (session.pending || !session.draft.trim()) return null;
      const request = {
        ownerId: session.ownerId, mode: session.mode, scope, lens: null,
        message: (session.minimumOnly ? OFFICE_MINIMUM_INSTRUCTION : '') + session.draft.trim(),
        participants: session.mode === 'council' ? [session.ownerId, ...session.reviewers.filter(id => id !== session.ownerId)] : [],
        history: officeHistory(session.turns), includeProjects: session.includeProjects,
      };
      if (request.message.length > 6000 || (request.mode === 'council' && request.participants.length < 2)) return null;
      if (request.mode === 'council') request.deliberation = officeDeliberationForParticipants(session.deliberation, request.participants);
      const pending = { id: requestId, rawDraft: session.draft, request };
      update(scope, { pending, error: null });
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
