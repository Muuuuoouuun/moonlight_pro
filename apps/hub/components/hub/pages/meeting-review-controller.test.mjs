import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as meetingClient from '../../../lib/meeting-review-client.js';

const require = createRequire(import.meta.url);
const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const entry = { id: ENTRY_ID, revision: 1, body: '금요일에 다시 연락합니다.' };

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function snapshot({ requestId = REQUEST_ID, proposals = [], state = 'ready' } = {}) {
  return { status: 'live', entryId: ENTRY_ID, revision: 1,
    run: { requestId, state, sourceRevision: 1, stale: false },
    proposals, usage: { status: 'unknown' } };
}

function acceptedAction() {
  return { id: PROPOSAL_ID, kind: 'action', text: '고객에게 다시 연락',
    source: { start: 0, end: entry.body.length, quote: entry.body },
    review: { status: 'accepted', text: '고객에게 다시 연락',
      execution: { actionScope: 'mine', dueAt: null, method: null, checklist: [] } }, application: { status: 'none' } };
}

function equalDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

// The project does not depend on a browser DOM/test renderer. This small hook
// harness runs the real controller callbacks and effects while the panel stays
// a props boundary, so network ordering and receipt behavior remain observable.
function makeHookHarness() {
  const cells = [];
  let cursor = 0;
  let effects = [];
  const React = {
    createElement: (type, props) => ({ type, props }),
    useRef(initial) {
      const index = cursor++;
      return cells[index] ??= { current: initial };
    },
    useState(initial) {
      const index = cursor++;
      const cell = cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, (next) => { cell.value = typeof next === 'function' ? next(cell.value) : next; }];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      const cell = cells[index];
      if (cell && equalDeps(cell.deps, deps)) return cell.callback;
      cells[index] = { callback, deps };
      return callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!cells[index] || !equalDeps(cells[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  function render(component, props) {
    cursor = 0;
    effects = [];
    const output = component(props);
    for (const pending of effects) {
      cells[pending.index]?.cleanup?.();
      cells[pending.index] = { deps: pending.deps, cleanup: pending.effect() };
    }
    return output.props;
  }
  return { React, render };
}

function loadController(React) {
  const source = readFileSync(new URL('./meeting-review-controller.jsx', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { fileName: 'meeting-review-controller.jsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const fakeRequire = (name) => name === 'react' ? React
    : name === '@/lib/meeting-review-client' ? meetingClient
      : name === './meeting-review-panel' ? { MeetingReviewPanel() {} } : require(name);
  new Function('require', 'module', 'exports', javascript)(fakeRequire, module, module.exports);
  return module.exports.MeetingReviewController;
}

async function mountedController(fetchImpl, props = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  const hooks = makeHookHarness();
  const component = loadController(hooks.React);
  const render = () => hooks.render(component, { entry, ...props });
  try {
    render(); // Mount effect starts the initial GET.
    await new Promise((resolve) => setImmediate(resolve));
    return { render, restore: () => { globalThis.fetch = originalFetch; } };
  } catch (error) {
    globalThis.fetch = originalFetch;
    throw error;
  }
}

test('meeting review controller async receipts', async (t) => {
  await t.test('same-frame analysis clicks send one POST', async () => {
    let postCount = 0;
    let finishPost;
    let latest = { status: 'live', entryId: ENTRY_ID, revision: 1, run: null, proposals: [], usage: { status: 'unknown' } };
    const harness = await mountedController((path, options = {}) => {
      if (options.method === 'POST') {
        postCount++;
        const requestId = JSON.parse(options.body).requestId;
        return new Promise((resolve) => { finishPost = () => {
          latest = snapshot({ requestId });
          resolve(response({ status: 'saved' }));
        }; });
      }
      return Promise.resolve(response(latest));
    });
    try {
      const panel = harness.render();
      assert.equal(panel.status, 'live');
      const first = panel.onAnalyze();
      const second = panel.onAnalyze();
      assert.equal(postCount, 1);
      finishPost();
      await Promise.all([first, second]);
      assert.equal(harness.render().run.state, 'ready');
    } finally { harness.restore(); }
  });

  await t.test('POST timeout recovers the saved analysis through GET receipt', async () => {
    let postCount = 0;
    let getCount = 0;
    let latest = { status: 'live', entryId: ENTRY_ID, revision: 1, run: null, proposals: [], usage: { status: 'unknown' } };
    const harness = await mountedController((path, options = {}) => {
      if (options.method === 'POST') {
        postCount++;
        latest = snapshot({ requestId: JSON.parse(options.body).requestId });
        return Promise.reject(new DOMException('The operation timed out', 'TimeoutError'));
      }
      getCount++;
      return Promise.resolve(response(latest));
    });
    try {
      await harness.render().onAnalyze();
      const panel = harness.render();
      assert.equal(postCount, 1);
      assert.equal(getCount, 2);
      assert.equal(panel.run.state, 'ready');
      assert.equal(panel.error, '');
    } finally { harness.restore(); }
  });

  await t.test('saved task POST plus failed GET locks the local application', async () => {
    let taskPosts = 0;
    let getCount = 0;
    let applied = 0;
    const action = acceptedAction();
    const harness = await mountedController((path, options = {}) => {
      if (options.method === 'POST') {
        taskPosts++;
        const command = JSON.parse(options.body);
        return Promise.resolve(response({ status: 'saved', entry: { id: ENTRY_ID },
          target: { type: 'task', id: TASK_ID, href: `/dashboard/work/my?task=${TASK_ID}` },
          link: { targetType: 'task', targetId: TASK_ID, sourceRevision: 1, excerpt: command.selection.text } }));
      }
      getCount++;
      return Promise.resolve(response(getCount === 1 ? snapshot({ proposals: [action] })
        : { status: 'error', message: '읽기 실패' }));
    }, { onApplied: () => { applied++; } });
    try {
      const panel = harness.render();
      assert.equal(panel.status, 'live');
      await panel.onApplyTask(PROPOSAL_ID);
      const after = harness.render();
      assert.equal(taskPosts, 1);
      assert.equal(applied, 1);
      assert.equal(after.status, 'live');
      assert.equal(after.proposals[0].application.status, 'saved');
      assert.equal(after.proposals[0].application.targetId, TASK_ID);
      assert.match(after.error, /다시 읽지 못했어요/);
      await after.onApplyTask(PROPOSAL_ID);
      assert.equal(taskPosts, 1);
    } finally { harness.restore(); }
  });

  await t.test('HTTP 200 status:error read never enables analysis', async () => {
    let postCount = 0;
    const harness = await mountedController((path, options = {}) => {
      if (options.method === 'POST') { postCount++; return Promise.resolve(response({ status: 'saved' })); }
      return Promise.resolve(response({ status: 'error', message: '저장소 읽기 실패' }));
    });
    try {
      const panel = harness.render();
      assert.equal(panel.status, 'error');
      assert.equal(panel.proposals.length, 0);
      await panel.onAnalyze();
      assert.equal(postCount, 0);
    } finally { harness.restore(); }
  });
});
