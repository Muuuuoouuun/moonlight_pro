import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildTodayDeck, dayEvents, freeGaps, todayMode } from './today-deck-model.js';

// 오늘 13a "하루 시계 위에 세 자리"(2026-10-21). 시간대·하루 띠·제목 규칙만 합성 값으로 고정한다.
// 시각은 기기 시계(로컬)로 만든다 — 실행 환경의 시간대와 무관하게 같은 판정이 나와야 한다.
const local = (h, m = 0) => new Date(2026, 9, 21, h, m);
const iso = (h, m = 0) => local(h, m).toISOString();
const agendaOf = (items, state = 'live') => ({ state, items });
const live = (focus, items = []) => ({ state: 'live', items, focus });

test('시간대는 기기 시계로 아침(~11시) · 낮(~18시) · 저녁으로 나뉜다', () => {
  assert.equal(todayMode(local(10, 59)), 'morning');
  assert.equal(todayMode(local(11)), 'day');
  assert.equal(todayMode(local(17, 59)), 'day');
  assert.equal(todayMode(local(18)), 'evening');
});

test('하루 띠는 끝 시각을 지어내지 않는다 — 끝을 모르면 진행 중으로 판정하지 않는다', () => {
  const now = local(14, 20);
  const events = dayEvents(agendaOf([
    { id: 'all', allDay: true, whenAt: '2026-10-21' },
    { id: 'known', title: '통화', whenAt: iso(14), endAt: iso(15) },
    { id: 'open', title: '미팅', whenAt: iso(14, 10), endAt: null },
    { id: 'carry', title: '이동', whenAt: new Date(2026, 9, 20, 23).toISOString(), endAt: iso(7, 30) },
  ]), now);
  assert.deepEqual(events.map(e => e.id), ['carry', 'known', 'open'], '종일은 빼고, 어제 시작은 0시로 당긴다');
  assert.equal(events.find(e => e.id === 'open').endKnown, false);
  const deck = buildTodayDeck({ taskToday: live({ picked: 0, done: 0 }), agenda: agendaOf([{ id: 'open', title: '미팅', whenAt: iso(14, 10), endAt: null }]), now });
  assert.equal(deck.current, null);
  assert.doesNotMatch(deck.headline, /^지금은/);
});

test('읽지 못한 캘린더는 일정 0건이나 빈 시간으로 바뀌지 않는다', () => {
  for (const state of ['error', 'preview', 'loading']) {
    const deck = buildTodayDeck({ taskToday: live({ picked: 1, done: 0 }), agenda: agendaOf([{ id: 'x', whenAt: iso(15), endAt: iso(16) }], state), now: local(13) });
    assert.equal(deck.agendaReadable, false);
    assert.deepEqual(deck.events, []);
    assert.doesNotMatch(deck.headline, /빈 시간|다음 일정은 없/);
  }
});

test('빈 시간은 09–18시 안에서 일정 사이 30분 이상만 센다', () => {
  const events = [{ s: 9 * 60 + 30, e: 10 * 60 }, { s: 10 * 60 + 10, e: 11 * 60 }, { s: 14 * 60, e: 17 * 60 + 45 }];
  assert.deepEqual(freeGaps(events), [{ s: 9 * 60, e: 9 * 60 + 30 }, { s: 11 * 60, e: 14 * 60 }]);
  assert.deepEqual(freeGaps([]), [{ s: 9 * 60, e: 18 * 60 }]);
});

test('제목은 시간대마다 하는 일을 말하고, 모르는 수는 숫자로 말하지 않는다', () => {
  const morning = local(8, 40), day = local(15, 10), evening = local(18, 50);
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 2, done: 0 }), now: morning }).headline, '세 자리 중 2개 골랐어요');
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 3, done: 0 }), now: morning }).headline, '오늘은 이 세 가지');
  assert.equal(buildTodayDeck({ taskToday: { state: 'error', items: [] }, now: morning }).headline, '오늘 세 자리를 골라요');
  const agenda = agendaOf([{ id: 'call', title: '견적 검토', whenAt: iso(15), endAt: iso(16) }, { id: 'later', title: '원고 정리', whenAt: iso(16, 30), endAt: iso(17, 30) }]);
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 2, done: 1 }), agenda, now: day }).headline, '지금은 견적 검토');
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 2, done: 1 }), agenda, now: local(16) }).headline, '빈 시간 · 다음은 16:30');
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 2, done: 1 }), now: evening }).headline, '오늘 3개 중 1개 끝냈어요');
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 0, done: 0 }), agenda, now: local(17, 45) }).headline, '세 자리가 비어 있어요');
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 1, done: 0 }, [{ id: 'selected', focusToday: true }]), now: day }).headline, '오늘 끝낼 일 1개', 'selected unfinished work is not the number of empty slots');
  assert.equal(buildTodayDeck({ taskToday: live({ picked: 2, done: 2 }), agenda, now: local(17, 45) }).headline, '오늘 3개를 다 끝냈어요');
  assert.equal(buildTodayDeck({ taskToday: { state: 'partial', items: [], focus: { picked: 2, done: 0 } }, now: evening }).headline, '하루를 닫을 시간', 'partial의 0은 확인한 0이 아니다');
});

test('오늘 화면은 세 자리를 할 일 목록보다 먼저 그리고, 같은 할 일을 목록에 두 번 그리지 않는다', () => {
  const source = readFileSync(new URL('./daily-brief.jsx', import.meta.url), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const at = marker => { const i = source.indexOf(marker); assert.ok(i > 0, marker); return i; };
  assert.ok(at('<TodayTaskCapture') < at('<TodaySlots') && at('<TodaySlots') < at('<TaskToday'));
  assert.match(source, /const listItems = \[\.\.\.items\.filter\(\(task\) => !task\.focusToday\), \.\.\.later\]/);
  assert.doesNotMatch(source, /15분 집중/, '15분 집중은 세 자리가 맡는다');
});

test('색은 토큰만 쓰고 빨강은 기한 지난 자리의 1px 레일과 글자에만 둔다', () => {
  const css = readFileSync(new URL('./today-deck.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  assert.deepEqual([...css.matchAll(/^[^\n]*var\(--danger\)[^\n]*$/gm)].map(m => m[0].trim().split(' {')[0]), [
    '.hub-app .today-slot[data-urgent]',
    '.hub-app .today-slot__meta[data-urgent]',
  ]);
});
