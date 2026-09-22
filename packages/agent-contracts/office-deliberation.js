import { OFFICE_IDS, OfficeInputError } from './office.js';

export const OFFICE_DISCUSSION_VERSION = '2026-09-22.v1';
export const OFFICE_DELIBERATION_PROFILES = Object.freeze({
  balanced: Object.freeze({ label: '균형 있게', challenge: 2, depth: 2, warmth: 2, convergence: 2 }),
  urgent: Object.freeze({ label: '빠른 결정', challenge: 1, depth: 1, warmth: 1, convergence: 3 }),
  explore: Object.freeze({ label: '가능성 탐색', challenge: 1, depth: 3, warmth: 2, convergence: 0 }),
  scrutiny: Object.freeze({ label: '엄밀한 검토', challenge: 3, depth: 3, warmth: 1, convergence: 2 }),
});
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
const keys = (value, allowed) => check(plain(value) && Object.keys(value).every(key => allowed.includes(key)), '토론 설정 또는 기록의 필드를 확인해 주세요.');
const text = (value, max, empty = false) => {
  check(typeof value === 'string' && value.length <= max && !value.includes('\0') && (empty || value.trim()), '토론 기록의 문장을 확인해 주세요.');
  return value.trim();
};

export function parseOfficeDeliberation(value = {}, participants = []) {
  keys(value, ['profile', 'challenge', 'depth', 'warmth', 'convergence', 'influence']);
  check(Array.isArray(participants) && participants.every(id => OFFICE_IDS.includes(id)) && new Set(participants).size === participants.length, '토론 참여자를 확인해 주세요.');
  const profile = value.profile === undefined ? 'balanced' : value.profile;
  check(Object.hasOwn(OFFICE_DELIBERATION_PROFILES, profile), '토론 상황을 확인해 주세요.');
  const defaults = OFFICE_DELIBERATION_PROFILES[profile];
  const result = { profile };
  for (const key of ['challenge', 'depth', 'warmth', 'convergence']) {
    const number = value[key] === undefined ? defaults[key] : value[key];
    check(Number.isInteger(number) && number >= (key === 'depth' ? 1 : 0) && number <= 3, '토론 조절값의 범위를 확인해 주세요.');
    result[key] = number;
  }
  const weights = value.influence === undefined ? {} : value.influence;
  keys(weights, participants);
  result.influence = Object.fromEntries(participants.map(id => {
    const weight = weights[id] === undefined ? 1 : weights[id];
    check(Number.isInteger(weight) && weight >= 1 && weight <= 3, '관점 비중은 1~3입니다.');
    return [id, weight];
  }));
  return result;
}

export function officeDiscussionRounds(settings) {
  return settings.depth === 1 || settings.challenge === 0 ? 1 : 2;
}

export function parseOfficeDiscussionTurn(turn, { ownerId, round, participants }) {
  check(['position', 'response'].includes(round) && OFFICE_IDS.includes(ownerId) && Array.isArray(participants) && participants.length >= 2 && participants.length <= 3 && participants.every(id => OFFICE_IDS.includes(id)) && new Set(participants).size === participants.length, '토론의 참여자와 단계를 확인해 주세요.');
  keys(turn, ['ownerId', 'round', 'position', 'evidence', 'objection', 'revisionCondition', 'changed', 'replyTo', 'changeReason']);
  check(turn.ownerId === ownerId && turn.round === round && participants.includes(ownerId), '참여자 또는 토론 순서가 일치하지 않습니다.');
  check(Array.isArray(turn.evidence) && turn.evidence.length <= 2, '토론 근거는 최대 두 항목입니다.');
  check(typeof turn.changed === 'boolean' && Array.isArray(turn.replyTo) && new Set(turn.replyTo).size === turn.replyTo.length && turn.replyTo.every(id => id !== ownerId && participants.includes(id)), '토론의 답변 대상을 확인해 주세요.');
  check(round !== 'position' || (!turn.changed && turn.replyTo.length === 0), '첫 의견은 다른 관점을 미리 읽은 것으로 기록할 수 없습니다.');
  check(round !== 'response' || turn.replyTo.length >= 1, '재검토는 실제 참여 관점에 답해야 합니다.');
  const changeReason = text(turn.changeReason, 400, round === 'position');
  return { ownerId, round, position: text(turn.position, 600), evidence: turn.evidence.map(item => text(item, 300)), objection: text(turn.objection, 400, true), revisionCondition: text(turn.revisionCondition, 300), changed: turn.changed, replyTo: [...turn.replyTo], changeReason };
}

export function parseOfficeDiscussion(value, request) {
  check(request.mode === 'council', '개별 답변에 회의 기록을 붙일 수 없습니다.');
  check(Array.isArray(request.participants) && request.participants.length >= 2 && request.participants.length <= 3 && request.participants.includes(request.ownerId), '주관을 포함한 두세 명의 참여자가 필요합니다.');
  keys(value, ['version', 'settings', 'turns', 'modelCalls']);
  check(value.version === OFFICE_DISCUSSION_VERSION, '토론 기록 버전이 일치하지 않습니다.');
  const settings = parseOfficeDeliberation(value.settings, request.participants);
  const expected = parseOfficeDeliberation(request.deliberation, request.participants);
  check(JSON.stringify(settings) === JSON.stringify(expected), '요청한 토론 설정과 결과가 일치하지 않습니다.');
  const rounds = officeDiscussionRounds(settings), count = request.participants.length;
  check(Array.isArray(value.turns) && value.turns.length === count * rounds && value.modelCalls === count * rounds + 1, '토론 호출 기록이 완전하지 않습니다.');
  const turns = value.turns.map((turn, index) => {
    const round = index < count ? 'position' : 'response';
    return parseOfficeDiscussionTurn(turn, { ownerId: request.participants[index % count], round, participants: request.participants });
  });
  const result = { version: OFFICE_DISCUSSION_VERSION, settings, turns, modelCalls: value.modelCalls };
  check(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 18000, '토론 기록이 너무 깁니다.');
  return result;
}
