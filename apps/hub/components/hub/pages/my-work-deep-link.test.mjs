import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./my-work.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('my-work.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect'
    && node.arguments[0]?.getText(ast).includes("const requestedTaskId = searchParams?.get('task')")) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'exercise the production task-link consumer');
const task = id => ({ id: `task-${id}`, entityId: id, lane: 'task', bucket: 'today' });

function mount() {
  const consumed = { current: null }, opened = [], navigation = [], changes = [];
  let props = { searchParams: new URLSearchParams(), items: [task('one'), task('two')], state: 'ready', sources: { tasks: 'live' } };
  return {
    opened, navigation, changes, consumed,
    render(next = {}) {
      props = { ...props, ...next };
      const dependencies = { ...props, taskDeepLinkRef: consumed, pathname: '/dashboard/work/my',
        router: { replace: value => navigation.push(value) },
        setLane: value => changes.push(['lane', value]), setBucketFilter: value => changes.push(['bucket', value]),
        setSearch: value => changes.push(['search', value]), setDetailId: value => opened.push(value),
        scrollToRow: value => changes.push(['scroll', value]), normalizeBucket: item => item.bucket };
      new Function(...Object.keys(dependencies), `return (${effect});`)(...Object.values(dependencies))();
    },
  };
}

test('the same command-palette task can reopen after its query was consumed on the mounted page', () => {
  const app = mount();
  app.render({ searchParams: new URLSearchParams('task=one&lens=list&scope=personal') });
  assert.deepEqual(app.opened, ['task-one']);
  assert.equal(app.navigation[0], '/dashboard/work/my?scope=personal');
  app.render({ searchParams: new URLSearchParams('scope=personal') });
  app.render({ searchParams: new URLSearchParams('task=one&scope=personal') });
  assert.deepEqual(app.opened, ['task-one', 'task-one']);
  app.render();
  assert.equal(app.opened.length, 2, 'the same unconsumed URL is still handled once');
});

for (const state of ['loading', 'error', 'stale', 'unauthorized']) test(`a ${state} read retains the task link until a confirmed retry`, () => {
  const app = mount();
  app.render({ state, searchParams: new URLSearchParams('task=one') });
  assert.deepEqual(app.opened, []); assert.deepEqual(app.navigation, []); assert.equal(app.consumed.current, null);
  app.render({ state: 'ready' });
  assert.deepEqual(app.opened, ['task-one']); assert.equal(app.navigation[0], '/dashboard/work/my');
});

test('source failures retain context while a partial read can open an actual supplied task', () => {
  const app = mount();
  app.render({ searchParams: new URLSearchParams('task=two'), sources: { tasks: 'error' } });
  assert.deepEqual(app.opened, []); assert.deepEqual(app.navigation, []);
  app.render({ sources: { tasks: 'partial' }, items: [{ ...task('two'), bucket: 'later' }] });
  assert.deepEqual(app.opened, ['task-two']);
  assert.ok(app.changes.some(([kind, value]) => kind === 'bucket' && value === 'later'));
});
