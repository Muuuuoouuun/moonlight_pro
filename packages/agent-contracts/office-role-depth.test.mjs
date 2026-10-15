import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_ROSTER } from './office.js';
import { OFFICE_ROLE_DEPTH_VERSION, OFFICE_ROLE_DEPTH_REGISTRY, getOfficeRoleDepth, renderOfficeRoleDepthInstructions, parseOfficeRoleBrief, officeRoleBriefBinding, parseOfficeRoleOutput, officeRoleReviewGate } from './office-role-depth.js';
import { createOfficeCommanderState, applyOfficeCommanderAction, officeCommanderReviewBinding, officeCommanderReviewCurrent, parseOfficeCommanderState } from './office-commander.js';
const identity = { workspaceId: 'depth-workspace', actorId: 'depth-operator' };
const brief = (ownerId = 'flareon', changes = {}) => ({ version: OFFICE_ROLE_DEPTH_VERSION, taskId: 'depth-request:t1', ownerId, epoch: 0, scope: 'classin', goal: '요청한 전문 결과', inputs: Object.fromEntries(getOfficeRoleDepth(ownerId).inputFields.map(item => [item.key, '제공한 입력'])), sources: [{ id: 'source-1', label: '사용자가 제공한 원문', scope: 'classin', excerpt: '자료를 요청했습니다. 제공 범위는 미확인입니다.' }], completionCriteria: ['원문과 미확인을 보존'], constraints: ['외부 실행 없음'], ...changes });
const output = (b, changes = {}) => ({ version: OFFICE_ROLE_DEPTH_VERSION, taskId: b.taskId, ownerId: b.ownerId, epoch: b.epoch, scope: b.scope, briefBinding: officeRoleBriefBinding(b), status: 'draft', fields: Object.fromEntries(getOfficeRoleDepth(b.ownerId).outputFields.map(item => [item.key, `${item.label} 전문 초안`])), claims: [{ kind: 'fact', text: '원문에 자료 요청이 있습니다.', sourceIds: ['source-1'], quote: '자료를 요청했습니다.', reason: null }], uncertainties: ['제공 범위 미확인'], questions: [], nextAction: null, ...changes });
let seq = 0;
const act = (s, type, i, payload = {}) => applyOfficeCommanderAction(s, { operationId: `depth-op-${++seq}`, expectedRevision: s.revision, type, ...(i == null ? {} : { taskId: s.tasks[i].id }), payload }, identity).state;
const initial = () => createOfficeCommanderState({ requestId: 'depth-request', scope: 'classin', goal: '요청한 전문 결과', source: '고객 답장\n운영 일정\n계약 검수' }, identity);
function specialist(s, i = 0) { const t = s.tasks[i]; s = act(s, 'set_role_brief', i, { brief: brief(t.ownerId, { taskId: t.id, epoch: t.epoch }) }); s = act(s, 'record_specialist_result', i, { output: output(s.tasks[i].brief) }); return act(s, 'review_result', i, { binding: officeCommanderReviewBinding(s.tasks[i]), reviewedSources: true }); }

