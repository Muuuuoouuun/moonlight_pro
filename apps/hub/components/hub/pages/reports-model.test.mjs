import assert from 'node:assert/strict';
import test from 'node:test';
import * as workspaces from '../workspace-map.js';
const model = await import('./reports-model.js').catch(() => ({}));

test('report scopes map company workspace without guessing content belongs to company', () => {
  assert.equal(typeof workspaces.reportScopeForWorkspace, 'function');
  assert.equal(workspaces.reportScopeForWorkspace('classin'), 'company');
  assert.equal(workspaces.reportScopeForWorkspace('personal'), 'personal');
  assert.equal(workspaces.reportScopeForWorkspace('content'), 'content');
  assert.equal(workspaces.reportScopeForWorkspace('unknown'), 'all');
});
test('HTTP 200 read errors discard stale reports while partial keeps actual records and names missing sources', () => {
  assert.equal(typeof model.reportsReadState, 'function');
  const rows = [{ id: 'stored:one' }];
  assert.deepEqual(model.reportsReadState({ status: 'error', reports: rows }), { status: 'error', reports: [], failedSources: [] });
  assert.deepEqual(model.reportsReadState({ status: 'partial', reports: rows, failedSources: ['office'] }), { status: 'partial', reports: rows, failedSources: ['office'] });
  assert.equal(model.reportsReadState({ status: 'ok', reports: rows }).status, 'error');
});
test('kind scope week filters compose without changing saved period or data', () => {
  assert.equal(typeof model.filterReports, 'function');
  const rows = [
    { id: 'stored:company', kind: 'weekly', scope: 'company', periodStart: '2026-09-24', periodEnd: '2026-09-30' },
    { id: 'stored:personal', kind: 'weekly', scope: 'personal', periodStart: '2026-09-21', periodEnd: '2026-09-27' },
    { id: 'research:one', kind: 'research', scope: 'content', createdAt: '2026-09-30T23:40:00Z' },
  ];
  assert.deepEqual(model.filterReports(rows, { kind: 'weekly', scope: 'company', week: '2026-09-21' }).map(r => r.id), ['stored:company']);
  assert.equal(rows[0].periodStart, '2026-09-24');
  assert.deepEqual(model.filterReports(rows, { kind: 'research', scope: 'content', week: '2026-09-28' }).map(r => r.id), ['research:one']);
});
test('weekly facts distinguish unmeasured null from a recorded zero', () => {
  assert.equal(typeof model.weeklyReportFacts, 'function');
  const rows = model.weeklyReportFacts({ scope: 'company', facts: { stats: { contacts: 0, newDeals: null } } });
  assert.equal(rows.find(row => row.key === 'contacts').text, '0');
  assert.equal(rows.find(row => row.key === 'newDeals').text, null);
});
test('stable report link round trips prefixed IDs and safe links refuse executable URLs', () => {
  assert.equal(typeof model.reportHref, 'function');
  const url = new URL(model.reportHref('stored:abc', { scope: 'company', kind: 'weekly', week: '2026-09-21' }), 'https://hub.invalid');
  assert.equal(url.searchParams.get('report'), 'stored:abc');
  assert.equal(url.searchParams.get('scope'), 'company');
  assert.equal(model.safeReportLink('javascript:alert(1)'), null);
  assert.equal(model.safeReportLink('https://source.invalid/paper'), 'https://source.invalid/paper');
  assert.equal(model.safeReportLink('/dashboard/content/research?brief=abc'), '/dashboard/content/research?brief=abc');
});
test('report command retries keep request ID on loss and preview, then release it only after durable save', async () => {
  assert.equal(typeof model.createReportWriter, 'function');
  let count = 0; const bodies = [];
  const writer = model.createReportWriter({ uuid: () => `request-${++count}`, fetch: async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw Error('response lost');
    return { ok: true, json: async () => ({ status: bodies.length === 2 ? 'preview' : 'duplicate' }) };
  } });
  const command = { action: 'capture-weekly', scope: 'company', periodStart: '2026-09-24', periodEnd: '2026-09-30' };
  await assert.rejects(writer(command));
  await writer(command); await writer(command);
  assert.equal(new Set(bodies.map(body => body.requestId)).size, 1);
  await writer(command);
  assert.equal(bodies[3].requestId, 'request-2');
});

