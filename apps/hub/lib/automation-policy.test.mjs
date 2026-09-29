import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as policy from './automation-policy.js';

const now = new Date('2026-09-26T12:00:00Z');
function run(id, statusKey = 'failure', overrides = {}) {
  return { id, automationKey: 'inquiries-sync', automationId: 'sync', automationStatus: 'active', executionMode: 'operational', statusKey, startedAt: '2026-09-26T07:00:00Z', ...overrides };
}

test('retired AI batches override stale active DB metadata', () => {
  for (const key of ['followup-autopilot', 'content-flywheel', 'chief-of-staff']) {
    assert.deepEqual(policy.resolveAutomationPolicy?.({ meta: { key }, status: 'active' }, { trigger_type: 'schedule' })?.executionMode, 'retired');
  }
});
test('manual AI stays requested and operational schedules remain operational', () => {
  assert.equal(policy.resolveAutomationPolicy?.({ status: 'active' })?.executionMode, 'requested');
  assert.equal(policy.resolveAutomationPolicy?.({ status: 'active' }, { trigger_type: 'webhook' })?.executionMode, 'operational');
});
test('same automation failures collapse to the most recent unresolved incident', () => {
  const older = run('older', 'failure', { startedAt: '2026-09-26T06:00:00Z' });
  const result = policy.getActionableAutomationFailures?.([older, run('newer')], { now });
  assert.equal(result?.length, 1);
  assert.equal(result?.[0]?.id, 'newer');
  assert.equal(result?.[0]?.failureCount, 2);
});
test('later success resolves failures, while running and ignored do not', () => {
  const success = run('success', 'success', { startedAt: '2026-09-26T08:00:00Z' });
  assert.deepEqual(policy.getActionableAutomationFailures?.([run('fail'), success], { now }), []);
  for (const status of ['queued', 'running', 'ignored']) {
    const latest = run('latest', status, { startedAt: '2026-09-26T08:00:00Z' });
    assert.equal(policy.getActionableAutomationFailures?.([run('fail'), latest], { now })?.[0]?.id, 'fail');
  }
});
test('retired, requested, paused, unknown and old runs remain history only', () => {
  for (const change of [
    { executionMode: 'retired' }, { executionMode: 'requested' },
    { automationStatus: 'paused' }, { automationStatus: 'disabled' },
    { automationStatus: undefined }, { automationKey: null, automationId: null },
    { startedAt: '2026-09-24T01:00:00Z' }, { startedAt: 'invalid' },
    { startedAt: '2026-09-27T01:00:00Z' },
  ]) assert.deepEqual(policy.getActionableAutomationFailures?.([run('history', 'failure', change)], { now }), []);
});
test('separate automations do not clear one another', () => {
  const another = run('other', 'success', { automationKey: 'github-sync', automationId: 'github' });
  assert.equal(policy.getActionableAutomationFailures?.([run('fail'), another], { now })?.length, 1);
});

test('completion order determines recovery for overlapping runs', () => {
  const slowSuccess = run('slow', 'success', { startedAt: '2026-09-26T05:00:00Z', finishedAt: '2026-09-26T09:00:00Z' });
  const fastFailure = run('fast', 'failure', { startedAt: '2026-09-26T07:00:00Z', finishedAt: '2026-09-26T08:00:00Z' });
  assert.deepEqual(policy.getActionableAutomationFailures([slowSuccess, fastFailure], { now }), []);
  assert.equal(policy.getActionableAutomationFailures([{...slowSuccess,statusKey:'failure'},{...fastFailure,statusKey:'success'}], { now })[0]?.id,'slow');
});
