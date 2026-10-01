import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { toCheckItem } from '../../../lib/check-items/catalog.js';
import { kstMs } from '../../../lib/check-items/slots.js';
import { cancelScheduled, moveScheduled, receiptLine, scheduleItem } from './check-item-actions.js';

// 확인할 것 시간 잡기(2026-09-30 스펙 §4.7) — 권장 시간은 캘린더를 읽었을 때만, 구글 쓰기 실패는 조용히
// 넘기지 않음, 취소·다른 시간은 Moonlight 행이 정본이고 구글 쪽 실패는 말로 알린다.
const { FocusCard } = await import(new URL('./focus-card.jsx', import.meta.url).href);
const { ScheduledList } = await import(new URL('./schedule-band.jsx', import.meta.url).href);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BLOCK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const deal = toCheckItem({ id: `revenue-stale-${DEAL}`, title: '거래 A — 16일째 정체', tone: 'danger', source: { from: 'Deals', ref: DEAL }, subject: { type: 'deal', id: DEAL, name: '거래 A' } });
const NOW = kstMs('2026-10-01', 10 * 60 + 20);
const at = (hh, mm = 0) => new Date(kstMs('2026-10-01', hh * 60 + mm)).toISOString();
const calendar = {
  status: 'live',
  writable: true,
  events: [{ start: at(9, 30), end: at(10, 30) }, { start: at(11), end: at(13) }],
};

function atNow(fn) {
  const real = Date.now;
  Date.now = () => NOW;
  try { return fn(); } finally { Date.now = real; }
}
const render = (props) => atNow(() => renderToStaticMarkup(React.createElement(FocusCard, { item: deal, panel: null, ...props })));
const count = (html, pattern) => (html.match(pattern) || []).length;

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift() || { status: 200, body: { status: 'saved' } };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}

test('읽은 캘린더면 끝내기 아래 띠가 권장 시간을 보이고, 끝내기 1번이 여전히 유일한 primary다', () => {
  const html = render({ calendar });
  assert.match(html, /지금 못 하면 시간 잡기/);
  assert.match(html, /권장 시간/);
  assert.match(html, /data-certainty="recommended"/);
  assert.match(html, /10:30–10:50/);
  assert.match(html, /· 20분/);
  assert.match(html, />잡기</);
  assert.match(html, /다른 시간/);
  assert.equal(count(html, /ci-outcome--primary/g), 1);
  assert.equal(count(html, /fx-pill-btn--primary/g), 0);
});

test('캘린더를 못 읽으면 빈 시간을 지어내지 않는다 — 직접 고르기만, 이유를 말한다', () => {
  const collapsed = render({ calendar: { status: 'error', events: [], writable: false } });
  assert.doesNotMatch(collapsed, /권장 시간/);
  assert.match(collapsed, /시간 고르기/);

  const open = render({ calendar: { status: 'preview', events: [], writable: false }, panel: 'schedule' });
  assert.match(open, /캘린더 연결 필요 — 빈 시간을 모르니 직접 골라 주세요/);
  assert.match(open, /직접 고르기/);
  assert.match(open, /Moonlight에만 잡힙니다/);
  assert.doesNotMatch(open, /구글 캘린더에도 넣기/);
});

test('고르기 칸: 선택지 셋 + 직접 고르기, 소요 시간 칩, 구글 넣기, 확정 버튼이 화면의 유일한 primary', () => {
  const html = render({ calendar, panel: 'schedule' });
  assert.match(html, /10:30–10:50<\/span><small>권장/);
  assert.match(html, /13:00–13:20<\/span><small>그다음 빈 시간/);
  assert.match(html, /내일 09:00–09:20<\/span><small>다음 근무일 첫 빈 시간/);
  assert.match(html, /직접 고르기/);
  for (const label of ['15분', '30분', '45분', '1시간']) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /구글 캘린더에도 넣기/);
  assert.match(html, /10:30–10:50에 잡기/);
  assert.equal(count(html, /ci-outcome--primary/g), 0);
  assert.equal(count(html, /fx-pill-btn--primary/g), 1);
});

test('잡아 둔 시간이 되면 띠로 말하고, 지나면 다시 잡기가 1순위다 — 빨강·깜빡임 없음', () => {
  const now = render({ calendar, item: { ...deal, scheduled: { start: at(10), end: at(10, 30), state: 'now' } } });
  assert.match(now, /잡아 둔 시간입니다 · <span class="mono">10:00–10:30<\/span> · 남은 <span class="mono">10<\/span>분/);
  assert.equal(count(now, /ci-outcome--primary/g), 1);

  const passed = render({ calendar, item: { ...deal, scheduled: { start: at(9), end: at(9, 20), state: 'passed' } } });
  assert.match(passed, /잡아 둔 시간이 지났습니다/);
  assert.match(passed, /다시 잡기 — 지난 시간은 자동으로 옮기지 않습니다/);
  assert.equal(count(passed, /ci-outcome--primary/g), 0);
  assert.equal(count(passed, /fx-pill-btn--primary/g), 1);
  assert.doesNotMatch(passed, /--danger/);
});

