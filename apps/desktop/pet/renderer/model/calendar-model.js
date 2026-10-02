// 일정 화면의 순수 규칙 — 월요일 시작 주, 날짜 라벨, 종일 일정(현지 날짜·종료일 제외) 판정.
// Mac HubCalendarEvent.occurs(on:)·CompanionDate 를 그대로 옮겼다.
'use strict';
(function (root, factory) {
  const C = typeof require === 'function' ? require('../../shared/contract.js') : root.PetContract;
  const api = factory(C);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).calendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const isSameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const pad = (n) => String(n).padStart(2, '0');

  // 월요일부터 7일.
  function weekOf(date) {
    const day = startOfDay(date);
    const offset = (day.getDay() + 6) % 7;
    const monday = addDays(day, -offset);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  const shiftWeek = (date, weeks) => addDays(startOfDay(date), weeks * 7);
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateLabel = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_NAMES[d.getDay()]}`;
  const weekdayShort = (d) => WEEKDAYS[d.getDay()];

  // 종일: 앞 10자(YYYY-MM-DD)를 현지 자정으로. 시간 지정: ISO 8601(소수 초 허용).
  function parseDate(text, allDay) {
    if (typeof text !== 'string' || !text) return null;
    if (allDay) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
      if (!m) return null;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.getMonth() === Number(m[2]) - 1 ? d : null;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  // 허브 행 → 화면 행. 읽을 수 없는 행은 null(부분 조회로 드러낸다).
  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') return null;
    const allDay = raw.allDay === true;
    const start = parseDate(raw.start, allDay);
    if (!start) return null;
    let end = null;
    if (raw.end) {
      end = parseDate(raw.end, allDay);
      if (!end) return null;
    }
    return {
      key: String(raw.key || raw.id || `${raw.title}-${raw.start}`),
      id: raw.id == null ? null : String(raw.id),
      title: raw.title,
      location: typeof raw.location === 'string' ? raw.location : '',
      source: typeof raw.source === 'string' ? raw.source : '',
      allDay, start, end,
    };
  }

  function normalizeEvents(list) {
    const events = [];
    let dropped = 0;
    for (const raw of Array.isArray(list) ? list : []) {
      const ev = normalizeEvent(raw);
      if (ev) events.push(ev); else dropped += 1;
    }
    return { events, dropped };
  }

  // 종료일은 제외한다(종일 2일~4일 = 2·3일). 끝이 없으면 종일은 하루, 시간 지정은 시작 순간.
  function occursOn(ev, date) {
    const day = startOfDay(date);
    const next = addDays(day, 1);
    const finish = ev.end || (ev.allDay ? addDays(ev.start, 1) : ev.start);
    return ev.start < next && (finish > day || (finish.getTime() === ev.start.getTime() && ev.start >= day));
  }

  function eventsOn(events, date) {
    return (events || []).filter((ev) => occursOn(ev, date)).sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start - b.start;
    });
  }

  const timeLabel = (ev) => (ev.allDay ? '종일' : `${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}`);

  return { weekOf, shiftWeek, startOfDay, addDays, isSameDay, toISODate, dateLabel, weekdayShort, parseDate, normalizeEvent, normalizeEvents, occursOn, eventsOn, timeLabel };
});
