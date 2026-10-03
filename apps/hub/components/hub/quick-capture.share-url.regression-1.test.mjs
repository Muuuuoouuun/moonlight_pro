import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createQuickCaptureSession, submitQuickCapture } from '../../lib/quick-task-capture.js';
import { savedSharedCaptureTarget, snapshotSharedCaptureQuery } from '../../lib/shared-capture-navigation.js';

// QA-SHARE-URL: confirmed shared captures replayed after reload because their
// incoming GET fields stayed in the URL. Run the actual popup/intake/save callbacks.
const parse = name => ts.createSourceFile(name, readFileSync(new URL(name, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const popupAST = parse('./quick-capture.jsx');
const hubAST = parse('./hub-app.jsx');
const popup = popupAST.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'GlobalQuickCapture');
const javascript = ts.transpileModule(popup.getText(popupAST).replace(/^export /, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
let consumeExpression, savedExpression, intakeExpression, submitSource;
function visitHub(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(hubAST) === 'GlobalQuickCapture') {
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) continue;
      if (attribute.name.getText(hubAST) === 'onInitialRawConsumed') consumeExpression = attribute.initializer?.expression?.getText(hubAST);
      if (attribute.name.getText(hubAST) === 'onSharedDraftSaved') savedExpression = attribute.initializer?.expression?.getText(hubAST);
    }
  }
  if (ts.isCallExpression(node) && node.expression.getText(hubAST) === 'React.useEffect'
      && node.arguments[0]?.getText(hubAST).includes('handledShareRef.current')) intakeExpression = node.arguments[0].getText(hubAST);
  ts.forEachChild(node, visitHub);
}
function visitPopup(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submit') submitSource = node.getText(popupAST);
  ts.forEachChild(node, visitPopup);
}
visitHub(hubAST); visitPopup(popupAST);
assert.ok(intakeExpression); assert.ok(submitSource);
const submitJavascript = ts.transpileModule(submitSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function mount(initialUrl = 'https://moonlight.test/dashboard') {
  const slots = [], effects = [], replacements = [];
  const browser = { location: { href: initialUrl } };
  const sharedCaptureQueryRef = { current: null }, handledShareRef = { current: false };
  let index = 0, tree, raw = '', request = 0, sequence = 0, normalSaves = 0;
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
  const setCaptureOpenRequest = value => { request = typeof value === 'function' ? value(request) : value; };
  const consume = new Function('setInitialCaptureRaw', `return ${consumeExpression};`)(setInitialCaptureRaw);
  const router = { replace(target, options) { replacements.push({ target, options }); browser.location.href = new URL(target, browser.location.href).href; } };
  const dependencies = { React, createQuickCaptureSession, createClientId: () => `share-url-key-${++sequence}`, Drawer: 'Drawer', QuickCaptureForm: 'QuickCaptureForm' };
  const Popup = new Function(...Object.keys(dependencies), `${javascript}; return GlobalQuickCapture;`)(...Object.values(dependencies));
  function render() {
    const onSharedDraftSaved = savedExpression ? new Function('window', 'router', 'sharedCaptureQuery', 'sharedCaptureQueryRef', 'savedSharedCaptureTarget', `return ${savedExpression};`)(browser, router, sharedCaptureQueryRef.current, sharedCaptureQueryRef, savedSharedCaptureTarget) : undefined;
    const props = { openRequest: request, initialRaw: raw, onInitialRawConsumed: consume, onSharedDraftSaved, onSaved: () => { normalSaves++; } };
    index = 0; tree = Popup(props);
    effects.splice(0).forEach(effect => effect());
    index = 0; tree = Popup({ ...props, initialRaw: raw });
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  function intake() {
    const params = new URL(browser.location.href).searchParams;
    new Function('searchParams', 'handledShareRef', 'sharedCaptureQueryRef', 'snapshotSharedCaptureQuery', 'setInitialCaptureRaw', 'setCaptureOpenRequest', `return ${intakeExpression};`)(params, handledShareRef, sharedCaptureQueryRef, snapshotSharedCaptureQuery, setInitialCaptureRaw, setCaptureOpenRequest)();
    return render();
  }
  render(); intake();
  const session = () => tree.props.children[0].props.session;
  return {
    session, replacements,
    url: () => browser.location.href,
    normalSaves: () => normalSaves,
    pendingRaw: () => raw,
    open: () => { request++; return render(); },
    close: () => { tree.props.onClose(); return render(); },
    receiveUrl: href => { browser.location.href = href; return intake(); },
    move: href => { browser.location.href = href; return render(); },
    async save(result = 'saved') {
      const fetchImpl = result === 'timeout' ? async () => { const error = new Error('lost response'); error.name = 'TimeoutError'; throw error; }
        : async () => ({ ok: result !== 'error', status: result === 'error' ? 500 : 200, json: async () => ({ status: result, destinationType: 'task' }) });
      const submit = new Function('session', 'onSaved', 'submitQuickCapture', `${submitJavascript}; return submit;`)(session(), tree.props.children[0].props.onSaved, current => submitQuickCapture(current, { fetchImpl }));
      await submit({ preventDefault() {} });
      render();
    },
  };
}

const shareUrl = 'https://moonlight.test/dashboard?scope=me&title=%EA%B3%B5%EC%9C%A0&text=%ED%95%9C+%EC%A4%84&url=https%3A%2F%2Fexample.test%2Fref#capture';
test('confirmed shared save removes only its URL fields and cannot replay on reload', async () => {
  const app = mount(shareUrl);
  assert.equal(app.session().snapshot().raw, '공유\n한 줄\nhttps://example.test/ref');
  assert.equal(app.url(), shareUrl, 'unsaved intake keeps its URL');
  await app.save();
  assert.deepEqual(app.replacements, [{ target: '/dashboard?scope=me#capture', options: { scroll: false } }]);
  assert.equal(app.normalSaves(), 1, 'existing onSaved still runs exactly once');
  const reloaded = mount(app.url());
  reloaded.open();
  assert.equal(reloaded.session().snapshot().raw, '');
});

for (const result of ['preview', 'timeout', 'error']) {
  test(`${result} keeps shared query and draft until a confirmed retry`, async () => {
    const app = mount(shareUrl);
    const key = app.session().snapshot().requestId;
    await app.save(result);
    assert.equal(app.url(), shareUrl);
    assert.equal(app.replacements.length, 0);
    assert.equal(app.normalSaves(), 0);
    app.close(); app.open();
    assert.equal(app.session().snapshot().requestId, key);
    assert.equal(app.session().snapshot().raw, '공유\n한 줄\nhttps://example.test/ref');
    const reloaded = mount(app.url());
    assert.equal(reloaded.session().snapshot().raw, app.session().snapshot().raw);
    await app.save('duplicate');
    assert.equal(app.replacements.length, 1);
  });
}

test('nonempty edit keeps share ownership and saving preserves the latest route, query and hash', async () => {
  const app = mount(shareUrl);
  app.session().setRaw('고친 공유 본문');
  const moved = shareUrl.replace('/dashboard?', '/dashboard/tasks?filter=all&').replace('#capture', '#today');
  app.move(moved);
  await app.save();
  assert.equal(app.replacements[0]?.target, '/dashboard/tasks?filter=all&scope=me#today');
});

test('explicit clear followed by unrelated text/save leaves the unsaved share URL intact', async () => {
  const app = mount(shareUrl);
  app.session().setRaw('');
  assert.equal(app.url(), shareUrl);
  app.close(); app.open();
  app.session().setRaw('다른 입력');
  await app.save();
  assert.equal(app.url(), shareUrl);
  assert.equal(app.replacements.length, 0);
  assert.equal(app.normalSaves(), 1);
});

test('whitespace clear also detaches the shared save callback', async () => {
  const app = mount(shareUrl);
  app.session().setRaw(' \n ');
  app.session().setRaw('새 입력');
  await app.save();
  assert.equal(app.url(), shareUrl);
});

test('saving an occupied draft cannot consume a share that was never inserted', async () => {
  const app = mount();
  app.open(); app.session().setRaw('작성 중이던 초안');
  app.receiveUrl(shareUrl);
  assert.equal(app.session().snapshot().raw, '작성 중이던 초안');
  assert.ok(app.pendingRaw());
  await app.save();
  assert.equal(app.url(), shareUrl);
  assert.equal(app.replacements.length, 0);
  app.close(); app.open();
  assert.equal(app.session().snapshot().raw, '공유\n한 줄\nhttps://example.test/ref');
  await app.save();
  assert.equal(app.replacements.length, 1, 'inserting then saving the pending share consumes it');
});

test('an older share save does not remove a newer incoming share query', async () => {
  const app = mount(shareUrl);
  const latest = shareUrl.replace('%ED%95%9C+%EC%A4%84', '%EB%8B%A4%EB%A5%B8+%EA%B3%B5%EC%9C%A0');
  app.move(latest);
  await app.save();
  assert.equal(app.url(), latest);
  assert.equal(app.replacements.length, 0);
  assert.equal(app.normalSaves(), 1);
});

test('a later unrelated save cannot reuse a consumed shared callback', async () => {
  const app = mount(shareUrl);
  await app.save();
  app.session().setRaw('후속 입력');
  app.move(shareUrl.replace('text=', 'text=new-'));
  await app.save();
  assert.equal(app.replacements.length, 1);
  assert.equal(app.normalSaves(), 2);
});

test('navigation helper preserves repeated unrelated fields, bytes, route and hash', () => {
  const current = 'https://moonlight.test/dashboard/tasks?title=t&view=a%20b&text=&scope=me&url=u&view=a+b#part%20one';
  const expected = snapshotSharedCaptureQuery(new URL(current).searchParams);
  assert.equal(savedSharedCaptureTarget(current, expected), '/dashboard/tasks?view=a%20b&scope=me&view=a+b#part%20one');
});

test('navigation helper compares all repeated fields and handles a share-only URL', () => {
  const current = 'https://moonlight.test/dashboard?title=t&text=one&text=two&url=';
  const expected = snapshotSharedCaptureQuery(new URL(current).searchParams);
  assert.equal(savedSharedCaptureTarget(current, expected), '/dashboard');
  assert.equal(savedSharedCaptureTarget(current.replace('text=two', 'text=three'), expected), null);
  assert.equal(savedSharedCaptureTarget(current.replace('title=t', 'title= t'), expected), null);
  assert.equal(savedSharedCaptureTarget(current, null), null);
  assert.equal(savedSharedCaptureTarget(current, snapshotSharedCaptureQuery(new URLSearchParams('scope=me'))), null);
});
