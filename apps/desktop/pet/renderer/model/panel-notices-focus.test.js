'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./panel-model');
const N = require('./notices-model');
const F = require('./focus-model');
const C = require('../../shared/contract');

const key = (o) => ({ ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, key: '', code: '', ...o });

test('Ctrl+1~7 은 계약 순서대로 모드를 고른다', () => {
  C.MODE_HOTKEY_ORDER.forEach((mode, i) => {
    assert.deepEqual(P.keyAction(key({ ctrlKey: true, code: `Digit${i + 1}`, key: String(i + 1) })), { type: 'mode', mode });
  });
  assert.equal(P.keyAction(key({ ctrlKey: true, code: 'Digit8', key: '8' })), null);
  assert.equal(P.keyAction(key({ ctrlKey: true, altKey: true, code: 'Digit1', key: '1' })), null, 'Ctrl+Alt 는 전역 단축키 몫');
  assert.deepEqual(P.keyAction(key({ ctrlKey: true, key: 's', code: 'KeyS' })), { type: 'save' });
  assert.deepEqual(P.keyAction(key({ ctrlKey: true, key: 'Enter', code: 'Enter' })), { type: 'primary' });
  assert.deepEqual(P.keyAction(key({ key: 'Escape', code: 'Escape' })), { type: 'collapse' });
  assert.equal(P.keyAction(key({ key: 'Enter', code: 'Enter' })), null, '그냥 Enter 는 각 입력이 처리');
  assert.equal(P.hotkeyLabel('notifications'), 'Ctrl+7');
});

test('제목·탭 묶음', () => {
  assert.equal(P.titleFor('tasks'), '오늘');
  assert.equal(P.titleFor('calendar'), '오늘');
  assert.equal(P.titleFor('memo'), '빠른 메모');
  assert.equal(P.titleFor('council'), 'Council');
  assert.equal(P.titleFor('hub-status'), 'Hub 연결');
  assert.equal(P.isLargeTitle('memo'), true);
  assert.equal(P.isLargeTitle('office'), false);
  assert.deepEqual(P.tabsFor('calendar'), { place: 'below', modes: ['tasks', 'calendar'] });
  assert.deepEqual(P.tabsFor('memo'), { place: 'header', modes: ['tasks', 'memo'] });
  assert.equal(P.tabsFor('focus'), null);
  assert.equal(P.hubStatusView('unauthorized').label, '로그인 필요');
  assert.equal(P.hubStatusView('이상한값').label, '확인 중');
});

test('배지는 99 를 넘으면 99+, 0 이하는 숨김', () => {
  assert.equal(N.badgeText(0), '');
  assert.equal(N.badgeText(-3), '');
  assert.equal(N.badgeText(7), '7');
  assert.equal(N.badgeText(99), '99');
  assert.equal(N.badgeText(100), '99+');
});

test('알림 목록·시각·이동 목적지', () => {
  const now = new Date('2026-09-27T10:00:00Z');
  assert.equal(N.relativeTime('2026-09-27T09:59:40Z', now), '방금');
  assert.equal(N.relativeTime('2026-09-27T09:45:00Z', now), '15분 전');
  assert.equal(N.relativeTime('2026-09-27T07:00:00Z', now), '3시간 전');
  assert.equal(N.relativeTime('2026-09-27T10:08:00Z', now), '8분 뒤');
  assert.equal(N.relativeTime('not a date', now), '');
  const list = [
    { id: 'a', kind: 'inquiry', at: '2026-09-27T08:00:00Z' },
    { id: 'b', kind: 'event', at: '2026-09-27T09:00:00Z', hidden: true },
    { id: 'c', kind: 'reply', at: '2026-09-27T09:30:00Z' },
  ];
  assert.deepEqual(N.visibleNotices(list).map((x) => x.id), ['c', 'a']);
  assert.equal(list[0].id, 'a', '원본은 그대로');
  assert.deepEqual(N.resolveTarget({ target: '/dashboard/revenue/inquiries?inquiry=1' }), { kind: 'hub', path: '/dashboard/revenue/inquiries?inquiry=1' });
  assert.equal(N.resolveTarget({ target: '//evil.example' }).path, C.HUB_PATHS.notifications, '프로토콜 상대 주소는 허브 경로가 아니다');
  assert.equal(N.resolveTarget({ target: { mode: 'calendar', date: '2026-09-27' } }).mode, 'calendar');
  assert.equal(N.resolveTarget({ target: { url: 'https://example.com' } }).kind, 'external');
  assert.equal(N.resolveTarget({ kind: 'reply' }).mode, 'council');
  assert.equal(N.kindInfo('event').glyph, 'calendar');
  assert.equal(N.headerLabel({ unreadCount: 2, total: 5 }), '새 알림 2개 · 전체 5개');
  assert.equal(N.headerLabel({ failed: true, total: 0 }), '알림 확인 필요');
  assert.match(N.bubbleSummary({ hubStatus: 'connected', badge: 150 }), /99\+/);
  assert.match(N.bubbleSummary({ hubStatus: 'unauthorized', badge: 3 }), /로그인/);
});

test('집중 시간은 1~120분, 남은 시간 mm:ss, 진행률 0~1', () => {
  assert.equal(F.clampMinutes(0), 1);
  assert.equal(F.clampMinutes(121), 120);
  assert.equal(F.clampMinutes('abc'), 25);
  assert.equal(F.formatRemaining(25 * 60), '25:00');
  assert.equal(F.formatRemaining(65), '01:05');
  assert.equal(F.formatRemaining(-4), '00:00');
  assert.equal(F.progress(25 * 60, 25), 0);
  assert.equal(F.progress(0, 25), 1);
  assert.equal(F.progress(750, 25), 0.5);
  assert.equal(F.HOLD_MS, 1300);
  assert.deepEqual([...F.PRESETS], [15, 25, 50]);
});
