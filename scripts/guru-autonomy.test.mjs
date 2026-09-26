import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const config = JSON.parse(readFileSync(new URL('../apps/hub/vercel.json', import.meta.url), 'utf8'));
const scheduled = new Set(config.crons.map(job => job.path));

test('Guru follow-up proposal endpoint is never scheduled automatically', () => {
  assert.equal(scheduled.has('/api/cron/followup-autopilot'), false);
});

// 2026-09-26 operator decision (agent-layer-direction §7): AI does not create work on its own schedule.
// The content-draft and morning-brief routes stay callable by hand; only the automatic schedule is gone.
test('AI draft and morning-brief endpoints are never scheduled automatically', () => {
  for (const path of ['/api/cron/content-flywheel', '/api/cron/chief-of-staff']) {
    assert.equal(scheduled.has(path), false, `${path} must not be in vercel.json crons`);
  }
});
