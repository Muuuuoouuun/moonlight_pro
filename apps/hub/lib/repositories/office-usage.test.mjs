import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeOfficeRuns, readOfficeUsage } from './office-usage.js';

test('summarizes office runs into requests, links, failures and average latency of successful requests', () => {
  const rows = [
    { agent: 'office.eevee', mode: 'chat', result: 'ok', recommendation: { elapsedMs: 10000 } },
    { agent: 'office.council', mode: 'council', result: 'error', recommendation: { failure: { phase: 'synthesis', category: 'deadline' }, elapsedMs: 48000 } },
    { agent: 'office.flareon', mode: 'draft', result: 'ok', recommendation: { elapsedMs: 20000 } },
    { agent: 'office.vaporeon', mode: 'draft', result: 'error', recommendation: { failure: null } },
    { agent: 'office.apply', mode: 'apply', result: 'ok', recommendation: { contextChanged: true } },
    { agent: 'office.eevee', mode: 'chat', result: 'ok', recommendation: null },
  ];
  assert.deepEqual(summarizeOfficeRuns(rows), { requests: 5, applied: 1, failed: 2, failureCategories: { deadline: 1, unknown: 1 }, averageElapsedMs: 15000 });
  assert.deepEqual(summarizeOfficeRuns([]), { requests: 0, applied: 0, failed: 0, failureCategories: {}, averageElapsedMs: null });
});

test('reads only office runs in the window and keeps the Hub read envelope', async () => {
  let seen;
  const live = await readOfficeUsage({ now: Date.parse('2026-09-23T00:00:00Z'), fetchRows: async (table, options) => { seen = { table, options }; return { rows: [], configured: true }; } });
  assert.equal(live.status, 'live');
  assert.equal(live.windowDays, 7);
  assert.equal(seen.table, 'agent_runs');
  assert.ok(seen.options.filters.some(([key, value]) => key === 'agent' && value === 'like.office.*'));
  assert.ok(seen.options.filters.some(([key, value]) => key === 'ran_at' && value === 'gte.2026-09-16T00:00:00.000Z'));
  assert.doesNotMatch(seen.options.select, /input_summary|\*/);
  assert.equal((await readOfficeUsage({ fetchRows: async () => ({ rows: null, configured: false }) })).status, 'preview');
  const failed = await readOfficeUsage({ fetchRows: async () => ({ rows: null, configured: true, error: 'x' }) });
  assert.equal(failed.status, 'error');
  assert.equal(failed.source, 'error');
});
