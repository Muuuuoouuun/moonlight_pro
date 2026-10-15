import assert from 'node:assert/strict';
import test from 'node:test';
let normalizeReportCommand, defaultReportPeriod;
try { ({ normalizeReportCommand, defaultReportPeriod } = await import('./reports-contract.js')); } catch {}
const ID = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-10-01T01:00:00Z');

test('capture fixes completed period and strips client supplied facts, workspace and timezone', () => {
  assert.equal(typeof normalizeReportCommand, 'function');
  const result = normalizeReportCommand({ requestId: ID, action: 'capture-weekly', scope: 'company', periodStart: '2026-09-24', periodEnd: '2026-09-30', facts: { invented: 77 }, workspaceId: 'foreign', timezone: 'UTC' }, { now });
  assert.deepEqual(result, { requestId: ID, action: 'capture-weekly', scope: 'company', periodStart: '2026-09-24', periodEnd: '2026-09-30' });
  for (const patch of [{scope:'other'}, {periodEnd:'2026-10-01'}, {periodStart:'2026-02-30'}, {periodStart:'2026-08-01'}, {periodEnd:'2026-09-20'}, {periodStart:'2026-09-29'}]) {
    assert.equal(normalizeReportCommand({ ...result, ...patch }, { now }), null);
  }
  assert.equal(normalizeReportCommand({requestId:ID,action:'capture-weekly',scope:'personal'},{now}),null);
});
test('default windows preserve personal Monday and company Thursday boundaries', () => {
  assert.equal(typeof defaultReportPeriod, 'function');
  assert.deepEqual(defaultReportPeriod('personal', now), { periodStart:'2026-09-21', periodEnd:'2026-09-27' });
  assert.deepEqual(defaultReportPeriod('company', now), { periodStart:'2026-09-24', periodEnd:'2026-09-30' });
});
test('document imports and decisions are bounded and cannot impersonate measured weekly facts', () => {
  assert.equal(typeof normalizeReportCommand, 'function');
  const base={requestId:ID,action:'save-document',kind:'qa',scope:'content',title:'검증 결과',body:'운영자가 제출한 실제 검증 결과',sourceRefs:[{url:'https://example.org/qa',label:'검증 기록'}]};
  assert.equal(normalizeReportCommand(base).body,base.body);
  for(const patch of [{kind:'weekly'},{title:''},{body:'x'.repeat(40001)},{sourceRefs:[{url:'javascript:alert(1)',label:'wrong'}]}])assert.equal(normalizeReportCommand({...base,...patch}),null);
  assert.ok(normalizeReportCommand({requestId:ID,action:'record-decision',reportId:ID,expectedRevision:1,decision:'다음 주에 확인'}));
  assert.equal(normalizeReportCommand({requestId:ID,action:'record-decision',reportId:'research:'+ID,expectedRevision:1,decision:'잘못된 대상'}),null);
});
