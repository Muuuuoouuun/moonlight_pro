import assert from 'node:assert/strict';
import test from 'node:test';
import { canReviewProjectCompletion, resolveProjectNextAction } from './project-action-state.js';

const task = (id, title, done = false) => ({ id, title, done });
const project = { id: 'synthetic-demo', statusKey: 'active', displayProgress: { source: 'tasks', done: 1, total: 1, partial: false } };
const complete = { project, tasks: [task('demo-check', '데모 확인', true)], sourceState: 'live' };

test('task completion offers review, not lifecycle completion, only from trusted reads', () => {
  assert.equal(canReviewProjectCompletion(complete), true);
  assert.equal(project.statusKey, 'active');
  assert.equal(canReviewProjectCompletion({ ...complete, sourceState: 'partial', failedSources: ['notes'] }), true);
  for (const sourceState of ['loading', 'error', 'preview', undefined]) {
    assert.equal(canReviewProjectCompletion({ ...complete, sourceState }), false);
  }
  for (const source of ['tasks', 'projects']) assert.equal(canReviewProjectCompletion({ ...complete, sourceState: 'partial', failedSources: [source] }), false);
  for (const statusKey of ['completed', 'archived']) assert.equal(canReviewProjectCompletion({ ...complete, project: { ...project, statusKey } }), false);
});

test('empty, partial, or open task lists never become completion evidence', () => {
  assert.equal(canReviewProjectCompletion({ ...complete, tasks: [] }), false);
  assert.equal(canReviewProjectCompletion({ ...complete, tasks: [task('open', '승인 확인')] }), false);
  assert.equal(canReviewProjectCompletion({ ...complete, taskPartial: true }), false);
  assert.equal(canReviewProjectCompletion({ ...complete, project: { ...project, displayProgress: { partial: true } } }), false);
});

test('a unique whitespace-normalized next action focuses the existing task without a duplicate draft', () => {
  assert.deepEqual(resolveProjectNextAction({ displayNextAction: '  제안서\n전달 ' }, [task('sales', '제안서   전달')]), { title: '제안서\n전달', kind: 'task', taskId: 'sales' });
});

test('duplicate titles are ambiguous across open and completed work; never choose the first record', () => {
  const tasks = [task('a', '고객 확인'), task('b', '고객 확인', true)];
  assert.deepEqual(resolveProjectNextAction({ displayNextAction: '고객 확인' }, tasks), { title: '고객 확인', kind: 'ambiguous', taskId: null });
  assert.equal(resolveProjectNextAction({ displayNextAction: '고객 확인' }, [...tasks].reverse()).kind, 'ambiguous');
});

test('a completed match opens evidence rather than drafting the same task again', () => {
  assert.deepEqual(resolveProjectNextAction({ displayNextAction: '촬영 완료' }, [task('video', '촬영 완료', true)]), { title: '촬영 완료', kind: 'done-task', taskId: 'video' });
});

test('fallback retains the selected task identity even when titles collide', () => {
  const a = task('a', '검토'), b = task('b', '검토');
  assert.deepEqual(resolveProjectNextAction({}, [a, b], b), { title: '검토', kind: 'task', taskId: 'b' });
});

test('missing actions use an empty draft, different words/case are not fuzzy-linked', () => {
  assert.deepEqual(resolveProjectNextAction({ displayNextAction: '   ' }), { title: '', kind: 'new', taskId: null });
  assert.equal(resolveProjectNextAction({ displayNextAction: 'Demo' }, [task('x', 'demo')]).kind, 'new');
  assert.equal(resolveProjectNextAction({ displayNextAction: '영상 검토' }, [task('x', '영상 검토 요청')]).kind, 'new');
});
