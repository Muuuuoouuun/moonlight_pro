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
  assert.match(source, /open && typeof document !== 'undefined' && createPortal\(<Drawer/);
  assert.match(source, /document\.querySelector\('\.hub-app'\) \|\| document\.body/);
  assert.match(source, /presentation=\{compact \? 'compact' : 'side'\}/);
  assert.match(source, /<SegmentedControl/);
  assert.match(source, /<Button/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /newWindowReady && <Button[^>]*>새 시간대 관점 보기/);
  assert.doesNotMatch(source, /setInterval|Math\.random/);
});

test('rail reads the same source-backed daily Guru and weekly Legend cards without side effects', () => {
  const source = read('./context-mentor-rail.jsx');
  assert.match(source, /selectGuidanceCard\(/);
  assert.match(source, /guidanceDailyWindow\(/);
  assert.match(source, /guidancePeriodKey\(/);
  assert.match(source, /GuidanceSource source=\{card\.source\}/);
  assert.match(source, /setOffset\(/);
  assert.match(source, /onGuidanceAsk\?\.\(card\)/);
  assert.match(source, /onNavigate\?\.\(`dashboard\/agents\/chat\?card=\$\{encodeURIComponent\(card\.id\)\}`\)/);
  assert.match(source, /이 글 읽기/);
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

test('screen context keys are passed only from verified, relevant surfaces', () => {
  const rail = read('./context-mentor-rail.jsx');
  const customers = read('./pages/customers.jsx');
  const brands = read('./pages/brands.jsx');
  const content = read('./pages/content.jsx');
  assert.match(rail, /selectGuidanceCard\(\{ cadence, domain: selectedDomain, contextKey, now, offset \}\)/);
  assert.match(rail, /\[selectedDomain, contextKey\]/);
  assert.match(customers, /contextKey=\{scopeKey === 'classin' && \['active', 'new', 'dormant'\]\.includes\(segment\) \? `sales:\$\{segment\}` : undefined\}/);
  assert.match(brands, /contextKey=\{syncState === 'live' && selected\?\.orgScope === 'personal'/);
  assert.match(brands, /marketing:audience-unrecorded/);
  assert.match(brands, /marketing:promise-unrecorded/);
  assert.match(content, /contextKey=\{\['idea', 'draft', 'review'\]\.includes\(tab\) \? `content:\$\{tab\}` : undefined\}/);
  assert.doesNotMatch(read('./pages/mentor-shelf.jsx'), /contextKey=/);
});

test('desktop trigger is a 58px vertical edge rail without taking layout width', () => {
  const source = read('./context-mentor-rail.jsx');
  const css = read('./context-mentor-rail.css');
  assert.match(source, /<button[\s\S]*className="context-mentor-rail__trigger"/);
  assert.match(source, /context-mentor-rail__arrow/);
  assert.match(css, /\.context-mentor-rail\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.context-mentor-rail\s*\{[^}]*right:\s*0;/);
  assert.match(css, /\.context-mentor-rail\s*\{[^}]*width:\s*58px/);
  assert.match(css, /border-radius:\s*var\(--r\) 0 0 var\(--r\)/);
  assert.match(css, /writing-mode:\s*vertical-rl/);
});

test('shell-narrow trigger returns to horizontal flow while only <=600px uses the bottom sheet', () => {
  const source = read('./context-mentor-rail.jsx');
  const css = read('./context-mentor-rail.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.context-mentor-rail__content \.hub-seg__btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*position:\s*static/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*flex-direction:\s*row/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*writing-mode:\s*horizontal-tb/);
  assert.match(source, /window\.matchMedia\('\(max-width: 600px\)'\)/);
  assert.match(source, /presentation=\{compact \? 'compact' : 'side'\}/);
  assert.match(css, /var\(--line/);
  assert.match(css, /var\(--surface/);
  assert.doesNotMatch(css, /#[\da-fA-F]{3,8}\b|rgba?\(|oklch\(/);
});
