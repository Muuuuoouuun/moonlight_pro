import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROJECT_INDEX_SORT_OPTIONS,
  normalizeProjectIndexPreferences,
  sortProjectIndex,
  moveProjectIndex,
} from './project-index-order.js';

const ids = (rows) => rows.map((row) => row.id);

test('preferences normalize malformed storage, stale duplicate IDs and unsupported sorts', () => {
  for (const value of [undefined, null, false, 'manual', [], 2]) {
    assert.deepEqual(normalizeProjectIndexPreferences(value), { order: [], sort: 'manual' });
  }
  const stored = { order: [' a ', null, 'b', 'a', '', 3, '  ', 'hidden', 'b'], sort: 'unsupported' };
  assert.deepEqual(normalizeProjectIndexPreferences(stored), { order: ['a', 'b', 'hidden'], sort: 'manual' });
  assert.equal(stored.order[0], ' a ', 'normalization must not edit stored input');
  for (const { value } of PROJECT_INDEX_SORT_OPTIONS) assert.equal(normalizeProjectIndexPreferences({ sort: value }).sort, value);
  const large = normalizeProjectIndexPreferences({ order: Array.from({ length: 10020 }, (_, index) => `project-${index}`) });
  assert.equal(large.order.length, 10000);
  assert.equal(large.order.at(-1), 'project-9999');
});

test('manual order retains unknown saved scopes, puts new projects last and never mutates records', () => {
  const projects = Object.freeze([
    Object.freeze({ id: 'new-one', name: '새 프로젝트' }),
    Object.freeze({ id: 'a', name: '가' }),
    Object.freeze({ id: 'new-two', name: '또 새 프로젝트' }),
    Object.freeze({ id: 'b', name: '나' }),
  ]);
  const sorted = sortProjectIndex(projects, { order: ['hidden', 'b', 'a'], sort: 'manual' });
  assert.deepEqual(ids(sorted), ['b', 'a', 'new-one', 'new-two']);
  assert.notEqual(sorted, projects);
  assert.equal(sorted[0], projects[3], 'sorting preserves entity identity');
  assert.deepEqual(ids(projects), ['new-one', 'a', 'new-two', 'b']);
  assert.deepEqual(sortProjectIndex(null), []);
});

test('name order uses Korean collation and numeric chunks in both directions', () => {
  const projects = [{ id: 'n', name: '나 1' }, { id: 'g10', name: '가 10' }, { id: 'g2', name: '가 2' }];
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'name-asc' })), ['g2', 'g10', 'n']);
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'name-desc' })), ['n', 'g10', 'g2']);
});

test('due dates keep missing and unreadable values last in both directions', () => {
  const projects = [
    { id: 'unset', dueAt: null }, { id: 'late', dueAt: '2026-09-30T00:00:00Z' },
    { id: 'invalid', dueAt: 'not-a-date' }, { id: 'early', dueAt: '2026-09-20' }, { id: 'blank', dueAt: '' },
  ];
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'due-asc' })), ['early', 'late', 'unset', 'invalid', 'blank']);
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'due-desc' })), ['late', 'early', 'unset', 'invalid', 'blank']);
});

test('measured zero progress differs from missing, partial, nonnumeric and nonfinite values', () => {
  const projects = [
    { id: 'unset' }, { id: 'partial', displayProgress: { value: 90, partial: true } },
    { id: 'zero', displayProgress: { value: 0 } }, { id: 'null', displayProgress: { value: null } },
    { id: 'half', displayProgress: { value: 50, partial: false } },
    { id: 'string', displayProgress: { value: '0' } }, { id: 'infinity', displayProgress: { value: Infinity } },
    { id: 'nan', displayProgress: { value: NaN } },
  ];
  const unknown = ['unset', 'partial', 'null', 'string', 'infinity', 'nan'];
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'progress-asc' })), ['zero', 'half', ...unknown]);
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'progress-desc' })), ['half', 'zero', ...unknown]);
});

test('recent updates compare actual instants and put missing timestamps last', () => {
  const projects = [
    { id: 'missing' }, { id: 'older', updatedAt: '2026-09-23T08:00:00+09:00' },
    { id: 'newer', updatedAt: '2026-09-23T00:00:00Z' }, { id: 'invalid', updatedAt: 'yesterday' },
  ];
  assert.deepEqual(ids(sortProjectIndex(projects, { sort: 'updated-desc' })), ['newer', 'older', 'missing', 'invalid']);
});

