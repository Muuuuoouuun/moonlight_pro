import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createQuickCaptureSession, submitQuickCapture } from '../../lib/quick-task-capture.js';

// Regression: QA-SHARE — a saved share was seeded again on the next blank capture.
// Found by /qa on 2026-10-02. Report: task-2/mobile-review-report.md (outside checkout).
// Exercise the actual popup hooks, parent's consume callback and real session.
const popupSource = readFileSync(new URL('./quick-capture.jsx', import.meta.url), 'utf8');
const popupAST = ts.createSourceFile('quick-capture.jsx', popupSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const popup = popupAST.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'GlobalQuickCapture');
assert.ok(popup);
const javascript = ts.transpileModule(popup.getText(popupAST).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const hubSource = readFileSync(new URL('./hub-app.jsx', import.meta.url), 'utf8');
const hubAST = ts.createSourceFile('hub-app.jsx', hubSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let consumeExpression;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(hubAST) === 'GlobalQuickCapture') {
    const attribute = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(hubAST) === 'onInitialRawConsumed');
    consumeExpression = attribute?.initializer?.expression?.getText(hubAST);
  }
  ts.forEachChild(node, visit);
}
visit(hubAST);

function mount() {
  const slots = [], effects = [];
  let index = 0, tree, raw = '', request = 0, sequence = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(Boolean) } }),
    useState: initial => {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
    useRef: initial => { const key = index++; return slots[key] ??= { current: initial }; },
    useEffect: (effect, deps) => {
      const key = index++, previous = slots[key];
      if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
        effects.push(() => { previous?.cleanup?.(); slots[key] = { deps, cleanup: effect() }; });
      }
    },
  };
  const setInitialCaptureRaw = value => { raw = typeof value === 'function' ? value(raw) : value; };
  const consume = consumeExpression ? new Function('setInitialCaptureRaw', `return ${consumeExpression};`)(setInitialCaptureRaw) : undefined;
  const dependencies = { React, createQuickCaptureSession, createClientId: () => `share-key-${++sequence}`, Drawer: 'Drawer', QuickCaptureForm: 'QuickCaptureForm' };
  const Popup = new Function(...Object.keys(dependencies), `${javascript}; return GlobalQuickCapture;`)(...Object.values(dependencies));
  function render() {
    index = 0;
    tree = Popup({ openRequest: request, initialRaw: raw, onInitialRawConsumed: consume });
    effects.splice(0).forEach(effect => effect());
    // Flush the local setOpen update as React's next render, then settle effects.
    index = 0;
    tree = Popup({ openRequest: request, initialRaw: raw, onInitialRawConsumed: consume });
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  render();
  return {
    render,
    receive: value => { raw = value; request++; return render(); },
    open: () => { request++; return render(); },
    close: () => { tree.props.onClose(); return render(); },
    session: () => tree.props.children[0].props.session,
    sharedRaw: () => raw,
    consume: value => consume?.(value),
  };
}
const savedResponse = async () => ({ ok: true, json: async () => ({ status: 'saved', destinationType: 'task' }) });

test('confirmed share save followed by close and a new capture cannot replay the shared body', async () => {
  const app = mount();
  app.receive('공유받은 한 줄');
  const session = app.session();
  assert.equal(session.snapshot().raw, '공유받은 한 줄');
  assert.equal((await submitQuickCapture(session, { fetchImpl: savedResponse })).durable, true);
  const nextKey = session.snapshot().requestId;
  app.close(); app.open();
  assert.equal(app.session().snapshot().raw, '');
  assert.equal(app.session().snapshot().requestId, nextKey);
  assert.equal(app.session().begin().ok, false, 'opening a blank capture cannot create another record');
});

for (const result of ['preview', 'timeout']) {
  test(`consuming the share seed preserves ${result} draft and receipt key across close/reopen`, async () => {
    const app = mount();
    app.receive('다시 확인할 공유');
    const session = app.session();
    const key = session.snapshot().requestId;
    const fetchImpl = result === 'preview'
      ? async () => ({ ok: true, json: async () => ({ status: 'preview' }) })
      : async () => { const error = new Error('lost response'); error.name = 'TimeoutError'; throw error; };
    assert.equal((await submitQuickCapture(session, { fetchImpl })).durable, false);
    app.close(); app.open();
    assert.equal(app.session().snapshot().raw, '다시 확인할 공유');
    assert.equal(app.session().snapshot().requestId, key);
    assert.equal(app.sharedRaw(), '', 'the session owns the unresolved draft after handoff');
  });
}

test('edits to a shared draft survive popup close without restoring the old parent text', () => {
  const app = mount();
  app.receive('원래 공유');
  app.session().setRaw('사용자가 고친 공유');
  app.close(); app.open();
  assert.equal(app.session().snapshot().raw, '사용자가 고친 공유');
  app.session().setRaw('');
  app.close(); app.open();
  assert.equal(app.session().snapshot().raw, '', 'explicitly clearing a consumed share stays cleared');
});

test('a newly received share does not overwrite an existing draft and is consumed only when inserted', async () => {
  const app = mount();
  app.open(); app.session().setRaw('작성 중인 초안');
  app.receive('다음 공유');
  assert.equal(app.session().snapshot().raw, '작성 중인 초안');
  assert.equal(app.sharedRaw(), '다음 공유');
  await submitQuickCapture(app.session(), { fetchImpl: savedResponse });
  app.close(); app.open();
  assert.equal(app.session().snapshot().raw, '다음 공유');
  assert.equal(app.sharedRaw(), '');
});

test('an older consume acknowledgment cannot clear a newer pending share', () => {
  const app = mount();
  app.open(); app.session().setRaw('기존 입력');
  app.receive('나중에 온 공유');
  app.consume('앞선 공유');
  assert.equal(app.sharedRaw(), '나중에 온 공유');
});
