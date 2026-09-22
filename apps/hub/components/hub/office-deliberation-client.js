import { parseOfficeDeliberation, parseOfficeDiscussion } from '@com-moon/agent-contracts/office';

// Changing participants keeps the chosen controls, drops departed weights and
// gives a newly selected perspective the ordinary weight.
export function officeDeliberationForParticipants(value, participants) {
  return parseOfficeDeliberation({ ...value, influence: Object.fromEntries(participants.map(id => [id, value?.influence?.[id] ?? 1])) }, participants);
}

export function officeDiscussionState(result, request) {
  if (result?.mode !== 'council' || result.status !== 'generated') return { state: 'none', discussion: null };
  if (result.discussion === undefined) return { state: request?.deliberation === undefined ? 'legacy' : 'invalid', discussion: null };
  try {
    const expected = request || { ownerId: result.ownerId, mode: result.mode, participants: result.participants, deliberation: result.discussion.settings };
    return { state: 'current', discussion: parseOfficeDiscussion(result.discussion, expected) };
  } catch { return { state: 'invalid', discussion: null }; }
}
