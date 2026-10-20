import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./work.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('work.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const names = new Set(['LOAD_SUPERSEDED', 'WORK_CACHE_SERVABLE_MS', 'workLedgerCache']);
const declarations = ast.statements.filter(node =>
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast))))
  || (ts.isFunctionDeclaration(node) && ['useWorkLedger', 'markWorkLedgerPartial'].includes(node.name?.text)));
assert.ok(declarations.some(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useWorkLedger'));
const code = declarations.map(node => node.getText(ast)).join('\n');

function liveData(id = 'first') {
  return {
    source: 'supabase', decisions: [{ id }], decisionsState: { state: 'live', partial: false, error: null },
    rituals: [{ id }], projects: [{ id }], blockedProjects: [],
    rhythm: { state: 'live', partial: false, truncatedSources: [], error: null },
    roadmap: { source: 'supabase', state: 'live', partial: false, error: null, failedSources: [], truncatedSources: [], projects: [{ id }], milestones: [] },
  };
}

// Execute the actual hook read handlers and shared module cache. React state
// cells control remounts; effects are driven explicitly through retry(). No
// product module, HTTP server, database or browser is needed.
function harness(t) {
  let active;
  const requests = [], unexpected = [];
  const React = {
    useState(initial) {
      const cells = active.cells, index = active.cursor++;
      cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cells[index].value, value => { cells[index].value = typeof value === 'function' ? value(cells[index].value) : value; }];
    },
    useRef(initial) { const index = active.cursor++; return active.cells[index] ??= { current: initial }; },
    useCallback(callback) { active.cursor++; return callback; },
    useEffect() { active.cursor++; },
  };
  const fetchImpl = url => new Promise((resolve, reject) => {
    if (url !== '/api/hub/work') unexpected.push(url);
    const request = { settled: false,
      resolve(data, status = 200) { request.settled = true; resolve({ ok: status >= 200 && status < 300, status, json: async () => data }); },
      reject(error) { request.settled = true; reject(error); },
    };
    requests.push(request);
  });
  const hook = new Function('React', 'fetch', `${code}\nreturn useWorkLedger;`)(React, fetchImpl);
  function mount() {
    const app = { cells: [], cursor: 0, state: null };
    app.render = () => { active = app; app.cursor = 0; app.state = hook(); active = null; return app.state; };
    app.render();
    return app;
  }
  t.after(() => {
    for (const request of requests) if (!request.settled) request.reject(new Error('synthetic test cleanup'));
    assert.deepEqual(unexpected, [], 'assert transport boundaries outside application catch');
  });
  async function load(app, data = liveData()) {
    const pending = app.state.retry(); requests.at(-1).resolve(data); await pending; app.render();
  }
  async function warm() { const first = mount(); await load(first); return mount(); }
  return { mount, load, warm, requests };
}

function surfaceStates(state) {
  return [state.syncState, state.decisionsState.state, state.rhythmState, state.roadmap.state];
}

for (const failure of ['network', 'envelope']) {
  test(`cached ${failure} failure marks each consumer partial and preserves rows`, async t => {
    const h = harness(t), app = await h.warm();
    const previous = app.state;
    const pending = app.state.retry();
    if (failure === 'network') h.requests.at(-1).reject(new Error('synthetic offline'));
    else h.requests.at(-1).resolve({ status: 'error', error: 'synthetic read failure' });
    await pending; app.render();
    assert.deepEqual(surfaceStates(app.state), ['partial', 'partial', 'partial', 'partial']);
    assert.equal(app.state.decisions, previous.decisions);
    assert.equal(app.state.rituals, previous.rituals);
    assert.equal(app.state.roadmap.projects, previous.roadmap.projects);
    assert.equal(app.state.decisionsState.partial, true);
    assert.equal(app.state.rhythmPartial, true);
    assert.equal(app.state.roadmap.partial, true);
    assert.match(app.state.decisionsState.error.message, /synthetic/);
    assert.match(app.state.rhythmError, /synthetic/);
    assert.match(app.state.roadmap.error.message, /synthetic/);
    assert.deepEqual(app.state.roadmap.failedSources, ['projects', 'milestones']);
  });
}

test('fresh success and cold failure retain their distinct states', async t => {
  const h = harness(t), app = h.mount();
  const pending = app.state.retry(); h.requests.at(-1).reject(new Error('synthetic offline'));
  await pending; app.render();
  assert.deepEqual(surfaceStates(app.state), ['error', 'error', 'error', 'error']);
  await h.load(app);
  assert.deepEqual(surfaceStates(app.state), ['live', 'live', 'live', 'live']);
  assert.equal(app.state.rhythmPartial, false);
  assert.equal(app.state.decisionsState.error, null);
});

test('successful retry replaces stale rows and clears each partial marker', async t => {
  const h = harness(t), app = await h.warm();
  const failed = app.state.retry(); h.requests.at(-1).reject(new Error('synthetic offline'));
  await failed; app.render();
  await h.load(app, liveData('newer'));
  assert.deepEqual(surfaceStates(app.state), ['live', 'live', 'live', 'live']);
  assert.deepEqual([app.state.decisions[0].id, app.state.rituals[0].id, app.state.roadmap.projects[0].id], ['newer', 'newer', 'newer']);
  assert.equal(app.state.decisionsState.partial, false);
  assert.equal(app.state.rhythmPartial, false);
  assert.equal(app.state.roadmap.partial, false);
  assert.equal(app.state.rhythmError, null);
  assert.equal(app.state.roadmap.error, null);
});

for (const oldResult of ['error', 'success']) {
  test(`late old ${oldResult} cannot overwrite a newer read`, async t => {
    const h = harness(t), app = await h.warm();
    const older = app.state.retry(), oldRequest = h.requests.at(-1);
    const newer = app.state.retry(), newRequest = h.requests.at(-1);
    if (oldResult === 'error') oldRequest.reject(new Error('old synthetic offline'));
    else oldRequest.resolve(liveData('old-response'));
    await new Promise(resolve => setImmediate(resolve));
    app.render();
    const whileNewerPending = surfaceStates(app.state);
    // Settle the new request before joining the old promise, which deliberately
    // follows the most recent read when its own owner has been superseded.
    newRequest.resolve(liveData('new-response'));
    await Promise.all([older, newer]); app.render();
    assert.deepEqual(whileNewerPending, ['live', 'live', 'live', 'live']);
    assert.deepEqual(surfaceStates(app.state), ['live', 'live', 'live', 'live']);
    assert.equal(app.state.decisions[0].id, 'new-response');
    assert.equal(app.state.rituals[0].id, 'new-response');
    assert.equal(app.state.roadmap.projects[0].id, 'new-response');
  });
}

for (const failure of ['network', 'envelope']) {
  test(`tab remount retains cached ${failure} warning until a verified fresh read`, async t => {
    const h = harness(t), app = await h.warm();
    const pending = app.state.retry();
    if (failure === 'network') h.requests.at(-1).reject(new Error('synthetic offline'));
    else h.requests.at(-1).resolve({ status: 'error', error: 'synthetic read failure' });
    await pending; app.render();
    const nextTab = h.mount();
    assert.deepEqual(surfaceStates(nextTab.state), ['partial', 'partial', 'partial', 'partial']);
    assert.equal(nextTab.state.decisions[0].id, 'first');
    assert.match(nextTab.state.decisionsState.error.message, /synthetic/);
    assert.equal(h.requests.length, 2, 'remount alone is not evidence of a successful read');
    await h.load(nextTab, liveData('verified-newer'));
    const afterSuccess = h.mount();
    assert.deepEqual(surfaceStates(afterSuccess.state), ['live', 'live', 'live', 'live']);
    assert.equal(afterSuccess.state.decisions[0].id, 'verified-newer');
  });
}

test('recording a cached failure does not extend the last successful read expiry', async t => {
  let clock = 1000000;
  t.mock.method(Date, 'now', () => clock);
  const h = harness(t), app = await h.warm();
  clock += 4 * 60 * 1000;
  const failed = app.state.retry(); h.requests.at(-1).reject(new Error('synthetic offline'));
  await failed; app.render();
  assert.equal(h.mount().state.decisionsState.state, 'partial');
  clock += 60 * 1000 + 1;
  const expired = h.mount();
  assert.equal(expired.state.decisionsState.state, 'preview');
  assert.deepEqual(expired.state.decisions, []);
});

test('an older consumer failure cannot mark a newer shared cache snapshot partial', async t => {
  const h = harness(t), older = await h.warm();
  const failed = older.state.retry(), pendingFailure = h.requests.at(-1);
  const newer = h.mount(); await h.load(newer, liveData('newest'));
  pendingFailure.reject(new Error('older synthetic offline')); await failed;
  const remounted = h.mount();
  assert.deepEqual(surfaceStates(remounted.state), ['live', 'live', 'live', 'live']);
  assert.equal(remounted.state.decisions[0].id, 'newest');
});
