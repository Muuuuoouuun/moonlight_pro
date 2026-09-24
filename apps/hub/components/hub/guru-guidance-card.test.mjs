import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { guruChatPath } from './guru-client.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('card keeps browsing separate from advice generation and lets the reader hide it', () => {
  const card = read('./guru-guidance-card.jsx');
  assert.match(card, /selectGuidanceCard/);
  assert.match(card, /sessionStorage/);
  assert.match(card, /다른 카드 보기/);
  assert.match(card, /이 세션에서 숨기기/);
  assert.match(card, /다시 보기/);
  assert.match(card, /<GuidanceSource source=\{card\.source\}/);
  assert.doesNotMatch(card, /<p className="guru-guidance__source">/);
  assert.match(card, /guidanceDailyWindow\(now\)/);
  assert.match(card, /새 시간대 관점 보기/);
  assert.match(card, /서울 기준 09·14·19시에 준비/);
  assert.match(card, /onBrowse\?\.\(\)/);
  assert.doesNotMatch(card, /fetch\(|requestGuruCoaching\(|createWorkOrder\(/);
});

test('Guru cards take existing surface space and stay out of Home and Today triage', () => {
  const chat = read('./pages/agents.jsx');
  const revenue = read('./pages/revenue.jsx');
  const customers = read('./pages/customers.jsx');
  const home = read('./pages/home.jsx');
  const today = read('./pages/daily-brief.jsx');
  assert.match(chat, /<GuruGuidanceCard allowDomains/);
  assert.match(chat, /onAsk=\{card =>/);
  assert.match(revenue, /<GuruGuidanceCard[^>]*domain="sales"/);
  assert.match(customers, /<GuruGuidanceCard[^>]*domain="sales"/);
  assert.doesNotMatch(home, /GuruGuidanceCard/);
  assert.doesNotMatch(today, /GuruGuidanceCard/);
  assert.doesNotMatch(chat, /지금 무엇을 놓치고 있고, 다음 한 수가 무엇인지/);
});

test('Revenue card opens a prepared Guru question without generating advice', () => {
  const revenue = read('./pages/revenue.jsx');
  const chat = read('./pages/agents.jsx');
  assert.equal(guruChatPath({ guidanceId: 'sales-gap' }), 'dashboard/agents/chat?agent=guru&guidanceId=sales-gap');
  assert.match(revenue, /onAsk=\{card => onNavigate\?\.\(guruChatPath\(\{ guidanceId: card\.id \}\)\)\}/);
  assert.match(chat, /q\.get\('guidanceId'\)/);
  assert.doesNotMatch(chat, /setInput\(guidanceCard\.question\)|setInput\(card\.question\)/);
  assert.match(chat, /선택한 관점/);
  assert.match(chat, /activeMode === 'advice' \? 'open-question'/);
  assert.match(chat, /onBrowse=\{\(\) => setGuruGuidanceId\(null\)\}/);
});
