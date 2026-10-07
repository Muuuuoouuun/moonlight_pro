import type { OfficeDiscussionTurn } from '@com-moon/agent-contracts/office';

type SynthesisPrompt = { systemInstruction: string; prompt: string };
type ReferenceIndex = { refs: string[]; eligibleEarlierRefs: Record<string, string[]> };

const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const clone = <T>(value: T): T => structuredClone(value);
const check: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };

function objectionReferenceIndex(turns: readonly OfficeDiscussionTurn[]): ReferenceIndex {
  const objectionTurns = turns.map((turn, index) => ({ turn, index })).filter(({ turn }) => typeof turn.objection === 'string' && turn.objection.trim().length > 0);
  const refs = objectionTurns.map(({ turn }) => turn.turnRef);
  check(refs.every(ref => typeof ref === 'string' && ref.trim().length > 0), 'missing-objection-turn-ref');
  check(new Set(refs).size === refs.length, 'duplicate-objection-turn-ref');

  const eligibleEarlierRefs: Record<string, string[]> = {};
  for (const { turn, index } of objectionTurns) {
    eligibleEarlierRefs[turn.turnRef!] = objectionTurns
      .filter(({ turn: earlier, index: earlierIndex }) => earlierIndex < index && earlier.ownerId === turn.ownerId && earlier.objection === turn.objection)
      .map(({ turn: earlier }) => earlier.turnRef!);
  }
  return { refs: refs as string[], eligibleEarlierRefs };
}

export function compactSynthesisPrompt(prompt: SynthesisPrompt, turns: readonly OfficeDiscussionTurn[]): SynthesisPrompt {
  const references = objectionReferenceIndex(turns);
  const payload = JSON.parse(prompt.prompt);
  check(record(payload), 'invalid-synthesis-prompt');
  const systemInstruction = `${prompt.systemInstruction}\n\n각 resolutionsByTurn 항목은 그 반론의 처리를 따로 판단해 작성한다. resolutionAliases에 허용된 참조를 쓸 수 있는 경우에도 같은 최종 disposition과 rationale이 적절할 때만 사용한다. 판단이 다르면 전체 객체를 작성한다. recommendation=null은 answer 전체가 그대로 추천으로 쓰일 때만 가능하며, answer가 비어 있지 않고 trim 뒤 2000자 이하여야 한다. 서버는 기존 답변을 복사할 뿐 사실이나 합의를 추가하지 않는다.`;
  return {
    systemInstruction,
    prompt: JSON.stringify({ ...payload, resolutionAliases: references.eligibleEarlierRefs }),
  };
}

export function compactSynthesisSchema(schema: Record<string, any>, turns: readonly OfficeDiscussionTurn[]): Record<string, any> {
  const references = objectionReferenceIndex(turns);
  const result = clone(schema);
  const properties = result.properties;
  check(record(properties) && record(properties.recommendation) && record(properties.resolutionsByTurn), 'invalid-synthesis-schema');
  const resolutionProperties = properties.resolutionsByTurn.properties;
  check(record(resolutionProperties), 'invalid-synthesis-resolution-schema');
  check(Object.keys(resolutionProperties).length === references.refs.length && references.refs.every(ref => Object.hasOwn(resolutionProperties, ref)), 'invalid-synthesis-resolution-schema-keys');

  properties.recommendation = { anyOf: [properties.recommendation, { type: 'null' }] };
  for (const ref of references.refs) {
    const earlierRefs = references.eligibleEarlierRefs[ref];
    if (earlierRefs.length === 0) continue;
    check(Object.hasOwn(resolutionProperties, ref), 'missing-synthesis-resolution-schema-key');
    resolutionProperties[ref] = {
      anyOf: [resolutionProperties[ref], { type: 'string', enum: earlierRefs }],
    };
  }
  check(Array.isArray(properties.resolutionsByTurn.required)
    && properties.resolutionsByTurn.required.length === references.refs.length
    && references.refs.every(ref => properties.resolutionsByTurn.required.includes(ref)), 'invalid-required-synthesis-resolution');
  return result;
}

export function expandCompactSynthesis(raw: Record<string, unknown>, turns: readonly OfficeDiscussionTurn[]): Record<string, unknown> {
  const references = objectionReferenceIndex(turns);
  check(record(raw), 'invalid-synthesis-output');
  const result = clone(raw);
  const resolutions = result.resolutionsByTurn;
  check(record(resolutions), 'invalid-synthesis-resolutions');
  check(Object.keys(resolutions).length === references.refs.length && references.refs.every(ref => Object.hasOwn(resolutions, ref)), 'invalid-synthesis-resolution-keys');

  const expandedResolutions: Record<string, unknown> = {};
  for (const ref of references.refs) {
    const value = resolutions[ref];
    if (typeof value !== 'string') {
      expandedResolutions[ref] = value;
      continue;
    }
    check(references.eligibleEarlierRefs[ref].includes(value), 'invalid-synthesis-resolution-reference');
    const source = expandedResolutions[value];
    check(record(source), 'invalid-synthesis-resolution-reference-source');
    expandedResolutions[ref] = clone(source);
  }
  result.resolutionsByTurn = expandedResolutions;

  if (result.recommendation === null) {
    const answer = result.answer;
    check(typeof answer === 'string' && answer.trim().length > 0 && answer.trim().length <= 2000 && !answer.includes('\0'), 'invalid-copied-synthesis-recommendation');
    result.recommendation = answer;
  }
  return result;
}
