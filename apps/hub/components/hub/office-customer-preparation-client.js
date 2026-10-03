import { OFFICE_CUSTOMER_PREPARATION_VERSION, officeCustomerApprovalPayload } from '@com-moon/agent-contracts/office-workflow';

export const CUSTOMER_PREPARATION_MESSAGE = '선택한 고객의 확인된 기록으로 이번 연락 목적, 추천 답장 한 개, 확인할 자료 후보와 질문, 필요한 다음 행동 한 개를 준비해 주세요. 없는 고객 발언·자료·가격·약속을 만들지 마세요.';

export function officeCustomerInputKey(input, state, ownerId) {
  return JSON.stringify([input.scope, input.originRef.entityType, input.originRef.entityId, state.context?.contextHash,
    ownerId, 'draft', state.draft.trim() || CUSTOMER_PREPARATION_MESSAGE, state.sourceExcerpt.trim()]);
}

export function officeCustomerGenerationBlock(state, key) {
  if (state.pending || state.applicationUnknown || ['running', 'unknown', 'unsaved'].includes(state.receipt?.status)) return '기존 요청의 저장·처리 상태를 먼저 확인해 주세요.';
  if (state.receipt?.result && !state.draft.trim()) return '수정할 내용이나 새 연락 목적을 적으면 다시 생성할 수 있습니다.';
  if (state.lastCustomerInputKey === key && state.receipt?.status === 'generated') return '같은 입력의 결과가 있습니다. 원문 검토를 이어가 주세요.';
  return '';
}

export function officeCustomerApprovalCurrent(state) {
  const result = state.receipt?.result;
  if (!result || state.context?.status !== 'ready' || state.pending || state.applicationUnknown || state.draft.trim() || (state.ownerId && state.ownerId !== result.ownerId) || state.cancelledRequestId === result.requestId || state.rejectedRequestId === result.requestId || state.receipt.persistence?.persisted !== true) return false;
  try { return state.customerApprovalKey === officeCustomerApprovalPayload(result, { reviewedContextHash: state.context.contextHash })
    && state.customerApproval?.requestId === result.requestId && state.customerApproval?.contextHash === result.context.contextHash
    && state.customerApproval?.reviewedContextHash === state.context.contextHash; }
  catch { return false; }
}

export function officeCustomerContextUpdate(state, context) {
  const changed = context?.status !== 'ready' || state.context?.contextHash !== context.contextHash;
  return { context, ...(changed ? { reviewedSources: false, reviewedQuestions: false, customerApproval: null, customerApprovalKey: null } : {}) };
}

export function officeCustomerStage(state) {
  const application = state.receipt?.application;
  if (state.pending && state.operation === 'apply') return { state: 'waiting', label: '할 일 저장 요청 확인 중' };
  if (application?.state === 'saved') return { state: application.entityConfirmed ? 'queued' : 'waiting',
    label: application.entityConfirmed ? '할 일 등록 확인 · 실행 전' : '할 일 저장됨 · 실재 확인 필요' };
  if (application?.state === 'rejected') return { state: 'blocked', label: '할 일 등록 거절 · 대상 확인 필요' };
  if (state.applicationUnknown || application?.commandId) return { state: 'waiting', label: '같은 할 일 명령의 저장 확인 대기' };
  if (state.cancelledRequestId && state.cancelledRequestId === (state.pending ? state.request?.requestId : state.receipt?.requestId || state.request?.requestId)) return { state: 'cancelled', label: '이 결과의 사용 취소' };
  if (state.pending || ['running', 'unknown'].includes(state.receipt?.status)) return { state: 'active', label: '초안·원문 대조 처리 확인 중' };
  if (state.receipt?.status === 'error') return { state: 'blocked', label: '생성 실패 · 입력 보존됨' };
  if (state.receipt?.status === 'unsaved') return { state: 'waiting', label: '초안 저장 확인 필요' };
  if (state.rejectedRequestId && state.rejectedRequestId === state.receipt?.requestId) return { state: 'waiting', label: '초안 반려 · 수정 요청 필요' };
  if (officeCustomerApprovalCurrent(state)) return { state: 'queued', label: '이 세션에서 초안 승인됨 · 실행 전' };
  if (state.receipt?.result) return { state: 'waiting', label: 'AI 원문 대조 후 · 사람 검토·승인 대기' };
  return { state: 'queued', label: '고객 대응 준비' };
}

export function officeCustomerCallSummary(receipt) {
  const execution = receipt?.result?.execution || receipt?.execution;
  return execution && Number.isInteger(execution.modelCalls)
    ? `모델 요청 시도 ${execution.modelCalls}회 · 자동 재시도 ${execution.providerRetries}회 · 금액 미확인`
    : ['unknown','running','unsaved','error'].includes(receipt?.status) ? '실제 호출 수·금액 미확인 · 같은 요청 상태를 확인해 주세요'
    : '기본 생성·원문 대조 2회 예정 · 추가 담당 추천 호출 없음 · 금액 미확인';
}

export const officeCustomerResult = result => result?.customerPreparation?.version === OFFICE_CUSTOMER_PREPARATION_VERSION;
