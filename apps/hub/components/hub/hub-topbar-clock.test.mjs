import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { pageOwnsTabs, topNavigationForRoute } from './hub-nav.js';
const clock = await import('./hub-clock.js').catch(() => ({}));
const source = await readFile(new URL('./hub-topbar.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hub-topbar.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TopBar');
const code = ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const RealDate = Date;
function renderClock(instant, timezone) {
  const previousTimezone = process.env.TZ;
  process.env.TZ = timezone;
  try {
    class SnapshotDate extends RealDate { constructor(...args) { super(...(args.length ? args : [instant])); } }
    const blank = () => null;
    const dependencies = { React, Date: SnapshotDate, LABELS: {}, pageOwnsTabs, topNavigationForRoute, Iconed: blank, IconButton: blank, Button: blank, DailyReviewTopButton: blank, InquiryBell: blank, ...clock };
    const TopBar = new Function(...Object.keys(dependencies), `${code};return TopBar;`)(...Object.values(dependencies));
    return renderToStaticMarkup(React.createElement(TopBar, { path: 'dashboard/reports', scope: 'all', theme: 'light', themePreference: 'light', onNavigate() {} }));
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone;
  }
}

test('SSR and initial client markup match across UTC/KST date changes and elapsed minute boundaries', () => {
  const server = renderClock('2026-09-30T14:59:59Z', 'UTC');
  const client = renderClock('2026-09-30T15:01:01Z', 'Asia/Seoul');
  assert.equal(client, server);
  assert.match(server, /— · —\/— · —:—/);
  assert.doesNotMatch(source, /suppressHydrationWarning/);
});

test('mounted clock formatting uses KST and rolls midnight correctly independent of host timezone', () => {
  assert.equal(typeof clock.formatHubClock, 'function');
  const previousTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/New_York', 'Asia/Seoul']) {
      process.env.TZ = timezone;
      assert.equal(clock.formatHubClock(new Date('2026-09-30T14:59:00Z')), '수 · 9/30 · 23:59');
      assert.equal(clock.formatHubClock(new Date('2026-09-30T15:00:00Z')), '목 · 10/1 · 00:00');
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone;
  }
});
