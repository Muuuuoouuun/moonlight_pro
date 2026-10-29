import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_JOBS, OFFICE_ROOM_JOBS, OFFICE_LINK_JOBS, officeActiveJob, officeJobMatches, officeJobPatch } from './office-jobs.js';
import { OFFICE_IDS, OFFICE_MODES } from './office.js';

// 2026-10-01 front-door 표 그대로: 정리·막힌일=이브이 대화, 판매판단=에브이·리피아 회의(개인), 개인 답장=부스터 초안(개인), 회사 답장·원고는 링크.
test('일감 표는 여섯 칩 — 회의실 넷 + 링크 둘, 담당은 로스터 안에서', () => {
  assert.deepEqual(OFFICE_JOBS.map(job => job.id), ['triage', 'stuck', 'sales-judgment', 'personal-reply', 'company-reply', 'copy']);
  assert.equal(OFFICE_ROOM_JOBS.length, 4); assert.equal(OFFICE_LINK_JOBS.length, 2);
  for (const job of OFFICE_ROOM_JOBS) {
    assert.ok(OFFICE_IDS.includes(job.ownerId), job.id);
    assert.ok(OFFICE_MODES.includes(job.mode), job.id);
    assert.ok(job.reviewerIds.every(id => OFFICE_IDS.includes(id) && id !== job.ownerId), job.id);
    assert.ok(job.mode !== 'council' || job.reviewerIds.length >= 1, '회의는 관점 1명 이상');
  }
  const sales = OFFICE_ROOM_JOBS.find(job => job.id === 'sales-judgment');
  assert.deepEqual([sales.scope, sales.ownerId, sales.reviewerIds, sales.mode], ['personal', 'espeon', ['leafeon'], 'council']);
  assert.ok(OFFICE_LINK_JOBS.every(job => job.link.startsWith('dashboard/')));
});

test('칩은 레일과 정확히 같을 때만 켜지고, 레일이 바뀌면 꺼진다', () => {
  const sales = OFFICE_ROOM_JOBS.find(job => job.id === 'sales-judgment');
  const session = { ownerId: 'espeon', reviewers: ['leafeon'], mode: 'council' };
  assert.ok(officeJobMatches(sales, session));
  assert.equal(officeActiveJob(session)?.id, 'sales-judgment');
  assert.equal(officeActiveJob({ ...session, reviewers: ['leafeon', 'umbreon'] }), null);
  assert.equal(officeActiveJob({ ...session, mode: 'chat' }), null);
  assert.equal(officeActiveJob({ ownerId: 'eevee', reviewers: [], mode: 'chat' })?.id, 'triage');
});

test('템플릿은 빈 칸이나 다른 칩의 템플릿만 바꾸고, 운영자가 쓴 글은 덮지 않는다', () => {
  const sales = OFFICE_ROOM_JOBS.find(job => job.id === 'sales-judgment');
  const stuck = OFFICE_ROOM_JOBS.find(job => job.id === 'stuck');
  assert.equal(officeJobPatch(sales, '').draft, sales.template);
  assert.equal(officeJobPatch(sales, stuck.template).draft, sales.template);
  assert.equal('draft' in officeJobPatch(sales, '내가 쓰던 안건'), false);
  assert.deepEqual(officeJobPatch(stuck, '').reviewers, []);
  assert.equal(officeJobPatch(sales, '').presetId, null);
});
