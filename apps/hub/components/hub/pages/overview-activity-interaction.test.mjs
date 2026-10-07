import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

import { activityAxis, activityDateTicks } from './overview-activity.js';
import { activitySeriesAvailability } from './overview-truth.js';

const source = readFileSync(new URL('./overview.jsx', import.meta.url), 'utf8');
const chartSource = source.slice(source.indexOf('const ACTIVITY_SEGMENTS ='), source.indexOf('\n// Compact SVG ring chart'));
const chartJs = ts.transpileModule(chartSource, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Run the real chart handlers and render tree, replacing only React's hook
// scheduler and the shared empty-state primitive. No chart logic is copied.
function mountChart(initialProps) {
  const slots = [];
  let hook = 0;
  let props = { sources: [], status: 'live', ...initialProps };
  let tree;
  const React = {
    createElement: (type, attributes, ...children) => ({
      type,
      props: { ...attributes, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) },
    }),
    useState(initial) {
      const slot = hook++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useId: () => 'activity-readout-test',
  };
  const dependencies = {
    React, activityAxis, activityDateTicks, activitySeriesAvailability,
    EmptyState: 'EmptyState',
    dayLabel: key => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(`${key}T00:00:00`)),
  };
  const Chart = new Function(...Object.keys(dependencies), `${chartJs}; return ActivityChart;`)(...Object.values(dependencies));
  const render = (nextProps = {}) => {
    props = { ...props, ...nextProps };
    hook = 0;
    tree = Chart(props);
  };
  const findAll = (predicate, node = tree) => {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.props?.children || []).flatMap(child => findAll(predicate, child))];
  };
  const findClass = name => findAll(node => node.props.className?.split(' ').includes(name))[0];
  const readText = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).map(readText).join('');
  const key = name => {
    let prevented = false;
    findClass('activity-chart__plot').props.onKeyDown({ key: name, preventDefault() { prevented = true; } });
    render();
    return prevented;
  };
  render();
  return { render, findAll, findClass, key, readout: () => readText(findClass('activity-chart__readout')) };
}

const dailyRows = length => Array.from({ length }, (_value, index) => ({
  date: `2026-09-${String(index + 1).padStart(2, '0')}`,
  work: index + 1,
  decisions: 0,
  content: 0,
}));

test('activity chart Home, End and arrows update the described live readout', () => {
  const chart = mountChart({ series: dailyRows(7), days: 7 });
  const plot = chart.findClass('activity-chart__plot');
  const readout = chart.findClass('activity-chart__readout');
  assert.equal(plot.props['aria-describedby'], readout.props.id);
  assert.equal(readout.props['aria-live'], 'polite');
  assert.equal(readout.props['aria-atomic'], 'true');
  assert.match(chart.readout(), /합계 28건 · 기간 전체/);

  assert.equal(chart.key('Home'), true);
  assert.match(chart.readout(), /9\/1합계 1건/);
  assert.equal(chart.key('ArrowRight'), true);
  assert.match(chart.readout(), /9\/2합계 2건/);
  assert.equal(chart.key('ArrowLeft'), true);
  assert.match(chart.readout(), /9\/1합계 1건/);
  chart.key('ArrowLeft');
  assert.match(chart.readout(), /9\/1합계 1건/, 'left stops at the first date');
  assert.equal(chart.key('End'), true);
  assert.match(chart.readout(), /9\/7합계 7건/);
  chart.key('ArrowRight');
  assert.match(chart.readout(), /9\/7합계 7건/, 'right stops at the last date');
  chart.key('ArrowLeft');
  assert.match(chart.readout(), /9\/6합계 6건/);
  assert.equal(chart.key('Escape'), true);
  assert.match(chart.readout(), /합계 28건 · 기간 전체/);
});

