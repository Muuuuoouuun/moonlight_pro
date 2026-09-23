import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEKLY_STAT_FIELDS, weeklyStatValue, weeklySourceLabels, weeklyPeriods } from './weekly-report-fields.js';

test('personal and company fields name every stat the weekly report returns, in card order', () => {
  assert.deepEqual(WEEKLY_STAT_FIELDS.personal.map(field => field.key), ['focus', 'doneTasks', 'contacts', 'memos', 'reviewDays', 'publishes', 'personalDeals']);
  assert.deepEqual(WEEKLY_STAT_FIELDS.company.map(field => field.key), ['contacts', 'newDeals', 'movedDeals', 'modifiedOpenDeals', 'wonDeals']);
  for (const field of [...WEEKLY_STAT_FIELDS.personal, ...WEEKLY_STAT_FIELDS.company]) assert.ok(field.label, field.key);
});

test('weekly stat values keep unmeasured null distinct from a measured zero', () => {
  const focus = WEEKLY_STAT_FIELDS.personal[0];
  assert.deepEqual(weeklyStatValue(focus, { focusPicked: 3, focusDone: 2, focusRate: 67 }), { text: '2/3', rate: 67, value: 2 });
  assert.deepEqual(weeklyStatValue(focus, { focusPicked: 0, focusDone: 0, focusRate: null }), { text: '0', rate: null, value: 0 });
  assert.deepEqual(weeklyStatValue(focus, { focusPicked: null, focusDone: null }), { text: null, rate: null, value: null });
  const memos = WEEKLY_STAT_FIELDS.personal.find(field => field.key === 'memos');
  assert.deepEqual(weeklyStatValue(memos, { memos: 0 }), { text: '0', rate: null, value: 0 });
  assert.deepEqual(weeklyStatValue(memos, { memos: null }), { text: null, rate: null, value: null });
  assert.deepEqual(weeklyStatValue(memos, null), { text: null, rate: null, value: null });
});

test('failed weekly sources get operator-facing names and unknown keys are never hidden', () => {
  assert.deepEqual(weeklySourceLabels(['tasks:focus', 'journal_entries:note', 'crm_activities:deal', 'reviews_completed', 'goals']), ['오늘 3개', '메모', '딜 단계 이동', '하루 리뷰', '목표·성과']);
  assert.deepEqual(weeklySourceLabels(['tasks_completed', 'tasks_completed', 'something-new']), ['완료 할 일', 'something-new']);
  assert.deepEqual(weeklySourceLabels(undefined), []);
});

test('personal weeks run Monday–Sunday and include the current week only once a day has completed', () => {
  // 2026-09-23 is a Wednesday.
  assert.deepEqual(weeklyPeriods({ scope: 'personal', today: '2026-09-23', count: 2 }), [
    { periodStart: '2026-09-21', periodEnd: '2026-09-22', current: true, days: 2 },
    { periodStart: '2026-09-14', periodEnd: '2026-09-20', current: false, days: 7 },
    { periodStart: '2026-09-07', periodEnd: '2026-09-13', current: false, days: 7 },
  ]);
  // On Monday the last completed week is exactly the Monday card's window.
  assert.deepEqual(weeklyPeriods({ scope: 'personal', today: '2026-09-21', count: 1 }), [
    { periodStart: '2026-09-14', periodEnd: '2026-09-20', current: false, days: 7 },
  ]);
});

test('company weeks run Thursday–Wednesday to match the Thursday report and cross month boundaries', () => {
  assert.deepEqual(weeklyPeriods({ scope: 'company', today: '2026-09-24', count: 2 }), [
    { periodStart: '2026-09-17', periodEnd: '2026-09-23', current: false, days: 7 },
    { periodStart: '2026-09-10', periodEnd: '2026-09-16', current: false, days: 7 },
  ]);
  assert.deepEqual(weeklyPeriods({ scope: 'company', today: '2026-10-02', count: 1 }), [
    { periodStart: '2026-10-01', periodEnd: '2026-10-01', current: true, days: 1 },
    { periodStart: '2026-09-24', periodEnd: '2026-09-30', current: false, days: 7 },
  ]);
});

test('invalid scope, date or count produce no periods instead of a guessed window', () => {
  assert.deepEqual(weeklyPeriods({ scope: 'all', today: '2026-09-23' }), []);
  assert.deepEqual(weeklyPeriods({ scope: 'personal', today: '2026-02-30' }), []);
  assert.deepEqual(weeklyPeriods({ scope: 'personal', today: '2026-09-23', count: 0 }), []);
  assert.equal(weeklyPeriods({ scope: 'personal', today: '2026-09-23', count: 99 }).filter(row => !row.current).length, 8);
});

test('weekly report query keeps the default window and passes an explicit period through unchanged', async () => {
  const { weeklyReportQuery } = await import('./weekly-report-fields.js');
  assert.deepEqual(weeklyReportQuery(new URLSearchParams('scope=company')), { scope: 'company', includeGoals: true });
  assert.deepEqual(weeklyReportQuery(new URLSearchParams('')), { scope: 'personal', includeGoals: true });
  assert.deepEqual(weeklyReportQuery(new URLSearchParams('scope=personal&periodStart=2026-09-14&periodEnd=2026-09-20&goals=0')),
    { scope: 'personal', periodStart: '2026-09-14', periodEnd: '2026-09-20', includeGoals: false });
});

