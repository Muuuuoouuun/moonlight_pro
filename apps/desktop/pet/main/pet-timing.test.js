'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./pet-timing');

function timers() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { seq += 1; pending.set(seq, { fn, at: now + ms }); return seq; },
    clearTimeout: (id) => pending.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...pending.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        pending.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    },
  };
}

function queueWith(clock, blocked = { value: false }) {
  const log = [];
  let visible = false;
  const q = T.createBubbleQueue({
    canShow: () => !blocked.value,
    show: (n) => { visible = true; log.push(['show', n ? n.id : null]); },
    hide: () => { visible = false; log.push(['hide']); },
    isVisible: () => visible,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  return { q, log };
}

test('8초 보이고 1초 쉬고 다음', () => {
  const clock = timers();
  const { q, log } = queueWith(clock);
  q.push({ id: 'a' });
  q.push({ id: 'b' });
  q.push({ id: 'b' }); // 같은 id는 한 번만
  assert.deepEqual(log, [['show', 'a']]);
  clock.advance(7999);
  assert.equal(log.length, 1);
  clock.advance(1);
  assert.deepEqual(log.at(-1), ['hide']);
  clock.advance(999);
  assert.equal(log.length, 2);
  clock.advance(1);
  assert.deepEqual(log.at(-1), ['show', 'b']);
  clock.advance(9000);
  assert.deepEqual(log.at(-1), ['hide']);
  assert.equal(q.queued, 0);
});

test('패널·집중이 열려 있으면 기다렸다가 pump로 이어서', () => {
  const clock = timers();
  const blocked = { value: true };
  const { q, log } = queueWith(clock, blocked);
  q.push({ id: 'a' });
  clock.advance(20000);
  assert.deepEqual(log, []);
  blocked.value = false;
  assert.equal(q.pump(), true);
  assert.deepEqual(log, [['show', 'a']]);
});

test('패널이 열리면 즉시 내리고, 트레이 토글은 마지막 메시지를 다시', () => {
  const clock = timers();
  const { q, log } = queueWith(clock);
  q.push({ id: 'a' });
  q.dismiss();
  assert.deepEqual(log, [['show', 'a'], ['hide']]);
  assert.equal(q.toggle(), true);
  assert.deepEqual(log.at(-1), ['show', 'a']);
  assert.equal(q.toggle(), false);
  assert.deepEqual(log.at(-1), ['hide']);
  const empty = queueWith(timers());
  empty.q.toggle();
  assert.deepEqual(empty.log, [['show', null]]); // 메시지가 없어도 기본 말풍선
  assert.equal(q.push(null), false);
});

test('집중 시간 1~120분, 남은 초는 올림', () => {
  assert.equal(T.clampFocusMinutes(25), 25);
  assert.equal(T.clampFocusMinutes(0), 1);
  assert.equal(T.clampFocusMinutes(500), 120);
  assert.equal(T.clampFocusMinutes('15'), 15);
  assert.equal(T.clampFocusMinutes('x'), null);
  assert.equal(T.remainingSeconds(10000, 0), 10);
  assert.equal(T.remainingSeconds(10000, 9001), 1);
  assert.equal(T.remainingSeconds(10000, 12000), 0);
});
