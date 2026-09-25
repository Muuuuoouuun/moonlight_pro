import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectGuidanceCard } from '@com-moon/guru-guidance';
const componentUrl = new URL('./guidance-inline-tip.jsx', import.meta.url);
const component = existsSync(componentUrl) ? await import(componentUrl.href) : {};
const { GuidanceInlineTip, guidanceInlineTipModel, nextInlineTipRefreshAt } = component;

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const now = new Date('2026-09-25T05:15:00Z'); // 14:15 Seoul

test('Today selects the current general sales card and points to its detail', () => {
  assert.equal(typeof guidanceInlineTipModel, 'function');
  const expected = selectGuidanceCard({ cadence: 'daily', domain: 'sales', now });
  const model = guidanceInlineTipModel('today', now);
  assert.equal(model.card.id, expected.id);
  assert.equal(model.card.text, expected.text);
  assert.equal(model.href, `dashboard/agents/chat?card=${expected.id}`);
  assert.equal(model.kind, 'GURU');
});

test('Overview selects a weekly Legend without claiming to analyze metrics', () => {
  const expected = selectGuidanceCard({ cadence: 'weekly', now });
  const model = guidanceInlineTipModel('overview', now);
  assert.equal(model.card.id, expected.id);
  assert.equal(model.card.text, expected.text);
  assert.equal(model.href, `dashboard/agents/chat?card=${expected.id}`);
  assert.equal(model.kind, 'LEGEND');
  assert.doesNotMatch(model.label, /분석|지표|고객|활동 결과/);
});

test('Today refreshes at the next Seoul 09/14/19 boundary without a midnight replacement', () => {
  assert.equal(typeof nextInlineTipRefreshAt, 'function');
  assert.equal(
    nextInlineTipRefreshAt('today', new Date('2026-09-25T04:59:59Z')).toISOString(),
    '2026-09-25T05:00:00.000Z',
  );
  assert.equal(
    nextInlineTipRefreshAt('today', new Date('2026-09-25T05:00:00Z')).toISOString(),
    '2026-09-25T10:00:00.000Z',
  );
  assert.equal(
    nextInlineTipRefreshAt('today', new Date('2026-09-25T14:59:59Z')).toISOString(),
    '2026-09-26T00:00:00.000Z',
  );
});

test('Overview refreshes at Monday 00:00 Seoul, then waits another full week', () => {
  assert.equal(typeof nextInlineTipRefreshAt, 'function');
  assert.equal(
    nextInlineTipRefreshAt('overview', new Date('2026-09-27T14:59:59Z')).toISOString(),
    '2026-09-27T15:00:00.000Z',
  );
  assert.equal(
    nextInlineTipRefreshAt('overview', new Date('2026-09-27T15:00:00Z')).toISOString(),
    '2026-10-04T15:00:00.000Z',
  );
});

test('the inline tip renders as one source-backed accessible button without requesting advice', () => {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('tip must not request advice'); };
  try {
    const model = guidanceInlineTipModel('today', now);
    const html = renderToStaticMarkup(React.createElement(GuidanceInlineTip, { variant: 'today', now, onNavigate: () => {} }));
    assert.match(html, /<button[^>]*type="button"[^>]*aria-label="[^"]*상세 보기"/);
    assert.match(html, new RegExp(model.card.text));
    assert.match(html, new RegExp(model.card.person.split(' · ')[0]));
    assert.match(html, /자료 요약/);
    assert.equal((html.match(/<button\b/g) || []).length, 1);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previous;
  }
  const css = read('./guidance-inline-tip.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /var\(--line/);
  assert.match(css, /var\(--surface/);
  assert.doesNotMatch(css, /#[\da-fA-F]{3,8}\b|rgba?\(|oklch\(/);
});

test('Today and Overview each place one tip between the named sections', () => {
  const today = read('./pages/daily-brief.jsx');
  const overview = read('./pages/overview.jsx');
  assert.equal((today.match(/<GuidanceInlineTip\b/g) || []).length, 1);
  assert.equal((overview.match(/<GuidanceInlineTip\b/g) || []).length, 1);
  assert.match(today, /<TaskToday[\s\S]*?<GuidanceInlineTip\s+variant="today"[\s\S]*?<FocusSlots/);
  const chartStart = overview.indexOf('작업·기획 활동 추이');
  const tip = overview.indexOf('<GuidanceInlineTip variant="overview"');
  const domainPanels = overview.indexOf('hub-grid--split', chartStart);
  assert.ok(chartStart >= 0 && tip > chartStart && domainPanels > tip);
  assert.doesNotMatch(read('./pages/home.jsx'), /GuidanceInlineTip/);
  assert.doesNotMatch(read('./pages/content-studio.jsx'), /GuidanceInlineTip/);
});
