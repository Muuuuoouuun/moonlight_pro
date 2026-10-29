import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeOfficeRuns, readOfficeUsage } from './office-usage.js';

const noVerdicts = { kept: 0, edited: 0, dropped: 0, total: 0, topDropReason: null };

test('summarizes office runs into requests, links, failures and average latency of successful requests', () => {
  const rows = [
    { agent: 'office.eevee', mode: 'chat', result: 'ok', recommendation: { elapsedMs: 10000 } },
    { agent: 'office.council', mode: 'council', result: 'error', recommendation: { failure: { phase: 'synthesis', category: 'deadline' }, elapsedMs: 48000 } },
    { agent: 'office.flareon', mode: 'draft', result: 'ok', recommendation: { elapsedMs: 20000 } },
    { agent: 'office.vaporeon', mode: 'draft', result: 'error', recommendation: { failure: null } },
    { agent: 'office.apply', mode: 'apply', result: 'ok', recommendation: { contextChanged: true } },
    { agent: 'office.eevee', mode: 'chat', result: 'ok', recommendation: null },
  ];
  assert.deepEqual(summarizeOfficeRuns(rows), { requests: 5, applied: 1, failed: 2, failureCategories: { deadline: 1, unknown: 1 }, averageElapsedMs: 15000, verdicts: noVerdicts, tokens: null });
  assert.deepEqual(summarizeOfficeRuns([]), { requests: 0, applied: 0, failed: 0, failureCategories: {}, averageElapsedMs: null, verdicts: noVerdicts, tokens: null });
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

test('usage read detects truncation with one lookahead row while preserving the 1000-row summary', async () => {
  const row = { mode: 'draft', result: 'ok', recommendation: { elapsedMs: 10 } };
  let seen;
  for (const count of [0, 1000, 1001]) {
    const value = await readOfficeUsage({ fetchRows: async (_table, options) => {
      if (!options.offset) seen = options;
      return { configured: true, rows: Array(count).fill(row).slice(options.offset || 0, (options.offset || 0) + options.limit) };
    } });
    assert.equal(seen.limit, 1001);
    assert.equal(value.rowLimit, 1000);
    assert.equal(value.truncated, count > 1000);
    assert.equal(value.requests, Math.min(count, 1000));
  }
});

test('usage read does not treat a rows array with a read error as live', async () => {
  const value = await readOfficeUsage({ fetchRows: async () => ({ configured: true, rows: [], error: 'read-failed' }) });
  assert.equal(value.status, 'error');
  assert.equal(value.source, 'error');
  assert.equal(value.requests, undefined);
});

test('usage read keeps an explicitly unconfigured connection in preview', async () => {
  const value = await readOfficeUsage({ fetchRows: async () => ({ configured: false, rows: [] }) });
  assert.equal(value.status, 'preview');
});

test('verdicts and tokens are tallied while probe rows are excluded everywhere', () => {
  const usage = totalTokens => ({ promptTokens: 1, outputTokens: 1, totalTokens });
  const rows = [
    { mode: 'chat', result: 'ok', recommendation: { usage: usage(100), verdict: { value: 'kept', reason: null } } },
    { mode: 'chat', result: 'ok', recommendation: { usage: usage(50), verdict: { value: 'edited', reason: null } } },
    { mode: 'draft', result: 'ok', recommendation: { usage: null, verdict: { value: 'dropped', reason: 'wrong' } } },
    { mode: 'draft', result: 'ok', recommendation: { verdict: { value: 'dropped', reason: 'wrong' } } },
    { mode: 'draft', result: 'ok', recommendation: { verdict: { value: 'dropped', reason: 'context' } } },
    { mode: 'chat', result: 'ok', recommendation: { verdict: { value: 'bogus' } } },
    { mode: 'chat', result: 'ok', recommendation: { probe: true, usage: usage(9999), verdict: { value: 'kept', reason: null } } },
  ];
  const summary = summarizeOfficeRuns(rows);
  assert.equal(summary.requests, 6);
  assert.deepEqual(summary.verdicts, { kept: 1, edited: 1, dropped: 3, total: 5, topDropReason: 'wrong' });
  assert.equal(summary.tokens, 150);
  assert.equal(summarizeOfficeRuns([{ mode: 'chat', result: 'ok', recommendation: { probe: true } }]).requests, 0);
});
