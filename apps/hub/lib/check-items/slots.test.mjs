import test from 'node:test';
import assert from 'node:assert/strict';

import { formatSlot, kstMs, nextWorkdayKey, suggestSlots } from './slots.js';

// 2026-10-01(목) 10:20 KST
const NOW = kstMs('2026-10-01', 10 * 60 + 20);
const at = (day, hh, mm = 0) => new Date(kstMs(day, hh * 60 + mm)).toISOString();
const event = (day, from, to, extra = {}) => ({ start: at(day, ...from), end: at(day, ...to), ...extra });

test('권장 시간은 지금+5분 이후 일정 사이 첫 빈 시간, 선택지는 오늘 둘 + 다음 근무일 하나', () => {
  const events = [
    event('2026-10-01', [9, 30], [10, 30]),
    event('2026-10-01', [11], [12]),
    event('2026-10-01', [12], [13]),
    event('2026-10-01', [15], [16, 30]),
    event('2026-10-01', [17, 30], [18]),
  ];
  const result = suggestSlots({ events, now: NOW, minutes: 20 });
  assert.equal(result.noRoomToday, false);
  assert.deepEqual(result.options.map((slot) => formatSlot(slot, NOW)), ['10:30–10:50', '13:00–13:20', '내일 09:00–09:20']);
  assert.equal(result.recommended, result.options[0]);
  assert.equal(result.options[0].isToday, true);
  assert.equal(result.options[2].isToday, false);
});

test('종일 일정은 피하지 않고, 이미 잡아 둔 일은 피한다', () => {
  const events = [{ start: '2026-10-01T00:00:00', end: '2026-10-02T00:00:00', allDay: true }];
  const blocks = [{ start: at('2026-10-01', 10, 30), end: at('2026-10-01', 11) }];
  const result = suggestSlots({ events, blocks, now: NOW, minutes: 30 });
  assert.equal(formatSlot(result.recommended, NOW), '11:00–11:30');
});

test('오늘 빈 시간이 없으면 다음 근무일만 권하고 noRoomToday를 알린다 — 금요일 저녁은 월요일로', () => {
  const fridayEvening = kstMs('2026-10-02', 18 * 60 + 50);
  const result = suggestSlots({ now: fridayEvening, minutes: 30 });
  assert.equal(result.noRoomToday, true);
  assert.equal(result.options.length, 1);
  assert.equal(result.recommended.dayKey, '2026-10-05');
  assert.equal(formatSlot(result.recommended, fridayEvening), '10월 5일 월 09:00–09:30');
});

test('근무 시간 전이면 9시부터, 시작은 5분 단위로 올린다', () => {
  const early = kstMs('2026-10-01', 7 * 60);
  assert.equal(formatSlot(suggestSlots({ now: early, minutes: 15 }).recommended, early), '09:00–09:15');
  const odd = kstMs('2026-10-01', 14 * 60 + 2);
  assert.equal(formatSlot(suggestSlots({ now: odd, minutes: 15 }).recommended, odd), '14:10–14:25');
});

test('겹친 일정은 합쳐서 본다 · 끝 시간 없는 일정은 무시', () => {
  const events = [
    event('2026-10-01', [10, 30], [11, 30]),
    event('2026-10-01', [11], [12]),
    { start: at('2026-10-01', 12) },
  ];
  const result = suggestSlots({ events, now: NOW, minutes: 60 });
  assert.equal(formatSlot(result.recommended, NOW), '12:00–13:00');
});

test('다음 근무일은 주말을 건너뛴다', () => {
  assert.equal(nextWorkdayKey('2026-10-01'), '2026-10-02');
  assert.equal(nextWorkdayKey('2026-10-02'), '2026-10-05');
  assert.equal(nextWorkdayKey('2026-10-03'), '2026-10-05');
});
