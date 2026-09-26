'use strict';
// 셸이 쓰는 hub 객체 — 채널 봉투, 연결 상태 이벤트, 알림·배지·대화 이벤트, origin 전환, 실제 로컬 http 왕복.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createPetHub, statusFromEnvelope } = require('./pet-hub');
const { PET_INVOKE, ENVELOPE_KINDS } = require('../shared/contract');

function memoryStore() {
  const map = new Map();
  return {
    map,
    get: async (key) => (map.has(key) ? JSON.parse(map.get(key)) : null),
    set: async (key, value) => { map.set(key, JSON.stringify(value)); },
  };
}

// 허브 계약만 흉내 내는 로컬 서버. 세션 쿠키가 없으면 401, 쓰기에 Origin 이 다르면 403(허브 write guard 와 같은 판정).
function startHubDouble() {
  const state = {
    tasks: [], memos: new Map(), inquiries: [], unreadCount: 0, events: [], seen: [], chatDelay: 0,
    cookie: 'com_moon_operator_session=operator-session',
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const body = raw ? JSON.parse(raw) : null;
      state.seen.push({ method: req.method, path: url.pathname, search: url.search, headers: req.headers, body });
      const send = (status, value) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (url.pathname === '/api/operator/session' && req.method === 'GET') {
        return send(200, { status: req.headers.cookie === state.cookie ? 'authenticated' : 'anonymous', configured: true, reason: null });
      }
      if (req.headers.cookie !== state.cookie) return send(401, { status: 'unauthorized' });
      if (req.method !== 'GET' && req.headers.origin !== origin) return send(403, { status: 'forbidden', error: 'same-origin-required' });
      if (url.pathname === '/api/hub/tasks') {
        if (req.method === 'GET') return send(200, { status: 'live', tasks: state.tasks });
        if (req.method === 'POST') {
          const task = { id: body.id, title: body.title, status: body.status, updated_at: '2026-09-27T01:02:03.123456+00:00' };
          state.tasks.unshift(task);
          return send(200, { status: 'saved', task });
        }
        if (req.method === 'PATCH') {
          const task = state.tasks.find((t) => t.id === body.id);
          if (!task || task.updated_at !== body.expectedUpdatedAt) return send(409, { status: 'conflict' });
          task.status = body.status;
          task.updated_at = '2026-09-27T02:00:00.000001+00:00';
          return send(200, { status: 'saved', task });
        }
      }
      if (url.pathname === '/api/hub/journal') {
        if (req.method === 'GET') {
          const entry = state.memos.get(url.searchParams.get('note')) || null;
          return send(200, { status: 'live', entry });
        }
        const previous = state.memos.get(body.entryId);
        if ((previous ? previous.revision : 0) !== body.expectedRevision) return send(409, { status: 'conflict', error: 'revision-conflict' });
        const entry = { id: body.entryId, body: body.body, title: body.title, occurredAt: body.occurredAt, revision: body.expectedRevision + 1, noteMeta: body.noteMeta, contexts: body.contexts };
        state.memos.set(body.entryId, entry);
        return send(200, { status: 'saved', entry });
      }
      if (url.pathname === '/api/calendar/google/event') return send(200, { status: 'live', events: state.events });
      if (url.pathname === '/api/hub/inquiries') return send(200, { status: 'live', source: 'supabase', rows: state.inquiries, unreadCount: state.unreadCount });
      if (url.pathname === '/api/hub/office/chat') {
        const reply = {
          status: 'generated', version: '2026-09-22.v3', ownerId: body.ownerId, mode: 'chat', scope: body.scope, lens: null, simulation: false,
          participants: [], answer: `${body.message}에 대한 답`, nextAction: '다음 행동', context: { source: 'provided', scope: body.scope, projects: [], note: '입력 기준' },
          log: { persisted: true, runId: randomUUID() }, businessWrites: false,
        };
        return setTimeout(() => send(200, reply), state.chatDelay);
      }
      return send(404, { status: 'error' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, origin: `http://127.0.0.1:${server.address().port}` })));
}

