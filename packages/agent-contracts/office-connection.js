import { OFFICE_IDS, OfficeInputError } from './office.js';

export const OFFICE_CONNECTION_VERSION = '2026-10-02.bound-source.v1';
export const OFFICE_CONNECTION_POLICY = Object.freeze({ mode: 'shadow', automaticGeneration: false, providerCalls: 0, persistence: false, executionApproved: false, independentVerification: false });
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
const keys = (x, allowed, required = allowed) => check(plain(x) && Object.keys(x).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(x, k)), '연결 계약의 필드를 확인해 주세요.');
const text = (x, max) => { check(typeof x === 'string' && x.trim() && x.length <= max && !x.includes('\0'), '연결 원문과 길이를 확인해 주세요.'); return x.trim(); };
const ref = x => { const v = text(x, 160); check(/^[a-zA-Z0-9._:-]+$/.test(v), '자료 참조를 확인해 주세요.'); return v; };
const hash = x => { check(typeof x === 'string' && /^[a-f0-9]{64}$/.test(x), '원문 해시를 확인해 주세요.'); return x; };
const integer = (x, min, max) => { check(Number.isInteger(x) && x >= min && x <= max, '자료 버전을 확인해 주세요.'); return x; };
const list = (x, n, size) => { check(Array.isArray(x) && x.length <= n, '연결 목록 한도를 확인해 주세요.'); return x.map(v => text(v, size)); };
export function parseOfficeWorkBoundary(value) {
  keys(value, ['scope', 'brandId']);
  check(['classin', 'personal'].includes(value.scope), '회사·개인 범위를 먼저 선택해 주세요.');
  check(value.brandId === null || typeof value.brandId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.brandId), '선택 브랜드를 확인해 주세요.');
  return { scope: value.scope, brandId: value.brandId === null ? null : value.brandId.toLowerCase() };
}
export function sameOfficeWorkBoundary(a, b) { return JSON.stringify(parseOfficeWorkBoundary(a)) === JSON.stringify(parseOfficeWorkBoundary(b)); }
export function parseOfficeArtifactRef(value) {
  keys(value, ['id', 'revision', 'contentHash', 'sourceHash']);
  return { id: ref(value.id), revision: integer(value.revision, 1, 1000000), contentHash: hash(value.contentHash), sourceHash: hash(value.sourceHash) };
}
export function canonicalOfficeConnectionJSON(value) {
  const visit = (x, depth = 0) => {
    check(depth <= 18, '연결 자료 구조가 너무 깊습니다.');
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
    if (typeof x === 'number') { check(Number.isFinite(x), '숫자를 확인해 주세요.'); return JSON.stringify(x); }
    if (Array.isArray(x)) { check(x.length <= 100, '자료 목록이 너무 깁니다.'); return '[' + x.map(v => visit(v, depth + 1)).join(',') + ']'; }
    check(plain(x) && !Object.keys(x).some(k => ['__proto__', 'constructor', 'prototype'].includes(k)), '연결 자료는 일반 JSON 객체여야 합니다.');
    return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + visit(x[k], depth + 1)).join(',') + '}';
  };
  const serialized = visit(value); check(new TextEncoder().encode(serialized).length <= 100000, '원문 묶음이 너무 큽니다. 범위를 줄여 주세요.'); return serialized;
}
// Only this typed arithmetic is checked; no free-text arithmetic/meaning is certified.
export function calculateOfficeNetTime(value) {
  keys(value, ['kind', 'basis', 'weeks', 'savedMinutesPerWeek', 'setupMinutes', 'maintenanceMinutesPerWeek']);
  check(value.kind === 'net_time' && ['estimated', 'observed'].includes(value.basis), '정형 시간 계산을 선택해 주세요.');
  const weeks = integer(value.weeks, 1, 520);
  for (const k of ['savedMinutesPerWeek', 'setupMinutes', 'maintenanceMinutesPerWeek']) check(Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= 1000000, '시간은 같은 단위의 정수 분으로 입력해 주세요.');
  return { ...value, weeks, firstPeriodMinutes: weeks * value.savedMinutesPerWeek - value.setupMinutes - weeks * value.maintenanceMinutesPerWeek, repeatedPeriodMinutes: weeks * (value.savedMinutesPerWeek - value.maintenanceMinutesPerWeek) };
}
export function parseOfficeTimeCalculation(value) {
  keys(value, ['kind', 'basis', 'weeks', 'savedMinutesPerWeek', 'setupMinutes', 'maintenanceMinutesPerWeek', 'firstPeriodMinutes', 'repeatedPeriodMinutes']);
  const { firstPeriodMinutes, repeatedPeriodMinutes, ...inputs } = value, expected = calculateOfficeNetTime(inputs);
  check(firstPeriodMinutes === expected.firstPeriodMinutes && repeatedPeriodMinutes === expected.repeatedPeriodMinutes, '정형 시간 계산 결과가 입력 산식과 일치하지 않습니다.');
  return expected;
}
export function parseOfficeConnectionReview(value, artifact, goalBinding) {
  keys(value, ['status', 'contentHash', 'sourceHash', 'goalBinding', 'findings', 'independentVerification', 'executionApproved']);
  check(['unavailable', 'failed', 'advisory_pass'].includes(value.status) && value.contentHash === artifact.contentHash && value.sourceHash === artifact.sourceHash && value.goalBinding === goalBinding && value.independentVerification === false && value.executionApproved === false, '현재 원문·목표의 검토 권고만 사용할 수 있습니다.');
  return { ...value, findings: list(value.findings, 8, 500) };
}
export function parseOfficeConnectionPacket(value) {
  keys(value, ['version', 'kind', 'boundary', 'artifact', 'sourceOwnerId', 'body', 'sourceSnapshot', 'sourceTruth', 'targetTaskId', 'targetOwnerId', 'targetEpoch', 'goalBinding', 'inputSummary', 'completionCriteria', 'roleInputs', 'review', 'humanReview', 'customerProjection']);
  check(value.version === OFFICE_CONNECTION_VERSION && ['office_council', 'customer_reply'].includes(value.kind), '연결할 Office 결과 종류를 확인해 주세요.');
  const boundary = parseOfficeWorkBoundary(value.boundary), artifact = parseOfficeArtifactRef(value.artifact);
  check(boundary.scope !== 'personal' || boundary.brandId !== null, '개인 브랜드 연결에는 요청 당시 선택 브랜드가 필요합니다.');
  check(OFFICE_IDS.includes(value.sourceOwnerId) && OFFICE_IDS.includes(value.targetOwnerId) && value.targetOwnerId !== 'eevee', '현재 전문 담당 한 명에게 연결해 주세요.');
  check(value.sourceTruth === 'client_provided_connection_unverified', '전달된 자료를 저장·독립 사실 검증으로 승격하지 않습니다.');
  canonicalOfficeConnectionJSON(value.sourceSnapshot);
  const result = { ...value, boundary, artifact, body: text(value.body, 24000), targetTaskId: ref(value.targetTaskId), targetEpoch: integer(value.targetEpoch, 0, 1000), goalBinding: text(value.goalBinding, 800), inputSummary: text(value.inputSummary, 500), completionCriteria: list(value.completionCriteria, 3, 250) };
  check(result.completionCriteria.length > 0 && plain(value.roleInputs) && Object.values(value.roleInputs).every(x => typeof x === 'string' && x.trim() && x.length <= 500), '전문 입력·완료 기준을 확인해 주세요.');
  result.review = parseOfficeConnectionReview(value.review, artifact, result.goalBinding);
  if (value.humanReview !== null) {
    keys(value.humanReview, ['binding', 'decision', 'sourcesReviewed', 'findingsAcknowledged', 'reason']);
    check(value.humanReview.binding === officeConnectionBinding({ ...result, humanReview: null }) && ['accepted_for_draft', 'rejected'].includes(value.humanReview.decision) && value.humanReview.sourcesReviewed === true && value.humanReview.findingsAcknowledged === true, '현재 자료·검토 한계를 직접 확인해 주세요.');
    result.humanReview = { ...value.humanReview, reason: text(value.humanReview.reason, 500) };
  }
  if (value.customerProjection !== null) {
    check(value.kind === 'customer_reply' && value.targetOwnerId === 'flareon', '고객 대응 결과는 부스터의 고객 초안에 연결합니다.');
    keys(value.customerProjection, ['customerState', 'draft', 'nextContact']);
    result.customerProjection = Object.fromEntries(Object.entries(value.customerProjection).map(([k, v]) => [k, text(v, 1000)]));
  }
  return structuredClone(result);
}
export function officeConnectionBinding(value) {
  return JSON.stringify([value.version, value.kind, value.boundary, value.artifact, value.targetTaskId, value.targetOwnerId, value.targetEpoch, value.goalBinding, value.inputSummary, value.completionCriteria, value.roleInputs, value.review, value.customerProjection]);
}
export function officeConnectionHumanCurrent(value) { return !!value && value.humanReview?.decision === 'accepted_for_draft' && value.humanReview.binding === officeConnectionBinding({ ...value, humanReview: null }); }
