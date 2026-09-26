'use strict';
// Mac Tests/PetActivityStoreTests 이식 — 첫 연결 조용히 채우기, 한 번만 말풍선, 배지, 숨김/읽음 보관, origin 분리.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createActivity, badgeLabel, DELIVERY_PREFIX, BANNERS_KEY } = require('./pet-activity');
const { fail } = require('./pet-hub-client');

function memoryStore() {
  const map = new Map();
  return {
    map,
    get: (key) => (map.has(key) ? JSON.parse(map.get(key)) : null),
    set: (key, value) => { map.set(key, JSON.stringify(value)); },
  };
}

// 제어 가능한 알림 원천(Mac ControlledActivity).
function controlledSource() {
  const source = {
    page: { inquiries: [], unreadCount: 0 },
    events: [],
    inquiryError: null,
    inquiryReads: 0,
    hold: null,
    set(inquiries, total, events = []) {
      source.page = { inquiries, unreadCount: total ?? inquiries.length };
      source.events = events;
    },
    async inquiries() {
      const snapshot = source.page;
      source.inquiryReads += 1;
      if (source.hold) await source.hold;
      if (source.inquiryError) throw source.inquiryError;
      return snapshot;
    },
    async calendar() {
      return { events: source.events, partial: false };
    },
  };
  return source;
}

// 수동 스케줄러: 말풍선 사이 간격 타이머를 테스트가 직접 흘린다.
function manualScheduler() {
  const tasks = [];
  const schedule = (fn) => {
    const task = { fn, cancelled: false };
    tasks.push(task);
    return () => { task.cancelled = true; };
  };
  const flush = () => {
    while (tasks.length) {
      const task = tasks.shift();
      if (!task.cancelled) task.fn();
    }
  };
  return { schedule, flush, tasks };
}

function inquiry(id = randomUUID(), sequence = 1) {
  return {
    id, title: '문의 상태 검증', subtitle: '지원 문의 · 메일', updatedAt: new Date().toISOString(),
    path: `/dashboard/revenue/inquiries?inquiry=${id}`, token: `inquiry:${id}:${sequence}`,
  };
}
function event(startMs, allDay = false) {
  return { key: `google:${randomUUID()}`, id: 'e', title: '일정 경계 검증', startMs, endMs: startMs + 3600000, allDay };
}

async function connected({ source = controlledSource(), store = memoryStore(), origin = 'https://initial.example.test', now } = {}) {
  const timers = manualScheduler();
  const activity = createActivity({ store, schedule: timers.schedule, now });
  await activity.configure({ service: source, origin });
  return { activity, source, store, timers };
}

test('배지 표시: 0 은 숨김, 100 이상은 99+', () => {
  assert.equal(badgeLabel(0), '');
  assert.equal(badgeLabel(1), '1');
  assert.equal(badgeLabel(99), '99');
  assert.equal(badgeLabel(100), '99+');
  assert.equal(badgeLabel(1234), '99+');
});

test('첫 연결의 기존 문의는 조용히 목록만, 새 수신은 한 번만 말풍선', async () => {
  const source = controlledSource();
  const id = randomUUID();
  source.set([inquiry(id)], 34);
  const { activity, timers } = await connected({ source });
  const delivered = [];
  activity.onBanner = (n) => { delivered.push(n.id); return true; };
  await activity.tick();
  let list = activity.list();
  assert.equal(list.notices.length, 1);
  assert.equal(list.totalInquiryCount, 34);
  assert.equal(list.banner, null);
  assert.deepEqual(delivered, []);
  assert.match(list.message, /전체 미확인 34개/);
  assert.equal(list.notices[0].kind, 'inquiry');
  assert.deepEqual(list.notices[0].target, { type: 'hub', path: `/dashboard/revenue/inquiries?inquiry=${id}`, inquiryId: id });
  source.set([inquiry(id, 2)]);
  await activity.tick();
  list = activity.list();
  assert.equal(delivered.length, 1);
  assert.ok(list.banner.id.endsWith(':2'));
  activity.dismissBanner();
  timers.flush();
  await activity.tick();
  activity.presentNext();
  assert.equal(delivered.length, 1, '같은 수신은 새로고침·닫기 뒤에도 반복하지 않는다');
  assert.equal(activity.list().banner, null);
});

