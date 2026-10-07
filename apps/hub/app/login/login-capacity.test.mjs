import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Evaluate the actual LoginForm handlers with synthetic responses. No browser login,
// credential setup, automatic retry, Council dispatch, or external requests occur.
const source = readFileSync(new URL('./page.jsx', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const body = (data, status = 200) => new Response(JSON.stringify(data), { status });
const kids = node => [node?.props?.children ?? []].flat(Infinity);
const text = node => typeof node === 'string' ? node : node && typeof node === 'object' ? kids(node).map(text).join('') : '';
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of kids(node)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function mount(respond, query = '') {
  let cursor = 0;
  const slots = [];
  const calls = [];
  const visits = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback: fn => fn, useEffect: () => {},
  };
  const scope = {
    React, Button: 'Button', Card: 'Card', Input: 'Input', TextAreaField: 'TextAreaField',
    useRouter: () => ({ replace: path => visits.push(path) }), useSearchParams: () => new URLSearchParams(query),
    window: { location: { origin: 'https://hub.example.invalid' } },
    fetch: async (url, init) => {
      assert.equal(url, '/api/operator/session');
      assert.equal(init.method, 'POST');
      calls.push(JSON.parse(init.body));
      return respond(calls.length);
    },
    createCouncilDraftState: () => ({ draft: '', pending: [], error: '', source: null }),
    COUNCIL_HANDOFF_DRAFT_LIMIT: 100, isCouncilHandoffLoginTarget: () => false,
    reduceCouncilDraft: () => { throw new Error('No Council change is allowed'); },
    consumeCouncilDesktopHandoff: () => { throw new Error('No handoff effects are allowed'); },
    councilHandoffLoginPath: () => { throw new Error('No Council routing is allowed'); },
  };
  const LoginForm = new Function(...Object.keys(scope), `${compiled}\nreturn LoginForm;`)(...Object.values(scope));
  const render = () => { cursor = 0; return LoginForm(); };
  const input = (tree, name) => find(tree, n => n.type === 'Input' && n.props.name === name);
  let tree = render();
  input(tree, 'username').props.onChange('synthetic-operator');
  input(tree, 'password').props.onChange('synthetic-password');
  return { render, input, calls, visits, submit: async () => { const tree = render(); await find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); return render(); } };
}

test('capacity busy preserves credentials, shows a neutral retry, and performs no automatic retry', async () => {
  const form = mount(() => body({ status: 'busy' }, 429));
  const tree = await form.submit();
  assert.equal(form.input(tree, 'password').props.value, 'synthetic-password');
  assert.equal(form.input(tree, 'username').props.value, 'synthetic-operator');
  assert.match(text(tree), /로그인 요청이 많습니다.*잠시 후 다시 시도하세요/);
  assert.doesNotMatch(text(tree), /아이디 또는 비밀번호를 확인/);
  const state = find(tree, n => n.type === 'span' && text(n).includes('로그인 요청이 많습니다'));
  assert.equal(state.props.role, 'status');
  assert.equal(find(tree, n => n.type === 'Button' && n.props.type === 'submit').props.disabled, false);
  assert.equal(form.calls.length, 1);
  assert.deepEqual(form.visits, []);
});

test('a manual retry after capacity busy reuses the preserved credentials and can authenticate', async () => {
  const form = mount(n => body(n === 1 ? { status: 'busy' } : { status: 'authenticated' }, n === 1 ? 429 : 200));
  await form.submit();
  const tree = await form.submit();
  assert.equal(form.calls.length, 2);
  assert.deepEqual(form.calls[1], form.calls[0]);
  assert.equal(form.input(tree, 'password').props.value, '');
  assert.deepEqual(form.visits, ['/dashboard']);
});

for (const [label, data, status, message] of [
  ['invalid password', { status: 'unauthorized' }, 401, /아이디 또는 비밀번호를 확인/],
  ['missing configuration', { status: 'not-configured' }, 503, /서버 로그인 설정/],
  ['unrelated 429', { status: 'error' }, 429, /아이디 또는 비밀번호를 확인/],
]) test(`${label} retains its existing password-clearing and error behavior`, async () => {
  const form = mount(() => body(data, status));
  const tree = await form.submit();
  assert.equal(form.input(tree, 'password').props.value, '');
  assert.match(text(tree), message);
  assert.deepEqual(form.visits, []);
});

test('logout cleanup warning survives navigation without claiming browser text was deleted', () => {
  const form = mount(() => { throw Error('render must not request login'); }, 'recoveryCleanup=failed&title=synthetic-private-input');
  const tree = form.render(), warning = find(tree, n => n.type === 'p' && n.props.role === 'alert');
  assert.match(text(warning), /로그아웃했습니다.*복구 입력을 정리하지 못했습니다.*남아 있을 수/);
  assert.doesNotMatch(text(tree), /synthetic-private-input/);assert.equal(form.calls.length, 0);assert.deepEqual(form.visits, []);
});

test('normal login shows no cleanup warning for absent or unrelated flags', () => {
  for (const query of ['', 'recoveryCleanup=other']) {
    const form = mount(() => { throw Error('render must not request login'); }, query);
    assert.doesNotMatch(text(form.render()), /복구 입력을 정리하지 못했습니다/);
  }
});
