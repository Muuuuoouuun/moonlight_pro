import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectGroupSpan, projectOpenSteps, selectProjectNextStep } from './project-next-step.js';

const group = {
  id: 'g1', title: '검토·발행', itemType: 'subproject', done: false, status: 'todo', dueAt: '2026-10-23',
  checklist: [
    { id: 'c1', title: '테스트 발송', done: true, dueAt: '2026-10-17' },
    { id: 'c2', title: 'Council 검토 반영', done: false, dueAt: '2026-10-20' },
    { id: 'c3', title: '발행 예약', done: false, dueAt: '2026-10-23' },
  ],
};
const plain = { id: 't1', title: '가격 페이지', done: false, status: 'todo', dueAt: '2026-10-21', checklist: [] };
const finished = { id: 't2', title: '랜딩 카피', done: true, status: 'done', dueAt: '2026-10-01', checklist: [] };

test('open steps expand open checklist items and skip finished work', () => {
  const steps = projectOpenSteps([group, plain, finished]);
  assert.deepEqual(steps.map(step => step.title), ['Council 검토 반영', '발행 예약', '가격 페이지']);
  assert.equal(steps[0].group, '검토·발행');
  assert.equal(steps[0].checkId, 'c2');
  assert.equal(steps[2].checkId, null);
});

test('a recorded next action wins when it names an open step', () => {
  const step = selectProjectNextStep({ tasks: [plain, group], nextAction: ' 발행 예약 ' });
  assert.equal(step.source, 'linked');
  assert.equal(step.checkId, 'c3');
});

test('a recorded next action without a matching step is text only and cannot be completed', () => {
  const step = selectProjectNextStep({ tasks: [group], nextAction: '파트너에게 전화' });
  assert.equal(step.source, 'record');
  assert.equal(step.taskId, null);
});

test('without a recorded action the first urgent item leads, else the earliest due step', () => {
  const urgent = selectProjectNextStep({ tasks: [plain, group], urgentItems: [{ taskId: 't1', checkId: null }] });
  assert.equal(urgent.source, 'urgent');
  assert.equal(urgent.taskId, 't1');
  const nearest = selectProjectNextStep({ tasks: [plain, group] });
  assert.equal(nearest.source, 'nearest');
  assert.equal(nearest.title, 'Council 검토 반영');
});

test('no open work means no next step', () => {
  assert.equal(selectProjectNextStep({ tasks: [finished] }), null);
  assert.equal(selectProjectNextStep(), null);
});

test('group span runs from the earliest to the latest dated item', () => {
  assert.deepEqual(projectGroupSpan(group), { start: '2026-10-17', end: '2026-10-23', single: false });
  assert.deepEqual(projectGroupSpan(plain), { start: '2026-10-21', end: '2026-10-21', single: true });
  assert.equal(projectGroupSpan({ checklist: [] }), null);
});