test('잡기: 구글에 먼저 넣고 그 일정 id로 영수증을 남긴다', async () => {
  const slot = { start: at(10, 30), end: at(10, 50) };
  const { impl, calls } = fakeFetch([
    { status: 200, body: { status: 'saved', event: { id: 'gcal-1' } } },
    { status: 200, body: { status: 'saved', receipt: { id: BLOCK } } },
  ]);
  const result = await scheduleItem(impl, deal, { slot, addToCalendar: true });
  assert.equal(result.ok, true);
  assert.equal(result.eventId, 'gcal-1');
  assert.equal(result.receipt.id, BLOCK);
  assert.equal(calls[0].url, '/api/calendar/google/event');
  assert.equal(calls[0].body.title, '확인할 것 · 거래 A 연락 기록');
  assert.equal(calls[1].body.outcome, 'scheduled');
  assert.equal(calls[1].body.scheduledStart, slot.start);
  assert.equal(calls[1].body.calendarEventId, 'gcal-1');
});

test('잡기: 구글 쓰기가 실패하면 잡지 않고 선택지를 남긴다, 영수증이 실패하면 만든 일정을 지운다', async () => {
  const slot = { start: at(10, 30), end: at(10, 50) };
  const calendarDown = fakeFetch([{ status: 500, body: { status: 'error' } }]);
  const failed = await scheduleItem(calendarDown.impl, deal, { slot, addToCalendar: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.calendarFailed, true);
  assert.equal(calendarDown.calls.length, 1, '영수증을 남기지 않는다');

  const receiptDown = fakeFetch([
    { status: 200, body: { status: 'saved', event: { id: 'gcal-2' } } },
    { status: 502, body: { status: 'failed' } },
    { status: 200, body: { status: 'saved' } },
  ]);
  const rolledBack = await scheduleItem(receiptDown.impl, deal, { slot, addToCalendar: true });
  assert.equal(rolledBack.ok, false);
  assert.equal(receiptDown.calls[2].method, 'DELETE');
  assert.deepEqual(receiptDown.calls[2].body, { eventId: 'gcal-2' });
  assert.match(rolledBack.message, /구글 일정도 지웠습니다/);

  const moonlightOnly = fakeFetch([{ status: 202, body: { status: 'preview' } }]);
  const preview = await scheduleItem(moonlightOnly.impl, deal, { slot, addToCalendar: false });
  assert.equal(preview.ok, false, 'preview는 잡은 것이 아니다');
  assert.equal(moonlightOnly.calls.length, 1);
});

test('취소·다른 시간은 Moonlight 행이 정본 — 구글 쪽 실패는 말로 알린다', async () => {
  const block = { id: BLOCK, title: '프로젝트 C', subject: { type: 'project', id: PROJECT }, calendarEventId: 'gcal-3' };
  const cancelled = fakeFetch([{ status: 200, body: { status: 'saved' } }, { status: 502, body: { status: 'error' } }]);
  const cancel = await cancelScheduled(cancelled.impl, block);
  assert.equal(cancel.ok, true);
  assert.deepEqual(cancelled.calls[0].body, { id: BLOCK, action: 'undo' });
  assert.equal(cancelled.calls[1].method, 'DELETE');
  assert.equal(cancel.message, 'Moonlight에서는 취소했고 구글 일정은 남아 있습니다.');

  const slot = { start: at(15), end: at(15, 15) };
  const moved = fakeFetch([{ status: 200, body: { status: 'saved' } }, { status: 200, body: { status: 'updated' } }]);
  const move = await moveScheduled(moved.impl, block, { slot });
  assert.equal(move.ok, true);
  assert.equal(move.message, '');
  assert.deepEqual(moved.calls[0].body, { id: BLOCK, action: 'move', scheduledStart: slot.start, scheduledEnd: slot.end });
  assert.equal(moved.calls[1].body.eventId, 'gcal-3');
  assert.equal(moved.calls[1].body.title, '확인할 것 · 프로젝트 C 막힌 점 확인');

  const notMoved = fakeFetch([{ status: 409, body: { status: 'conflict' } }]);
  assert.equal((await moveScheduled(notMoved.impl, block, { slot })).ok, false);
  assert.equal(notMoved.calls.length, 1, '행을 못 옮기면 구글도 건드리지 않는다');
});

test('레일의 잡아 둔 일: 시각·상태를 글로, 끝낸 것은 체크와 취소선, 바꾸기·취소는 남은 것만', () => {
  const html = atNow(() => renderToStaticMarkup(React.createElement(ScheduledList, {
    calendar,
    blocks: [
      { id: 'b1', title: '거래 A', subject: { type: 'deal', id: DEAL }, start: at(10), end: at(10, 20), state: 'now', done: true },
      { id: 'b2', title: '프로젝트 C', subject: { type: 'project', id: PROJECT }, start: at(15), end: at(15, 15), state: 'waiting', done: false, calendarEventId: 'gcal-3' },
    ],
  })));
  assert.match(html, /잡아 둔 일 · 1/);
  assert.match(html, /data-state="done"/);
  assert.match(html, /10:00–10:20<\/span> · 끝냄/);
  assert.match(html, /15:00–15:15<\/span> · 기다림 · 구글 캘린더/);
  assert.equal(count(html, />취소</g), 1);
  assert.equal(receiptLine({ outcome: 'scheduled' }), '시간을 잡았습니다');
});

test('홈: T가 시간 잡기를 열고, 시간표는 다음 근무일까지 한 번에 읽는다', () => {
  const home = read('../pages/home.jsx');
  assert.match(home, /e\.key === 't' \|\| e\.key === 'T'/);
  assert.match(home, /<Kbd>T<\/Kbd> 시간 잡기/);
  assert.match(home, /nextWorkdayKey\(day\)/);
  assert.match(home, /<ScheduledList /);
  assert.match(home, /scheduled=\{waitingCount\}/);
});
