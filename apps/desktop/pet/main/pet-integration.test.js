'use strict';
// 세 계층 통합 — 셸(pet-main.install)의 채널표 + 허브 모델(pet-hub, 실제 로컬 http) + 렌더러 뷰 모델(renderer/model/*)을
// 한 프로세스에서 이어, 채널마다 셸이 돌려주는 모양을 렌더러가 그대로 읽는지 고정한다. Electron 은 대역(test-support)이다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createElectronDouble, useElectron } = require('./test-support/electron-double');
const { createHubDouble, inquiryRow } = require('./test-support/hub-double');
const { createPetHub } = require('./pet-hub');
const C = require('../shared/contract');
const E = require('../renderer/model/envelope-view');
const T = require('../renderer/model/tasks-view-model');
const MM = require('../renderer/model/memo-model');
const N = require('../renderer/model/notices-model');
const V = require('../renderer/model/chat-view-model');
const F = require('../renderer/model/focus-model');
const K = require('../renderer/model/calendar-model');

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 3000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error(`wait ${label}`);
    await settle(10);
  }
}

// hub: 기본은 pet-main 이 받는 hubContext 그대로 createPetHub 에 넘기고 전송만 fetch 대역으로 바꾼다.
// wrapHub(hub) 로 허브 객체를 감쌀 수 있다. defaultHub: true 면 pet-main 의 기본 경로(loadDefaultHub)를 쓴다.
async function boot(t, { wrapHub, defaultHub = false, hubUrl: initialUrl, ...extra } = {}) {
  const double = createHubDouble();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-integration-'));
  const E2 = createElectronDouble({ userData, cookies: [{ origin: double.origin, name: 'com_moon_operator_session', value: 'operator-session' }] });
  const restore = useElectron(E2);
  // 모듈 캐시를 비워 이 대역으로 다시 읽게 한다(pet-main·pet-windows 가 require 시점에 electron 을 잡는다).
  for (const key of Object.keys(require.cache)) if (/[\\/]pet[\\/]main[\\/]pet-(main|windows)\.js$/.test(key)) delete require.cache[key];
  const { install } = require('./pet-main');
  const opened = [];
  let hubUrl = initialUrl === undefined ? double.origin : initialUrl;
  const hubOption = defaultHub ? {} : {
    hub: (ctx) => {
      const hub = createPetHub({ ...ctx, fetch: double.fetch });
      return wrapHub ? wrapHub(hub) : hub;
    },
  };
  const pet = install({
    app: E2.electron.app,
    getHubUrl: () => hubUrl,
    openMainUrl: (url) => opened.push(url),
    showSettings: () => opened.push('settings'),
    openExternal: () => {},
    registerShortcut: false,
    activate: false,
    log: () => {},
    ...hubOption,
    ...extra,
  });
  await pet.ready;
  t.after(() => {
    pet.dispose();
    restore();
  });
  const w = pet.windows;
  const call = (channel, payload, win = w.panel) => E2.invoke(channel, win, payload);
  return { double, E2, pet, w, call, opened, setHubUrl: (url) => { hubUrl = url; }, userData };
}

test('채널표: 계약의 invoke 채널마다 정확히 한 번 등록하고, 펫 창 밖의 호출은 거절한다', async (t) => {
  // 기본 경로(loadDefaultHub → pet-hub.createPetHub). 주소가 비어 있어 네트워크에 나가지 않는다.
  const { E2, call, pet } = await boot(t, { defaultHub: true, hubUrl: '' });
  assert.equal(pet.state().hubStatus, 'not-configured', '기본 허브가 만들어져 주소 없음을 알린다');
  assert.equal((await call('pet:tasks-list', {})).kind, 'not-configured');
  assert.deepEqual([...E2.handleCalls].sort(), [...C.PET_INVOKE].sort());
  assert.equal(new Set(E2.handleCalls).size, E2.handleCalls.length, '두 번 등록한 채널이 없다');
  await assert.rejects(E2.invoke('pet:state', { webContents: {} }, {}), /pet windows only/);
  const state = await call('pet:state', {});
  assert.equal(state.character, C.DEFAULT_CHARACTER);
  assert.equal(state.characters.length, C.CHARACTERS.length);
});

