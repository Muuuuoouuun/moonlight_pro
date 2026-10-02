import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createOfficeCommanderState } from '@com-moon/agent-contracts/office-commander';
import { Button, TextField } from './hub-primitives.jsx';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,next){if(s.endsWith('.module.css'))return {url:'data:text/javascript,export default new Proxy({}, {get:(_,k)=>String(k)})',shortCircuit:true};if(s==='next/image'){const r=await next('next/image.js',c);return {url:'data:text/javascript,'+encodeURIComponent('import Image from '+JSON.stringify(r.url)+';export default Image.default||Image;'),shortCircuit:true};}return next(s,c);}`), import.meta.url);
const { OfficeRoleDepthPanel } = await import('./office-role-depth-panel.jsx');
const commanderUi = await import('./office-commander.jsx');
const snapshot = () => createOfficeCommanderState({ requestId: 'render-depth', scope: 'classin', goal: '자료 대응 준비', source: '고객 답장' }, { workspaceId: 'render', actorId: 'operator' });
const visit = (node, predicate) => { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const found = visit(child, predicate); if (found) return found; } return null; };
const props = draft => { const s = snapshot(); return { task: s.tasks[0], snapshot: s, tasks: s.tasks, disabled: false, onAction() {}, draft, onDraft() {} }; };
test('actual specialist drawer exposes real responsibility and bounded inputs without claiming a completed model task', () => {
  const html = renderToStaticMarkup(React.createElement(OfficeRoleDepthPanel, props({}))); assert.match(html, /좋은 판단/); assert.match(html, /피할 판단/); assert.match(html, /고객 단계/); assert.match(html, /완료 기준/); assert.doesNotMatch(html, /발송 완료|모델 생성 완료/); assert.equal((html.match(/<summary/g) || []).length, 2);
});
test('actual connect button consumes typed inputs and reports invalid criteria without discarding form', () => {
  const actions = [], changes = [], p = props({ depth: { ownerId: 'flareon', inputs: { customerContext: '자료 요청', offerBoundary: '미확인', contactGoal: '확인' }, source: '<script>자료 원문</script>', criteria: '약속을 꾸미지 않음' } }); p.onAction = (...args) => actions.push(args); p.onDraft = value => changes.push(value);
  let tree = OfficeRoleDepthPanel(p); visit(tree, n => n.type === Button && n.props.children === '전문 입력 연결').props.onClick(); assert.equal(actions[0][0], 'set_role_brief'); assert.equal(actions[0][2].brief.sources[0].scope, 'classin'); assert.equal(actions[0][2].brief.sources[0].excerpt, '<script>자료 원문</script>');
  p.draft.depth.criteria = ''; tree = OfficeRoleDepthPanel(p); visit(tree, n => n.type === Button && n.props.children === '전문 입력 연결').props.onClick(); assert.equal(actions.length, 1); assert.match(changes.at(-1).depth.error, /완료 기준/); assert.equal(changes.at(-1).depth.inputs.customerContext, '자료 요청');
});

test('changed brief shows retained previous input but blocks silent submit and requires explicit current-source reuse', async () => {
  const { applyOfficeCommanderAction } = await import('@com-moon/agent-contracts/office-commander'); const { officeRoleBriefFromDraft, officeRoleOutputDraftBinding } = await import('./office-role-depth-client.js');
  let s = snapshot(), seq = 0; const identity = { workspaceId: 'render', actorId: 'operator' }, act = payload => { s = applyOfficeCommanderAction(s, { operationId: 'render-bind-' + ++seq, expectedRevision: s.revision, type: 'set_role_brief', taskId: s.tasks[0].id, payload }, identity).state; };
  const input = { inputs: { customerContext: '고객 요청', offerBoundary: '미확인', contactGoal: '범위 확인' }, source: '첫 원문', criteria: '원문 유지' }; act({ brief: officeRoleBriefFromDraft(s.tasks[0], s, input) });
  let draft = { depth: { ownerId: 'flareon', outputBinding: officeRoleOutputDraftBinding(s.tasks[0]), fields: { customerState: '이전 상태', draft: '이전 입력 문안', nextContact: '이전 조건' }, claimText: '' } }; act({ brief: officeRoleBriefFromDraft(s.tasks[0], s, { ...input, source: '바뀐 원문' }) });
  const p = { task: s.tasks[0], snapshot: s, tasks: s.tasks, disabled: false, onAction() {}, draft, onDraft: value => { draft = { ...draft, ...value }; } }; let tree = OfficeRoleDepthPanel(p);
  assert.equal(visit(tree, n => n.type === Button && n.props.children === '전문 산출물 기록').props.disabled, true); assert.equal(visit(tree, n => n.type === Button && n.props.children === '대조한 이전 입력 불러오기').props.disabled, true);
  const { CheckboxRow, TextAreaField } = await import('./hub-primitives.jsx'); assert.equal(visit(tree, n => n.type === TextAreaField && n.props.label === '바로 검토할 맞춤 답장').props.value, '');
  visit(tree, n => n.type === CheckboxRow).props.onChange(true); p.draft = draft; tree = OfficeRoleDepthPanel(p); visit(tree, n => n.type === Button && n.props.children === '대조한 이전 입력 불러오기').props.onClick(); assert.equal(draft.depth.outputBinding, officeRoleOutputDraftBinding(s.tasks[0])); assert.equal(draft.depth.fields.draft, '이전 입력 문안');
});

test('questions-only previous result input remains visible after a corrected original and requires explicit reuse', async () => {
  const { applyOfficeCommanderAction } = await import('@com-moon/agent-contracts/office-commander');
  const { officeRoleBriefFromDraft, officeRoleOutputDraftBinding } = await import('./office-role-depth-client.js');
  let s = snapshot(); const identity = { workspaceId: 'render', actorId: 'operator' };
  const connect = (source, operationId) => { s = applyOfficeCommanderAction(s, { operationId, expectedRevision: s.revision, type: 'set_role_brief', taskId: s.tasks[0].id, payload: { brief: officeRoleBriefFromDraft(s.tasks[0], s, { inputs: {}, source, criteria: '미확인 질문 보존' }) } }, identity).state; };
  connect('질문 진단 요청으로 이해한 이전 원문', 'questions-old');
  const draft = { depth: { ownerId: 'flareon', outputBinding: officeRoleOutputDraftBinding(s.tasks[0]), status: 'needs_input', fields: {}, questions: { customerContext: '수업 관리 범위인가요?' }, claimText: '', uncertainties: '범위 미확인' } };
  connect('목표 정정: 통합 수업 관리', 'questions-new');
  const p = { task: s.tasks[0], snapshot: s, tasks: s.tasks, disabled: false, onAction() {}, draft, onDraft() {} };
  const tree = OfficeRoleDepthPanel(p), html = renderToStaticMarkup(React.createElement(OfficeRoleDepthPanel, p));
  assert.match(html, /수업 관리 범위인가요/);
  assert.ok(visit(tree, n => n.type === Button && n.props.children === '대조한 이전 입력 불러오기'));
  assert.equal(visit(tree, n => n.type === Button && n.props.children === '대조한 이전 입력 불러오기').props.disabled, true);
});

test('current nonempty goal can be explicitly corrected through the actual UI without creating another plan', () => {
  assert.equal(typeof commanderUi.OfficeCommanderGoalEditor, 'function');
  const s = snapshot(), actions = [], changes = [];
  const tree = commanderUi.OfficeCommanderGoalEditor({ snapshot: s, value: '질문 진단 대신 통합 수업 관리 안내', disabled: false, onChange: value => changes.push(value), onAction: (...args) => actions.push(args) });
  visit(tree, n => n.type === TextField).props.onChange({ target: { value: '통합 수업 관리' } });
  assert.deepEqual(changes, ['통합 수업 관리']);
  visit(tree, n => n.type === Button).props.onClick();
  assert.deepEqual(actions, [['set_goal', null, { goal: '질문 진단 대신 통합 수업 관리 안내' }]]);
  const unchanged = commanderUi.OfficeCommanderGoalEditor({ snapshot: s, value: s.goal, disabled: false, onChange() {}, onAction() {} });
  assert.equal(visit(unchanged, n => n.type === Button).props.disabled, true);
});
