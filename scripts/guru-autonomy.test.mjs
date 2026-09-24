import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Guru follow-up proposal endpoint is never scheduled automatically', () => {
  const config = JSON.parse(readFileSync(new URL('../apps/hub/vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.crons.some(job => job.path === '/api/cron/followup-autopilot'), false);
});