test('허브 모델은 pet-hub 하나 — 셸 ctx.store 를 같이 쓰고(같은 파일 한 인스턴스), 준비되면 폴링이 연결 상태를 정한다', async (t) => {
  const { pet, userData } = await boot(t);
  const { createPetStore, STORE_FILE } = require('./pet-store');
  assert.equal(createPetStore(path.join(userData, STORE_FILE)), pet.store, '같은 파일은 같은 저장소');
  await until(() => pet.state().hubStatus === 'connected', 'connected after first poll');
});

test('할 일: 목록·추가·완료(updatedAt 낙관적 잠금)·낡은 완료는 conflict — 렌더러 뷰 모델이 그대로 읽는다', async (t) => {
  const { call, double } = await boot(t);
  const list = await call('pet:tasks-list', {});
  assert.equal(E.describeRead(list, '할 일').showData, true);
  assert.deepEqual(list.data.tasks, []);
  const id = randomUUID();
  const added = await call('pet:tasks-add', { title: '견적서 보내기', id });
  assert.equal(E.describeWrite(added, '할 일').ok, true);
  assert.equal(T.isReplayedAdd(added, '견적서 보내기'), false);
  assert.deepEqual(Object.keys(added.data.task).sort(), ['id', 'status', 'title', 'updatedAt']);
  const done = await call('pet:tasks-toggle', { id, status: 'done', expectedUpdatedAt: added.data.task.updatedAt });
  assert.equal(E.describeWrite(done).ok, true);
  assert.equal(T.isDone(done.data.task), true);
  const stale = await call('pet:tasks-toggle', { id, status: 'todo', expectedUpdatedAt: added.data.task.updatedAt });
  assert.equal(E.describeWrite(stale).kind, 'conflict');
  assert.equal(double.state.tasks[0].status, 'done', '낡은 요청은 덮어쓰지 않았다');
  const origin = double.state.seen.find((s) => s.method === 'POST' && s.path === '/api/hub/tasks');
  assert.equal(origin.headers.origin, double.origin, '쓰기에 허브 Origin');
  assert.match(origin.headers.cookie, /com_moon_operator_session=/, '메인 창 세션 쿠키');
});

test('메모: 캡처 저장은 재조회로 확인되고 끝난다(다음 입력은 새 메모), 충돌이면 새 항목으로만', async (t) => {
  const { call, double } = await boot(t);
  const first = MM.captureRequest('첫 메모');
  const r1 = MM.interpretSave(await call('pet:journal-save', first), first, '첫 메모');
  assert.equal(r1.outcome, 'saved');
  assert.equal(r1.clearDraft, true);
  assert.equal(r1.pending.hasPendingMemo, false);
  const second = MM.captureRequest('둘째 메모');
  const r2 = MM.interpretSave(await call('pet:journal-save', second), second, '둘째 메모');
  assert.equal(r2.outcome, 'saved');
  assert.notEqual(r1.savedEntry.id, r2.savedEntry.id, '확인된 캡처는 끝나고 새 메모가 된다');
  assert.equal(double.state.memos.size, 2);
  const read = await call('pet:journal-read', {});
  assert.equal(read.kind, 'live');
  assert.equal(MM.pendingFrom(read).hasPendingMemo, false);
  // 충돌: 다른 곳에서 먼저 쓴 id 로 새 캡처를 시작하면(허브 409) 캡처 충돌 → 대상 없는 저장이 막히고 새 항목으로 푼다.
  const taken = randomUUID();
  double.state.memos.set(taken, { id: taken, body: '웹에서 쓴 글', title: '', occurredAt: '2026-09-27T00:00:00Z', revision: 2, noteMeta: { kind: 'note', enhancement: '' }, contexts: [] });
  const clash = await call('pet:journal-save', { body: '펫 글', entryId: taken, finish: true });
  const rc = MM.interpretSave(clash, { body: '펫 글' }, '펫 글');
  assert.equal(rc.outcome, 'conflict');
  assert.equal(rc.pending.captureConflict, true);
  assert.equal(MM.canSave({ saving: false, draft: '펫 글', pending: rc.pending }), false);
  const asNew = MM.asNewRequest('펫 글', rc.pending);
  const recovered = MM.interpretSave(await call('pet:journal-save', asNew), asNew, '펫 글');
  assert.equal(recovered.outcome, 'saved');
  assert.equal(recovered.pending.captureConflict, false);
  assert.equal(double.state.memos.get(taken).body, '웹에서 쓴 글');
});

