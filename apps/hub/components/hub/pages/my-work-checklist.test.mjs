import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMyWorkChecklistToggle, readMyWorkChecklistReceipt } from './my-work-checklist.js';

const id = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-09-23T02:10:11.123456Z';
const item = { lane: 'task', entityId: id, updatedAt: stamp, checklist: [
  { id: first, title: '자료 확인', done: false, note: '', dueAt: '2026-09-30' },
  { id: second, title: '후속 연락', done: true, note: '고객 승인 뒤', dueAt: '2026-10-01' },
] };

test('내 작업 체크 토글은 원본·순서·세부 날짜를 보존하고 DB 버전을 싣는다', () => {
  const command = buildMyWorkChecklistToggle(item, first);
  assert.equal(command.id, id);
  assert.equal(command.expectedUpdatedAt, stamp);
  assert.deepEqual(command.checklist, [
    { ...item.checklist[0], done: true }, item.checklist[1],
  ]);
  assert.equal(item.checklist[0].done, false);
  assert.equal(buildMyWorkChecklistToggle({ ...item, checklist: command.checklist }, first).checklist[0].done, false);
});

test('버전·대상·체크리스트 검증 실패면 쓰기 명령을 만들지 않는다', () => {
  assert.equal(buildMyWorkChecklistToggle({ ...item, updatedAt: '' }, first), null);
  assert.equal(buildMyWorkChecklistToggle({ ...item, lane: 'deal' }, first), null);
  assert.equal(buildMyWorkChecklistToggle(item, '44444444-4444-4444-8444-444444444444'), null);
  assert.equal(buildMyWorkChecklistToggle({ ...item, checklist: [item.checklist[0], item.checklist[0]] }, first), null);
});

test('HTTP 성공만으로 완료라 하지 않고 영속 task의 체크리스트를 대조한다', () => {
  const command = buildMyWorkChecklistToggle(item, first);
  const saved = { status: 'saved', task: { id, updated_at: '2026-09-23T02:10:12.654321Z', meta: { checklist: command.checklist } } };
  assert.deepEqual(readMyWorkChecklistReceipt({ ok: true }, saved, command), {
    checklist: command.checklist, updatedAt: saved.task.updated_at,
  });
  assert.equal(readMyWorkChecklistReceipt({ ok: false }, saved, command), null);
  assert.equal(readMyWorkChecklistReceipt({ ok: true }, { ...saved, status: 'preview' }, command), null);
  assert.equal(readMyWorkChecklistReceipt({ ok: true }, { ...saved, task: { ...saved.task, meta: { checklist: item.checklist } } }, command), null);
  assert.equal(readMyWorkChecklistReceipt({ ok: true }, { ...saved, task: { ...saved.task, updated_at: '' } }, command), null);
});
