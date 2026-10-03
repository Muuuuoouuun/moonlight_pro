import { OfficeInputError } from './office.js';
import { OFFICE_ROLE_DEPTH_VERSION, parseOfficeRoleBrief, officeRoleBriefBinding, parseOfficeRoleOutput, officeRoleOutputBody, officeRoleMissingInputs } from './office-role-depth.js';
import { parseOfficeConnectionPacket, sameOfficeWorkBoundary, officeConnectionBinding, officeConnectionHumanCurrent, parseOfficeConnectionReview } from './office-connection.js';
const check = (ok, message) => { if (!ok) throw new OfficeInputError(message); };
export function officeCommanderConnectionCurrent(task) {
  const c = task.connection;
  return !c || c.targetTaskId === task.id && c.targetOwnerId === task.ownerId && c.targetEpoch === task.epoch && officeConnectionHumanCurrent(c);
}
export function attachOfficeCommanderConnection(state, task, { packet, excerpt }) {
  const c = parseOfficeConnectionPacket(packet);
  check(state.boundary && sameOfficeWorkBoundary(state.boundary, c.boundary) && c.targetTaskId === task.id && c.targetOwnerId === task.ownerId && c.targetEpoch === task.epoch + 1 && c.goalBinding === JSON.stringify([state.requestId, state.goal, state.boundary]), '수신 업무·담당·목표·브랜드 버전이 바뀌었습니다.');
  check(typeof excerpt === 'string' && excerpt.trim() && excerpt.length <= 1000 && c.body.includes(excerpt.trim()), '현재 결론 원문의 일부만 전문 입력으로 연결해 주세요.');
  task.epoch++;
  task.connection = c;
  task.brief = parseOfficeRoleBrief({ version: OFFICE_ROLE_DEPTH_VERSION, taskId: task.id, ownerId: task.ownerId, epoch: task.epoch, scope: state.scope, boundary: c.boundary, goal: state.goal, inputs: c.roleInputs, sources: [{ id: `${c.artifact.id}:connection`, label: c.kind === 'customer_reply' ? '고객 대응 원문·제공 receipt' : 'Office 회의 원문·세션 결과', scope: state.scope, excerpt: excerpt.trim(), binding: { boundary: c.boundary, artifact: c.artifact } }], completionCriteria: c.completionCriteria, constraints: ['실행·발행·일정 변경 없음', '제공 결과의 의미는 직접 검토 필요'] });
  if (c.customerProjection && officeRoleMissingInputs(task.brief).length === 0) {
    const output = parseOfficeRoleOutput({ version: OFFICE_ROLE_DEPTH_VERSION, taskId: task.id, ownerId: task.ownerId, epoch: task.epoch, scope: state.scope, briefBinding: officeRoleBriefBinding(task.brief), status: 'draft', fields: c.customerProjection, claims: [], uncertainties: ['제공 receipt의 본문 연결. 독립 의미 검증·실제 고객 연락은 미확인'], questions: [], nextAction: null }, task.brief);
    task.result = { revision: (task.result?.revision || 0) + 1, ownerId: task.ownerId, epoch: task.epoch, body: officeRoleOutputBody(output, task.brief), evidence: task.brief.sources.map(x => `${x.id} · ${x.label}`), uncertainties: output.uncertainties, sourceTruth: 'operator_provided_unverified', roleBrief: structuredClone(task.brief), roleOutput: output };
  }
  task.state = 'needs_user'; task.review = null;
  task.error = '결과를 입력으로 연결했습니다. 브랜드·원문·검토 한계를 직접 확인해 주세요. 의미 모델은 비활성입니다.';
}
export function rebindOfficeCommanderConnection(task, brief) {
  if (!task.connection) return;
  const c = task.connection;
  check(brief.boundary && sameOfficeWorkBoundary(brief.boundary, c.boundary) && brief.sources.every(source => source.binding && JSON.stringify(source.binding.artifact) === JSON.stringify(c.artifact) && c.body.includes(source.excerpt)), '연결된 원문·브랜드를 다른 자료로 바꿀 수 없습니다. 새 원문 결과를 명시 연결해 주세요.');
  c.targetEpoch = task.epoch; c.roleInputs = brief.inputs; c.completionCriteria = brief.completionCriteria; c.humanReview = null;
  c.review = { ...c.review, status: c.review.status==='failed'?'failed':'unavailable' };
  task.state = 'needs_user'; task.error = '전문 입력이 바뀌었습니다. 현재 인계 자료와 검토 한계를 다시 확인해 주세요.';
}
export function recordOfficeCommanderConnectionReview(task, review) {
  check(task.connection, '검토할 인계 원문이 없습니다.');
  task.connection.review = parseOfficeConnectionReview(review, task.connection.artifact, task.connection.goalBinding);
  task.connection.humanReview = null; task.state = 'needs_user'; task.error = '검토 권고와 현재 원문을 사용자가 확인해야 합니다.';
}
export function acknowledgeOfficeCommanderConnection(task, value) {
  check(task.connection && value.binding === officeConnectionBinding(task.connection) && ['accepted_for_draft', 'rejected'].includes(value.decision) && value.sourcesReviewed === true && value.findingsAcknowledged === true && typeof value.reason === 'string' && value.reason.trim() && value.reason.length <= 500 && Object.keys(value).every(k => ['binding', 'decision', 'sourcesReviewed', 'findingsAcknowledged', 'reason'].includes(k)), '현재 원문·검토 한계를 직접 확인하고 수신 응답을 남겨 주세요.');
  task.connection.humanReview = { ...value, reason: value.reason.trim() };
  const ready = value.decision === 'accepted_for_draft' && officeRoleMissingInputs(task.brief).length === 0;
  task.state = ready ? task.result?.epoch === task.epoch ? 'result_provided' : 'queued_shadow' : 'blocked';
  task.error = ready ? null : value.decision === 'rejected' ? '인계 원문 반려. 담당을 유지하고 새 원문·수정 조건을 확인해 주세요.' : '필수 전문 입력을 먼저 준비해 주세요.';
}