test('일정: 주간 봉투의 종일·시각 일정을 달력 모델이 그대로 읽는다', async (t) => {
  const { call, double } = await boot(t);
  const today = new Date();
  const iso = K.toISODate(today);
  const tomorrow = K.toISODate(K.addDays(today, 1));
  const soon = new Date(Date.now() + 5 * 60000);
  double.state.events = [
    { id: 'all-day', title: '워크숍', start: iso, end: tomorrow, allDay: true, source: 'google' },
    { id: 'soon', title: '고객 통화', start: soon.toISOString(), end: new Date(soon.getTime() + 1800000).toISOString(), allDay: false, source: 'google', location: '회의실' },
  ];
  const week = await call('pet:calendar-week', { dateISO: iso });
  assert.equal(E.describeRead(week, '일정').showData, true);
  const normalized = K.normalizeEvents(week.data.events);
  assert.equal(normalized.dropped, 0);
  assert.equal(normalized.events.length, 2);
  assert.ok(normalized.events.find((e) => e.title === '워크숍').allDay);
});

test('알림: 새 문의마다 말풍선, 닫기(X)는 말풍선만 내리고 다음 것이 뜬다 — 숨기기는 읽음이 아니다', async (t) => {
  const { call, double, w, pet } = await boot(t);
  const baseline = randomUUID();
  double.state.inquiries = [inquiryRow(baseline)];
  double.state.unreadCount = 1;
  await call('pet:notices-list', {}); // 첫 연결: 조용히
  const shown = () => w.bubble.webContents.sent.filter(([c, p]) => c === 'pet:notice' && p && p.notice).map(([, p]) => p.notice.id);
  const a = randomUUID();
  const b = randomUUID();
  double.state.inquiries = [inquiryRow(a), inquiryRow(b), inquiryRow(baseline)];
  double.state.unreadCount = 3;
  await call('pet:notices-list', {}); // 로그인 필요도 not-loaded 도 아니므로 목록만 — 폴링 한 칸을 대신 돌린다
  await pet.hubUrlChanged(); // 같은 주소: 한 칸 확인
  await until(() => shown().length === 1, 'first bubble');
  assert.equal(w.bubble.isVisible(), true);
  await call('pet:collapse', {}, w.bubble); // 말풍선 X
  assert.equal(w.bubble.isVisible(), false, '말풍선만 내린다');
  await until(() => shown().length === 2, 'second bubble after gap', 3000);
  assert.deepEqual(shown().sort(), [`inquiry:${a}:3`, `inquiry:${b}:3`].sort());
  const before = await call('pet:notices-list', {});
  const unreadBefore = N.listFrom(before).unreadCount;
  const hidden = await call('pet:notices-hide', { id: `inquiry:${a}:3` });
  const after = N.listFrom(hidden);
  assert.ok(after, '숨기기 응답은 새 목록');
  assert.equal(after.notices.some((n) => n.id === `inquiry:${a}:3`), false);
  assert.equal(after.notices.find((n) => n.id === `inquiry:${b}:3`).read, false, '다른 알림의 읽음은 그대로');
  assert.equal(after.unreadCount, unreadBefore - 1, '숨긴 것은 이 PC 목록에서 빠질 뿐');
  assert.equal(hidden.data.totalInquiryCount, 3, '허브 미확인 수는 그대로');
  assert.equal(pet.state().badge, after.unreadCount, '배지는 숫자');
  assert.equal(double.state.seen.filter((s) => s.method !== 'GET').length, 0, '알림 조작은 허브에 쓰지 않는다');
});

