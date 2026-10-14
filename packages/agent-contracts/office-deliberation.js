import { OFFICE_IDS, OfficeInputError } from './office.js';

export const OFFICE_DISCUSSION_VERSION = '2026-10-04.v2';
export const OFFICE_DISCUSSION_LEGACY_VERSION = '2026-09-22.v1';
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

export function officeDiscussionReviewTargets(participants) {
  check(Array.isArray(participants) && participants.length >= 2 && participants.length <= 3 && participants.every(id => OFFICE_IDS.includes(id)) && new Set(participants).size === participants.length, '토론 참여자를 확인해 주세요.');
  return Object.fromEntries(participants.map((id, index) => [id, participants[(index + 1) % participants.length]]));
}

export function parseOfficeDiscussionTurn(turn, { ownerId, round, participants, version = OFFICE_DISCUSSION_VERSION, positions = [] }) {
  check([OFFICE_DISCUSSION_VERSION, OFFICE_DISCUSSION_LEGACY_VERSION].includes(version), '토론 기록 버전이 일치하지 않습니다.');
  const current = version === OFFICE_DISCUSSION_VERSION;
  check(['position', 'response'].includes(round) && OFFICE_IDS.includes(ownerId) && Array.isArray(participants) && participants.length >= 2 && participants.length <= 3 && participants.every(id => OFFICE_IDS.includes(id)) && new Set(participants).size === participants.length, '토론의 참여자와 단계를 확인해 주세요.');
  keys(turn, ['ownerId', 'round', 'position', 'evidence', 'objection', 'revisionCondition', 'changed', 'replyTo', 'changeReason', ...(current ? ['turnRef', 'peerReviews', 'sourceCheck', 'sourceCounts'] : [])]);
  check(turn.ownerId === ownerId && turn.round === round && participants.includes(ownerId), '참여자 또는 토론 순서가 일치하지 않습니다.');
  check(Array.isArray(turn.evidence) && turn.evidence.length <= 2, '토론 근거는 최대 두 항목입니다.');
  check(typeof turn.changed === 'boolean' && Array.isArray(turn.replyTo) && new Set(turn.replyTo).size === turn.replyTo.length && turn.replyTo.every(id => id !== ownerId && participants.includes(id)), '토론의 답변 대상을 확인해 주세요.');
  check(round !== 'position' || (!turn.changed && turn.replyTo.length === 0), '첫 의견은 다른 관점을 미리 읽은 것으로 기록할 수 없습니다.');
  check(round !== 'response' || turn.replyTo.length >= 1, '재검토는 실제 참여 관점에 답해야 합니다.');
  const changeReason = text(turn.changeReason, 400, round === 'position');
  const result = { ownerId, round, position: text(turn.position, 600), evidence: turn.evidence.map(item => text(item, 300)), objection: text(turn.objection, 400, true), revisionCondition: text(turn.revisionCondition, 300), changed: turn.changed, replyTo: [...turn.replyTo], changeReason };
  if (!current) return result;
  check(round !== 'position' || changeReason === '', '첫 의견에는 수정 이유를 붙일 수 없습니다.');
  check(turn.turnRef === `${round}:${ownerId}`, '발언 참조가 일치하지 않습니다.');
  keys(turn.sourceCounts, ['selected', 'traced', 'untraced']);
  const sourceCounts = Object.fromEntries(['selected', 'traced', 'untraced'].map(key => {
    const count = turn.sourceCounts[key];
    check(Number.isInteger(count) && count >= 0 && count <= 5, '출처 추적 수를 확인해 주세요.');
    return [key, count];
  }));
  check(sourceCounts.selected === sourceCounts.traced + sourceCounts.untraced, '출처 추적 수가 일치하지 않습니다.');
  const sourceCheck = sourceCounts.selected === 0 ? 'none' : sourceCounts.traced ? 'traced' : 'untraced';
  check(turn.sourceCheck === sourceCheck, '출처 추적 상태가 일치하지 않습니다.');
  check(Array.isArray(turn.peerReviews) && turn.peerReviews.length <= 2 && (round === 'response' ? turn.peerReviews.length >= 1 : turn.peerReviews.length === 0), '동료 검토 기록을 확인해 주세요.');
  const peerReviews = turn.peerReviews.map(review => {
    keys(review, ['ownerId', 'field', 'quote', 'assessment', 'reason']);
    check(review.ownerId !== ownerId && participants.includes(review.ownerId) && ['position', 'objection', 'revisionCondition'].includes(review.field) && ['supports', 'challenges', 'needs_evidence'].includes(review.assessment), '동료 검토 대상을 확인해 주세요.');
    const quote = text(review.quote, 400);
    const target = positions.find(position => position.ownerId === review.ownerId && position.round === 'position');
    check(target && typeof target[review.field] === 'string' && target[review.field].includes(quote), '동료 검토 인용이 첫 의견에 없습니다.');
    return { ownerId: review.ownerId, field: review.field, quote, assessment: review.assessment, reason: text(review.reason, 400) };
  });
  const reviewed = peerReviews.map(review => review.ownerId);
  check(new Set(reviewed).size === reviewed.length && JSON.stringify(turn.replyTo) === JSON.stringify(reviewed), '답한 관점과 동료 검토가 일치하지 않습니다.');
  check(round !== 'response' || reviewed.includes(officeDiscussionReviewTargets(participants)[ownerId]), '배정된 동료 관점을 검토해 주세요.');
  return { ...result, turnRef: turn.turnRef, peerReviews, sourceCheck, sourceCounts };
}

