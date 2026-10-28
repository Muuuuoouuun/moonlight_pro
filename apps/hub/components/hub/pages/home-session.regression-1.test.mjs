import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, EmptyState, Skeleton, TruthBadge, Kbd, useToast } from '../hub-primitives.jsx';
import { CheckItemProgress, FinishedTodayList, FocusCard, RemainingList, outcomeIsPanel, useCheckItemDeck } from '../check-items/focus-card.jsx';
import { ScheduledList } from '../check-items/schedule-band.jsx';
import { Iconed } from '../hub-icons.jsx';
import { fetchDailyBriefSignals, readEnvelope } from '../daily-brief-signals.js';

// Regression: QA-001 — a 401 appeared as a quiet Home and an empty calendar.
// Found by /qa on 2026-10-02. Report: task-2/QA-REPORT.md (outside checkout).
const source = readFileSync(new URL('./home.jsx', import.meta.url), 'utf8');
// Resolve the component through Home's actual import: an extensionless import
// previously selected its same-name .js helper and crashed the full browser shell.
const morningImport = source.match(/import \{ HomeMorningBrief \} from ['"]([^'"]+)['"]/)[1];
const { HomeMorningBrief } = await import(morningImport);
const code = ts.transpileModule(source.replace(/^import[^\n]+\n/gm, '').replace(/^export /gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function surface(brief, schedule) {
  const hookReact = { ...React, useState: initial => React.useState(initial?.events ? schedule : initial) };
  const absent = () => null;
  return new Function('React', 'deps', `const {Iconed,Button,EmptyState,Skeleton,TruthBadge,Kbd,useToast,CheckItemProgress,FinishedTodayList,FocusCard,RemainingList,outcomeIsPanel,useCheckItemDeck,ScheduledList,readEnvelope,useDailyBriefSignals,useGuruRecommendations,DailyReviewCue,PublishDue,GuruRecommendation,GuruRecommendationList,GuidanceInlineTip,HomeMorningBrief,SIGNAL_TARGETS,recommendationForSubject}=deps;\n${code}\nreturn {Home,TodaySchedule,LoginRequired};`)(hookReact, {
    Iconed, Button, EmptyState, Skeleton, TruthBadge, Kbd, useToast,
    CheckItemProgress, FinishedTodayList, FocusCard, RemainingList, outcomeIsPanel, useCheckItemDeck, ScheduledList, readEnvelope,
    useDailyBriefSignals: () => brief, useGuruRecommendations: () => ({status:'preview'}),
    DailyReviewCue: absent, PublishDue: absent, GuruRecommendation: absent,
    GuruRecommendationList: absent, GuidanceInlineTip: absent,
    HomeMorningBrief,
    SIGNAL_TARGETS: {}, recommendationForSubject: () => null,
  });
}

test('a real unauthorized read renders login recovery instead of empty signals and schedules', async () => {
  const brief = await fetchDailyBriefSignals({fetchImpl: async () => ({ok:false,status:401,json:async()=>({status:'unauthorized'})})});
  const { Home } = surface(brief, {status:'unauthorized',events:[]});
  const html = renderToStaticMarkup(React.createElement(Home, {onNavigate:()=>{}}));
  assert.match(html, /로그인이 필요합니다/);
  assert.match(html, /다시 로그인/);
  assert.doesNotMatch(html, /지금 확인할 항목이 없습니다|확인할 것을 다 봤습니다|오늘 잡힌 일정이 없습니다|오늘의 할 일/);
});

test('unauthorized calendar alone suppresses stale events and morning interpretation', () => {
  const { Home } = surface({status:'live',signals:[]}, {status:'unauthorized',events:[{title:'stale',start:'2026-10-02T00:00:00Z'}]});
  const html = renderToStaticMarkup(React.createElement(Home, {onNavigate:()=>{}}));
  assert.match(html, /로그인이 필요합니다/);
  assert.doesNotMatch(html, /stale|오늘 잡힌 일정이 없습니다|오늘의 할 일/);
});

test('confirmed empty reads retain their real empty state', () => {
  const { Home } = surface({status:'live',signals:[]}, {status:'live',events:[]});
  const html = renderToStaticMarkup(React.createElement(Home, {onNavigate:()=>{}}));
  assert.match(html, /지금 확인할 항목이 없습니다/);
  assert.match(html, /새로 확인할 것이 생기면/);
  assert.match(html, /오늘 잡힌 일정이 없습니다/);
  assert.match(html, /오늘의 할 일/);
  assert.doesNotMatch(html, /로그인이 필요합니다/);
});

test('partial empty calendar does not claim there are no appointments', () => {
  const { Home } = surface({status:'live',signals:[]}, {status:'partial',events:[]});
  const html = renderToStaticMarkup(React.createElement(Home, {onNavigate:()=>{}}));
  assert.match(html, /오늘 일정이 없다고 확정할 수 없습니다/);
  assert.doesNotMatch(html, /오늘 잡힌 일정이 없습니다/);
});

test('login recovery redirects only after explicit action and returns to Home', () => {
  const { LoginRequired } = surface({status:'unauthorized',signals:[]}, {status:'unauthorized',events:[]});
  const prior = globalThis.window;
  const visits = [];
  globalThis.window = {location:{assign:path=>visits.push(path)}};
  try {
    const element = LoginRequired();
    assert.deepEqual(visits, []);
    element.props.action.props.onClick();
    assert.deepEqual(visits, ['/login?next=%2Fdashboard%2Fhome']);
  } finally { globalThis.window = prior; }
});

test('partial empty signal deck never reports all checks finished and retains explicit read retry', () => {
  const { Home } = surface({status:'partial',signals:[],reload:()=>{}}, {status:'live',events:[]});
  const html = renderToStaticMarkup(React.createElement(Home, {onNavigate:()=>{}}));
  assert.match(html, /확인할 것을 모두 읽지 못했습니다/);
  assert.match(html, /실제로 확인할 일이 있을 수 있습니다/);
  assert.match(html, /다시 불러오기/);
  assert.doesNotMatch(html, /지금 확인할 항목이 없습니다|확인할 것을 다 봤습니다/);
});

test('loading, preview and error signal reads stay distinct from verified empty', () => {
  for (const status of ['loading', 'preview', 'error']) {
    const { Home } = surface({status,signals:[],reload:()=>{}}, {status:'live',events:[]});
    const html = renderToStaticMarkup(React.createElement(Home, {onNavigate:()=>{}}));
    assert.doesNotMatch(html, /지금 확인할 항목이 없습니다|확인할 것을 다 봤습니다/);
  }
});
