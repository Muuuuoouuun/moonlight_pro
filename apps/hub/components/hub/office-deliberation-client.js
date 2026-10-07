import { parseOfficeDeliberation, parseOfficeDiscussion, evaluateOfficeDiscussion } from '@com-moon/agent-contracts/office';

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
    const discussion = parseOfficeDiscussion(result.discussion, expected);
    return { state: 'current', discussion, evaluation: evaluateOfficeDiscussion(discussion, expected) };
  } catch { return { state: 'invalid', discussion: null }; }
}

// The synthesis prose can omit an objection that is still explicitly open in
// the structured record. Keep it visible and include it in requested reviews.
export function officeRemainingDissent(result, discussion = officeDiscussionState(result).discussion) {
  const open = (discussion?.resolutions || []).filter(item => item.disposition === 'open')
    .map(item => discussion.turns.find(turn => turn.turnRef === item.turnRef).objection);
  return [...new Set([...(result?.dissent || []), ...open])];
}