test('a first pointer press keeps its touched date when focusing runs onFocus synchronously', () => {
  let focuses = 0;
  for (const [clientX, date, total, index] of [
    [0, '9/1', 1, 0],
    [150, '9/16', 16, 15],
    [299, '9/30', 30, 29],
  ]) {
    const chart = mountChart({ series: dailyRows(30), days: 30 });
    const currentTarget = {
      getBoundingClientRect: () => ({ left: 0, width: 300 }),
      focus(options) {
        assert.deepEqual(options, { preventScroll: true });
        focuses += 1;
        chart.findClass('activity-chart__plot').props.onFocus();
      },
    };
    // No pointerMove precedes the press: touch selection itself must survive
    // the focus event that the pointerDown handler triggers immediately.
    chart.findClass('activity-chart__plot').props.onPointerDown({ pointerType: 'touch', clientX, currentTarget });
    chart.render();
    assert.ok(chart.readout().startsWith(`${date}합계 ${total}건`), `focus preserves the date pressed at ${clientX}px`);
    const columns = chart.findAll(node => node.props.className === 'activity-chart__column');
    assert.deepEqual(columns.flatMap((node, i) => node.props['data-active'] === 'true' ? [i] : []), [index]);
  }
  assert.equal(focuses, 3, 'each press exercises the synchronous focus handler');
});

test('a selected date outside a shorter window falls back to that window total and keeps its bars', () => {
  const chart = mountChart({ series: dailyRows(30), days: 30 });
  chart.key('Home');
  assert.match(chart.readout(), /9\/1합계 1건/);
  chart.render({ days: 7 });
  assert.match(chart.readout(), /9\/24–9\/30합계/);
  assert.match(chart.readout(), /합계 189건 · 기간 전체/);
  const columns = chart.findAll(node => node.props.className === 'activity-chart__column');
  assert.equal(columns.length, 7);
  assert.equal(columns.filter(node => node.props['data-active'] === 'true').length, 0);
  const bars = chart.findAll(node => node.props.className === 'activity-chart__bar');
  assert.equal(bars.length, 7, 'every positive date remains visible after the window changes');
  assert.ok(bars.every(node => Number.parseFloat(node.props.style.height) > 0));
  chart.key('ArrowLeft');
  assert.match(chart.readout(), /9\/29합계 29건/, 'keyboard resumes inside the current window');
});

test('a mixed stacked bar uses the total for its height and exact internal proportions', () => {
  const row = { date: '2026-09-30', work: 2, decisions: 3, content: 1 };
  const chart = mountChart({ series: [row], days: 7 });
  const total = 6;
  const bar = chart.findClass('activity-chart__bar');
  assert.equal(Number.parseFloat(bar.props.style.height), total / activityAxis(total).max * 100);
  const segments = chart.findAll(node => node.props.className === 'activity-chart__segment');
  const valuesFromTop = [row.content, row.decisions, row.work];
  assert.equal(segments.length, 3);
  segments.forEach((segment, index) => {
    assert.equal(Number.parseFloat(segment.props.style.height), valuesFromTop[index] / total * 100);
  });
  assert.ok(Math.abs(segments.reduce((sum, segment) => sum + Number.parseFloat(segment.props.style.height), 0) - 100) < 1e-10);
  assert.match(chart.readout(), /합계 6건/);
  assert.match(chart.readout(), /작업2건결정3건발행1건/);
});

test('an unreadable activity segment shows EmptyState instead of a zero or incomplete stacked bar', () => {
  const chart = mountChart({
    series: [{ date: '2026-09-30', work: null, decisions: 2, content: 1 }],
    days: 7,
    status: 'partial',
    sources: [
      { key: 'projects', state: 'partial', failedSources: ['project_updates'] },
      { key: 'content', state: 'live', failedSources: [] },
    ],
  });
  const empty = chart.findAll(node => node.type === 'EmptyState')[0];
  assert.equal(empty.props.title, '활동 기록 일부를 읽지 못했습니다');
  assert.match(empty.props.description, /작업 기록을 다시 읽은 뒤/);
  assert.equal(chart.findClass('activity-chart__bar'), undefined);
  assert.equal(chart.findClass('activity-chart__readout'), undefined);
});
