import assert from 'node:assert/strict';
import { test } from 'node:test';

import { signalKeyFor, toCheckItem, shortHash } from './catalog.js';
import { applyCheckItemOutcomes, isSnoozedThrough, orderCheckItems } from './suppression.js';
import { buildSignalOutcomeWrite, MAX_SNOOZE_DAYS } from './outcome-input.js';

const DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TODAY = '2026-10-01';
const NOW = Date.parse('2026-10-01T01:20:00Z'); // 10:20 KST

const dealSignal = { id: `revenue-stale-${DEAL}`, title: '거래 A — 16일째 정체', tone: 'danger', subject: { type: 'deal', id: DEAL, name: '거래 A' } };

test('a check item gets a stable key, a Korean kind label and write/navigate outcomes', () => {
  const item = toCheckItem(dealSignal);
  assert.equal(item.signalKey, `revenue-stale:${DEAL}`);
  assert.equal(item.kindLabel, '거래');
  assert.deepEqual(item.outcomes.map((o) => o.key), ['contact', 'task', 'reschedule', 'snooze']);
  assert.ok(item.outcomes.every((o) => o.kind === 'write'));
  assert.equal(item.outcomes.filter((o) => o.primary).length, 1, 'one primary per card');
  assert.equal(item.outcomes.at(-1).label, '보류 · 다시 볼 날', '4 is always the snooze (§4.1)');
  assert.equal(item.taskTitle, '거래 A 다음 연락');

  const content = toCheckItem({ id: 'content-x', title: '원고 D', subject: { type: 'content', id: 'item-1', name: '원고 D' } });
  assert.equal(content.outcomes[0].kind, 'navigate', 'content opens the production screen (operator profile §4)');
  assert.equal(content.outcomes[0].action, 'write');
});

test('lead groups key on the sorted lead ids, so a new lead makes a new key (Q-CF7)', () => {
  const a = signalKeyFor({ type: 'lead-group', ids: ['b', 'a'] });
  const b = signalKeyFor({ type: 'lead-group', ids: ['a', 'b'] });
  const c = signalKeyFor({ type: 'lead-group', ids: ['a', 'b', 'c'] });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^revenue-new-leads:[0-9a-z]+$/);
  assert.equal(shortHash('a,b'), shortHash('a,b'));
});

test('signals without a known subject keep their links and get no outcomes', () => {
  const item = toCheckItem({ id: 'x', kind: 'Other', title: 't', decisions: [{ label: '열기', action: 'projects' }] });
  assert.equal(item.signalKey, null);
  assert.deepEqual(item.outcomes, []);
  assert.equal(item.decisions.length, 1);
});

test('snooze boundary matches the CRM nudge rule: hidden before the return day, back on it', () => {
  assert.equal(isSnoozedThrough('2026-10-02', TODAY), true);
  assert.equal(isSnoozedThrough('2026-10-01', TODAY), false);
  assert.equal(isSnoozedThrough('', TODAY), false);
});

