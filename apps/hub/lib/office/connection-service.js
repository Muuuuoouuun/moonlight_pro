import { officeContextHash } from '../repositories/office-workflow-context.js';
import { createHash } from 'node:crypto';
import { OfficeInputError, parseOfficeRequest, parseOfficeAnswer, parseOfficeContext, parseOfficeDiscussion, OFFICE_VERSION } from '@com-moon/agent-contracts/office';
import { parseOfficeWorkflowRequest, parseOfficeWorkflowContext, parseOfficeWorkflowResult, officeCustomerApprovalPayload, parseOfficeCustomerApproval, OFFICE_CUSTOMER_PREPARATION_VERSION } from '@com-moon/agent-contracts/office-workflow';
import { OFFICE_CONNECTION_VERSION, parseOfficeWorkBoundary, sameOfficeWorkBoundary, canonicalOfficeConnectionJSON, parseOfficeConnectionPacket, officeConnectionBinding } from '@com-moon/agent-contracts/office-connection';
const fail = message => { throw new OfficeInputError(message); };
export const officeConnectionHash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => canonicalOfficeConnectionJSON(a) === canonicalOfficeConnectionJSON(b);

function council(source) {
  const turn = source.source?.turn;
  if (!turn || turn.id !== source.artifactId || source.artifactRevision !== 1 || !turn.officeBoundary) fail('요청 당시 브랜드가 없는 이전 회의는 새 원자료 확인이 필요합니다.');
  const boundary = parseOfficeWorkBoundary(turn.officeBoundary);
  if (!sameOfficeWorkBoundary(boundary, source.boundary)) fail('회의 요청 당시 브랜드를 나중에 바꿀 수 없습니다.');
  const request = parseOfficeRequest(turn.request), result = turn.result;
  if(request.includeProjects)fail('프로젝트 전체 문맥은 브랜드별 원문으로 결속되지 않았습니다. 해당 원자료만 사용하는 새 회의를 준비해 주세요.');
  if (request.mode !== 'council' || request.scope !== boundary.scope || result?.status !== 'generated' || result.version !== OFFICE_VERSION || result.mode !== 'council' || result.ownerId !== request.ownerId || result.scope !== request.scope || !same(result.participants, request.participants)) fail('현재 생성된 Office 회의 결론을 선택해 주세요.');
  const answer = parseOfficeAnswer(Object.fromEntries(['answer','nextAction','recommendation','evidence','dissent'].map(k => [k,result[k]])), 'council');
  const discussion = parseOfficeDiscussion(result.discussion, request);
  const context = parseOfficeContext(result.context, request.scope);
  return { boundary, body: answer.answer, ownerId: result.ownerId, snapshot: { turnId: turn.id, request, answer, discussion, context, boundary }, customerProjection: null };
}
function customer(source, inputSummary) {
  const state = source.source?.state, receipt = state?.receipt, result = receipt?.result, context = state?.context;
  if (receipt?.intent !== 'customer_reply' || receipt.status !== 'generated' || receipt.persistence?.persisted !== true || result?.status !== 'generated' || !context || context.status !== 'ready' || receipt.requestId !== result.requestId || receipt.resultRevision !== result.resultRevision || result.resultRevision !== 1 || result.mode !== 'draft' || result.ownerId !== 'flareon' || receipt.ownerId !== result.ownerId || receipt.mode !== result.mode || result.customerPreparation?.version !== OFFICE_CUSTOMER_PREPARATION_VERSION) fail('보관된 현재 고객 대응 초안 한 건을 선택해 주세요.');
  if (source.artifactId !== receipt.requestId || source.artifactRevision !== result.resultRevision || receipt.scope !== result.scope || receipt.scope !== context.scope || !same(receipt.originRef, context.originRef) || result.context?.contextHash !== context.contextHash || state.reviewedSources !== true || state.reviewedQuestions !== true) fail('고객·현재 문맥·원문 검토가 바뀌었습니다. 고객 화면에서 다시 확인해 주세요.');
  if(context.facts?.customer?.id!==receipt.originRef.entityId||context.facts?.customer?.entityType!==receipt.originRef.entityType)fail('고객 원자료와 선택한 대상이 일치하지 않습니다.');
  const boundary = parseOfficeWorkBoundary(source.boundary);
  const currentBrandId = context.facts?.customer?.brandId ?? null;
  if (boundary.scope !== receipt.scope || boundary.brandId !== currentBrandId || state.request && (!same(state.request.originRef, receipt.originRef) || state.request.ownerId !== receipt.ownerId)) fail('선택한 고객·브랜드와 전달 자료가 일치하지 않습니다.');
  const request = parseOfficeWorkflowRequest(state.request || { requestId: receipt.requestId, intent: 'customer_reply', ownerId: result.ownerId, mode: 'draft', scope: receipt.scope, originRef: receipt.originRef, expectedContextHash: context.contextHash, message: '보관된 고객 대응 원문 연결', customerPreparationVersion: OFFICE_CUSTOMER_PREPARATION_VERSION });
  if(officeContextHash(context)!==context.contextHash)fail('고객 원자료가 기존 문맥 해시와 일치하지 않습니다. 원문을 다시 확인해 주세요.');
  const parsedContext = parseOfficeWorkflowContext(context, request);
  // The content hash is unchanged; only generation/read timestamps differ.
  // Preserve the original generation metadata and current read snapshot separately.
  const parsedResult = parseOfficeWorkflowResult(result, request, { ...parsedContext, asOf: result.context.asOf });
  const approval = state.customerApproval;
  if (approval?.reviewedContextHash !== parsedContext.contextHash) fail('최신 고객 문맥을 검토한 초안 승인만 사용할 수 있습니다.');
  parseOfficeCustomerApproval(approval, parsedResult, officeConnectionHash(officeCustomerApprovalPayload(parsedResult, { reviewedContextHash: parsedContext.contextHash })));
  if (parsedResult.artifact.body.length > 1000) fail('고객 답장이 전문 입력 한도를 넘었습니다. 고객 화면에서 답장 범위를 줄여 주세요.');
  const purpose = parsedResult.customerPreparation.purpose;
  return { boundary, body: parsedResult.artifact.body, ownerId: result.ownerId,
    snapshot: { request: state.request || null, requestOrigin: state.request ? 'current_session' : 'stored_receipt_projection', context: parsedContext, result: parsedResult, approval, receipt: { requestId: receipt.requestId, intent: receipt.intent, scope: receipt.scope, originRef: receipt.originRef, ownerId: receipt.ownerId, mode: receipt.mode, resultRevision: receipt.resultRevision, persisted: true, applicationState: receipt.application?.state ?? null } },
    customerProjection: { customerState: `관측 단계: ${typeof parsedContext.facts.customer?.stage==='string'&&parsedContext.facts.customer.stage.trim()?parsedContext.facts.customer.stage:'미확인'}\n이번 연락 목적: ${purpose}`, draft: parsedResult.artifact.body, nextContact: `${inputSummary}\n자료 후보 ${parsedResult.customerPreparation.materials.length}건·확인 질문 ${parsedResult.customerPreparation.questions.length}건 · 자료 존재·연락 실행 미확인` } };
}
export function prepareOfficeCommanderConnection(snapshot, taskId, input) {
  const task = snapshot.tasks.find(item => item.id === taskId);
  if (!task?.ownerId || !snapshot.goal || !snapshot.boundary) fail('목표·전문 담당·선택 브랜드를 먼저 확인해 주세요.');
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!['source','inputSummary','completionCriteria','roleInputs','excerpt'].includes(k)))fail('연결 입력에는 권한·예산·외부 실행 필드를 추가할 수 없습니다.');
  const { source, inputSummary, completionCriteria, roleInputs, excerpt } = input || {};
  if (!source || !['office_council', 'customer_reply'].includes(source.kind) || source.scope !== snapshot.scope || !sameOfficeWorkBoundary(source.boundary, snapshot.boundary)) fail('브랜드·회사/개인 범위가 다른 결과는 연결할 수 없습니다.');
  const origin = source.kind === 'office_council' ? council(source) : customer(source, inputSummary);
  if (source.kind === 'customer_reply' && task.ownerId !== 'flareon') fail('고객 대응 초안은 부스터 한 명의 업무에 연결해 주세요.');
  if (typeof excerpt !== 'string' || !excerpt.trim() || excerpt.length > 1000 || !origin.body.includes(excerpt.trim())) fail('수신할 부분은 현재 결론 원문의 정확한 일부를 골라 주세요.');
  const artifact = { id: source.artifactId, revision: source.artifactRevision, contentHash: officeConnectionHash(origin.body), sourceHash: officeConnectionHash(canonicalOfficeConnectionJSON(origin.snapshot)) };
  const goalBinding = JSON.stringify([snapshot.requestId, snapshot.goal, snapshot.boundary]);
  const review = { status: 'unavailable', contentHash: artifact.contentHash, sourceHash: artifact.sourceHash, goalBinding, findings: ['현재 원문·브랜드 결속만 검사했습니다. 의미 검토 모델은 비활성이고 직접 판단이 필요합니다.'], independentVerification: false, executionApproved: false };
  const packet = parseOfficeConnectionPacket({ version: OFFICE_CONNECTION_VERSION, kind: source.kind, boundary: origin.boundary, artifact, sourceOwnerId: origin.ownerId, body: origin.body, sourceSnapshot: origin.snapshot, sourceTruth: 'client_provided_connection_unverified', targetTaskId: task.id, targetOwnerId: task.ownerId, targetEpoch: task.epoch + 1, goalBinding, inputSummary, completionCriteria, roleInputs, review, humanReview: null, customerProjection: origin.customerProjection });
  return { packet, excerpt: excerpt.trim() };
}
export function verifyOfficeCommanderConnections(snapshot) {
  for (const task of snapshot.tasks) {
    if (!task.connection) continue;
    const c = parseOfficeConnectionPacket(task.connection);
    if (officeConnectionHash(c.body) !== c.artifact.contentHash || officeConnectionHash(canonicalOfficeConnectionJSON(c.sourceSnapshot)) !== c.artifact.sourceHash) fail('연결된 원문 본문·자료 해시가 바뀌었습니다.');
    if (task.brief?.sources?.some(source => source.binding && source.binding.artifact.id === c.artifact.id && !c.body.includes(source.excerpt))) fail('전문 입력의 인용이 연결 원문에 없습니다.');
  }
}
export function officeConnectionReviewAcknowledgement(packet, decision, reason) {
  return { binding: officeConnectionBinding(packet), decision, sourcesReviewed: true, findingsAcknowledged: true, reason };
}
