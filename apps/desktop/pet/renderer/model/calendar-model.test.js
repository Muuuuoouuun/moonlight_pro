'use strict';
// Mac HubDomainTests 의 일정 규칙(월요일 시작 주, 종일 현지 날짜, 종료일 제외) 이식.
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('./calendar-model');

const day = (y, m, d) => new Date(y, m - 1, d);
const ev = (o) => K.normalizeEvent({ key: o.key || 'k', id: 'e', title: o.title || '회의', allDay: !!o.allDay, start: o.start, end: o.end, location: o.location });

test('주는 월요일부터 7일', () => {
  const week = K.weekOf(day(2026, 9, 27)); // 일요일
  assert.equal(week.length, 7);
  assert.equal(K.toISODate(week[0]), '2026-09-21');
  assert.equal(K.weekdayShort(week[0]), '월');
  assert.equal(K.toISODate(week[6]), '2026-09-27');
  assert.equal(K.toISODate(K.weekOf(day(2026, 9, 21))[0]), '2026-09-21', '월요일 자신이 주의 시작');
  assert.equal(K.toISODate(K.shiftWeek(day(2026, 9, 27), -1)), '2026-09-20');
  assert.equal(K.dateLabel(day(2026, 9, 26)), '9월 26일 토요일');
});

test('종일 일정은 현지 날짜이고 종료일은 제외', () => {
  const trip = ev({ allDay: true, start: '2026-09-22', end: '2026-09-24' });
  assert.equal(K.occursOn(trip, day(2026, 9, 21)), false);
  assert.equal(K.occursOn(trip, day(2026, 9, 22)), true);
  assert.equal(K.occursOn(trip, day(2026, 9, 23)), true);
  assert.equal(K.occursOn(trip, day(2026, 9, 24)), false);
  const single = ev({ allDay: true, start: '2026-09-22T00:00:00Z' });
  assert.equal(K.occursOn(single, day(2026, 9, 22)), true, '앞 10자만 날짜로 읽는다');
  assert.equal(K.occursOn(single, day(2026, 9, 23)), false);
  assert.equal(K.timeLabel(single), '종일');
});

test('시간 지정 일정은 시작 순간·구간으로 판정하고 HH:mm 로 표기', () => {
  const start = new Date(2026, 8, 22, 9, 5);
  const point = ev({ start: start.toISOString() });
  assert.equal(K.occursOn(point, day(2026, 9, 22)), true);
  assert.equal(K.occursOn(point, day(2026, 9, 23)), false);
  assert.equal(K.timeLabel(point), '09:05');
  const overnight = ev({ start: new Date(2026, 8, 22, 23).toISOString(), end: new Date(2026, 8, 23, 1).toISOString() });
  assert.equal(K.occursOn(overnight, day(2026, 9, 23)), true);
  const endsAtMidnight = ev({ start: new Date(2026, 8, 22, 22).toISOString(), end: new Date(2026, 8, 23, 0).toISOString() });
  assert.equal(K.occursOn(endsAtMidnight, day(2026, 9, 23)), false, '자정에 끝나면 다음 날에 걸리지 않는다');
});

test('하루 목록은 종일 먼저, 그다음 시작 순', () => {
  const list = [
    ev({ key: 'b', start: new Date(2026, 8, 22, 14).toISOString() }),
    ev({ key: 'a', start: new Date(2026, 8, 22, 9).toISOString() }),
    ev({ key: 'c', allDay: true, start: '2026-09-22' }),
  ];
  assert.deepEqual(K.eventsOn(list, day(2026, 9, 22)).map((e) => e.key), ['c', 'a', 'b']);
});

test('읽을 수 없는 행은 버리고 개수를 알린다(부분 조회)', () => {
  const { events, dropped } = K.normalizeEvents([
    { key: 'ok', title: '정상', allDay: false, start: '2026-09-22T09:00:00+09:00' },
    { key: 'bad', title: '날짜 없음', allDay: false, start: 'tomorrow' },
    { key: 'bad2', title: '종일 형식 오류', allDay: true, start: '22/09/2026' },
    null,
  ]);
  assert.equal(events.length, 1);
  assert.equal(dropped, 3);
  assert.equal(K.parseDate('2026-02-30', true), null, '없는 날짜는 거절');
});
