import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import {
  GURU_CARDS,
  LEGEND_CARDS,
  guidancePeriodKey,
  listGuidanceCards,
  selectGuidanceCard,
  guidancePromptFrame,
} from './index.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('Guru catalogue covers each practice domain with attributable source sections', () => {
  assert.deepEqual([...new Set(GURU_CARDS.map(card => card.domain))].sort(), ['content', 'marketing', 'sales']);
  for (const card of [...GURU_CARDS, ...LEGEND_CARDS]) {
    assert.ok(card.id && card.person && card.frame && card.text && card.useWhen && card.question);
    assert.ok(card.source.title && card.source.section);
    assert.ok(existsSync(resolve(repoRoot, card.source.path)), card.source.path);
    assert.doesNotMatch(card.text, /\d+\s*%|“.*”/, `unverified claim or quotation in ${card.id}`);
  }
  assert.equal(new Set([...GURU_CARDS, ...LEGEND_CARDS].map(card => card.id)).size, GURU_CARDS.length + LEGEND_CARDS.length);
});

test('Seoul day selection is stable across UTC time within the same local day', () => {
  const before = new Date('2026-09-23T16:00:00Z');
  const after = new Date('2026-09-24T14:59:00Z');
  assert.equal(guidancePeriodKey('daily', before), '2026-09-24');
  assert.equal(guidancePeriodKey('daily', after), '2026-09-24');
  assert.equal(selectGuidanceCard({ cadence: 'daily', domain: 'sales', now: before }).id,
    selectGuidanceCard({ cadence: 'daily', domain: 'sales', now: after }).id);
});

test('weekly Legend selection changes only at the Seoul Monday boundary', () => {
  const sunday = new Date('2026-09-27T14:59:00Z');
  const monday = new Date('2026-09-27T15:00:00Z');
  assert.notEqual(guidancePeriodKey('weekly', sunday), guidancePeriodKey('weekly', monday));
  assert.ok(LEGEND_CARDS.some(card => card.id === selectGuidanceCard({ cadence: 'weekly', now: monday }).id));
});

test('domain filtering and manual offset do not change another domain', () => {
  const now = new Date('2026-09-24T00:00:00Z');
  const sales = listGuidanceCards({ cadence: 'daily', domain: 'sales' });
  const marketing = listGuidanceCards({ cadence: 'daily', domain: 'marketing' });
  assert.ok(sales.length >= 2 && marketing.length >= 2);
  assert.ok(sales.every(card => card.domain === 'sales'));
  assert.notEqual(selectGuidanceCard({ cadence: 'daily', domain: 'sales', now, offset: 0 }).id,
    selectGuidanceCard({ cadence: 'daily', domain: 'sales', now, offset: 1 }).id);
  assert.equal(selectGuidanceCard({ cadence: 'daily', domain: 'marketing', now, offset: 0 }).id,
    selectGuidanceCard({ cadence: 'daily', domain: 'marketing', now, offset: 0 }).id);
});

test('selected frame names its source without turning a tip into a required action', () => {
  const frame = guidancePromptFrame('sales-meddic');
  assert.match(frame, /Dick Dunkel/);
  assert.match(frame, /docs\/sales-guru-knowledge-base\.md/);
  assert.doesNotMatch(frame, /work_order|승인 큐|반드시.*다음/);
  assert.equal(guidancePromptFrame('missing-card'), '');
});