test('archive pages append unique durable IDs and group saved periods even when creation timestamps cross weeks', () => {
  assert.equal(typeof model.mergeReportPages, 'function');
  assert.equal(typeof model.groupReportsByWeek, 'function');
  const older = { id: 'stored:old', kind: 'weekly', periodStart: '2026-09-14', createdAt: '2026-10-01T00:00:00Z' };
  const newer = { id: 'stored:new', kind: 'weekly', periodStart: '2026-09-21', createdAt: '2026-09-29T00:00:00Z' };
  const page = model.mergeReportPages([older], [older, newer]);
  assert.equal(page.length, 2);
  assert.deepEqual(model.groupReportsByWeek(page).map(group => group.week), ['2026-09-21', '2026-09-14']);
  assert.equal(model.reportsReadState({ status: 'live', reports: [], nextCursor: 'cursor-one' }).nextCursor, 'cursor-one');
});

test('report URL filters normalize workspace aliases and reject malformed dates and genres', () => {
  assert.equal(typeof model.reportFiltersFromSearch, 'function');
  assert.deepEqual(model.reportFiltersFromSearch(new URLSearchParams('scope=classin&kind=weekly&week=2026-09-21')), { scope: 'company', kind: 'weekly', week: '2026-09-21' });
  assert.deepEqual(model.reportFiltersFromSearch(new URLSearchParams('scope=private&kind=secret&week=2026-02-30')), { scope: 'all', kind: 'all', week: 'all' });
});

test('weekly capture requires seven completed calendar days while allowing custom seven-day periods', () => {
  assert.equal(typeof model.weeklyCaptureError, 'function');
  const valid = { periodStart: '2026-09-24', periodEnd: '2026-09-30' };
  assert.equal(model.weeklyCaptureError(valid, '2026-10-01'), null);
  assert.equal(model.weeklyCaptureError({ periodStart: '2026-09-20', periodEnd: '2026-09-26' }, '2026-10-01'), null);
  for (const period of [{ periodStart: '2026-09-24', periodEnd: '2026-09-29' }, { periodStart: '2026-09-24', periodEnd: '2026-10-01' }, { periodStart: '2026-09-25', periodEnd: '2026-10-01' }, { periodStart: '2026-02-30', periodEnd: '2026-03-08' }]) {
    assert.equal(model.weeklyCaptureError(period, '2026-10-01'), '주간 보고서는 완료된 7일 기간으로 저장해 주세요.');
  }
});

test('report reads reject source failures and malformed rows without presenting a live archive', () => {
  for (const data of [{ status: 'live', source: 'error', reports: [] }, { status: 'live', reports: [null] }, { status: 'partial', reports: [{ id: 1 }] }, { status: 'live', reports: [{ id: '' }] }]) {
    const state = model.reportsReadState(data); assert.equal(state.status, 'error'); assert.deepEqual(state.reports, []);
  }
});
test('an older stored-report snapshot never rolls a current decision revision back', () => {
  const current = { id: 'stored:one', revision: 3, decision: 'current' };
  assert.deepEqual(model.mergeReportPages([current], [{ ...current, revision: 2, decision: 'old' }]), [current]);
  assert.equal(model.mergeReportPages([current], [{ ...current, revision: 4 }])[0].revision, 4);
});
test('report week uses Seoul Monday boundaries and preserves saved periods across date zones', () => {
  for (const [report, week] of [
    [{ createdAt: '2026-10-04T14:59:59Z' }, '2026-09-28'],
    [{ createdAt: '2026-10-04T15:00:00Z' }, '2026-10-05'],
    [{ createdAt: '2026-01-01T00:00:00+09:00' }, '2025-12-29'],
    [{ periodStart: '2024-02-29', createdAt: '2026-10-05T00:00:00Z' }, '2024-02-26'],
    [{ createdAt: 'invalid' }, null], [{ periodStart: '2026-02-30' }, null], [{} , null],
  ]) assert.equal(model.reportWeek(report), week);
});