test('알림: 패널이 열린 동안 넘겨받은 알림은 보이기 직전에 다시 거른다 — 읽은 문의·시작한 일정은 말풍선에 뜨지 않는다', async (t) => {
  const { call, double, w, pet } = await boot(t);
  const baseline = randomUUID();
  double.state.inquiries = [inquiryRow(baseline)];
  double.state.unreadCount = 1;
  await pet.hubUrlChanged(); // 첫 연결: 기존 미확인은 조용히
  const bubbleShown = () => w.bubble.webContents.sent.filter(([c, p]) => c === 'pet:notice' && p && p.notice).map(([, p]) => p.notice.id);
  const handed = () => w.panel.webContents.sent.filter(([c, p]) => c === 'pet:notice' && p && p.notice).map(([, p]) => p.notice.id);
  pet.openQuick();
  const readInPanel = randomUUID();
  const stillUnread = randomUUID();
  double.state.inquiries = [inquiryRow(readInPanel, 3, '패널 열린 동안 온 문의'), inquiryRow(stillUnread, 3, '아직 안 읽은 문의'), inquiryRow(baseline)];
  double.state.unreadCount = 3;
  const startsAt = Date.now() + 400;
  double.state.events = [{
    id: 'soon', title: '곧 시작 일정', start: new Date(startsAt).toISOString(), end: new Date(startsAt + 1800000).toISOString(), allDay: false, source: 'google',
  }];
  await pet.hubUrlChanged(); // 같은 주소: 폴링 한 칸
  await until(() => handed().length === 3, 'hub hands every new notice over', 4000);
  assert.equal(bubbleShown().length, 0, '패널이 열려 있으면 말풍선은 기다린다');
  assert.equal(w.bubble.isVisible(), false);
  await call('pet:notices-read', { id: `inquiry:${readInPanel}:3` }); // 패널에서 읽음
  await until(() => Date.now() > startsAt + 50, 'event started', 2000);
  pet.collapse();
  await until(() => bubbleShown().length === 1, 'bubble after collapse');
  assert.deepEqual(bubbleShown(), [`inquiry:${stillUnread}:3`], '읽은 문의·시작한 일정은 건너뛴다');
  await call('pet:collapse', {}, w.bubble); // 말풍선 X
  await settle(1300);
  assert.equal(bubbleShown().length, 1, '줄에 남은 낡은 알림이 뒤늦게 뜨지 않는다');
  assert.equal(w.bubble.isVisible(), false);
});

test('Council: 대화 busy 는 boolean, 답이 오면 이 대화, 패널을 접으면 셸이 chatLeave 를 불러 다음 답은 알림', async (t) => {
  let leaves = 0;
  const { call, pet } = await boot(t, {
    wrapHub: (hub) => {
      const leave = hub.chatLeave;
      hub.chatLeave = () => { leaves += 1; leave(); };
      return hub;
    },
  });
  pet.openMode('council');
  const who = { ownerId: 'glaceon', scope: 'all' };
  const session = await call('pet:chat-session', who);
  assert.deepEqual(V.sessionLock(session.data, who), { busy: false, lockedByOther: false });
  const sent = await call('pet:chat-send', { ...who, message: '이번 주 우선순위는?' });
  assert.equal(E.describeWrite(sent).ok, true);
  assert.equal(typeof sent.data.turn.text, 'string');
  assert.equal(sent.data.turn.persisted, true);
  pet.collapse();
  assert.equal(leaves, 1, '대화 화면을 떠나면 한 번');
  await call('pet:chat-send', { ...who, message: '접은 뒤 질문' });
  const list = N.listFrom(await call('pet:notices-list', {}));
  assert.ok(list.notices.some((n) => n.kind === 'reply'));
});

