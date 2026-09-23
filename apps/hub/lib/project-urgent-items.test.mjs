import assert from 'node:assert/strict';
import test from 'node:test';
import { selectUrgentProjectItems } from './project-urgent-items.js';

test('urgent project items use KST dates, skip completed checks, and keep one row per subproject', () => {
  const now = new Date('2026-09-23T15:30:00Z'); // 9/24 in Seoul
  const rows = selectUrgentProjectItems([
    { id: 'later', itemType: 'subproject', title: '나중', dueAt: '2026-10-03', checklist: [] },
    { id: 'done', itemType: 'milestone', title: '완료', done: true, dueAt: '2026-09-20' },
    { id: 'ordinary', itemType: 'task', title: '일반 할 일', dueAt: '2026-09-20' },
    { id: 'blocked', itemType: 'milestone', title: '막힘', status: 'blocked', checklist: [] },
    { id: 'check', itemType: 'subproject', title: '산출물', checklist: [
      { id: 'finished', title: '완료된 것', done: true, dueAt: '2026-09-20' },
      { id: 'next', title: '검증', done: false, dueAt: '2026-09-24' },
      { id: 'third', title: '발행', done: false, dueAt: '2026-09-26' },
    ] },
  ], now);
  assert.deepEqual(rows.map(row => [row.taskId, row.checkId, row.reason]), [
    ['check', 'next', '오늘'], ['blocked', null, '막힘'],
  ]);
});