function inquiryRow(id = randomUUID(), seq = 3) {
  return { id, subject: '새 제휴 문의', kind: 'partnership', status: 'new', classification: 'inquiry', sources: ['webhook'], unread: true, last_inbound_seq: seq, last_read_seq: 1, updated_at: '2026-09-27T00:00:00Z' };
}

function hubFor(double, extra = {}) {
  const events = [];
  const hub = createPetHub({
    origin: double.origin,
    store: memoryStore(),
    cookieHeader: async (url) => (url.startsWith(double.origin) ? double.state.cookie : ''),
    onEvent: (name, payload) => events.push([name, payload]),
    schedule: () => () => {},
    ...extra,
  });
  return { hub, events };
}

const channelMethod = (channel) => channel.replace(/^pet:/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

test('허브 채널은 모두 메서드로 있고, 봉투 kind 는 계약 목록 안', async () => {
  const hubChannels = PET_INVOKE.filter((c) => /^pet:(hub-session|tasks-|journal-|calendar-|notices-|chat-|council-)/.test(c));
  const { hub } = hubFor({ origin: '', state: {} });
  for (const channel of hubChannels) {
    const method = channel === 'pet:hub-session' ? 'session' : channelMethod(channel);
    assert.equal(typeof hub[method], 'function', `${channel} → hub.${method}`);
    const envelope = await hub[method]({});
    assert.ok(ENVELOPE_KINDS.includes(envelope.kind), `${channel}: ${envelope.kind}`);
    assert.deepEqual(Object.keys(envelope).sort(), ['data', 'error', 'httpStatus', 'kind']);
  }
  assert.equal(typeof hub.councilHandoffUrl, 'function');
});

test('허브 주소가 없거나 규칙 밖이면 not-configured(hub-url-missing), 요청하지 않는다', async () => {
  let fetched = 0;
  const hub = createPetHub({ origin: 'http://remote.example.test', fetch: async () => { fetched += 1; }, store: memoryStore() });
  for (const envelope of [await hub.tasksList(), await hub.session(), await hub.noticesList(), await hub.chatSend({ ownerId: 'eevee', scope: 'all', message: '질문' })]) {
    assert.equal(envelope.kind, 'not-configured');
    assert.equal(envelope.error, 'hub-url-missing');
  }
  assert.equal(fetched, 0);
  assert.equal(hub.status, 'not-configured');
});

test('연결 상태 판정표', () => {
  assert.equal(statusFromEnvelope({ kind: 'live' }), 'connected');
  assert.equal(statusFromEnvelope({ kind: 'preview' }), 'connected');
  assert.equal(statusFromEnvelope({ kind: 'unauthorized' }), 'unauthorized');
  assert.equal(statusFromEnvelope({ kind: 'not-configured' }), 'not-configured');
  assert.equal(statusFromEnvelope({ kind: 'error', error: 'offline' }), 'offline');
  assert.equal(statusFromEnvelope({ kind: 'error', error: 'timeout' }), 'offline');
  assert.equal(statusFromEnvelope({ kind: 'error', error: 'server' }), null);
  assert.equal(statusFromEnvelope({ kind: 'conflict' }), null);
});

test('실제 http: 메인 창 세션으로 할 일 읽기·추가·완료, 연결 상태 이벤트', async () => {
  const double = await startHubDouble();
  try {
    const { hub, events } = hubFor(double);
    const session = await hub.session();
    assert.deepEqual(session.data, { status: 'authenticated', configured: true, reason: null });
    assert.equal(hub.status, 'connected');
    assert.deepEqual(events.filter(([n]) => n === 'pet:hub-status').map(([, p]) => p.status), ['connected']);
    const empty = await hub.tasksList();
    assert.equal(empty.kind, 'live');
    assert.deepEqual(empty.data.tasks, []);
    const added = await hub.tasksAdd({ title: '  펫에서 추가  ' });
    assert.equal(added.kind, 'live');
    assert.equal(added.data.task.title, '펫에서 추가');
    assert.equal(added.data.pending.hasPendingTask, false);
    const post = double.state.seen.find((s) => s.method === 'POST');
    assert.equal(post.headers.origin, double.origin);
    assert.equal(post.headers.cookie, double.state.cookie);
    assert.equal(post.body.source, 'desktop-pet');
    const list = await hub.tasksList();
    const task = list.data.tasks[0];
    assert.equal(task.updatedAt, '2026-09-27T01:02:03.123456+00:00');
    const done = await hub.tasksToggle({ id: task.id, status: 'done', expectedUpdatedAt: task.updatedAt });
    assert.equal(done.kind, 'live');
    assert.equal(done.data.task.status, 'done');
    const stale = await hub.tasksToggle({ id: task.id, status: 'todo', expectedUpdatedAt: task.updatedAt });
    assert.equal(stale.kind, 'conflict');
    const invalid = await hub.tasksToggle({ id: 'nope', status: 'done' });
    assert.equal(invalid.error, 'invalid-input');
  } finally {
    double.server.close();
  }
});

test('실제 http: 401 이면 unauthorized 로 바뀌고 로그인 필요 상태를 알린다', async () => {
  const double = await startHubDouble();
  try {
    const { hub, events } = hubFor(double, { cookieHeader: async () => '' });
    const session = await hub.session();
    assert.equal(session.data.status, 'anonymous');
    assert.equal(hub.status, 'unauthorized');
    const tasks = await hub.tasksList();
    assert.equal(tasks.kind, 'unauthorized');
    assert.equal(tasks.httpStatus, 401);
    assert.ok(events.some(([n, p]) => n === 'pet:hub-status' && p.status === 'unauthorized'));
  } finally {
    double.server.close();
  }
});

test('실제 http: 메모 저장은 재조회로 verified, 같은 메모 후속 저장은 revision 을 올린다', async () => {
  const double = await startHubDouble();
  try {
    const { hub } = hubFor(double);
    const first = await hub.journalSave({ body: '펫 메모 원문\n둘째 줄' });
    assert.equal(first.kind, 'live');
    assert.equal(first.data.verified, true);
    assert.equal(first.data.entry.revision, 1);
    assert.equal(first.data.pending.savedMemoBody, '펫 메모 원문\n둘째 줄');
    const read = await hub.journalRead({});
    assert.equal(read.data.entry.id, first.data.entry.id);
    const second = await hub.journalSave({ body: '고친 메모' });
    assert.equal(second.data.entry.id, first.data.entry.id);
    assert.equal(second.data.entry.revision, 2);
    const posts = double.state.seen.filter((s) => s.path === '/api/hub/journal' && s.method === 'POST');
    assert.equal(posts.length, 2);
    assert.notEqual(posts[0].body.requestId, posts[1].body.requestId);
    // Hub 에서 바뀌면 덮어쓰지 않고 conflict + 보류 상태 요약을 함께 돌려준다.
    double.state.memos.get(first.data.entry.id).revision = 7;
    const conflict = await hub.journalSave({ body: '로컬 수정' });
    assert.equal(conflict.kind, 'conflict');
    assert.equal(conflict.data.pending.memoConflict, true);
    const recovered = await hub.journalSave({ body: '로컬 수정', asNew: true });
    assert.equal(recovered.kind, 'live');
    assert.notEqual(recovered.data.entry.id, first.data.entry.id);
  } finally {
    double.server.close();
  }
});

test('실제 http: 주간 일정은 partial 이 아닌 live, 날짜 칸을 붙인다', async () => {
  const double = await startHubDouble();
  try {
    double.state.events = [{ id: 'e1', source: 'google', title: '주간 회의', start: new Date(2026, 8, 22, 9).toISOString(), end: new Date(2026, 8, 22, 10).toISOString(), allDay: false, location: '회의실' }];
    const { hub } = hubFor(double);
    const week = await hub.calendarWeek({ dateISO: '2026-09-24' });
    assert.equal(week.kind, 'live');
    assert.equal(week.data.status, 'live');
    assert.equal(week.data.weekStart, '2026-09-21');
    assert.equal(week.data.events[0].key, 'google:e1');
    assert.deepEqual(week.data.events[0].dates, ['2026-09-22']);
  } finally {
    double.server.close();
  }
});

test('실제 http: 알림 — 첫 연결은 조용히, 새 문의는 게이트를 통과할 때만 말풍선, 배지 이벤트', async () => {
  const double = await startHubDouble();
  try {
    const id = randomUUID();
    double.state.inquiries = [inquiryRow(id, 3)];
    double.state.unreadCount = 1;
    let gateOpen = false;
    const { hub, events } = hubFor(double, { canPresentBanner: () => gateOpen });
    const first = await hub.noticesList();
    assert.equal(first.kind, 'live');
    assert.equal(first.data.unreadCount, 1);
    assert.equal(first.data.badge, '1');
    assert.equal(events.filter(([n]) => n === 'pet:notice').length, 0);
    assert.deepEqual(events.find(([n]) => n === 'pet:badge')[1], { count: 1, label: '1' });
    double.state.inquiries = [inquiryRow(id, 4)];
    await hub.tick();
    assert.equal(events.filter(([n]) => n === 'pet:notice').length, 0, '게이트가 닫혀 있으면 보류');
    gateOpen = true;
    hub.presentNext();
    const notices = events.filter(([n]) => n === 'pet:notice');
    assert.equal(notices.length, 1);
    assert.equal(notices[0][1].notice.kind, 'inquiry');
    assert.equal(notices[0][1].notice.id, `inquiry:${id}:4`);
    const opened = await hub.noticesRead({ id: `inquiry:${id}:4` });
    assert.deepEqual(opened.data.target, { type: 'hub', path: `/dashboard/revenue/inquiries?inquiry=${id}`, inquiryId: id });
    assert.equal(opened.data.unreadCount, 0);
    const hidden = await hub.noticesHide({ id: `inquiry:${id}:4` });
    assert.equal(hidden.data.notices.length, 0);
    assert.equal(hidden.data.totalInquiryCount, 1, '숨겨도 허브 미확인 수는 그대로');
    assert.equal(double.state.seen.filter((s) => s.method !== 'GET').length, 0, '알림 조작은 허브에 쓰지 않는다');
  } finally {
    double.server.close();
  }
});

test('실제 http: 대화 — 답 이벤트, 보고 있지 않으면 reply 알림, 대화를 열면 거둔다', async () => {
  const double = await startHubDouble();
  try {
    const { hub, events } = hubFor(double, { canPresentBanner: () => true });
    await hub.noticesList();
    const who = { ownerId: 'glaceon', scope: 'personal' };
    const sent = await hub.chatSend({ ...who, message: '오늘 제품 우선순위' });
    assert.equal(sent.kind, 'live');
    assert.equal(sent.data.turn.text, '오늘 제품 우선순위에 대한 답');
    assert.equal(sent.data.turn.persisted, true);
    assert.match(sent.data.turn.runId, /^[0-9a-f-]{36}$/);
    const replyEvent = events.find(([n]) => n === 'pet:chat-reply');
    assert.deepEqual([replyEvent[1].ownerId, replyEvent[1].scope], ['glaceon', 'personal']);
    const notice = events.find(([n]) => n === 'pet:notice');
    assert.equal(notice[1].notice.kind, 'reply');
    assert.equal(notice[1].notice.title, '글레이시아의 답변 · 개인');
    assert.deepEqual(notice[1].notice.target, { type: 'chat', ...who });
    const session = await hub.chatSession({ ...who, draft: '다음 질문 초안' });
    assert.equal(session.data.turns.length, 2);
    assert.equal(session.data.draft, '다음 질문 초안');
    assert.equal(hub.badge().count, 0, '그 대화를 열면 답변 알림을 거둔다');
    const whileViewing = await hub.chatSend({ ...who, message: '이어서' });
    assert.equal(whileViewing.kind, 'live');
    assert.equal(hub.badge().count, 0, '보고 있는 대화의 답은 알림을 만들지 않는다');
    const request = double.state.seen.filter((s) => s.path === '/api/hub/office/chat').pop();
    assert.equal(request.body.history.length, 2);
    assert.equal(request.headers.origin, double.origin);
  } finally {
    double.server.close();
  }
});

test('실제 http: 대화 취소는 늦은 답을 버리고 cancelled', async () => {
  const double = await startHubDouble();
  try {
    double.state.chatDelay = 200;
    const { hub } = hubFor(double);
    const sending = hub.chatSend({ ownerId: 'eevee', scope: 'all', message: '느린 질문' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const cancelled = await hub.chatCancel();
    assert.equal(cancelled.data.cancelled, true);
    const result = await sending;
    assert.equal(result.error, 'cancelled');
    const session = await hub.chatSession({ ownerId: 'eevee', scope: 'all' });
    assert.equal(session.data.turns.length, 0);
    assert.equal(session.data.busy, null);
  } finally {
    double.server.close();
  }
});

test('origin 을 바꾸는 동안 도착한 결과는 stale-origin 으로 버린다', async () => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const hub = createPetHub({
    origin: 'https://one.example.test',
    store: memoryStore(),
    fetch: async () => { await hold; return new Response(JSON.stringify({ status: 'live', tasks: [] })); },
  });
  const pending = hub.tasksList();
  await new Promise((resolve) => setImmediate(resolve));
  await hub.setOrigin('https://two.example.test');
  release();
  const result = await pending;
  assert.equal(result.kind, 'error');
  assert.equal(result.error, 'stale-origin');
  assert.equal(hub.origin, 'https://two.example.test');
});

test('Council 전달: 허브 상대 경로와 전체 주소, 틀린 안건은 invalid-input', async () => {
  const { hub } = hubFor({ origin: 'https://hub.example.test', state: { cookie: '' } });
  const ok = await hub.councilHandoff({ draft: '이번 분기 제품 방향 검토', source: 'memo' });
  assert.equal(ok.kind, 'live');
  assert.ok(ok.data.path.startsWith('/dashboard/agents/council#moonlight-council='));
  assert.equal(ok.data.url, `https://hub.example.test${ok.data.path}`);
  const bad = await hub.councilHandoff({ draft: 'x'.repeat(4001) });
  assert.equal(bad.error, 'invalid-input');
});

test('폴링은 주입한 타이머로 돌고 멈춘다', async () => {
  const intervals = [];
  let reads = 0;
  const hub = createPetHub({
    origin: 'https://hub.example.test',
    store: memoryStore(),
    fetch: async (url) => {
      if (url.includes('/api/hub/inquiries')) reads += 1;
      return new Response(JSON.stringify(url.includes('inquiries') ? { status: 'live', source: 'supabase', rows: [], unreadCount: 0 } : { status: 'live', events: [] }));
    },
    setInterval: (fn, ms) => { const entry = { fn, ms, stopped: false }; intervals.push(entry); return () => { entry.stopped = true; }; },
  });
  hub.startPolling();
  hub.startPolling();
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].ms, 60000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await intervals[0].fn();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(reads >= 2);
  assert.equal(hub.status, 'connected');
  hub.stopPolling();
  assert.equal(intervals[0].stopped, true);
});

test('알림 목록: 한 원천 실패는 partial, 모두 실패는 그 오류 — 빈 받은함으로 위장하지 않는다', async () => {
  let inquiriesDown = true;
  let calendarDown = false;
  const hub = createPetHub({
    origin: 'https://hub.example.test',
    store: memoryStore(),
    schedule: () => () => {},
    fetch: async (url) => {
      if (url.includes('/api/hub/inquiries')) {
        if (inquiriesDown) return new Response(JSON.stringify({ status: 'error', source: 'error' }));
        return new Response(JSON.stringify({ status: 'live', source: 'supabase', rows: [], unreadCount: 0 }));
      }
      if (calendarDown) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ status: 'live', events: [] }));
    },
  });
  const partial = await hub.noticesList();
  assert.equal(partial.kind, 'partial');
  assert.deepEqual(partial.data.sources, { inquiry: 'server', event: 'ok' });
  assert.match(partial.data.message, /^문의: /);
  calendarDown = true;
  await hub.tick();
  const down = await hub.noticesList();
  assert.equal(down.kind, 'error');
  assert.equal(down.error, 'server');
  assert.ok(down.data && Array.isArray(down.data.notices));
  inquiriesDown = false;
  calendarDown = false;
  await hub.tick();
  const live = await hub.noticesList();
  assert.equal(live.kind, 'live');
  assert.deepEqual(live.data.sources, { inquiry: 'ok', event: 'ok' });
  assert.equal(live.data.message, null);
});
