import assert from 'node:assert/strict';
import test from 'node:test';
import { selectUrgentProjectItems } from './project-urgent-items.js';

test('urgent project items include direct tasks, use KST dates, and skip completed checks', () => {
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
    ['ordinary', null, '4일 지남'], ['check', 'next', '오늘'], ['blocked', null, '막힘'],
  ]);
});

test('direct tasks retain overdue, today, blocked, then upcoming priority without a type requirement', () => {
  const rows = selectUrgentProjectItems([
    { id: 'upcoming', title: '이번 주 할 일', dueAt: '2026-09-30' },
    { id: 'blocked', title: '막힌 할 일', status: 'blocked', dueAt: '2026-10-05' },
    { id: 'today', title: '오늘 할 일', dueAt: '2026-09-23' },
    { id: 'overdue', title: '지난 할 일', dueAt: '2026-09-22' },
    { id: 'later', title: '다음 주 할 일', dueAt: '2026-10-01' },
    { id: 'undated', title: '기한 없는 할 일' },
    { id: 'completed', title: '끝낸 할 일', status: 'done', dueAt: '2026-09-21' },
  ], new Date('2026-09-23T00:00:00Z'));
  assert.deepEqual(rows.map(row => [row.taskId, row.reason, row.checkId]), [
    ['overdue', '1일 지남', null],
    ['today', '오늘', null],
    ['blocked', '막힘', null],
    ['upcoming', '7일 남음', null],
  ]);
});

test('a direct task and its urgent checklist produce one suggestion with the actionable check ID', () => {
  const rows = selectUrgentProjectItems([
    { id: 'direct', title: '제출', dueAt: '2026-09-23', meta: { checklist: [
      { id: 'complete', title: '자료 정리', done: true, dueAt: '2026-09-20' },
      { id: 'later', title: '전송', done: false, dueAt: '2026-09-25' },
      { id: 'next', title: '검토', done: false, dueAt: '2026-09-22' },
    ] } },
  ], new Date('2026-09-23T00:00:00Z'));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    taskId: 'direct', checkId: 'next', title: '제출', checkTitle: '검토',
    dueKey: '2026-09-22', rank: 0, reason: '1일 지남', blocked: false,
  });
});

test('equally urgent rows use stable task IDs after date and title ordering', () => {
  const tasks = [
    { id: 'b', title: '검토', dueAt: '2026-09-23' },
    { id: 'a', title: '검토', dueAt: '2026-09-23' },
  ];
  const now = new Date('2026-09-23T00:00:00Z');
  assert.deepEqual(selectUrgentProjectItems(tasks, now).map(row => row.taskId), ['a', 'b']);
  assert.deepEqual(selectUrgentProjectItems([...tasks].reverse(), now).map(row => row.taskId), ['a', 'b']);
});
