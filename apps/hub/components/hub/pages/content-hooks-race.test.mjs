import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const response = (data) => ({ ok: true, status: 200, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

// Like meeting-review-controller.test.mjs: run the real hook callbacks/effects
// with persistent hook slots and deferred fetches, without a DOM or live service.
function mountedHook(name, fetcher, initialScope = 'all') {
  const cells = [];
  let cursor = 0, effects = [], updates = 0, scope = initialScope;
  const React = {
    useRef(initial) { return cells[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      const cell = cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, next => { updates += 1; cell.value = typeof next === 'function' ? next(cell.value) : next; }];
    },
    useCallback(callback, deps) {
      const index = cursor++, cell = cells[index];
      if (cell && sameDeps(cell.deps, deps)) return cell.callback;
      cells[index] = { callback, deps };
      return callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) effects.push({ index, effect, deps });
    },
  };
  const file = name === 'useContentSchedule' ? 'use-content-schedule.js' : 'use-content-templates.js';
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    .replace(/^import React from 'react';/m, '').replace(/^export function /m, 'function ');
  const hook = new Function('React', 'fetch', 'AbortSignal', `${source}\nreturn ${name};`)(React, fetcher, AbortSignal);
  function render(nextScope = scope) {
    scope = nextScope; cursor = 0; effects = [];
    const output = hook(scope);
    for (const pending of effects) {
      cells[pending.index]?.cleanup?.();
      cells[pending.index] = { deps: pending.deps, cleanup: pending.effect() };
    }
    return output;
  }
  const unmount = () => { for (const cell of cells) cell?.cleanup?.(); };
  render();
  return { render, unmount, updateCount: () => updates };
}

const schedule = (state = 'scheduled', revision = 1) => ({
  variantId: '11111111-1111-4111-8111-111111111111', contentId: '22222222-2222-4222-8222-222222222222',
  status: state, state, revision, scheduledAt: '2026-10-03T03:00:00.000Z', title: '예약 검증용 입력', channel: 'threads',
});
const template = (id, revision = 1) => ({ id, name: id, revision, request: '직접 입력한 요청', skeleton: '' });
const stateOf = (view, key) => ({ status: view.status, message: view.message, [key]: view[key] });

test('confirmed schedule receipts survive older reads', async (t) => {
  for (const action of ['set', 'cancel', 'complete']) {
    for (const lateRead of ['success', 'error']) {
      await t.test(`${action} survives late GET ${lateRead}`, async () => {
        const read = deferred();
        const row = schedule(action === 'cancel' ? 'cancelled' : action === 'complete' ? 'published' : 'scheduled', 2);
        const harness = mountedHook('useContentSchedule', (_path, options = {}) => options.method === 'POST'
          ? Promise.resolve(response({ status: 'saved', schedule: row })) : read.promise);
        const view = harness.render();
        const result = action === 'set' ? await view.set({ variantId: row.variantId, expectedRevision: 1 })
          : await view[action](row.variantId, 1);
        assert.equal(result.status, 'saved');
        assert.deepEqual(harness.render().schedules, [row], 'the confirmed receipt is visible before the older read completes');
        if (lateRead === 'success') read.resolve(response({ status: 'live', schedules: [schedule()] }));
        else read.reject(new Error('delayed read failure'));
        await settle();
        const latest = harness.render();
        assert.deepEqual(stateOf(latest, 'schedules'), { status: 'live', message: '', schedules: [row] });
        assert.equal(latest.anyForVariant(row.variantId).revision, 2);
        assert.equal(latest.forVariant(row.variantId), action === 'set' ? row : null);
        harness.unmount();
      });
    }
  }
  await t.test('duplicate set is also a confirmed receipt', async () => {
    const read = deferred(), row = schedule();
    const harness = mountedHook('useContentSchedule', (_path, options = {}) => options.method === 'POST'
      ? Promise.resolve(response({ status: 'duplicate', schedule: row })) : read.promise);
    await harness.render().set({ variantId: row.variantId, expectedRevision: 0 });
    read.resolve(response({ status: 'live', schedules: [] }));
    await settle();
    assert.deepEqual(stateOf(harness.render(), 'schedules'), { status: 'live', message: '', schedules: [row] });
    harness.unmount();
  });
});

test('confirmed template upserts and removals survive older reads', async (t) => {
  for (const action of ['save', 'remove']) {
    for (const lateRead of ['success', 'error']) {
      await t.test(`${action} survives late GET ${lateRead}`, async () => {
        const read = deferred(), old = template('alpha'), unrelated = template('beta'), changed = template('alpha', 2);
        let reads = 0;
        const harness = mountedHook('useContentTemplates', (_path, options = {}) => {
          if (options.method === 'POST') return Promise.resolve(response(action === 'save'
            ? { status: 'saved', template: changed } : { status: 'deleted' }));
          return ++reads === 1 ? Promise.resolve(response({ status: 'live', templates: [old, unrelated] })) : read.promise;
        });
        await settle();
        const pending = harness.render().reload();
        const view = harness.render();
        if (action === 'save') await view.save(changed); else await view.remove(old.id);
        const expected = { status: 'live', message: '', templates: action === 'save' ? [changed, unrelated] : [unrelated] };
        assert.deepEqual(harness.render().templates, expected.templates, 'the confirmed change preserves unrelated templates');
        if (lateRead === 'success') read.resolve(response({ status: 'live', templates: [old, unrelated] }));
        else read.reject(new Error('delayed read failure'));
        await pending;
        assert.deepEqual(stateOf(harness.render(), 'templates'), expected);
        harness.unmount();
      });
    }
  }
  await t.test('duplicate template upsert survives initial empty snapshot', async () => {
    const read = deferred(), row = template('alpha');
    const harness = mountedHook('useContentTemplates', (_path, options = {}) => options.method === 'POST'
      ? Promise.resolve(response({ status: 'duplicate', template: row })) : read.promise);
    await harness.render().save(row);
    read.resolve(response({ status: 'live', templates: [] }));
    await settle();
    assert.deepEqual(stateOf(harness.render(), 'templates'), { status: 'live', message: '', templates: [row] });
    harness.unmount();
  });
});

test('only the latest read may publish data or failure', async (t) => {
  for (const name of ['useContentSchedule', 'useContentTemplates']) {
    await t.test(name, async () => {
      const first = deferred(), second = deferred();
      let reads = 0;
      const key = name === 'useContentSchedule' ? 'schedules' : 'templates';
      const row = key === 'schedules' ? schedule() : template('alpha');
      const harness = mountedHook(name, () => ++reads === 1 ? first.promise : second.promise);
      const latest = harness.render().reload();
      second.resolve(response({ status: 'live', [key]: [row] }));
      await latest;
      first.reject(new Error('older read failed'));
      await settle();
      assert.deepEqual(stateOf(harness.render(), key), { status: 'live', message: '', [key]: [row] });
      harness.unmount();
    });
  }
});

test('failed mutations preserve read truth and other rows', async (t) => {
  for (const name of ['useContentSchedule', 'useContentTemplates']) {
    for (const status of ['live', 'error', 'preview']) {
      await t.test(`${name} keeps ${status}`, async () => {
        const key = name === 'useContentSchedule' ? 'schedules' : 'templates';
        const rows = status === 'live' ? [key === 'schedules' ? schedule() : template('alpha')] : [];
        const expected = { status, message: '현재 조회 상태', [key]: rows };
        const harness = mountedHook(name, (_path, options = {}) => Promise.resolve(response(options.method === 'POST'
          ? { status: 'error', message: '저장 실패' } : expected)));
        await settle();
        const view = harness.render();
        if (key === 'schedules') await view.set({ variantId: schedule().variantId, expectedRevision: 0 });
        else { await view.save(template('alpha')); await view.remove('alpha'); }
        assert.deepEqual(stateOf(harness.render(), key), expected);
        harness.unmount();
      });
    }
  }
});

test('scope changes reject old schedule reads and mutation receipts', async () => {
  const oldRead = deferred(), newRead = deferred(), oldWrite = deferred();
  const actionRow = { ...schedule('due'), variantId: '33333333-3333-4333-8333-333333333333' };
  const paths = [];
  const harness = mountedHook('useContentSchedule', (path, options = {}) => {
    if (options.method === 'POST') return oldWrite.promise;
    paths.push(path);
    return path.endsWith('scope=all') ? oldRead.promise : newRead.promise;
  });
  const mutation = harness.render().set({ variantId: schedule().variantId, expectedRevision: 0 });
  harness.render('action');
  newRead.resolve(response({ status: 'live', schedules: [actionRow] }));
  await settle();
  oldRead.resolve(response({ status: 'live', schedules: [schedule()] }));
  oldWrite.resolve(response({ status: 'saved', schedule: schedule() }));
  await mutation; await settle();
  assert.deepEqual(paths, ['/api/hub/content/schedule?scope=all', '/api/hub/content/schedule?scope=action']);
  assert.deepEqual(stateOf(harness.render(), 'schedules'), { status: 'live', message: '', schedules: [actionRow] });
  harness.unmount();
});

test('unmounted hooks ignore pending read and write completions', async (t) => {
  for (const name of ['useContentSchedule', 'useContentTemplates']) {
    for (const lateRead of ['success', 'error']) {
      await t.test(`${name} ignores unmounted ${lateRead}`, async () => {
        const read = deferred(), write = deferred();
        const key = name === 'useContentSchedule' ? 'schedules' : 'templates';
        const row = key === 'schedules' ? schedule() : template('alpha');
        const harness = mountedHook(name, (_path, options = {}) => options.method === 'POST' ? write.promise : read.promise);
        const view = harness.render();
        const mutation = key === 'schedules' ? view.set({ variantId: row.variantId, expectedRevision: 0 }) : view.save(row);
        harness.unmount();
        const count = harness.updateCount();
        if (lateRead === 'success') read.resolve(response({ status: 'live', [key]: [row] }));
        else read.reject(new Error('read after unmount'));
        write.resolve(response(key === 'schedules' ? { status: 'saved', schedule: row } : { status: 'saved', template: row }));
        await mutation; await settle();
        assert.equal(harness.updateCount(), count, 'late promises must not write state after cleanup');
      });
    }
  }
});