test('Council 안건 넘기기: 셸이 조각(#moonlight-council=…)이 붙은 허브 경로를 메인 창에서 연다', async (t) => {
  const { call, opened, double } = await boot(t);
  const res = await call('pet:council-handoff', { draft: '이번 분기 브랜드 방향을 검토해 줘', source: 'text' });
  assert.equal(res.kind, 'live');
  assert.equal(res.data.opened, true);
  const url = new URL(opened.at(-1));
  assert.equal(url.origin, double.origin);
  assert.equal(url.pathname, '/dashboard/agents/council');
  assert.match(url.hash, /^#moonlight-council=/);
});

test('허브 열기: 허브 상대 경로·조각은 열고, 다른 scheme·host 는 거절한다', async (t) => {
  const { call, opened, double } = await boot(t);
  assert.deepEqual(await call('pet:open-hub', { path: '/dashboard/agents/council#moonlight-council=abc' }), { ok: true });
  assert.equal(opened.at(-1), `${double.origin}/dashboard/agents/council#moonlight-council=abc`);
  for (const bad of ['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)', '/\\evil', 'dashboard']) {
    const result = await call('pet:open-hub', { path: bad });
    assert.equal(result.ok, false, bad);
  }
  assert.deepEqual(await call('pet:open-hub', { path: '/login' }), { ok: true });
});

test('집중: 시작·상태는 계약 봉투, Esc 길게 → 확인, 렌더러가 닫으면 다음 방송에 다시 뜨지 않는다', async (t) => {
  const { call, pet } = await boot(t);
  const started = await call('pet:focus-start', { minutes: 25 });
  assert.equal(F.startError(started), null);
  assert.equal(F.focusFrom(started).running, true);
  assert.equal(F.startError(await call('pet:focus-start', { minutes: 'x' })), null, '이미 진행 중이면 그 상태');
  const screens = pet.windows.focus();
  assert.equal(screens.length, 1);
  // Esc 1.3초: 메인이 before-input-event 로 잰다(페이지로도 그대로 간다).
  const input = (type) => { screens[0].webContents.emit('before-input-event', { preventDefault() { throw new Error('Esc 를 막으면 페이지가 받지 못한다'); } }, { type, key: 'Escape' }); };
  input('keyDown');
  await settle(1400);
  input('keyUp');
  let view = F.confirmAfterState({ confirming: false, seenRevision: 0 }, pet.state().focus);
  assert.equal(view.confirming, true);
  await call('pet:focus-state', { dismissConfirm: true }, screens[0]);
  assert.equal(pet.state().focus.confirmStop, false);
  await call('pet:set-character', { key: 'pink' });
  view = F.confirmAfterState({ ...view, confirming: false }, pet.state().focus);
  assert.equal(view.confirming, false, '캐릭터가 바뀌어도 확인이 다시 뜨지 않는다');
  const stopped = await call('pet:focus-stop', {}, screens[0]);
  assert.equal(F.focusFrom(stopped).running, false);
  assert.equal(pet.windows.focus().length, 0);
});

test('위젯 → 빠른 패널: 위젯을 접어 펫을 위젯 위 끝에 맞춘 뒤 빠른 패널을 연다', async (t) => {
  const { pet, w } = await boot(t);
  pet.showWidget('tasks');
  assert.equal(pet.state().presentation, 'widget');
  const widgetTop = w.panel.getBounds().y - C.PERCH_STRIP;
  pet.toggleQuick();
  const s = pet.state();
  assert.equal(s.panelOpen, true);
  assert.equal(s.presentation, 'quick');
  assert.equal(pet.petBounds.y, widgetTop, '펫이 위젯 위 끝으로');
  assert.equal(w.perch.isVisible(), false, '빠른 할 일에는 걸친 캐릭터가 없다');
});

test('누름을 잃으면(cancel) 워시를 끄고 클릭으로 치지 않는다', async (t) => {
  const { call, pet, w } = await boot(t);
  const washes = () => w.pet.webContents.sent.filter(([c]) => c === 'pet:wash').map(([, p]) => p.on);
  await call('pet:press', { pressed: true, source: 'pet' }, w.pet);
  await call('pet:drag', { phase: 'begin', screenY: 500 }, w.pet);
  assert.equal(washes().at(-1), true);
  await call('pet:drag', { phase: 'cancel' }, w.pet);
  await call('pet:press', { pressed: false, source: 'pet' }, w.pet);
  assert.equal(washes().at(-1), false);
  assert.equal(pet.state().panelOpen, false, '잃은 누름은 클릭이 아니다');
  await call('pet:press', { pressed: true, source: 'pet' }, w.pet);
  await call('pet:drag', { phase: 'begin', screenY: 500 }, w.pet);
  await call('pet:drag', { phase: 'end', screenY: 500 }, w.pet);
  await call('pet:press', { pressed: false, source: 'pet' }, w.pet);
  assert.equal(pet.state().panelOpen, true, '다음 누름은 새 클릭');
});

test('허브 주소를 같은 값으로 다시 저장해도 상태가 unknown 에 멈추지 않고, 바꾸면 새 origin 으로 간다', async (t) => {
  const { pet, setHubUrl, double } = await boot(t);
  await until(() => pet.state().hubStatus === 'connected', 'connected');
  await pet.hubUrlChanged();
  assert.equal(pet.state().hubStatus, 'connected');
  setHubUrl('http://127.0.0.1:3158'); // 닿지 않는 허브
  await pet.hubUrlChanged();
  assert.equal(pet.state().hubStatus, 'offline', '연결 실패는 offline(unknown 에 머물지 않는다)');
  setHubUrl(double.origin);
  await pet.hubUrlChanged();
  assert.equal(pet.state().hubStatus, 'connected', '돌아오면 다시 연결됨');
  setHubUrl('');
  await pet.hubUrlChanged();
  assert.equal(pet.state().hubStatus, 'not-configured');
});
