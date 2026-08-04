import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = (name) => readFileSync(new URL(`./pages/${name}.jsx`, import.meta.url), 'utf8');

test('decision certainty uses the shared geometry-based badge', () => {
  const source = page('work');
  assert.match(source, /import \{[^}]*CertaintyBadge[^}]*\} from "\.\.\/hub-primitives"/s);
  assert.match(source, /<CertaintyBadge\s+state=\{d\.status === 'Committed' \? 'confirmed' : 'unknown'\}/);
});

test('automation status uses lifecycle semantics instead of decorative status colors', () => {
  const source = page('automations');
  assert.match(source, /<LifecycleBadge state=\{automationLifecycle\(a\.status\)\} label=\{a\.status\}/);
  assert.doesNotMatch(source, /const sTone = \{ Active: 'success', Paused: 'warning', Error: 'danger' \}/);
});

test('category-only badges are neutral across work lanes, follow-ups, segments and commands', () => {
  assert.match(page('my-work'), /const LANE_TONE = \{ task: 'neutral', deal: 'neutral', event: 'neutral' \}/);
  assert.match(page('followups'), /const ACT_TONE = Object\.fromEntries\(Object\.keys\(ACT_ICON\)\.map\(\(key\) => \[key, "neutral"\]\)\)/);
  assert.match(page('segments'), /const STAGE_TONE = \{ New: 'neutral', Contact: 'neutral', Qualified: 'neutral', Lost: 'neutral' \}/);
  assert.doesNotMatch(page('evolution-settings'), /dest: '[^']+',\s+tone: '(?:info|warning|success|danger)'/);
});

test('overview charts use a monochrome Moonstone scale and reserve danger for blocked work', () => {
  const source = page('overview');
  assert.match(source, /blocked: 'var\(--danger\)'/);
  assert.match(source, /\{ key: 'decisions', label: '결정', color: 'var\(--moon-500\)'/);
  assert.match(source, /\{ key: 'content', label: '발행', color: 'var\(--fg-dim\)'/);
  assert.doesNotMatch(source, /blocked: 'var\(--warning\)'/);
});

test('urgent rails stay one pixel while non-urgent timing remains neutral', () => {
  const myWork = page('my-work');
  const followups = page('followups');
  assert.match(myWork, /item\.bucket === 'overdue' \? 'inset 1px 0 0 var\(--danger\)'/);
  assert.match(followups, /BUCKET_STRIPE = \{ overdue: "var\(--danger\)" \}/);
  assert.doesNotMatch(followups, /inset 2px 0 0/);
});

test('follow-up truth never turns a failed read into preview or a proven empty state', () => {
  const source = page('followups');
  assert.match(source, /<SyncBadge state=\{state\.syncState\} \/>/);
  assert.match(source, /state\.syncState === "error" \? \(\s*<EmptyState[\s\S]*?title="활동 기록을 읽지 못했습니다"/);
  assert.match(source, /stage && <Badge tone="neutral" size="xs" variant="outline">\{stage\.label\}<\/Badge>/);
});
