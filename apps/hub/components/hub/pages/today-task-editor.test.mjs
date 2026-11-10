import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { dateKeyInZone } from '../../../lib/task-today.js';

const source = readFileSync(new URL('./today-task-editor.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\n/gm, '').replaceAll('export function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
function mount() {
  const notices = [], calls = [], timers = new Map(), pending = [];
  const refs = []; let cursor = 0;
  let result = { ok: true, status: 'saved' };
  const deps = {
    React: { createElement: (type, props) => ({ type, props }), useRef: value => refs[cursor++] ??= { current: value }, useEffect() {} },
    EditDrawer: 'EditDrawer', TASK_PRIORITY_OPTIONS: [], dateKeyInZone,
    useToast: () => Object.fromEntries(['info', 'success', 'error'].map(key => [key, (message, options) => notices.push({ key, message, options })])),
    useUndoableAction: () => ({ schedule: (key, run) => timers.set(key, run), cancel: key => timers.delete(key) }),
  };
  const api = new Function(...Object.keys(deps), `${compiled}; return { todayTaskDraft, todayTaskEditPatch, TodayTaskEditor };`)(...Object.values(deps));
  const original = { id: 'test-task', title: '기존 제목', dueAt: '2026-10-27T05:30:00Z', priority: 'medium', description: '메모', nextAction: '다음 행동', updatedAt: 'v1' };
  const draft = api.todayTaskDraft(original);
  const render = () => { cursor = 0; return api.TodayTaskEditor({ draft, onChange() {}, onClose() {}, onPendingChange: ids => pending.push(ids),
    actions: { run: async (task, patch) => { calls.push({ method: 'PATCH', task, patch }); return result; },
      remove: async task => { calls.push({ method: 'DELETE', task }); return result; } } }); };
  return { ...api, original, draft, render, notices, calls, pending, timers, setResult: value => { result = value; } };
}

test('opening an existing timed task does not rewrite its date, status, focus or unrelated fields', () => {
  const app = mount();
  assert.equal(app.draft.dueAt, '2026-10-27');
  assert.deepEqual(app.todayTaskEditPatch(app.draft), {});
  app.draft.title = '수정한 제목'; app.draft.description = ''; app.draft.dueAt = '';
  assert.deepEqual(app.todayTaskEditPatch(app.draft), { title: '수정한 제목', dueAt: null, description: '', expectedUpdatedAt: 'v1' });
});

test('editor reads canonical priority rather than the board presentation alias', () => {
  const app = mount();
  assert.equal(app.todayTaskDraft({ ...app.original, priority: 'med', priorityRaw: 'medium' }).priority, 'medium');
  assert.equal(app.todayTaskDraft({ ...app.original, priority: 'high', priorityRaw: 'critical' }).priority, 'critical');
  assert.equal(app.todayTaskDraft({ ...app.original, priority: 'med' }).priority, 'medium');
});

test('blank title is rejected without a write, and save failure retains the draft for the same-task retry', async () => {
  const app = mount(); app.draft.title = '  ';
  assert.equal((await app.render().props.onSave()).status, 'invalid-input');
  assert.equal(app.calls.length, 0);
  app.draft.title = '실패 후 남을 제목'; app.setResult({ ok: false, status: 'error', message: 'synthetic failure' });
  assert.equal((await app.render().props.onSave()).ok, false);
  assert.equal(app.draft.title, '실패 후 남을 제목');
  app.setResult({ ok: true, status: 'saved' });
  assert.equal((await app.render().props.onSave()).ok, true);
  assert.equal(app.calls.length, 2);
  assert.deepEqual(app.calls[0], app.calls[1]);
  assert.equal(app.calls[0].task.id, app.original.id);
});

test('confirmed delete is deferred, duplicate callbacks do not schedule twice, and undo cancels before any DELETE', async () => {
  const app = mount();
  assert.equal(app.render().props.onDelete().status, 'deferred');
  assert.equal(app.render().props.onDelete().ok, false);
  assert.equal(app.timers.size, 1); assert.equal(app.calls.length, 0);
  assert.deepEqual(app.pending.at(-1), [app.original.id]);
  app.notices[0].options.action.onClick();
  assert.equal(app.timers.size, 0); assert.deepEqual(app.pending.at(-1), []);
  assert.equal(app.calls.length, 0);
  assert.equal(app.render().props.onDelete().ok, true);
  await [...app.timers.values()][0]();
  assert.deepEqual(app.calls.map(call => call.method), ['DELETE']);
  assert.deepEqual(app.pending.at(-1), []);
});

test('length validation preserves oversized changes instead of accepting a silently truncated server result', async () => {
  for (const [key, limit] of [['title', 300], ['description', 4000], ['nextAction', 1000]]) {
    const app = mount(); app.draft[key] = '가'.repeat(limit + 1);
    const result = await app.render().props.onSave();
    assert.equal(result.status, 'invalid-input'); assert.equal(app.calls.length, 0);
    assert.equal(app.draft[key].length, limit + 1);
    assert.equal(app.render().props.fields.find(field => field.key === key).maxLength, limit);
  }
});

test('failed deferred DELETE clears the lock and offers an honest same-item retry without claiming success', async () => {
  const app = mount(); app.setResult({ ok: false, status: 'error', message: '삭제 실패' });
  app.render().props.onDelete(); await [...app.timers.values()][0]();
  assert.deepEqual(app.pending.at(-1), []);
  assert.equal(app.notices.some(n => n.key === 'success'), false);
  assert.match(app.notices.at(-1).message, /삭제를 확인하지 못했습니다/);
  assert.equal(app.render().props.onDelete().ok, true);
});
