import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync(new URL('./home.jsx', import.meta.url), 'utf8');
const componentUrl = new URL('./home-morning-brief.jsx', import.meta.url);
const component = existsSync(componentUrl) ? await import(componentUrl.href) : {};
const { HomeMorningBrief } = component;

test('Home places its one morning brief after the existing schedule and before shortcuts', () => {
  assert.match(source, /<TodaySchedule\b[\s\S]*?<HomeMorningBrief\b[\s\S]*?<footer\b/);
  assert.equal((source.match(/<HomeMorningBrief\b/g) || []).length, 1);
});

test('shared daily brief read passes its real focus and task data to Home', async () => {
  const { fetchDailyBriefSignals } = await import('../daily-brief-signals.js');
  const dailyFocus = { urgentKa: { state: 'live', item: null } };
  const taskToday = { state: 'live', focus: { picked: 2, done: 1 } };
  const live = await fetchDailyBriefSignals({
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ status: 'live', signals: [], dailyFocus, taskToday }),
    }),
  });
  assert.deepEqual(live, { status: 'live', signals: [], dailyFocus, taskToday });

  const failed = await fetchDailyBriefSignals({
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ status: 'error', signals: [{ title: 'stale' }], dailyFocus, taskToday }),
    }),
  });
  assert.deepEqual(failed, { status: 'error', signals: [], dailyFocus: null, taskToday: null });
});

test('morning brief renders three factual lines, the reused Guru tip, and navigation only', () => {
  assert.equal(typeof HomeMorningBrief, 'function');
  const html = renderToStaticMarkup(React.createElement(HomeMorningBrief, {
    brief: {
      status: 'live', signals: [],
      dailyFocus: { urgentKa: { state: 'live', item: null }, focusCustomers: { state: 'live', items: [] } },
      taskToday: { state: 'live', focus: { picked: 2, done: 1 }, counts: { missed: 0 } },
    },
    schedule: { status: 'live', events: [] },
    now: new Date('2026-09-29T00:15:00.000Z'),
    onNavigate: () => {},
  }));
  assert.match(html, /아침 브리핑/);
  assert.match(html, /먼저 확인[\s\S]*다음 일정[\s\S]*오늘의 진척[\s\S]*GURU[\s\S]*오늘 열기/);
  assert.match(html, /30초 AI 브리핑 열기/);
  assert.equal((html.match(/guidance-inline-tip-wrap/g) || []).length, 1);
  assert.doesNotMatch(html, /고객 A|고객 미팅/);
});

test('loading and complete read failure do not claim that only some records are missing', () => {
  const loading = renderToStaticMarkup(React.createElement(HomeMorningBrief, {
    brief: { status: 'loading' }, schedule: { status: 'loading' }, onNavigate: () => {},
  }));
  assert.match(loading, /기록 확인 중/);
  assert.doesNotMatch(loading, /일부 기록 미확인/);

  const error = renderToStaticMarkup(React.createElement(HomeMorningBrief, {
    brief: { status: 'error' }, schedule: { status: 'error' }, onNavigate: () => {},
  }));
  assert.match(error, /기록을 확인하지 못했습니다/);
  assert.doesNotMatch(error, /일부 기록 미확인/);
});