export function parseOfficeDiscussionResolutions(value, turns) {
  const objections = turns.filter(turn => turn.objection).map(turn => turn.turnRef);
  check(Array.isArray(value) && value.length === objections.length, '모든 반론의 처리 기록이 필요합니다.');
  const seen = new Set();
  return value.map(item => {
    keys(item, ['turnRef', 'disposition', 'rationale']);
    check(objections.includes(item.turnRef) && !seen.has(item.turnRef) && ['addressed', 'open', 'not_applicable'].includes(item.disposition), '반론 처리 참조를 확인해 주세요.');
    seen.add(item.turnRef);
    return { turnRef: item.turnRef, disposition: item.disposition, rationale: text(item.rationale, 400) };
  });
}

export function parseOfficeDiscussion(value, request) {
  check(request.mode === 'council', '개별 답변에 회의 기록을 붙일 수 없습니다.');
  check(Array.isArray(request.participants) && request.participants.length >= 2 && request.participants.length <= 3 && request.participants.includes(request.ownerId), '주관을 포함한 두세 명의 참여자가 필요합니다.');
  const current = value?.version === OFFICE_DISCUSSION_VERSION;
  keys(value, ['version', 'settings', 'turns', 'modelCalls', ...(current ? ['resolutions', 'artifactReviewCalls'] : [])]);
  check([OFFICE_DISCUSSION_VERSION, OFFICE_DISCUSSION_LEGACY_VERSION].includes(value.version), '토론 기록 버전이 일치하지 않습니다.');
  const settings = parseOfficeDeliberation(value.settings, request.participants);
  const expected = parseOfficeDeliberation(request.deliberation, request.participants);
  check(JSON.stringify(settings) === JSON.stringify(expected), '요청한 토론 설정과 결과가 일치하지 않습니다.');
  const rounds = officeDiscussionRounds(settings), count = request.participants.length;
  const hasArtifactReview = Object.hasOwn(value, 'artifactReviewCalls');
  // Optional server accounting for one review of the assembled answer. This is
  // neither another participant turn nor an independent quality certificate.
  check(!hasArtifactReview || current && value.artifactReviewCalls === 1, '최종 답안 검토 호출 기록을 확인해 주세요.');
  check(Array.isArray(value.turns) && value.turns.length === count * rounds && value.modelCalls === count * rounds + 1 + (hasArtifactReview ? 1 : 0), '토론 호출 기록이 완전하지 않습니다.');
  const turns = [];
  for (const [index, turn] of value.turns.entries()) {
    const round = index < count ? 'position' : 'response';
    turns.push(parseOfficeDiscussionTurn(turn, { ownerId: request.participants[index % count], round, participants: request.participants, version: value.version, positions: turns.slice(0, count) }));
  }
  const result = { version: value.version, settings, turns, modelCalls: value.modelCalls, ...(current ? { resolutions: parseOfficeDiscussionResolutions(value.resolutions, turns) } : {}), ...(hasArtifactReview ? { artifactReviewCalls: 1 } : {}) };
  check(new TextEncoder().encode(JSON.stringify(result)).byteLength <= (current ? 24000 : 18000), '토론 기록이 너무 깁니다.');
  return result;
}

// Observable structure only. Source matching, coverage and declared resolutions are not quality scores.
export function evaluateOfficeDiscussion(value, request) {
  const discussion = parseOfficeDiscussion(value, request);
  const current = discussion.version === OFFICE_DISCUSSION_VERSION;
  const reviews = discussion.turns.flatMap(turn => turn.peerReviews || []);
  const reviewedRoleIds = current ? request.participants.filter(id => reviews.some(review => review.ownerId === id)) : [];
  const source = Object.fromEntries(['selected', 'traced', 'untraced'].map(key => [key, current ? discussion.turns.reduce((sum, turn) => sum + turn.sourceCounts[key], 0) : null]));
  const countResolution = disposition => current ? discussion.resolutions.filter(item => item.disposition === disposition).length : null;
  return { kind: 'structural-only', version: discussion.version, participants: request.participants.length, rounds: officeDiscussionRounds(discussion.settings), turns: discussion.turns.length, modelCalls: discussion.modelCalls,
    ...(Object.hasOwn(discussion, 'artifactReviewCalls') ? { artifactReviewCalls: 1 } : {}),
    reviewRequired: officeDiscussionRounds(discussion.settings) === 2, peerReviews: current ? reviews.length : null, reviewedRoleIds, unreviewedRoleIds: request.participants.filter(id => !reviewedRoleIds.includes(id)),
    changedPositions: discussion.turns.filter(turn => turn.changed).length,
    source: { ...source, untrackedTurns: current ? 0 : discussion.turns.length },
    objections: { total: discussion.turns.filter(turn => turn.objection).length, addressed: countResolution('addressed'), open: countResolution('open'), notApplicable: countResolution('not_applicable') },
  };
}