test('a half-specified or malformed period is rejected rather than silently becoming the default week', async () => {
  const { weeklyReportQuery } = await import('./weekly-report-fields.js');
  assert.deepEqual(weeklyReportQuery(new URLSearchParams('periodStart=2026-09-14')), { error: 'invalid-weekly-period' });
  assert.deepEqual(weeklyReportQuery(new URLSearchParams('periodStart=2026-09-14&periodEnd=2026-9-20')), { error: 'invalid-weekly-period' });
});

test('weekly actuals table keeps each week honest: loading, error and partial columns never show a guessed number', async () => {
  const { weeklyActualsModel } = await import('./weekly-report-fields.js');
  const periods = weeklyPeriods({ scope: 'personal', today: '2026-09-23', count: 3 });
  const model = weeklyActualsModel({
    scope: 'personal',
    periods,
    reports: [
      { status: 'partial', partial: true, failedSources: ['journal_entries:note'], stats: { focusPicked: 2, focusDone: 1, focusRate: 50, doneTasks: 4, contacts: 0, memos: null, reviewDays: 2, publishes: 0, personalDeals: 1 }, definitions: { focusRate: '고른 오늘 3개 중 같은 날 완료한 비율', memos: '새 메모 수' } },
      { status: 'live', partial: false, failedSources: [], stats: { focusPicked: 0, focusDone: 0, focusRate: null, doneTasks: 6, contacts: 3, memos: 5, reviewDays: 5, publishes: 1, personalDeals: 0 } },
      { status: 'error', error: 'weekly-report-read-failed' },
      undefined,
    ],
  });
  assert.deepEqual(model.columns.map(column => column.state), ['partial', 'live', 'error', 'loading']);
  assert.deepEqual(model.columns[0].missing, ['메모']);
  assert.equal(model.columns[0].current, true);
  const focus = model.rows.find(row => row.key === 'focus');
  assert.deepEqual(focus.cells.map(cell => cell.text), ['1/2', '0', null, null]);
  assert.equal(focus.cells[0].rate, 50);
  assert.equal(focus.definition, '고른 오늘 3개 중 같은 날 완료한 비율');
  const memos = model.rows.find(row => row.key === 'memos');
  assert.deepEqual(memos.cells.map(cell => cell.text), [null, '5', null, null]);
  // 한 주라도 아직 읽는 중이면 표 전체는 확인 중이다.
  assert.equal(model.state, 'loading');
});

test('weekly actuals report error only when every week failed, and preview when storage is not connected', async () => {
  const { weeklyActualsModel } = await import('./weekly-report-fields.js');
  const periods = weeklyPeriods({ scope: 'company', today: '2026-09-24', count: 2 });
  assert.equal(weeklyActualsModel({ scope: 'company', periods, reports: [{ status: 'error' }, { status: 'error' }] }).state, 'error');
  assert.equal(weeklyActualsModel({ scope: 'company', periods, reports: [{ status: 'preview' }, { status: 'preview' }] }).state, 'preview');
  assert.equal(weeklyActualsModel({ scope: 'company', periods, reports: [undefined, { status: 'live', stats: {} }] }).state, 'loading');
  assert.equal(weeklyActualsModel({ scope: 'company', periods, reports: [{ status: 'live', stats: { contacts: 1 } }, { status: 'live', stats: { contacts: 2 } }] }).state, 'live');
});

test('every weekly failed-source key has a missing-data label for the Office context note', async () => {
  const { WEEKLY_SOURCE_LABELS, WEEKLY_MISSING_LABELS } = await import('./weekly-report-fields.js');
  assert.deepEqual(Object.keys(WEEKLY_MISSING_LABELS).sort(), Object.keys(WEEKLY_SOURCE_LABELS).sort());
  assert.equal(WEEKLY_MISSING_LABELS['tasks:focus'], '오늘 3개 미측정');
});

test('weeks missing the same sources are listed once with every affected period', async () => {
  const { weeklyActualsModel } = await import('./weekly-report-fields.js');
  const periods = weeklyPeriods({ scope: 'company', today: '2026-09-24', count: 3 });
  const partial = failedSources => ({ status: 'partial', partial: true, failedSources, stats: { contacts: 0 } });
  const model = weeklyActualsModel({ scope: 'company', periods, reports: [partial(['deal-win-timestamps']), partial(['deal-win-timestamps']), partial(['deal-win-timestamps', 'crm_activities:deal'])] });
  assert.deepEqual(model.missingGroups, [
    { labels: ['성사일'], periods: [['2026-09-17', '2026-09-23'], ['2026-09-10', '2026-09-16']] },
    { labels: ['성사일', '딜 단계 이동'], periods: [['2026-09-03', '2026-09-09']] },
  ]);
});
