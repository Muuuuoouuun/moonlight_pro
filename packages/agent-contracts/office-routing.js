import { OFFICE_IDS, OFFICE_SCOPES, OfficeInputError } from './office.js';

export const OFFICE_ROUTING_VERSION = '2026-10-04.v2';
const LEGACY_ROUTING_VERSION = '2026-09-24.v1';

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

function recommendationFields(value, request) {
  check(OFFICE_IDS.includes(value.ownerId), '등록되지 않은 오피스 담당입니다.');
  check(Array.isArray(value.reviewerIds) && value.reviewerIds.length <= 2 && new Set(value.reviewerIds).size === value.reviewerIds.length && value.reviewerIds.every(id => OFFICE_IDS.includes(id) && id !== value.ownerId), '검토 관점은 담당 외 최대 두 명입니다.');
  check(value.scope === request.scope && OFFICE_SCOPES.includes(value.scope), '업무 범위가 일치하지 않습니다.');
  return { ownerId: value.ownerId, reviewerIds: [...value.reviewerIds], reason: boundedText(value.reason, 400, '추천 이유를 확인해 주세요.'), scope: value.scope };
}

function routingPlan(value, reviewerIds) {
  exactKeys(value, ['ownerDeliverable', 'reviews']);
  const ownerDeliverable = boundedText(value.ownerDeliverable, 300, '주관이 만들 결과물을 확인해 주세요.');
  check(Array.isArray(value.reviews) && value.reviews.length === reviewerIds.length, '검토자마다 맡을 질문 하나가 필요합니다.');
  const reviews = value.reviews.map((review, index) => {
    exactKeys(review, ['reviewerId', 'question']);
    check(review.reviewerId === reviewerIds[index], '검토 질문의 담당과 순서가 일치하지 않습니다.');
    return { reviewerId: review.reviewerId, question: boundedText(review.question, 300, '검토 질문을 확인해 주세요.') };
  });
  const questions = reviews.map(review => review.question.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase());
  check(new Set(questions).size === questions.length, '검토자는 서로 다른 쟁점을 맡아야 합니다.');
  return { ownerDeliverable, reviews };
}

// New model output must carry the functional plan. Legacy support belongs only
// to the versioned result reader below, never to a fresh generation.
export function parseOfficeRoutingRecommendation(value, request) {
  exactKeys(value, ['ownerId', 'reviewerIds', 'reason', 'scope', 'plan']);
  const recommendation = recommendationFields(value, request);
  return { ...recommendation, plan: routingPlan(value.plan, recommendation.reviewerIds) };
}

export function parseOfficeRoutingResult(value, request) {
  check(record(value) && value.status === 'recommended' && [OFFICE_ROUTING_VERSION, LEGACY_ROUTING_VERSION].includes(value.version), '담당 추천 계약 버전이 일치하지 않습니다.');
  const legacy = value.version === LEGACY_ROUTING_VERSION;
  exactKeys(value, ['status', 'version', 'ownerId', 'reviewerIds', 'reason', 'scope', ...(legacy ? [] : ['plan'])]);
  const recommendation = recommendationFields(value, request);
  return { status: 'recommended', version: value.version, ...recommendation, ...(legacy ? {} : { plan: routingPlan(value.plan, recommendation.reviewerIds) }) };
}