test('every sorting mode breaks equal values by manual rank then original position', () => {
  const projects = ['new-first', 'a', 'new-second', 'b'].map((id) => ({
    id, name: '같은 이름', dueAt: '2026-09-23', displayProgress: { value: 0 }, updatedAt: '2026-09-23T00:00:00Z',
  }));
  for (const { value: sort } of PROJECT_INDEX_SORT_OPTIONS) {
    assert.deepEqual(ids(sortProjectIndex(projects, { sort, order: ['b', 'hidden', 'a'] })), ['b', 'a', 'new-first', 'new-second'], sort);
  }
  const unknown = projects.map(({ id }) => ({ id }));
  for (const sort of ['due-asc', 'due-desc', 'progress-asc', 'progress-desc', 'updated-desc']) {
    assert.deepEqual(ids(sortProjectIndex(unknown, { sort, order: ['b', 'a'] })), ['b', 'a', 'new-first', 'new-second'], sort);
  }
});

test('moving visible projects preserves hidden filtered slots and other-brand IDs', () => {
  const order = Object.freeze(['a', 'hidden-one', 'b', 'hidden-two', 'c', 'unknown-saved']);
  assert.deepEqual(moveProjectIndex(order, ['a', 'b', 'c'], 'c', 'a'), ['c', 'hidden-one', 'a', 'hidden-two', 'b', 'unknown-saved']);
  assert.deepEqual(moveProjectIndex(order, ['a', 'b', 'c'], 'a', 'b', 'after'), ['b', 'hidden-one', 'a', 'hidden-two', 'c', 'unknown-saved']);
  assert.deepEqual(moveProjectIndex(order, ['a', 'b', 'c'], 'a', null, 'end'), ['b', 'hidden-one', 'c', 'hidden-two', 'a', 'unknown-saved']);
  assert.deepEqual(order, ['a', 'hidden-one', 'b', 'hidden-two', 'c', 'unknown-saved']);
});

test('moving uses current rendered order and appends newly rendered IDs only once', () => {
  assert.deepEqual(moveProjectIndex(['a', 'hidden', 'b', 'c'], ['c', 'b', 'a'], 'a', 'c'), ['a', 'hidden', 'c', 'b']);
  assert.deepEqual(moveProjectIndex(['hidden', 'a', 'a', 'b'], ['a', 'b', 'c', 'c'], 'c', 'a'), ['hidden', 'c', 'a', 'b']);
});

test('invalid and self moves remain no-ops while adjacent moves preserve a matching snapshot', () => {
  const order = ['a', 'hidden', 'b', 'a', 'c'];
  const expected = ['a', 'hidden', 'b', 'c'];
  for (const [source, target, placement] of [
    ['missing', 'a', 'before'], ['a', 'hidden', 'before'], ['a', 'missing', 'after'],
    ['a', 'a', 'before'], ['a', 'a', 'after'], ['a', 'b', 'before'], ['b', 'a', 'after'],
    ['c', null, 'end'], ['a', 'b', 'invalid'], [null, 'b', 'before'],
  ]) assert.deepEqual(moveProjectIndex(order, ['a', 'b', 'c'], source, target, placement), expected, `${source}/${target}/${placement}`);
  assert.deepEqual(moveProjectIndex(order, [], 'a', 'b'), expected);
  assert.deepEqual(moveProjectIndex(null, null, 'a', 'b'), []);
});


test('valid adjacent moves persist the current automatic-sort snapshot before switching to manual', () => {
  const order = Object.freeze(['a', 'hidden', 'b', 'c']);
  const visible = Object.freeze(['c', 'b', 'a']);
  for (const [source, target, placement] of [['c', 'b', 'before'], ['b', 'c', 'after'], ['a', null, 'end']]) {
    assert.deepEqual(moveProjectIndex(order, visible, source, target, placement), ['c', 'hidden', 'b', 'a']);
  }
  assert.deepEqual(moveProjectIndex(order, visible, 'c', 'c', 'before'), order, 'self-drop must not change sort order');
  assert.deepEqual(moveProjectIndex(order, visible, 'c', 'missing', 'after'), order, 'invalid drop must not change sort order');
  assert.deepEqual(order, ['a', 'hidden', 'b', 'c']);
  assert.deepEqual(visible, ['c', 'b', 'a']);
});
