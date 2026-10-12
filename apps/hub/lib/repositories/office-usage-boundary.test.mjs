import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readOfficeUsage } from './office-usage.js';

const row = { mode: 'draft', result: 'ok', recommendation: { elapsedMs: 10 } };

test('server-capped 1000 rows still reveal a later row without changing the summary or scope', async () => {
  const calls = [];
  const value = await readOfficeUsage({ now: Date.parse('2026-10-02T00:00:00Z'), fetchRows: async (table, options) => {
    calls.push({ table, options });
    return { configured: true, rows: options.offset ? [{ mode: 'draft' }] : Array(1000).fill(row) };
  } });
  assert.equal(value.status, 'live');
  assert.equal(value.truncated, true);
  assert.equal(value.requests, 1000);
  assert.equal(value.rowLimit, 1000);
  assert.equal(value.averageElapsedMs, 10);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].table, 'agent_runs');
  assert.equal(calls[1].options.offset, 1000);
  assert.equal(calls[1].options.limit, 1);
  assert.equal(calls[1].options.select, 'mode');
  assert.deepEqual(calls[1].options.filters, calls[0].options.filters);
  assert.equal(calls[1].options.order, calls[0].options.order);
});

test('exactly 1000 available logs remain complete after an empty boundary probe', async () => {
  let calls = 0;
  const value = await readOfficeUsage({ fetchRows: async (_table, options) => {
    calls += 1;
    return { configured: true, rows: options.offset ? [] : Array(1000).fill(row) };
  } });
  assert.equal(value.status, 'live');
  assert.equal(value.truncated, false);
  assert.equal(value.requests, 1000);
  assert.equal(calls, 2);
});

for (const [label, next] of [
  ['error with rows', { configured: true, rows: [], error: 'synthetic-read-failed' }],
  ['unconfigured', { configured: false, rows: [] }],
  ['missing rows', { configured: true, rows: null }],
]) test(`uncertain boundary (${label}) fails closed without a live summary`, async () => {
  const value = await readOfficeUsage({ fetchRows: async (_table, options) => options.offset ? next : { configured: true, rows: Array(1000).fill(row) } });
  assert.equal(value.status, 'error');
  assert.equal(value.source, 'error');
  assert.equal(value.requests, undefined);
  assert.equal(value.truncated, undefined);
});
