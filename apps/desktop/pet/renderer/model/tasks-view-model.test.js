'use strict';
// Mac Tests/TaskCompletionFeedbackTests.swift 이식 + 정렬·검증.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./tasks-view-model');

// 가짜 시계: setTimer 가 등록한 콜백을 advance(ms)로 직접 흘린다.
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimer(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
      }
    },
  };
}
const task = (id, done) => ({ id, title: `항목 ${id}`, status: done ? 'done' : 'todo', updatedAt: null });
const ids = (list) => list.map((t) => t.id);

test('남은 할 일이 먼저, 무리 안의 순서는 허브 순서 그대로', () => {
  const list = [task('a', true), task('b'), task('c', true), task('d')];
  assert.deepEqual(ids(T.orderTasks(list)), ['b', 'd', 'a', 'c']);
  assert.deepEqual(T.orderTasks(null), []);
});

test('제목은 앞뒤 공백을 빼고 1~300자', () => {
  assert.equal(T.validateTitle('   ').ok, false);
  assert.equal(T.validateTitle(' 견적서 ').value, '견적서');
  assert.equal(T.validateTitle('가'.repeat(300)).ok, true);
  const long = T.validateTitle('가'.repeat(301));
  assert.equal(long.ok, false);
  assert.match(long.error, /1~300자/);
});

test('완료한 행은 3초 동안 원래 자리에 남고 그 뒤 숨는다', () => {
  const clock = fakeClock();
  let changes = 0;
  const g = T.createGrace({ delayMs: 3000, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onChange: () => { changes += 1; } });
  const first = task('1'); const second = task('2'); const done = task('1', true);
  g.retain('1', ['1', '2']);
  // 허브는 완료 행을 뒤로 보낸다 — 표시는 누른 자리를 지킨다.
  assert.deepEqual(ids(g.visible([second, done], false)), ['1', '2']);
  assert.equal(g.isRetained('1'), true);
  clock.advance(2999);
  assert.deepEqual(ids(g.visible([second, done], false)), ['1', '2']);
  clock.advance(1);
  assert.deepEqual(ids(g.visible([second, done], false)), ['2']);
  assert.deepEqual(ids(g.visible([second, done], true)), ['2', '1'], '완료 포함 보기에서는 기록이 남는다');
  assert.ok(changes >= 2);
  // 다시 눌러 취소하면 원래 행이 돌아온다.
  g.retain('1', ['1', '2']);
  g.cancel('1');
  assert.deepEqual(ids(g.visible([first, second], false)), ['1', '2']);
});

test('취소된 옛 타이머가 새 완료를 숨기지 않는다', () => {
  const clock = fakeClock();
  const g = T.createGrace({ delayMs: 80, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const second = task('2'); const done = task('1', true);
  g.retain('1', ['1', '2']);
  clock.advance(50);
  g.retain('1', ['1', '2']);
  clock.advance(45);
  assert.equal(g.visible([second, done], false).length, 2);
  g.reset();
  assert.deepEqual(ids(g.visible([second, done], false)), ['2'], '출처가 바뀌면 유예도 비운다');
  g.retain('1', ['1', '2']);
  assert.deepEqual(ids(g.visible([second], false)), ['2'], '지워진 행을 되살리지 않는다');
});

test('형제 행이 먼저 풀려도 남은 행의 이웃 관계를 지킨다', () => {
  const clock = fakeClock();
  const g = T.createGrace({ delayMs: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const third = task('3'); const done1 = task('1', true); const done2 = task('2', true); const inserted = task('0');
  const order = ['1', '2', '3'];
  g.retain('1', order);
  g.retain('2', order);
  g.cancel('1');
  assert.deepEqual(ids(g.visible([third, done1, done2], false)), ['2', '3']);
  assert.deepEqual(ids(g.visible([inserted, third, done2], false)), ['0', '2', '3']);
});

test('목록 윗줄은 실패·로딩 중에 "남은 0개"라고 말하지 않는다', () => {
  assert.equal(T.countLabel({ loading: true, visibleTasks: [] }), '불러오는 중…');
  assert.equal(T.countLabel({ failed: true, visibleTasks: [] }), '할 일 확인 필요');
  assert.equal(T.countLabel({ visibleTasks: [task('a'), task('b', true)] }), '남은 1개');
  assert.equal(T.emptyMessage(2), '남은 할 일을 모두 마쳤어요.');
  assert.equal(T.shortTitle('가'.repeat(40)).length, 31);
});
