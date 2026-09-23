import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCurrentMonthProjectPreview } from './project-monthly-preview.js';

test('current-month preview separates completed and ongoing without counting archives or duplicate customers', () => {
  const projects = [
    { id: 'sept-done', statusKey: 'completed', completedAt: '2026-09-30T14:59:00Z', entityRef: { type: 'lead', id: 'same' } },
    { id: 'oct-done', statusKey: 'completed', completedAt: '2026-09-30T15:00:00Z' },
    { id: 'active', statusKey: 'active', entityRef: { type: 'lead', id: 'same' } },
    { id: 'blocked', statusKey: 'blocked', entityRef: { type: 'customer_account', id: 'other' } },
    { id: 'archived', statusKey: 'archived', completedAt: '2026-09-15T00:00:00Z' },
    { id: 'unknown', statusKey: 'completed', completedAt: null },
  ];
  const review = buildCurrentMonthProjectPreview(projects, new Date('2026-09-30T14:59:30Z'));
  assert.equal(review.month, '2026-09');
  assert.deepEqual(review.completed.map(project => project.id), ['sept-done']);
  assert.deepEqual(review.ongoing.map(project => project.id), ['active', 'blocked']);
  assert.deepEqual(review.blocked.map(project => project.id), ['blocked']);
  assert.deepEqual(review.undatedCompleted.map(project => project.id), ['unknown']);
  assert.equal(review.linkedCustomerCount, 2);
});
