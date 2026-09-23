import assert from 'node:assert/strict';
import { test } from 'node:test';
let helpers;
try { helpers = await import('./content-performance.js'); } catch {}

test('Korean calendar periods retain Monday across a year boundary', () => {
  assert.ok(helpers, 'performance helpers must exist');
  assert.equal(helpers.seoulDate('2026-01-31T15:00:00Z'), '2026-02-01');
  assert.equal(helpers.seoulDate(null), null);
  assert.equal(helpers.seoulDate('bad'), null);
  assert.deepEqual(helpers.performancePeriods('2025-12-31T15:00:00Z'), { today: '2026-01-01', weekStart: '2025-12-29', month: '2026-01', year: 2026 });
});

test('totals distinguish unrecorded, actual zero and partial coverage', () => {
  assert.ok(helpers);
  assert.deepEqual(helpers.summarizePublications([]), { published: 0, views: null, shares: null, replies: null, coverage: { views: 0, shares: 0, replies: 0 }, lastCapturedAt: null });
  const rows = [{ metrics: { views: 0, shares: null, replies: 2, capturedAt: '2026-09-21T00:00:00Z' } }, { metrics: { views: 15, shares: 0, replies: null, capturedAt: '2026-09-22T00:00:00Z' } }, { metrics: null }];
  assert.deepEqual(helpers.summarizePublications(rows), { published: 3, views: 15, shares: 0, replies: 2, coverage: { views: 2, shares: 1, replies: 1 }, lastCapturedAt: '2026-09-22T00:00:00.000Z' });
});
