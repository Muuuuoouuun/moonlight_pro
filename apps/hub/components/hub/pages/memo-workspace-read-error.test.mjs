import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NextResponse } from 'next/server.js';
import * as memoView from '../../../lib/memo-view.js';

const strip = source => source.replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
const source = readFileSync(new URL('./memo-workspace.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(strip(source), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const routeSource = strip(readFileSync(new URL('../../../app/api/hub/memos/route.js', import.meta.url), 'utf8'));
const errorGET = new Function('NextResponse', 'getMemoLedger', 'isCanonicalUuid', `${routeSource};return GET;`)(
  NextResponse, async () => { throw Error('synthetic repository outage'); }, () => true,
);
const live = () => ({
  status: 'live', source: 'supabase', linksComplete: true, failedSources: [], partialSources: [],
  memos: [{ id: 'note-1', kind: 'note', title: 'Synthetic note', body: 'Synthetic original body', projectId: 'project-1', createdAt: '2026-10-01T00:00:00Z' }],
  links: [{ id: 'link-1', note_id: 'note-1', task_id: 'task-1' }],
  tasks: [{ id: 'task-1', title: 'Synthetic task', project_id: 'project-1', status: 'todo' }],
  projects: [{ id: 'project-1', name: 'Synthetic project' }],
});
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children || []].flat(Infinity).flatMap(nodes)];
const text = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? [tree.props?.children || []].flat(Infinity).map(text).join('') : '';

// Execute the actual component, load callback and input events. Only transport
// and React hook storage are local. The actual selected-memo draft effect runs
// when its dependencies change; mount and window registration are isolated.
function mount({ projects } = {}) {
  const cells = [], effectDeps = [];
  let cursor = 0, effectCursor = 0, load, response = Response.json(live()), posts = 0, draftEffects = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial;
      return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useCallback(fn) { load = fn; return fn; },
    useEffect(fn, deps) {
      const i = effectCursor++, previous = effectDeps[i];
      effectDeps[i] = deps;
      if (fn.toString().includes('setDraft({') && (!previous || deps.some((value, index) => value !== previous[index]))) draftEffects.push(fn);
    },
  };
  const scope = { React, ...memoView, Link: 'Link', Button: 'Button', MemoCaptureLink: 'MemoCaptureLink',
    styles: new Proxy({}, { get: (_, key) => key }), MEMO_SAVED_EVENT: 'synthetic-saved',
    isCanonicalUuid: () => true, journalMemosFromLegacyHref: () => '/synthetic-memos' };
  const Component = new Function(...Object.keys(scope), `${code};return MemoWorkspace;`)(...Object.values(scope));
  const fetchImpl = async (url, options) => {
    if (options.method === 'POST') { posts++; throw Error('unexpected write'); }
    assert.equal(options.cache, 'no-store');
    assert.match(url, /^\/api\/hub\/memos/);
    return response;
  };
  const props = { fetchImpl, ...(projects ? { projects } : {}) };
  function render() {
    cursor = 0; effectCursor = 0;
    let tree = Component(props);
    if (draftEffects.length) {
      for (const effect of draftEffects.splice(0)) effect();
      cursor = 0; effectCursor = 0; tree = Component(props);
    }
    return tree;
  }
  render();
  return {
    render, data: () => cells[0], draft: () => cells[9], posts: () => posts,
    read: async next => { response = next; await load(); return render(); },
    editTitle(value) {
      const input = nodes(render()).find(node => node.type === 'input' && node.props.maxLength === 300);
      assert.ok(input); input.props.onChange({ target: { value } }); render();
    },
  };
}
function assertError(view, tree, previous, previousDraft) {
  assert.equal(view.data().status, 'error');
  assert.equal(view.data().linksComplete, false);
  for (const key of ['memos', 'links', 'tasks', 'projects']) assert.equal(view.data()[key], previous[key]);
  assert.equal(view.draft(), previousDraft);
  assert.match(text(tree), /기록을 읽지 못했습니다.*새로고침/);
  if (previous.memos.length) {
    assert.match(text(tree), /Synthetic original body/);
    assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.maxLength === 300).props.value, previousDraft.title);
    assert.equal(nodes(tree).find(node => node.type === 'fieldset').props.disabled, true);
    for (const button of nodes(tree).filter(node => node.type === 'Button' && /할 일로 만들기|선택한 업무에 연결/.test(text(node)))) assert.equal(button.props.disabled, true);
  }
  assert.equal(view.posts(), 0);
}

test('initial actual GET HTTP200 error with memos only leaves a renderable error state', async () => {
  const view = mount(), previous = view.data(), draft = view.draft();
  const response = await errorGET({ url: 'http://localhost/api/hub/memos' });
  assert.equal(response.status, 200);
  const tree = await view.read(response);
  assertError(view, tree, previous, draft);
});

test('actual refresh outage preserves confirmed collections, original body and unsaved editor draft', async () => {
  for (const projects of [undefined, []]) {
    const view = mount({ projects }); await view.read(Response.json(live())); view.editTitle('Synthetic unsaved next action');
    const previous = view.data(), draft = view.draft();
    const tree = await view.read(await errorGET({ url: 'http://localhost/api/hub/memos' }));
    assertError(view, tree, previous, draft);
  }
});

test('source error and HTTP failure preserve prior state instead of replacing it with empty rows', async () => {
  for (const response of [Response.json({ status: 'live', source: 'error', memos: [] }), Response.json({ memos: [] }, { status: 502 }), Response.json(null)]) {
    const view = mount(); await view.read(Response.json(live())); view.editTitle('Synthetic retained draft');
    const previous = view.data(), draft = view.draft();
    assertError(view, await view.read(response), previous, draft);
  }
});

test('confirmed live recovery and confirmed empty reads retain their normal meanings', async () => {
  const view = mount(); await view.read(Response.json(live())); view.editTitle('Synthetic retained draft');
  await view.read(await errorGET({ url: 'http://localhost/api/hub/memos' }));
  const draft = view.draft(), recovered = { ...live(), projects: [{ id: 'project-1', name: 'Synthetic refreshed project' }] };
  const tree = await view.read(Response.json(recovered));
  assert.deepEqual(view.data(), recovered); assert.equal(view.draft(), draft);
  assert.equal(nodes(tree).find(node => node.type === 'fieldset').props.disabled, false);
  assert.doesNotMatch(text(tree), /기록을 읽지 못했습니다/);
  const empty = { ...live(), memos: [], links: [], tasks: [], projects: [] };
  const emptyTree = await view.read(Response.json(empty));
  assert.deepEqual(view.data(), empty); assert.doesNotMatch(text(emptyTree), /Synthetic original body/);
  assert.equal(nodes(emptyTree).some(node => node.type === 'fieldset'), false);
});

test('usable partial data stays readable and only failed relation reads disable linking', async () => {
  for (const [failedSources, expectedDisabled] of [[['projects'], false], [['task_memo_links'], true]]) {
    const view = mount(); const partial = { ...live(), status: 'partial', linksComplete: false, failedSources };
    const tree = await view.read(Response.json(partial));
    assert.deepEqual(view.data(), partial); assert.match(text(tree), /일부 기록만 확인했습니다/);
    assert.match(text(tree), /Synthetic original body/);
    assert.equal(nodes(tree).find(node => node.type === 'fieldset').props.disabled, expectedDisabled);
    assert.equal(view.posts(), 0);
  }
});