test('집중·누름 중에 거절한 말풍선은 소모되지 않고 나중에 한 번 나온다', async () => {
  const source = controlledSource();
  const id = randomUUID();
  source.set([inquiry(id)]);
  const { activity } = await connected({ source, origin: 'https://suppressed.example.test' });
  let mayPresent = false;
  const accepted = [];
  activity.onBanner = (n) => { if (mayPresent) accepted.push(n.id); return mayPresent; };
  await activity.tick();
  source.set([inquiry(id, 2)]);
  await activity.tick();
  assert.equal(activity.list().banner, null);
  assert.deepEqual(accepted, []);
  mayPresent = true;
  activity.presentNext();
  assert.equal(accepted.length, 1);
  assert.ok(activity.list().banner);
  activity.dismissBanner();
  activity.presentNext();
  assert.equal(accepted.length, 1);
});

test('10분 안에 시작하는 시각 일정만 알리고, 지난 일정은 조회 사이에도 사라진다', async () => {
  const now = Date.now();
  const source = controlledSource();
  source.set([], 0, [event(now - 60000), event(now + 300000), event(now + 900000), event(new Date(new Date(now).setHours(0, 0, 0, 0)).getTime(), true)]);
  const { activity } = await connected({ source, origin: 'https://calendar.example.test' });
  let presented = 0;
  activity.onBanner = () => { presented += 1; return true; };
  await activity.tick(now);
  const list = activity.list();
  assert.equal(list.notices.length, 1);
  assert.equal(list.notices[0].kind, 'event');
  assert.equal(list.notices[0].target.type, 'calendar');
  assert.match(list.notices[0].target.dateISO, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(presented, 1);
  activity.presentNext(now + 301000);
  assert.equal(activity.list().notices.length, 0);
  assert.equal(activity.list().banner, null);
});

test('숨김은 이 PC 에서만 — 허브 미확인 수는 그대로, 같은 origin 재연결에도 유지, 다른 origin 은 물려받지 않는다', async () => {
  const source = controlledSource();
  const notice = inquiry();
  source.set([notice]);
  const store = memoryStore();
  const first = await connected({ source, store, origin: 'https://hidden.example.test' });
  await first.activity.tick();
  first.activity.hide(notice.token);
  assert.equal(first.activity.list().notices.length, 0);
  assert.equal(first.activity.list().totalInquiryCount, 1);
  const restored = await connected({ source, store, origin: 'https://hidden.example.test' });
  await restored.activity.tick();
  assert.equal(restored.activity.list().notices.length, 0);
  const switching = restored.activity.configure({ service: source, origin: 'https://different.example.test' });
  const cleared = restored.activity.list();
  assert.equal(cleared.notices.length, 0);
  assert.equal(cleared.totalInquiryCount, 0);
  assert.equal(cleared.banner, null);
  await switching;
  await restored.activity.tick();
  assert.equal(restored.activity.list().notices.length, 1);
});

test('이전 연결의 늦은 응답은 현재 origin 데이터를 바꾸지 않는다', async () => {
  const oldSource = controlledSource();
  const newSource = controlledSource();
  const old = inquiry();
  const current = inquiry();
  oldSource.set([old]);
  let release;
  oldSource.hold = new Promise((resolve) => { release = resolve; });
  newSource.set([current]);
  const { activity } = await connected({ source: oldSource, origin: 'https://old.example.test' });
  const late = activity.tick();
  await activity.configure({ service: newSource, origin: 'https://new.example.test' });
  await activity.tick();
  assert.deepEqual(activity.list().notices.map((n) => n.id), [current.token]);
  release();
  await late;
  assert.deepEqual(activity.list().notices.map((n) => n.id), [current.token]);
  assert.equal(activity.isRefreshing(), false);
  await activity.configure({ service: null, origin: null });
  const list = activity.list();
  assert.equal(list.notices.length, 0);
  assert.equal(list.banner, null);
  assert.equal(list.totalInquiryCount, 0);
});

test('에이전트 답변은 배지를 올리되 허브 문의 수는 바꾸지 않고, 바로 한 번 말풍선', async () => {
  const source = controlledSource();
  source.set([inquiry()], 7);
  const { activity, timers } = await connected({ source, origin: 'https://agent-reply.example.test' });
  const delivered = [];
  activity.onBanner = (n) => { delivered.push(n.id); return true; };
  await activity.tick();
  const replyId = randomUUID();
  activity.addAgentReply({ id: replyId, ownerId: 'sylveon', scope: 'personal', title: '님피아의 답변', body: '답변이 도착했어요.' });
  const list = activity.list();
  assert.equal(list.unreadCount, 2);
  assert.equal(list.badge, 2, 'badge 는 state.badge 와 같은 숫자');
  assert.equal(list.badgeLabel, '2');
  assert.equal(list.totalInquiryCount, 7);
  assert.equal(list.banner.id, `reply:${replyId}`);
  assert.deepEqual(delivered, [`reply:${replyId}`]);
  assert.equal(list.banner.kind, 'reply');
  assert.deepEqual(list.banner.target, { type: 'chat', ownerId: 'sylveon', scope: 'personal' });
  activity.dismissBanner();
  timers.flush();
  await activity.tick();
  activity.presentNext();
  assert.equal(activity.list().unreadCount, 2);
  assert.equal(activity.list().banner, null);
  assert.equal(delivered.length, 1);
});

test('대화를 보면 정확히 그 담당·범위의 답변 알림만 거둔다', async () => {
  const source = controlledSource();
  const inq = inquiry();
  source.set([inq]);
  const { activity, timers } = await connected({ source, origin: 'https://agent-acknowledge.example.test' });
  let dismissed = 0;
  activity.onBanner = () => true;
  activity.onBannerDismissed = () => { dismissed += 1; };
  await activity.tick();
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
  activity.addAgentReply({ id: a, ownerId: 'eevee', scope: 'personal', title: '첫 답변', body: '개인 범위' });
  activity.addAgentReply({ id: b, ownerId: 'eevee', scope: 'classin', title: '다른 범위', body: '회사 범위' });
  activity.addAgentReply({ id: c, ownerId: 'sylveon', scope: 'personal', title: '다른 담당', body: '개인 범위' });
  activity.acknowledgeAgentReplies('eevee', 'all');
  assert.equal(activity.list().unreadCount, 4);
  assert.equal(activity.list().banner.id, `reply:${a}`);
  activity.acknowledgeAgentReplies('eevee', 'personal');
  assert.deepEqual(new Set(activity.list().notices.map((n) => n.id)), new Set([`reply:${b}`, `reply:${c}`, inq.token]));
  assert.equal(activity.list().unreadCount, 3);
  assert.equal(activity.list().banner, null);
  assert.equal(dismissed, 1);
  timers.flush();
  assert.equal(activity.list().banner.id, `reply:${c}`);
  activity.acknowledgeAgentReplies('eevee', 'classin');
  assert.equal(activity.list().unreadCount, 2);
  assert.equal(activity.list().banner.id, `reply:${c}`);
  assert.equal(dismissed, 1);
});

test('origin 을 바꾸면 이전 허브의 로컬 답변과 배지를 즉시 지운다', async () => {
  const oldSource = controlledSource();
  const { activity } = await connected({ source: oldSource, origin: 'https://agent-old.example.test' });
  const delivered = [];
  activity.onBanner = (n) => { delivered.push(n.id); return true; };
  await activity.tick();
  activity.addAgentReply({ id: randomUUID(), ownerId: 'umbreon', scope: 'all', title: '이전 Hub 답변', body: '표시 중' });
  activity.addAgentReply({ id: randomUUID(), ownerId: 'leafeon', scope: 'personal', title: '이전 Hub 대기 답변', body: '대기 중' });
  assert.equal(activity.list().unreadCount, 2);
  assert.equal(delivered.length, 1);
  const switching = activity.configure({ service: controlledSource(), origin: 'https://agent-new.example.test' });
  assert.equal(activity.list().unreadCount, 0);
  assert.equal(activity.list().banner, null);
  await switching;
  await activity.tick();
  activity.presentNext();
  assert.equal(activity.list().notices.length, 0);
  assert.equal(delivered.length, 1);
});

test('읽음은 재시작 뒤에도 남고(옛 저장 형식도 읽는다), 새 수신은 다시 안 읽음', async () => {
  const source = controlledSource();
  const inq = inquiry();
  const hidden = inquiry();
  const origin = 'https://read-state.example.test';
  const store = memoryStore();
  store.set(DELIVERY_PREFIX + origin, { delivered: [inq.token], hidden: [hidden.token] });
  source.set([inq, hidden], 8);
  const first = await connected({ source, store, origin });
  await first.activity.tick();
  assert.equal(first.activity.list().notices.length, 1);
  assert.equal(first.activity.list().unreadCount, 1);
  const target = first.activity.read(inq.token);
  assert.deepEqual(target, { type: 'hub', path: inq.path, inquiryId: inq.id });
  assert.equal(first.activity.list().unreadCount, 0);
  assert.equal(first.activity.list().notices.length, 1);
  assert.equal(first.activity.list().totalInquiryCount, 8);
  const reopened = await connected({ source, store, origin });
  await reopened.activity.tick();
  assert.equal(reopened.activity.list().unreadCount, 0);
  assert.equal(reopened.activity.list().notices.length, 1);
  source.set([inquiry(inq.id, 2)]);
  await reopened.activity.tick();
  assert.equal(reopened.activity.list().unreadCount, 1);
});

test('말풍선은 간격을 두고 차례로, 모두 읽음은 기록을 남기고 대기 말풍선을 멈춘다', async () => {
  const { activity, timers } = await connected({ origin: 'https://queue.example.test' });
  const delivered = [];
  activity.onBanner = (n) => { delivered.push(n.id); return true; };
  await activity.tick();
  const [first, next] = [randomUUID(), randomUUID()];
  activity.addAgentReply({ id: first, ownerId: 'eevee', scope: 'personal', title: '첫 답변' });
  activity.addAgentReply({ id: next, ownerId: 'eevee', scope: 'personal', title: '다음 답변' });
  activity.dismissBanner();
  activity.presentNext();
  assert.equal(activity.list().banner, null);
  assert.equal(activity.list().unreadCount, 2);
  timers.flush();
  assert.equal(activity.list().banner.id, `reply:${next}`);
  assert.deepEqual(delivered, [`reply:${first}`, `reply:${next}`]);
  activity.addAgentReply({ id: randomUUID(), ownerId: 'eevee', scope: 'personal', title: '확인할 답변' });
  activity.readAll();
  timers.flush();
  activity.presentNext();
  assert.equal(activity.list().unreadCount, 0);
  assert.equal(activity.list().notices.length, 3);
  assert.equal(activity.list().banner, null);
});

test('원천 하나가 실패해도 다른 원천은 반영하고 실패는 드러낸다(빈 받은함으로 위장하지 않음)', async () => {
  const source = controlledSource();
  source.inquiryError = fail('unauthorized', 'unauthorized', 401);
  const now = Date.now();
  source.events = [event(now + 120000)];
  const { activity } = await connected({ source });
  const result = await activity.tick(now);
  assert.equal(result.succeeded, 1);
  assert.equal(result.errors[0].kind, 'unauthorized');
  const list = activity.list();
  assert.match(list.message, /문의: Hub 로그인이 필요해요/);
  assert.equal(list.notices.length, 1);
});

test('말풍선 끄기는 보관되고 켜면 대기 알림이 나온다', async () => {
  const store = memoryStore();
  const { activity } = await connected({ store });
  const delivered = [];
  activity.onBanner = (n) => { delivered.push(n.id); return true; };
  activity.setBannersEnabled(false);
  assert.equal(store.get(BANNERS_KEY), false);
  const again = await connected({ store });
  assert.equal(again.activity.list().bannersEnabled, false, '다시 연결해도 사용자의 끄기 선택 유지');
  await activity.tick();
  activity.addAgentReply({ id: randomUUID(), ownerId: 'eevee', scope: 'all', title: '답' });
  assert.equal(delivered.length, 0);
  activity.setBannersEnabled(true);
  assert.equal(delivered.length, 1);
  assert.equal(store.get(BANNERS_KEY), true);
});

test('전달·숨김·읽음 기록은 최대 1000건', async () => {
  const origin = 'https://bounded.example.test';
  const store = memoryStore();
  store.set(DELIVERY_PREFIX + origin, { read: Array.from({ length: 1200 }, (_, i) => `inquiry:${i}`), delivered: [], hidden: [] });
  const { activity } = await connected({ store, origin });
  await activity.tick();
  activity.readAll();
  activity.hide('inquiry:new');
  const saved = store.get(DELIVERY_PREFIX + origin);
  assert.equal(saved.read.length, 1000);
  assert.equal(saved.read[saved.read.length - 1], 'inquiry:1199');
});
