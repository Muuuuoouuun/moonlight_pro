import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SIGNAL_TARGETS } from './signal-targets.js';

test('every decision emitted by the daily brief API has a destination in both home views', () => {
  const route = readFileSync(new URL('../app/api/hub/daily-brief/route.js', import.meta.url), 'utf8');
  const actions = [...route.matchAll(/action\("[^\"]+",\s*"([^\"]+)"/g)].map(match => match[1]);
  assert.ok(actions.length > 10, 'the producer action contract must be inspected');
  for (const action of actions) assert.ok(SIGNAL_TARGETS[action]?.startsWith('dashboard/'), `missing destination: ${action}`);
  assert.equal(SIGNAL_TARGETS.queueApprovals, 'dashboard/agents/orders');
  assert.equal(SIGNAL_TARGETS.write, 'dashboard/content/studio');
  assert.equal(SIGNAL_TARGETS.review, 'dashboard/automations/runs');
  assert.equal(SIGNAL_TARGETS.decision, 'dashboard/work/decisions?new=decision');
});

test('both home views consume the shared map, and unsupported decisions stay unresolved', () => {
  for (const name of ['home', 'daily-brief']) {
    const source = readFileSync(new URL(`../components/hub/pages/${name}.jsx`, import.meta.url), 'utf8');
    assert.match(source, /import \{ SIGNAL_TARGETS \} from ['"]@\/lib\/signal-targets['"]/);
    assert.doesNotMatch(source, /const SIGNAL_TARGETS\s*=/);
    if (name === 'home') assert.ok(source.indexOf('if (decision && !target) return;') < source.indexOf('setResolved((prev)'), 'unmapped decisions must not remove the signal');
  }
});
