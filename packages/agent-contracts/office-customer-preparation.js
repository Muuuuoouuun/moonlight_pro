// Browser-safe contract for one selected customer's preparation, never a sending tool.
import { OfficeInputError } from './office.js';

export const OFFICE_CUSTOMER_PREPARATION_VERSION = '2026-10-02.customer-preparation.v2';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
const keys = (value, allowed) => check(plain(value) && Object.keys(value).every(key => allowed.includes(key)), '고객 대응 필드를 확인해 주세요.');
const text = (value, max) => { check(typeof value === 'string' && value.trim() && value.length <= max, '고객 대응 내용의 길이를 확인해 주세요.'); return value.trim(); };
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);

export function parseOfficeCustomerPreparation(value) {
  keys(value, ['version', 'purpose', 'materials', 'questions']);
  check(value.version === undefined || value.version === OFFICE_CUSTOMER_PREPARATION_VERSION, '고객 대응 계약 버전을 확인해 주세요.');
  check(Array.isArray(value.materials) && value.materials.length <= 4 && Array.isArray(value.questions) && value.questions.length <= 6, '자료 후보와 확인 질문의 수를 줄여 주세요.');
  const materials = value.materials.map(item => {
    keys(item, ['title', 'reason', 'availability']);
    // This MVP has no asset lookup. A model cannot certify existence or delivery.
    check(item.availability === undefined || item.availability === 'unverified', '조회하지 않은 자료를 확인됨으로 표시할 수 없습니다.');
    return { title: text(item.title, 160), reason: text(item.reason, 600), availability: 'unverified' };
  });
  return { version: OFFICE_CUSTOMER_PREPARATION_VERSION, purpose: text(value.purpose, 600), materials, questions: value.questions.map(item => text(item, 600)) };
}

export function officeCustomerApprovalPayload(result, { reviewedContextHash = result?.context?.contextHash } = {}) {
  check(result?.status === 'generated' && result.customerPreparation?.version === OFFICE_CUSTOMER_PREPARATION_VERSION && result.resultRevision === 1, '승인할 고객 대응 결과가 없습니다.');
  check(/^[a-f0-9]{64}$/.test(reviewedContextHash || ''), '검토한 고객 문맥을 다시 확인해 주세요.');
  return stable({ version: OFFICE_CUSTOMER_PREPARATION_VERSION, requestId: result.requestId, resultRevision: result.resultRevision,
    ownerId: result.ownerId, scope: result.scope, context: result.context, reviewedContextHash, artifact: result.artifact,
    customerPreparation: result.customerPreparation, evidence: result.evidence, uncertainties: result.uncertainties,
    sourceCheck: result.sourceCheck ?? null, nextStep: result.nextStep });
}

export async function createOfficeCustomerApproval(result, { sourcesReviewed, questionsReviewed, reviewedContextHash = result?.context?.contextHash, cryptoProvider = globalThis.crypto } = {}) {
  check(sourcesReviewed === true && questionsReviewed === true, '원문과 확인 질문을 검토한 뒤 승인해 주세요.');
  const bytes = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(officeCustomerApprovalPayload(result, { reviewedContextHash })));
  return { version: OFFICE_CUSTOMER_PREPARATION_VERSION, requestId: result.requestId, resultRevision: result.resultRevision,
    contextHash: result.context.contextHash, reviewedContextHash, resultHash: [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
    sourcesReviewed: true, questionsReviewed: true };
}

// Hub recomputes the hash from its stored result under the authenticated operator.
// Approval grants only permission to open the existing task confirmation flow.
export function parseOfficeCustomerApproval(value, result, expectedHash) {
  keys(value, ['version', 'requestId', 'resultRevision', 'contextHash', 'reviewedContextHash', 'resultHash', 'sourcesReviewed', 'questionsReviewed']);
  check(value.version === OFFICE_CUSTOMER_PREPARATION_VERSION && value.requestId === result.requestId && value.resultRevision === result.resultRevision
    && value.contextHash === result.context.contextHash && /^[a-f0-9]{64}$/.test(value.reviewedContextHash || '') && /^[a-f0-9]{64}$/.test(value.resultHash || '') && value.resultHash === expectedHash
    && value.sourcesReviewed === true && value.questionsReviewed === true, '현재 결과의 원문 검토와 초안 승인이 필요합니다.');
  return { ...value };
}

export function parseOfficeCustomerExecution(value) {
  keys(value, ['modelCalls', 'providerRetries', 'costStatus']);
  check(Number.isInteger(value.modelCalls) && value.modelCalls >= 0 && value.modelCalls <= 2 && value.providerRetries === 0 && value.costStatus === 'unknown', '고객 대응 호출 기록이 올바르지 않습니다.');
  return { ...value };
}
