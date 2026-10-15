import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeCommanderController } from './office-commander-client.js';
import { processOfficeCommanderShadow } from '../../lib/office/commander-service.js';
import { officeCommanderReviewBinding } from '@com-moon/agent-contracts/office-commander';
import { officeRoleBriefFromDraft, officeRoleOutputFromDraft, officeRoleOutputDraftBinding } from './office-role-depth-client.js';
const identity = { workspaceId: 'client-depth', actorId: 'operator' };
const form = { inputs: { customerContext: '고객 원문은 자료 요청', offerBoundary: '미확인 자료', contactGoal: '요청 범위 확인' }, source: '자료를 요청했습니다.', criteria: '없는 제공 약속 금지', constraints: '회사 범위만' };
const result = { fields: { customerState: '자료 요청 단계, 구매 미확인', draft: '필요한 자료의 범위를 알려주시면 제공 가능한 내용을 확인하겠습니다.', nextContact: '자료 존재 확인 뒤 원문 재검토' }, claimText: '', uncertainties: '자료 제공 가능 범위 미확인', status: 'draft' };
let seq = 0;
const controller = () => createOfficeCommanderController({ id: () => `ui-depth-${++seq}`, send: async request => processOfficeCommanderShadow(request, identity) });
test('real client builders flow through server specialist contract, exact review and eevee report', async () => {
  const c = controller(); await c.intake({ scope: 'classin', goal: '고객 요청 대응 준비', source: '고객 답장' }); let snapshot = c.value().snapshot, task = snapshot.tasks[0];
  await c.act('set_role_brief', task.id, { brief: officeRoleBriefFromDraft(task, snapshot, form) }); task = c.value().snapshot.tasks[0];
  await c.act('record_specialist_result', task.id, { output: officeRoleOutputFromDraft(task, { ...result, outputBinding: officeRoleOutputDraftBinding(task) }) }); task = c.value().snapshot.tasks[0];
  await c.act('review_result', task.id, { binding: officeCommanderReviewBinding(task), reviewedSources: true }); await c.act('compile_report');
  assert.equal(c.value().snapshot.report.complete, true); assert.ok(c.value().snapshot.report.body.includes(result.fields.draft)); assert.equal(c.value().snapshot.providerCalls, 0); assert.equal(c.value().snapshot.persistence, false);
});
test('builder parses only current owner fields and never imports another scope or an implicit source', async () => {
  const c = controller(); await c.intake({ scope: 'personal', goal: '고객 요청 대응 준비', source: '고객 답장' }); const snapshot = c.value().snapshot, task = snapshot.tasks[0], brief = officeRoleBriefFromDraft(task, snapshot, { ...form, inputs: { ...form.inputs, admin: '권한 상승' } });
  assert.equal(brief.scope, 'personal'); assert.equal(brief.sources[0].scope, 'personal'); assert.equal(brief.inputs.admin, undefined); assert.deepEqual(officeRoleBriefFromDraft(task, snapshot, { ...form, source: '' }).sources, []);
});
test('malformed claims and incomplete drafts preserve client input instead of inventing a result', async () => {
  const c = controller(); await c.intake({ scope: 'classin', goal: '고객 요청 대응 준비', source: '고객 답장' }); let s = c.value().snapshot; await c.act('set_role_brief', s.tasks[0].id, { brief: officeRoleBriefFromDraft(s.tasks[0], s, form) }); const task = c.value().snapshot.tasks[0];
  assert.throws(() => officeRoleOutputFromDraft(task, { ...result, outputBinding: officeRoleOutputDraftBinding(task), claimText: '{' }), SyntaxError); assert.throws(() => officeRoleOutputFromDraft(task, { ...result, outputBinding: officeRoleOutputDraftBinding(task), fields: { draft: '미완성' } }), /누락/); assert.equal(c.value().snapshot.tasks[0].result, null);
});

test('unsubmitted specialist input cannot silently acquire a changed source, owner or completion version', async () => {
  const c = controller(); await c.intake({ scope: 'classin', goal: '고객 요청 대응 준비', source: '고객 답장' }); let s = c.value().snapshot;
  await c.act('set_role_brief', s.tasks[0].id, { brief: officeRoleBriefFromDraft(s.tasks[0], s, form) }); let task = c.value().snapshot.tasks[0]; const oldDraft = { ...result, outputBinding: officeRoleOutputDraftBinding(task) };
  assert.equal(officeRoleOutputFromDraft(task, oldDraft).status, 'draft'); s = c.value().snapshot; await c.act('set_role_brief', task.id, { brief: officeRoleBriefFromDraft(task, s, { ...form, source: '바뀐 원문' }) }); task = c.value().snapshot.tasks[0];
  assert.throws(() => officeRoleOutputFromDraft(task, oldDraft), /버전이 바뀌/); assert.equal(oldDraft.fields.draft, result.fields.draft); assert.equal(c.value().snapshot.tasks[0].result, null);
});

test('current typed minutes are deterministically checked while incorrect totals and malformed JSON preserve input',async()=>{
 const c=controller();await c.intake({scope:'classin',goal:'시간의 같은 기간 비교',source:'고객 답장'});let s=c.value().snapshot;await c.act('set_role_brief',s.tasks[0].id,{brief:officeRoleBriefFromDraft(s.tasks[0],s,form)});const t=c.value().snapshot.tasks[0],calculation={kind:'net_time',basis:'estimated',weeks:4,savedMinutesPerWeek:30,setupMinutes:90,maintenanceMinutesPerWeek:10,firstPeriodMinutes:-10,repeatedPeriodMinutes:80};const draft={...result,outputBinding:officeRoleOutputDraftBinding(t),calculationText:JSON.stringify([calculation])};assert.equal(officeRoleOutputFromDraft(t,draft).calculations[0].firstPeriodMinutes,-10);assert.throws(()=>officeRoleOutputFromDraft(t,{...draft,calculationText:JSON.stringify([{...calculation,firstPeriodMinutes:80}])}),/산식/);assert.throws(()=>officeRoleOutputFromDraft(t,{...draft,calculationText:'{'}),SyntaxError);assert.equal(draft.fields.draft,result.fields.draft);
});
