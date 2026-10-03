import { OFFICE_ROLE_DEPTH_VERSION, getOfficeRoleDepth, parseOfficeRoleBrief, officeRoleBriefBinding, parseOfficeRoleOutput } from '@com-moon/agent-contracts/office-role-depth';
const lines = text => (text || '').split('\n').map(item => item.trim()).filter(Boolean);
export function officeRoleBriefFromDraft(task, snapshot, draft) {
  const role = getOfficeRoleDepth(task.ownerId);
  return parseOfficeRoleBrief({ version: OFFICE_ROLE_DEPTH_VERSION, taskId: task.id, ownerId: role.id, epoch: task.epoch, scope: snapshot.scope, goal: snapshot.goal, inputs: Object.fromEntries(role.inputFields.filter(item => (draft.inputs?.[item.key] ?? task.brief?.inputs[item.key] ?? '').trim()).map(item => [item.key, draft.inputs?.[item.key] ?? task.brief.inputs[item.key]])), sources: (draft.source ?? task.brief?.sources[0]?.excerpt ?? '').trim() ? [{ id: `${task.id}:source`, label: '사용자가 제공한 원문', scope: snapshot.scope, excerpt: draft.source ?? task.brief.sources[0].excerpt, ...(task.brief?.sources[0]?.binding ? {binding:task.brief.sources[0].binding}: {}) }] : [], completionCriteria: lines(draft.criteria ?? task.brief?.completionCriteria.join('\n')), constraints: lines(draft.constraints ?? task.brief?.constraints.join('\n')), ...(task.brief?.boundary ? {boundary:task.brief.boundary}: {}) });
}
export function officeRoleOutputFromDraft(task, draft) {
  if (!task.brief || draft.outputBinding !== officeRoleOutputDraftBinding(task)) throw new Error('입력·담당·원문 버전이 바뀌었습니다. 새 결과를 기록하거나 이전 입력을 현재 자료와 대조한 뒤 명시적으로 불러와 주세요.');
  const brief = task.brief, role = getOfficeRoleDepth(task.ownerId);
  const claims = draft.claimText?.trim() ? JSON.parse(draft.claimText) : [];
  const questions = role.inputFields.filter(item => draft.questions?.[item.key]?.trim()).map(item => ({ inputKey: item.key, question: draft.questions[item.key] }));
  return parseOfficeRoleOutput({ version: OFFICE_ROLE_DEPTH_VERSION, taskId: task.id, ownerId: role.id, epoch: task.epoch, scope: brief.scope, briefBinding: officeRoleBriefBinding(brief), status: draft.status || 'draft', fields: Object.fromEntries(role.outputFields.filter(item => (draft.fields?.[item.key] || '').trim()).map(item => [item.key, draft.fields[item.key]])), claims, uncertainties: lines(draft.uncertainties), questions, ...(draft.calculationText?.trim()?{calculations:JSON.parse(draft.calculationText)}:{}), nextAction: draft.nextAction?.trim() ? { ownerId: role.id, action: draft.nextAction, condition: draft.nextCondition || '' } : null }, brief);
}
export function officeRoleOutputDraftBinding(task) {
  return task.brief ? JSON.stringify([task.id, task.ownerId, task.epoch, task.brief.scope, officeRoleBriefBinding(task.brief)]) : null;
}
