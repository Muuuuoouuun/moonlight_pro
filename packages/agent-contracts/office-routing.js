import { OFFICE_IDS, OFFICE_SCOPES, OfficeInputError } from './office.js';

export const OFFICE_ROUTING_VERSION = '2026-09-24.v1';

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function check(condition, message) {
  if (!condition) throw new OfficeInputError(message);
}
function exactKeys(value, expected) {
  check(record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), '담당 추천 형식을 확인해 주세요.');
}
function boundedText(value, max, message) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, message);
  return value.trim();
}

export function parseOfficeRoutingRequest(value) {
  exactKeys(value, ['message', 'scope']);
  check(OFFICE_SCOPES.includes(value.scope), '지원하지 않는 업무 범위입니다.');
  return { message: boundedText(value.message, 6000, '안건 길이를 확인해 주세요.'), scope: value.scope };
}

export function parseOfficeRoutingRecommendation(value, request) {
  exactKeys(value, ['ownerId', 'reviewerIds', 'reason', 'scope']);
  check(OFFICE_IDS.includes(value.ownerId), '등록되지 않은 Office 담당입니다.');
  check(Array.isArray(value.reviewerIds) && value.reviewerIds.length <= 2 && new Set(value.reviewerIds).size === value.reviewerIds.length && value.reviewerIds.every(id => OFFICE_IDS.includes(id) && id !== value.ownerId), '검토 관점은 담당 외 최대 두 명입니다.');
  check(value.scope === request.scope && OFFICE_SCOPES.includes(value.scope), '업무 범위가 일치하지 않습니다.');
  return { ownerId: value.ownerId, reviewerIds: [...value.reviewerIds], reason: boundedText(value.reason, 400, '추천 이유를 확인해 주세요.'), scope: value.scope };
}

export function parseOfficeRoutingResult(value, request) {
  exactKeys(value, ['status', 'version', 'ownerId', 'reviewerIds', 'reason', 'scope']);
  check(value.status === 'recommended' && value.version === OFFICE_ROUTING_VERSION, '담당 추천 계약 버전이 일치하지 않습니다.');
  return { status: 'recommended', version: OFFICE_ROUTING_VERSION, ...parseOfficeRoutingRecommendation({ ownerId: value.ownerId, reviewerIds: value.reviewerIds, reason: value.reason, scope: value.scope }, request) };
}