test('all nine keep real roster identity and have distinct bounded inputs, outputs and behavioral judgments', () => {
  assert.deepEqual(Object.keys(OFFICE_ROLE_DEPTH_REGISTRY), OFFICE_ROSTER.map(role => role.id));
  for (const role of OFFICE_ROSTER) { const depth = getOfficeRoleDepth(role.id); assert.equal(depth.name, role.name); assert.equal(depth.role, role.role); assert.ok(Object.isFrozen(depth.behavior)); assert.ok(depth.inputFields.length >= 2 && depth.inputFields.length <= 3); assert.ok(depth.outputFields.length === 3); assert.ok(depth.behavior.goodJudgment !== depth.behavior.badJudgment); const instructions = renderOfficeRoleDepthInstructions(role.id); assert.match(instructions, /기존 예시보다 우선/); assert.ok(instructions.includes(depth.behavior.badJudgment)); }
  assert.equal(new Set(OFFICE_ROSTER.map(role => getOfficeRoleDepth(role.id).responsibility)).size, 9);
  assert.throws(() => getOfficeRoleDepth('__proto__'));
});
test('every role validates its own complete output and rejects another role field', () => {
  for (const role of OFFICE_ROSTER) { const b = brief(role.id), result = parseOfficeRoleOutput(output(b), b); assert.equal(result.ownerId, role.id); assert.throws(() => parseOfficeRoleOutput(output(b, { fields: { ...result.fields, otherOwnerField: '역할 밖' } }), b)); }
});
test('missing inputs require linked questions and cannot be presented as a complete draft', () => {
  const b = brief('flareon', { inputs: {} }); assert.throws(() => parseOfficeRoleOutput(output(b), b), /누락/);
  const questions = getOfficeRoleDepth('flareon').inputFields.map(item => ({ inputKey: item.key, question: item.label + ' 확인 필요' }));
  const result = parseOfficeRoleOutput(output(b, { status: 'needs_input', fields: {}, questions }), b); assert.equal(officeRoleReviewGate(result, b).allowed, false);
  assert.throws(() => parseOfficeRoleOutput(output(b, { status: 'needs_input', fields: {}, questions: questions.slice(1) }), b), /질문/);
});
test('scope, owner, epoch, goal, source and completion criteria are tied to the current brief', () => {
  const b = brief(), result = output(b);
  for (const changed of [brief('umbreon'), { ...b, epoch: 1 }, { ...b, goal: '다른 목표' }, { ...b, completionCriteria: ['다른 끝'] }, { ...b, sources: [{ ...b.sources[0], excerpt: '다른 원문' }] }]) assert.throws(() => parseOfficeRoleOutput(result, changed), /바뀌/);
  assert.throws(() => parseOfficeRoleBrief({ ...b, sources: [{ ...b.sources[0], scope: 'personal' }] }), /다른 업무/);
  assert.throws(() => parseOfficeRoleBrief({ ...b, sources: [...b.sources, ...b.sources] }), /중복/);
  for (const field of ['budget', 'tools', 'permission', 'selfScore']) assert.throws(() => parseOfficeRoleBrief({ ...b, [field]: 1 }));
});
test('facts require exact provided quotes; inferences require reasons; quotes never certify semantics', () => {
  const b = brief(), c = output(b).claims[0];
  for (const changed of [{ sourceIds: [] }, { sourceIds: ['missing'] }, { quote: '이미 첨부했습니다.' }, { quote: null }]) assert.throws(() => parseOfficeRoleOutput(output(b, { claims: [{ ...c, ...changed }] }), b));
  assert.throws(() => parseOfficeRoleOutput(output(b, { claims: [{ ...c, kind: 'inference', quote: null, reason: null }] }), b), /이유/);
  const gate = officeRoleReviewGate(output(b), b); assert.equal(gate.sourceTruth, 'provided_quote_link_only'); assert.equal(gate.independentVerification, false); assert.equal(gate.executionApproved, false);
});
test('specialist contract blocks raw-result bypass and retains typed original across review', () => {
  let s = initial(); s = act(s, 'set_role_brief', 0, { brief: brief() });
  assert.throws(() => act(s, 'record_result', 0, { body: '계약 우회', evidence: ['원문'], uncertainties: [] }), /전문 산출물/);
  s = act(s, 'record_specialist_result', 0, { output: output(s.tasks[0].brief) }); s = act(s, 'review_result', 0, { binding: officeCommanderReviewBinding(s.tasks[0]), reviewedSources: true }); assert.equal(officeCommanderReviewCurrent(s.tasks[0]), true);
  s = act(s, 'compile_report'); assert.match(s.report.body, /맞춤 답장/); assert.equal(s.report.complete, false); assert.equal(s.providerCalls, 0); assert.equal(s.businessWrites, false);
});
test('needs_input records questions as blocked and cannot acquire a human review mark', () => {
  let s = initial(); s = act(s, 'set_role_brief', 0, { brief: brief('flareon', { inputs: {} }) }); const b = s.tasks[0].brief;
  s = act(s, 'record_specialist_result', 0, { output: output(b, { status: 'needs_input', fields: {}, questions: getOfficeRoleDepth(b.ownerId).inputFields.map(item => ({ inputKey: item.key, question: item.label + ' 확인' })) }) });
  assert.equal(s.tasks[0].state, 'blocked'); assert.throws(() => act(s, 'review_result', 0, { binding: officeCommanderReviewBinding(s.tasks[0]), reviewedSources: true })); assert.equal(officeCommanderReviewCurrent(s.tasks[0]), false);
});
test('source or owner change invalidates specialist output and preserves previous original body', () => {
  let s = specialist(initial()), body = s.tasks[0].result.body; s = act(s, 'set_role_brief', 0, { brief: { ...s.tasks[0].brief, sources: [{ ...s.tasks[0].brief.sources[0], excerpt: '다른 원문' }] } }); assert.equal(officeCommanderReviewCurrent(s.tasks[0]), false); assert.equal(s.tasks[0].result.body, body); assert.throws(() => act(s, 'review_result', 0, { binding: officeCommanderReviewBinding(s.tasks[0]), reviewedSources: true }), /새 결과/);
  s = act(s, 'assign_owner', 0, { ownerId: 'umbreon' }); assert.equal(s.tasks[0].brief, null); assert.equal(s.tasks[0].result.body, body);
});
test('typed body, foreign task and review-brief removal tampering are rejected', () => {
  const s = specialist(initial()); for (const mutate of [x => x.tasks[0].result.body = '교체 원문', x => x.tasks[0].brief = null, x => { const b = x.tasks[0].result.roleBrief; b.taskId = 'other:t1'; x.tasks[0].result.roleOutput.taskId = b.taskId; }]) { const changed = structuredClone(s); mutate(changed); assert.throws(() => parseOfficeCommanderState(changed)); }
});
test('receiver explicitly accepts current original without spawning or changing ownership', () => {
  let s = specialist(initial()); const source = s.tasks[0], target = s.tasks[1], ack = { status: 'accepted', toOwnerId: target.ownerId, consumedResultBinding: source.review.binding, inputSummary: '회신 대기 조건을 운영 순서에 사용', reason: '담당 범위의 후속 추적' };
  s = act(s, 'ack_handoff', 1, { fromTaskId: source.id, ack }); assert.equal(s.tasks.length, 3); assert.equal(s.tasks[1].ownerId, 'vaporeon'); assert.deepEqual(s.tasks[1].dependencies, [source.id]); assert.equal(s.tasks[1].handoffAcks[0].status, 'accepted'); assert.equal(s.tasks[1].result, null);
  s = act(s, 'record_specialist_result', 0, { output: output(s.tasks[0].brief, { fields: { ...s.tasks[0].result.roleOutput.fields, draft: '변경된 원문' } }) }); assert.equal(s.tasks[1].state, 'blocked'); assert.equal(s.tasks[1].handoffAcks.length, 0);
});
test('needs-input and out-of-scope acknowledgements retain responsibility without adding dependencies', () => {
  for (const status of ['needs_input', 'rejected_out_of_scope']) { let s = specialist(initial()); s = act(s, 'ack_handoff', 1, { fromTaskId: s.tasks[0].id, ack: { status, toOwnerId: 'vaporeon', consumedResultBinding: s.tasks[0].review.binding, inputSummary: '수신한 원문', reason: '기한 입력 필요' } }); assert.equal(s.tasks[1].state, 'blocked'); assert.deepEqual(s.tasks[1].dependencies, []); assert.equal(s.tasks[1].ownerId, 'vaporeon'); }
});
test('handoff rejects stale original, wrong receiver, unsuitable owner pair and dependency cycles', () => {
  let s = specialist(initial()), ack = { status: 'accepted', toOwnerId: 'vaporeon', consumedResultBinding: s.tasks[0].review.binding, inputSummary: '원문', reason: '담당 인계' };
  assert.throws(() => act(s, 'ack_handoff', 1, { fromTaskId: s.tasks[0].id, ack: { ...ack, consumedResultBinding: 'stale' } }), /바뀌/);
  assert.throws(() => act(s, 'ack_handoff', 1, { fromTaskId: s.tasks[0].id, ack: { ...ack, toOwnerId: 'umbreon' } }), /수신/);
  s = act(s, 'assign_owner', 1, { ownerId: 'leafeon' }); assert.throws(() => act(s, 'ack_handoff', 1, { fromTaskId: s.tasks[0].id, ack: { ...ack, toOwnerId: 'leafeon' } }), /책임/);
  s = initial(); s = act(s, 'assign_owner', 1, { ownerId: 'umbreon' }); s = act(s, 'set_dependencies', 0, { dependencies: [s.tasks[1].id] }); s = specialist(s, 1); s = specialist(s, 0); assert.throws(() => act(s, 'ack_handoff', 1, { fromTaskId: s.tasks[0].id, ack: { ...ack, toOwnerId: 'umbreon', consumedResultBinding: s.tasks[0].review.binding } }), /순환/);
});

test('accepted original receipt survives receiver brief, output and retry, then invalidates with source revision', () => {
  let s = specialist(initial()); const source = s.tasks[0]; s = act(s, 'ack_handoff', 1, { fromTaskId: source.id, ack: { status: 'accepted', toOwnerId: 'vaporeon', consumedResultBinding: source.review.binding, inputSummary: '후속 조건을 수신', reason: '현재 전문 owner 범위' } });
  const binding = s.tasks[1].handoffAcks[0].consumedResultBinding; s = specialist(s, 1); assert.equal(s.tasks[1].handoffAcks[0].consumedResultBinding, binding);
  s = act(s, 'fail', 1, { reason: '수정 필요' }); s = act(s, 'retry', 1); assert.equal(s.tasks[1].handoffAcks[0].consumedResultBinding, binding);
  s = act(s, 'record_specialist_result', 0, { output: output(s.tasks[0].brief, { fields: { ...s.tasks[0].result.roleOutput.fields, draft: '원문 수정' } }) }); assert.equal(s.tasks[1].handoffAcks.length, 0); assert.equal(s.tasks[1].state, 'blocked');
});
