import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./inquiries.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('inquiries.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let component;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'CreateInquiry') component = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(component);
const code = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;

function mount(writeInquiry) {
  const slots = [], saved = [];
  let cursor = 0, tree;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }];
    },
    useRef(initial) { const at = cursor++; return slots[at] ??= { current: initial }; },
  };
  const blankDraft = () => ({ subject: 'Synthetic inquiry', body: 'Synthetic body', kind: 'general', org_scope: 'unclassified', contact_name: '', contact_email: '', contact_phone: '' });
  const C = new Function('React', 'blankDraft', 'writeInquiry', 'Drawer', 'Button', 'InquiryFields', `${code}; return CreateInquiry;`)(React, blankDraft, writeInquiry, 'Drawer', 'Button', 'InquiryFields');
  const render = () => { cursor = 0; tree = C({ scope: 'personal', onClose() {}, onSaved: id => saved.push(id) }); };
  const form = () => tree.props.children[0];
  const fields = () => form().props.children[0];
  render();
  return { render, saved, submit: () => form().props.onSubmit({ preventDefault() {} }),
    fields, change: patch => { fields().props.setDraft(current => ({ ...current, ...patch })); render(); },
    message: () => form().props.children[1]?.props.children[0], label: () => tree.props.footer.props.children[0],
  };
}

test('a duplicate create receipt retains changed classification until an explicit update saves it', async () => {
  const calls = [];
  let stored;
  const app = mount(async command => {
    calls.push(command);
    if (calls.length === 1) {
      stored = { id: 'synthetic-inquiry', updated_at: '2026-10-27T00:00:00Z', kind: command.kind, org_scope: command.orgScope };
      throw Error('synthetic reply lost after commit');
    }
    if (command.action === 'ingest') return { status: 'duplicate', inquiry: stored };
    assert.equal(command.id, stored.id); assert.equal(command.expectedUpdatedAt, stored.updated_at);
    stored = { ...stored, ...command.patch };
    return { status: 'saved', inquiry: stored };
  });
  await app.submit(); app.render();
  app.change({ kind: 'sales', org_scope: 'classin' });
  await app.submit(); app.render();
  assert.equal(calls[0].externalEventId, calls[1].externalEventId);
  assert.deepEqual(app.saved, [], 'duplicate must not acknowledge edits it did not persist');
  assert.equal(app.fields().props.draft.kind, 'sales'); assert.equal(app.fields().props.draft.org_scope, 'classin');
  assert.equal(app.fields().props.classificationOnly, true);
  assert.match(app.message(), /아직 반영되지 않았습니다/); assert.equal(app.label(), '변경 저장');
  await app.submit(); app.render();
  assert.deepEqual(calls[2].patch, { kind: 'sales', org_scope: 'classin' });
  assert.deepEqual(app.saved, ['synthetic-inquiry']);
});

test('same-frame double submit sends one create and an unchanged duplicate remains a success', async () => {
  let release, calls = 0;
  const app = mount(command => {
    calls++;
    return new Promise(resolve => { release = () => resolve({ status: 'duplicate', inquiry: { id: 'synthetic-inquiry', kind: command.kind, org_scope: command.orgScope } }); });
  });
  const first = app.submit(), second = app.submit();
  assert.equal(calls, 1);
  release(); await Promise.all([first, second]);
  assert.deepEqual(app.saved, ['synthetic-inquiry']);
});

test('a failed classification update preserves the input and can retry the same existing inquiry', async () => {
  let attempts = 0;
  const existing = { id: 'synthetic-existing', updated_at: '2026-10-27T00:00:00Z', kind: 'general', org_scope: 'personal' };
  const app = mount(async command => {
    if (command.action === 'ingest') return { status: 'duplicate', inquiry: existing };
    attempts++;
    assert.equal(command.id, existing.id);
    if (attempts === 1) throw Error('synthetic rejection');
    return { status: 'saved', inquiry: { ...existing, ...command.patch } };
  });
  app.change({ kind: 'support' }); await app.submit(); app.render();
  await app.submit(); app.render();
  assert.deepEqual(app.saved, []); assert.equal(app.fields().props.draft.kind, 'support');
  await app.submit();
  assert.deepEqual(app.saved, [existing.id]); assert.equal(attempts, 2);
});
