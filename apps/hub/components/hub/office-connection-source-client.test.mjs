import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createOfficeConnectionInbox, officeCouncilConnectionSource, officeCustomerConnectionSource } from './office-connection-inbox.js';

// Exercise the production event handlers directly, with injected session inputs.
// No browser, API, provider, or storage calls are used by this harness.
const file = fs.readFileSync(new URL('./office-connection-source.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('office-connection-source.jsx', file, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const action = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OfficeConnectionSourceAction');
const handlers = action.body.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => ['capture', 'share'].includes(declaration.name.getText(ast))));
assert.equal(handlers.length, 2);
const code = ts.transpileModule(handlers.map(node => node.getText(ast)).join('\n') + '\nreturn { capture, share };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const brandId = '11111111-1111-4111-8111-111111111111';
const turn = () => ({ id: 'action-turn', message: '공유할 실제 원문', request: { scope: 'personal', mode: 'council' }, result: { status: 'generated', scope: 'personal', mode: 'council', answer: '생성된 전체 본문' }, officeBoundary: { scope: 'personal', brandId } });
function harness(sourceTurn) {
  const inbox = createOfficeConnectionInbox(), reports = [], shared = [];
  const controls = new Function('turn', 'state', 'scope', 'officeCouncilConnectionSource', 'officeCustomerConnectionSource', 'inbox', 'setShared', 'onShared', code)
    (sourceTurn, null, 'personal', officeCouncilConnectionSource, officeCustomerConnectionSource, inbox, result => reports.push(result), source => shared.push(source));
  return { inbox, reports, shared, controls };
}

test('production share handler requires an explicit invocation and shares a frozen source only', () => {
  const original = turn(), h = harness(original);
  h.controls.capture(); assert.equal(h.inbox.get('personal').length, 0);
  h.controls.share();
  assert.equal(h.inbox.get('personal').length, 1); assert.equal(h.reports[0].status, 'shared'); assert.equal(h.shared.length, 1);
  assert.deepEqual(h.shared[0].source.turn, original);
  original.result.answer = '나중에 수정한 출력';
  assert.equal(h.inbox.get('personal')[0].source.turn.result.answer, '생성된 전체 본문');
});

test('production share handler surfaces legacy provenance failure without sharing or invoking downstream work', () => {
  const original = turn(); delete original.officeBoundary;
  const h = harness(original); h.controls.share();
  assert.equal(h.reports[0].status, 'needs_user'); assert.equal(h.shared.length, 0); assert.equal(h.inbox.get('all').length, 0);
});

test('source actions remain in result More disclosures and brand reader mounts only inside opened settings', () => {
  const council = fs.readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8');
  const workflow = fs.readFileSync(new URL('./office-workflow-panel.jsx', import.meta.url), 'utf8');
  assert.match(council, /<details[^>]*><summary>더보기<\/summary>[\s\S]*?<OfficeConnectionSourceAction turn=\{turn\}/);
  assert.match(council, /\{moreOpen \? <Drawer[\s\S]*?<OfficeConnectionBrandPicker scope=\{scope\}/);
  assert.match(workflow, /isCustomer&&<details><summary>더보기<\/summary><OfficeConnectionSourceAction key=\{result.requestId\} state=\{state\} scope=\{scope\}/);
  assert.doesNotMatch(file, /localStorage|sessionStorage|requestOffice\(|sendOfficeWorkflow\(|writeOfficeWorkflow\(/);
});
