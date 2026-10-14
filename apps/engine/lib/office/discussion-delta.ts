import type { OfficeDiscussionTurn, OfficeId } from '@com-moon/agent-contracts/office';

const contentFields = ['position', 'evidence', 'objection', 'revisionCondition'] as const;
const invalid = () => { throw new Error('invalid-discussion-delta'); };

// Private compact response format only. Public turns always contain full text.
export function officeDiscussionDeltaSchema(content: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(contentFields.map(field => [field, {
    anyOf: [{ type: 'null' }, content[field]],
    description: '본인의 첫 의견에서 이 필드가 그대로 유지되면 null. 달라졌을 때만 새 값 전체를 쓴다. objection의 빈 문자열과 evidence의 빈 배열은 명시적 삭제다.',
  }]));
}

// The base is selected by the server's role identity, never an output selector.
// Keep unknown output keys so the existing public parser can reject them.
export function readOfficeDiscussionDelta(raw: Record<string, unknown>, ownerId: OfficeId, positions: readonly OfficeDiscussionTurn[]) {
  const own = positions.filter(turn => turn.ownerId === ownerId && turn.round === 'position');
  if (own.length !== 1) return invalid();
  const initial = own[0];
  const result = { ...raw };
  for (const field of contentFields) {
    if (!Object.hasOwn(raw, field)) return invalid();
    const value = raw[field] === null ? initial[field] : raw[field];
    result[field] = Array.isArray(value) ? [...value] : value;
  }
  // Compare the text that the public parser will expose (it trims strings).
  // This only rejects an unobservable change; it does not certify its meaning.
  const normalized = (value: unknown): unknown => typeof value === 'string' ? value.trim()
    : Array.isArray(value) ? value.map(item => typeof item === 'string' ? item.trim() : item) : value;
  if (raw.changed === true && contentFields.every(field => JSON.stringify(normalized(result[field])) === JSON.stringify(initial[field]))) return invalid();
  return result;
}
