import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GURU_CARDS, LEGEND_CARDS, selectGuidanceCard } from '../../../../packages/guru-guidance/index.ts';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('quiet rail starts closed and only opens the shared accessible drawer on request', () => {
  const source = read('./context-mentor-rail.jsx');
  assert.match(source, /export function ContextMentorRail/);
  assert.match(source, /React\.useState\(false\)/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /open &&\s*<Drawer/);
  assert.match(source, /presentation=\{compact \? 'compact' : 'side'\}/);
  assert.match(source, /<SegmentedControl/);
  assert.match(source, /<Button/);
  assert.doesNotMatch(source, /setInterval|setTimeout|Math\.random/);
});

test('rail reads the same source-backed daily Guru and weekly Legend cards without side effects', () => {
  const source = read('./context-mentor-rail.jsx');
  assert.match(source, /selectGuidanceCard\(/);
  assert.match(source, /guidancePeriodKey\(/);
  assert.match(source, /source\.title/);
  assert.match(source, /source\.path/);
  assert.match(source, /source\.section/);
  assert.match(source, /setOffset\(/);
  assert.match(source, /onGuidanceAsk\?\.\(card\)/);
  assert.match(source, /onNavigate\?\.\('dashboard\/agents\/chat'\)/);
  assert.doesNotMatch(source, /fetch\(|requestGuruCoaching\(|createWorkOrder\(|work_order/);
  const now = new Date('2026-09-24T00:00:00Z');
  assert.ok(GURU_CARDS.some(card => card.id === selectGuidanceCard({ cadence: 'daily', domain: 'marketing', now }).id));
  assert.ok(LEGEND_CARDS.some(card => card.id === selectGuidanceCard({ cadence: 'weekly', now }).id));
});

test('Legend stays read only while Guru questions honor disabled contexts', () => {
  const source = read('./context-mentor-rail.jsx');
  assert.match(source, /cadence === 'daily' && !disabled/);
  assert.match(source, /onGuidanceAsk\?\.\(card\)/);
  assert.match(source, /setOpen\(false\)[\s\S]*onGuidanceAsk\?\.\(card\)/);
  assert.match(source, /Guru · 실무/);
  assert.match(source, /Legend · 판단/);
});

test('the compact trigger and sheet use tokens and a 390px-safe touch floor', () => {
  const css = read('./context-mentor-rail.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /var\(--line/);
  assert.match(css, /var\(--surface/);
  assert.doesNotMatch(css, /#[\da-fA-F]{3,8}\b|rgba?\(|oklch\(/);
});