test('suppression hides only snoozed, open-task and not-yet-started scheduled cards', () => {
  const item = toCheckItem(dealSignal);
  const base = { todayKey: TODAY, now: NOW };

  const crm = applyCheckItemOutcomes([item], { ...base, nudgesBySubject: new Map([[`deal:${DEAL}`, { snoozedUntil: '2026-10-05' }]]) });
  assert.equal(crm.visible.length, 0);
  assert.deepEqual(crm.suppressed, [{ signalKey: item.signalKey, reason: 'snoozed' }]);

  const row = (extra) => ({ signal_key: item.signalKey, created_at: '2026-09-30T00:00:00Z', ...extra });
  const receipt = applyCheckItemOutcomes([item], { ...base, outcomes: [row({ outcome: 'snoozed', snoozed_until: '2026-10-03' })] });
  assert.equal(receipt.visible.length, 0);

  const returned = applyCheckItemOutcomes([item], { ...base, outcomes: [row({ outcome: 'snoozed', snoozed_until: TODAY })] });
  assert.equal(returned.visible.length, 1);
  assert.equal(returned.visible[0].returnedFromSnooze.until, TODAY);

  const undone = applyCheckItemOutcomes([item], { ...base, outcomes: [row({ outcome: 'snoozed', snoozed_until: '2026-10-03', undone_at: '2026-09-30T01:00:00Z' })] });
  assert.equal(undone.visible.length, 1, 'an undone snooze no longer hides the card');

  const taskRow = row({ outcome: 'task_created', record_ref: { table: 'tasks', id: TASK } });
  assert.equal(applyCheckItemOutcomes([item], { ...base, outcomes: [taskRow], openTaskIds: new Set([TASK]) }).visible.length, 0);
  assert.equal(applyCheckItemOutcomes([item], { ...base, outcomes: [taskRow], openTaskIds: new Set() }).visible.length, 1,
    'a finished (or unreadable) task does not keep the card hidden');

  const contacted = applyCheckItemOutcomes([item], { ...base, outcomes: [row({ outcome: 'contact_logged' })] });
  assert.equal(contacted.visible.length, 1, 'contact logs never suppress — the source record must change');

  const later = row({ outcome: 'scheduled', scheduled_start: '2026-10-01T04:30:00Z', scheduled_end: '2026-10-01T05:00:00Z' });
  assert.equal(applyCheckItemOutcomes([item], { ...base, outcomes: [later] }).visible.length, 0);
  const atStart = applyCheckItemOutcomes([item], { ...base, now: Date.parse('2026-10-01T04:32:00Z'), outcomes: [later] });
  assert.equal(atStart.visible[0].scheduled.state, 'now');
  const passed = applyCheckItemOutcomes([item], { ...base, now: Date.parse('2026-10-01T06:00:00Z'), outcomes: [later] });
  assert.equal(passed.visible[0].scheduled.state, 'passed');
});

test('order: scheduled-now → returned from snooze → urgent → the rest', () => {
  const plain = { id: 'p', tone: 'neutral' };
  const urgent = { id: 'u', tone: 'danger' };
  const back = { id: 'b', tone: 'neutral', returnedFromSnooze: { until: TODAY } };
  const now = { id: 'n', tone: 'neutral', scheduled: { state: 'now' } };
  assert.deepEqual(orderCheckItems([plain, urgent, back, now]).map((i) => i.id), ['n', 'b', 'u', 'p']);
});

test('outcome input: shape, idempotency key, snooze window and task reference', () => {
  const base = { requestId: REQ, signalKey: `revenue-stale:${DEAL}`, subject: { type: 'deal', id: DEAL }, title: '거래 A' };
  const ok = buildSignalOutcomeWrite({ ...base, outcome: 'contact_logged', recordRef: { table: 'crm_activities', id: 'act-1' } }, { todayKey: TODAY });
  assert.equal(ok.ok, true);
  assert.equal(ok.row.request_id, REQ);
  assert.equal(ok.row.snoozed_until, null);

  assert.equal(buildSignalOutcomeWrite({ ...base, requestId: 'nope', outcome: 'contact_logged' }).reason, 'invalid-request-id');
  assert.equal(buildSignalOutcomeWrite({ ...base, signalKey: 'bad key', outcome: 'contact_logged' }).reason, 'invalid-signal-key');
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'handled' }).reason, 'invalid-outcome');
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'task_created' }).reason, 'missing-task-ref');
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'task_created', recordRef: { table: 'tasks', id: TASK } }).ok, true);

  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'snoozed', snoozedUntil: TODAY }, { todayKey: TODAY }).reason, 'snooze-not-future');
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'snoozed', snoozedUntil: '2026-10-02' }, { todayKey: TODAY }).ok, true);
  assert.equal(MAX_SNOOZE_DAYS, 30);
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'snoozed', snoozedUntil: '2026-11-01' }, { todayKey: TODAY }).reason, 'snooze-too-far');
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'contact_logged', snoozedUntil: '2026-10-02' }).reason, 'unexpected-snoozed-until');

  const scheduled = buildSignalOutcomeWrite({ ...base, outcome: 'scheduled', scheduledStart: '2026-10-01T04:30:00Z', scheduledEnd: '2026-10-01T05:00:00Z', calendarEventId: 'evt' });
  assert.equal(scheduled.ok, true);
  assert.equal(scheduled.row.calendar_event_id, 'evt');
  assert.equal(buildSignalOutcomeWrite({ ...base, outcome: 'scheduled', scheduledStart: '2026-10-01T05:00:00Z', scheduledEnd: '2026-10-01T04:00:00Z' }).reason, 'invalid-scheduled-end');
});
