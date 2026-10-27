import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { HomeMorningBrief } from './home-morning-brief.jsx';
import { SIGNAL_TARGETS, withEntityRef } from '../../../lib/signal-targets.js';

const source = readFileSync(new URL('./home.jsx', import.meta.url), 'utf8');
const live = { status: 'live', taskToday: { state: 'live', focus: { picked: 2, done: 1 }, queueCount: 4 } };

test('Home keeps its decision card first, then compact execution routes and collapsed supporting context', () => {
  assert.match(source, /<FocusCard\b[\s\S]*?<HomeMorningBrief\b[\s\S]*?<TodaySchedule\b[\s\S]*?<footer\b/);
  assert.equal((source.match(/<HomeMorningBrief\b/g) || []).length, 1);
  assert.match(source, /홈 · \{formatEyebrowDate/);
  assert.match(source, /한 장씩 확인하고 다음 행동을 정하세요/);
  const schedule = source.slice(source.indexOf('function TodaySchedule('), source.indexOf('export function Home('));
  assert.match(schedule, /<details className="home-support-disclosure">/);
  assert.doesNotMatch(schedule, /<details[^>]*\bopen[= >]/);
  assert.match(source, /<details className="home-support-disclosure">[\s\S]*?참고 관점과 보조 브리핑[\s\S]*?<GuidanceInlineTip/);
  assert.match(source, /dashboard\/daily-brief\?panel=briefing/, 'existing AI entry remains explicit and optional');
});

test('compact Home handoff repeats one factual task line, keeps goal assumptions and detailed lists out', () => {
  const html = renderToStaticMarkup(React.createElement(HomeMorningBrief, { brief: live, onNavigate() {} }));
  assert.match(html, /실행과 흐름 이어가기/);
  assert.match(html, /집중 2개 중 1개 완료 · 대기 4개/);
  assert.match(html, /오늘에서 할 일 이어가기/);
  assert.match(html, /현황에서 흐름 보기/);
  assert.doesNotMatch(html, /아침 브리핑|다음 일정|먼저 확인|오늘의 시작|이번 달 목표|<dl\b/);
});

test('Home handoff buttons navigate only after activation and preserve their destination lens', () => {
  const visits = [];
  const tree = HomeMorningBrief({ brief: live, onNavigate: href => visits.push(href) });
  const buttons = React.Children.toArray(tree.props.children)[1].props.children;
  assert.deepEqual(visits, []);
  buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.deepEqual(visits, ['dashboard/daily-brief', 'dashboard/overview?view=summary']);
});

test('handoff loading, failure, preview and partial are distinct from verified empty', () => {
  for (const status of ['loading', 'error', 'preview', 'partial']) {
    const html = renderToStaticMarkup(React.createElement(HomeMorningBrief, { brief: { status }, onNavigate() {} }));
    assert.doesNotMatch(html, /대기 0개|0개 완료|아직 오늘 집중할 일을 고르지/);
    if (status === 'loading') assert.match(html, /할 일 확인 중/);
    if (status === 'error') assert.match(html, /읽지 못했습니다/);
    if (status === 'preview') assert.match(html, /연결/);
    if (status === 'partial') assert.match(html, /일부 할 일만 확인/);
  }
});

test('Home departure preserves the viewed card and existing scope for Back without replaying an action', () => {
  const ast = ts.createSourceFile('home.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'navigateFromHome') callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(callback);
  const visits = [], replaced = [], historyState = { existing: true };
  const window = { location: { pathname: '/dashboard/home', search: '?scope=personal&check=old&do=3', hash: '#here' },
    history: { state: historyState, replaceState: (...args) => replaced.push(args) } };
  const make = new Function('activeKey', 'window', 'onNavigate', `return ${callback.getText(ast)};`);
  const navigate = make('content:current', window, target => visits.push(target));
  navigate('dashboard/daily-brief');
  assert.deepEqual(visits, ['dashboard/daily-brief']);
  assert.equal(replaced[0][0], historyState);
  const restored = new URL(replaced[0][2], 'http://local.test');
  assert.equal(restored.searchParams.get('scope'), 'personal');
  assert.equal(restored.searchParams.get('check'), 'content:current');
  assert.equal(restored.searchParams.has('do'), false);
  assert.equal(restored.hash, '#here');
  window.history.replaceState = () => { throw new Error('history unavailable'); };
  navigate('dashboard/overview?view=summary');
  assert.equal(visits.at(-1), 'dashboard/overview?view=summary');
});

test('Home project outcome opens the actual subject and keeps other source links intact', () => {
  const from = source.indexOf('function homeOutcomeTarget('), to = source.indexOf('// 허브 read', from);
  assert.ok(from >= 0 && to > from);
  const target = new Function('SIGNAL_TARGETS', 'withEntityRef', `${source.slice(from, to)}; return homeOutcomeTarget;`)(SIGNAL_TARGETS, withEntityRef);
  const id = '62000000-0000-4000-8000-000000000001';
  assert.equal(target({ subject: { type: 'project', id } }, { action: 'projects' }), `dashboard/work/projects?project=${id}`);
  assert.equal(target({ source: { from: 'content', ref: 'one item' } }, { action: 'write' }), 'dashboard/content/studio?item=one%20item');
  assert.equal(target({}, { action: 'unknown' }), null);
});
