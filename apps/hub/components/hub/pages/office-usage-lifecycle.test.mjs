import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the actual component effect with deferred reads, including a fetch
// that ignores cancellation and still resolves after refresh or unmount.
function mountUsage(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const end = source.indexOf('\nexport function Office', source.indexOf('function OfficeUsageLine('));
  const usageSource = source.slice(source.indexOf('function OfficeUsageLine('), end);
  const js = ts.transpileModule(usageSource, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const slots = [], pending = [], reads = [];
  let index = 0, tree, updates = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; updates += 1; }];
    },
    useCallback(fn, deps) {
      const slot = index++;
      if (!slots[slot]?.deps.every((value, i) => Object.is(value, deps[i]))) slots[slot] = { fn, deps };
      return slots[slot].fn;
    },
    useEffect(fn, deps) {
      const slot = index++;
      if (slots[slot]?.deps.every((value, i) => Object.is(value, deps[i]))) return;
      slots[slot]?.cleanup?.();
      slots[slot] = { deps };
      pending.push(() => { slots[slot].cleanup = fn(); });
    },
  };
  const read = ({ signal } = {}) => new Promise(resolve => reads.push({ signal, resolve }));
  const fetch = async (_url, options) => ({ ok: true, json: () => read(options) });
  const Component = new Function('React', 'loadOfficeUsage', 'fetch', 'styles', 'Skeleton', 'TruthBadge', 'Button', 'OFFICE_FAILURE_LABELS', `${js}; return OfficeUsageLine;`)(React, read, fetch, {}, 'Skeleton', 'TruthBadge', 'Button', {});
  const render = (refreshKey = 0) => {
    index = 0;
    tree = Component({ refreshKey });
    while (pending.length) pending.shift()();
  };
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).map(text).join('');
  return { render, reads, text: () => text(tree), get updates() { return updates; }, unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const usage = requests => ({ status: 'live', windowDays: 7, requests, applied: 0, failed: 0 });

for (const file of ['./office-council.jsx', './office-meeting-room.jsx']) {
test(`${file} usage keeps the refreshed result when an earlier read resolves last`, async () => {
  const mounted = mountUsage(file);
  mounted.render(0);
  await flush();
  mounted.render(1);
  await flush();
  mounted.reads[1].resolve(usage(8));
  await flush();
  mounted.render(1);
  assert.match(mounted.text(), /요청 8/);
  mounted.reads[0].resolve(usage(3));
  await flush();
  mounted.render(1);
  assert.match(mounted.text(), /요청 8/, 'late old counts cannot overwrite the current result');
  assert.equal(mounted.reads[0].signal.aborted, true);
  mounted.unmount();
});

test(`${file} usage cancels its read and skips state updates after unmount`, async () => {
  const mounted = mountUsage(file);
  mounted.render();
  await flush();
  mounted.unmount();
  const updates = mounted.updates;
  mounted.reads[0].resolve(usage(3));
  await flush();
  assert.equal(mounted.updates, updates);
  assert.equal(mounted.reads[0].signal.aborted, true);
});
}
