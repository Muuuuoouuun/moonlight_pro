'use strict';
// 셸이 쓰는 hub 객체 — 채널 봉투, 연결 상태 이벤트, 알림·배지·대화 이벤트, origin 전환, 실제 로컬 http 왕복.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createPetHub, statusFromEnvelope, channelMethod: hubChannelMethod, CHANNEL_METHODS } = require('./pet-hub');
const { resolveMainPath } = require('../../widget-window');
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
      if (url.pathname === '/api/operator/session' && req.method === 'POST' && body && body.action === 'logout') {
        if (req.headers.origin !== origin) return send(403, { status: 'forbidden', error: 'same-origin-required' });
        state.cookie = 'com_moon_operator_session=logged-out';
        return send(200, { status: 'logged_out' });
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
    assert.equal(first.data.badge, 1);
    assert.equal(first.data.badgeLabel, '1');
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
    assert.equal(session.data.busy, false);
    assert.equal(session.data.busyWith, null);
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

test('실제 http: 익명 세션은 hub-status 를 unauthorized 한 번만 보낸다(connected 를 거치지 않는다)', async () => {
  const double = await startHubDouble();
  try {
    const { hub, events } = hubFor(double, { cookieHeader: async () => '' });
    await hub.session();
    assert.deepEqual(events.filter(([n]) => n === 'pet:hub-status').map(([, p]) => p.status), ['unauthorized']);
    const authed = hubFor(double);
    await authed.hub.session();
    assert.deepEqual(authed.events.filter(([n]) => n === 'pet:hub-status').map(([, p]) => p.status), ['connected']);
  } finally {
    double.server.close();
  }
});

test('모든 허브 채널은 null·배열·원시값 payload 에도 던지지 않고 계약 봉투로 풀린다', async () => {
  const double = await startHubDouble();
  try {
    const hubChannels = PET_INVOKE.filter((c) => /^pet:(hub-session|tasks-|journal-|calendar-|notices-|chat-|council-)/.test(c));
    for (const origin of [double.origin, '']) {
      const { hub } = hubFor({ ...double, origin });
      for (const channel of hubChannels) {
        const method = channel === 'pet:hub-session' ? 'session' : channelMethod(channel);
        for (const payload of [null, [], 7, 'x', undefined]) {
          let envelope;
          try {
            envelope = await hub[method](payload);
          } catch (error) {
            assert.fail(`${channel}(${JSON.stringify(payload)}) threw ${error && error.message}`);
          }
          assert.ok(ENVELOPE_KINDS.includes(envelope.kind), `${channel}: ${envelope.kind}`);
          assert.deepEqual(Object.keys(envelope).sort(), ['data', 'error', 'httpStatus', 'kind']);
        }
      }
    }
  } finally {
    double.server.close();
  }
});

test('실제 http: journal-read 로 연 다른 메모를 고치면 그 메모에 쓴다(마지막 저장 메모로 새지 않는다)', async () => {
  const double = await startHubDouble();
  try {
    const { hub } = hubFor(double);
    const a = await hub.journalSave({ body: '펫 메모 A' });
    assert.equal(a.kind, 'live');
    const b = randomUUID();
    double.state.memos.set(b, { id: b, body: 'B 원문', title: 'B 제목', occurredAt: '2026-09-27T00:00:00Z', revision: 3, noteMeta: { kind: 'note', enhancement: '' }, contexts: [] });
    const read = await hub.journalRead({ entryId: b });
    assert.equal(read.data.entry.revision, 3);
    const saved = await hub.journalSave({ entryId: b, expectedRevision: read.data.entry.revision, body: 'B 를 고친 글' });
    assert.equal(saved.kind, 'live');
    assert.equal(saved.data.entry.id, b);
    assert.equal(saved.data.verified, true);
    assert.equal(double.state.memos.get(b).body, 'B 를 고친 글');
    assert.equal(double.state.memos.get(b).title, 'B 제목');
    assert.equal(double.state.memos.get(a.data.entry.id).body, '펫 메모 A');
    assert.equal(double.state.memos.get(a.data.entry.id).revision, 1);
  } finally {
    double.server.close();
  }
});

test('실제 http: 대화 busy 는 이 대화가 보내는 중일 때만 true, 보내는 대화는 busyWith', async () => {
  const double = await startHubDouble();
  try {
    double.state.chatDelay = 150;
    const { hub } = hubFor(double);
    const sending = hub.chatSend({ ownerId: 'eevee', scope: 'all', message: '느린 질문' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const same = await hub.chatSession({ ownerId: 'eevee', scope: 'all' });
    assert.equal(same.data.busy, true);
    const other = await hub.chatSession({ ownerId: 'sylveon', scope: 'personal' });
    assert.equal(other.data.busy, false, '다른 대화에는 스피너를 그리지 않는다');
    assert.deepEqual(other.data.busyWith, { ownerId: 'eevee', scope: 'all', message: '느린 질문' });
    await sending;
    const after = await hub.chatSession({ ownerId: 'eevee', scope: 'all' });
    assert.equal(after.data.busy, false);
    assert.equal(after.data.busyWith, null);
  } finally {
    double.server.close();
  }
});

test('실제 http: 로그인 필요 동안 폴링은 세션만 확인하고, 메인 창 로그인 뒤 원천을 다시 읽는다', async () => {
  const double = await startHubDouble();
  try {
    let cookie = '';
    const { hub, events } = hubFor(double, { cookieHeader: async () => cookie });
    await hub.tick();
    assert.equal(hub.status, 'unauthorized');
    const countSince = (start, path) => double.state.seen.slice(start).filter((s) => s.path === path).length;
    let mark = double.state.seen.length;
    await hub.tick();
    await hub.tick();
    assert.equal(countSince(mark, '/api/hub/inquiries'), 0, '401 을 쌓지 않는다');
    assert.equal(countSince(mark, '/api/calendar/google/event'), 0);
    assert.equal(countSince(mark, '/api/operator/session'), 2);
    cookie = double.state.cookie; // 메인 창에서 로그인
    mark = double.state.seen.length;
    const result = await hub.tick();
    assert.equal(hub.status, 'connected');
    assert.ok(!result.skipped && !result.probed);
    assert.equal(countSince(mark, '/api/operator/session'), 1);
    assert.equal(countSince(mark, '/api/hub/inquiries'), 1);
    const statuses = events.filter(([n]) => n === 'pet:hub-status').map(([, p]) => p.status);
    assert.deepEqual(statuses.slice(-2), ['unauthorized', 'connected']);
  } finally {
    double.server.close();
  }
});

const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

test('실제 http: 익명 세션에서 알림 목록은 빈 live 가 아니라 unauthorized 봉투(읽기 실패를 빈 상태로 위장하지 않는다)', async () => {
  const double = await startHubDouble();
  try {
    let cookie = '';
    const { hub } = hubFor(double, { cookieHeader: async () => cookie });
    const session = await hub.session();
    assert.equal(session.data.status, 'anonymous');
    const list = await hub.noticesList();
    assert.equal(list.kind, 'unauthorized');
    assert.equal(list.error, 'unauthorized');
    assert.equal(list.data.loaded, false);
    assert.deepEqual(list.data.notices, []);
    // 로그인 뒤: 목록 요청이 세션을 다시 확인하고 원천을 읽어 live 로 준다.
    double.state.inquiries = [inquiryRow()];
    double.state.unreadCount = 1;
    cookie = double.state.cookie;
    const live = await hub.noticesList();
    assert.equal(live.kind, 'live');
    assert.equal(live.data.loaded, true);
    assert.equal(live.data.totalInquiryCount, 1);
    // 다른 채널에서 로그인 필요가 확인되면 예전 목록을 live 로 주지 않는다.
    cookie = '';
    const tasks = await hub.tasksList();
    assert.equal(tasks.kind, 'unauthorized');
    const stale = await hub.noticesList();
    assert.equal(stale.kind, 'unauthorized');
    assert.equal(stale.data.totalInquiryCount, 1, '예전 목록은 data 로만, kind 는 실패');
  } finally {
    double.server.close();
  }
});

test('허브 로그인 미설정이면 알림 목록은 not-configured 봉투', async () => {
  const hub = createPetHub({
    origin: 'http://127.0.0.1:9',
    store: memoryStore(),
    fetch: async () => new Response(JSON.stringify({ status: 'anonymous', configured: false, reason: 'operator-login-not-configured' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    schedule: () => () => {},
  });
  await hub.session();
  assert.equal(hub.status, 'not-configured');
  const list = await hub.noticesList();
  assert.equal(hub.status, 'not-configured');
  assert.equal(list.kind, 'not-configured');
  assert.equal(list.error, 'operator-login-not-configured');
});

test('실제 http: 로그아웃이 성공하면 곧바로 unauthorized(연결됨으로 두지 않는다), Origin 을 붙인다', async () => {
  const double = await startHubDouble();
  try {
    const { hub, events } = hubFor(double, { cookieHeader: async () => double.state.cookie });
    await hub.session();
    assert.equal(hub.status, 'connected');
    const out = await hub.logout();
    assert.equal(out.kind, 'live');
    assert.equal(hub.status, 'unauthorized');
    assert.deepEqual(events.filter(([n]) => n === 'pet:hub-status').map(([, p]) => p.status), ['connected', 'unauthorized']);
    const post = double.state.seen.find((x) => x.method === 'POST' && x.path === '/api/operator/session');
    assert.equal(post.headers.origin, double.origin);
  } finally {
    double.server.close();
  }
});

test('실제 http: 할 일 추가가 실패해도 봉투 data.pending 으로 다시 보낼 할 일이 보인다', async () => {
  const double = await startHubDouble();
  try {
    let cookie = '';
    const { hub } = hubFor(double, { cookieHeader: async () => cookie });
    const failed = await hub.tasksAdd({ title: '로그인 전에 적은 일' });
    assert.equal(failed.kind, 'unauthorized');
    assert.equal(failed.data.pending.hasPendingTask, true);
    assert.equal(failed.data.pending.pendingTaskTitle, '로그인 전에 적은 일');
    cookie = double.state.cookie;
    const replay = await hub.tasksAdd({ title: '새 입력' });
    assert.equal(replay.kind, 'live');
    assert.equal(replay.data.title, '로그인 전에 적은 일');
    assert.equal(replay.data.pending.hasPendingTask, false);
    const invalid = await hub.tasksAdd({ title: '' });
    assert.equal(invalid.error, 'invalid-input');
    assert.equal(invalid.data.pending.hasPendingTask, false, '입력 거절에도 pending 요약');
  } finally {
    double.server.close();
  }
});

test('실제 http: 명시 편집 충돌은 그 메모만 막고 journal-read 로 다시 읽으면 풀린다, 캡처 저장은 계속 캡처 메모로', async () => {
  const double = await startHubDouble();
  try {
    const { hub } = hubFor(double);
    const a = (await hub.journalSave({ body: '캡처 A' })).data.entry.id;
    const b = randomUUID();
    double.state.memos.set(b, { id: b, body: 'B 원문', title: 'B', occurredAt: '2026-09-27T00:00:00Z', revision: 2, noteMeta: { kind: 'note', enhancement: '' }, contexts: [] });
    const stale = await hub.journalSave({ entryId: b, expectedRevision: 1, body: '낡은 B 편집' });
    assert.equal(stale.kind, 'conflict');
    assert.deepEqual(stale.data.pending.memoConflictIds, [b]);
    assert.equal(stale.data.pending.savedMemoId, a);
    const capture = await hub.journalSave({ body: '캡처 A 이어 쓰기' });
    assert.equal(capture.kind, 'live');
    assert.equal(capture.data.entry.id, a);
    const blocked = await hub.journalSave({ entryId: b, expectedRevision: 2, body: 'B 편집' });
    assert.equal(blocked.error, 'memo-conflict');
    const read = await hub.journalRead({ entryId: b });
    assert.equal(read.data.pending.memoConflict, false);
    const ok = await hub.journalSave({ entryId: b, expectedRevision: read.data.entry.revision, body: 'B 편집' });
    assert.equal(ok.kind, 'live');
    assert.equal(double.state.memos.get(b).body, 'B 편집');
    assert.equal(double.state.memos.get(a).body, '캡처 A 이어 쓰기');
  } finally {
    double.server.close();
  }
});

test('실제 http: 보고 있던 대화라도 office 모드를 떠나면(또는 leave) 답변은 reply 알림이 된다', async () => {
  const double = await startHubDouble();
  try {
    const shellState = { mode: 'office', panelOpen: true };
    const { hub, events } = hubFor(double, { isChatVisible: () => shellState.mode === 'office' && shellState.panelOpen });
    await hub.session();
    const who = { ownerId: 'glaceon', scope: 'personal' };
    await hub.chatSession(who);
    await hub.chatSend({ ...who, message: '보는 중' });
    assert.equal(hub.activity.list().notices.filter((n) => n.kind === 'reply').length, 0);
    shellState.mode = 'tasks'; // pet:set-mode 로 할 일 모드로 옮김 — 셸은 chatLeave 를 부르지 않았다
    await hub.chatSend({ ...who, message: '다른 모드로 옮긴 뒤' });
    assert.equal(hub.activity.list().notices.filter((n) => n.kind === 'reply').length, 1);
    shellState.mode = 'office';
    await hub.chatSession(who);
    const left = await hub.chatSession({ leave: true });
    assert.equal(left.kind, 'live');
    await hub.chatSend({ ...who, message: '떠난 뒤' });
    assert.equal(hub.activity.list().notices.filter((n) => n.kind === 'reply').length, 1, '다시 보면 앞 알림은 거두고, leave 뒤 답변은 새 알림');
    assert.ok(events.some(([n]) => n === 'pet:chat-reply'));
  } finally {
    double.server.close();
  }
});

test('Council 전달 경로는 셸의 open-hub 규칙(resolveMainPath)을 통과하고 조각을 보존한다', async () => {
  const { hub } = hubFor({ origin: 'https://hub.example.com', state: { cookie: '' } });
  const envelope = await hub.councilHandoff({ draft: '이번 주 우선순위를 같이 보자', source: 'memo' });
  assert.equal(envelope.kind, 'live');
  assert.ok(envelope.data.path.startsWith('/dashboard/agents/council#moonlight-council='));
  assert.equal(envelope.data.pathname + envelope.data.hash, envelope.data.path);
  const resolved = resolveMainPath(envelope.data.path, 'https://hub.example.com');
  assert.equal(resolved.ok, true);
  assert.equal(new URL(resolved.url).hash, envelope.data.hash);
  assert.equal(resolved.url, envelope.data.url);
});

// 셸 pet-main 이 하는 그대로: loadDefaultHub → createPetHub(ctx) → attach(ctx), 채널은 hub.invoke, 상태는 봉투로 먼저 정한다.
function fakeSession(cookieJar) {
  return {
    cookies: {
      get: async ({ url }) => (cookieJar.value && url.startsWith(cookieJar.origin) ? [{ name: 'com_moon_operator_session', value: cookieJar.value }] : []),
      set: async (details) => { cookieJar.value = details.value; },
      remove: async () => { cookieJar.value = ''; },
    },
  };
}

test('셸 hubContext 로 만들고 invoke 로 부른다 — 쿠키·이벤트·대화 표시·폴링을 ctx 에서 읽는다', async () => {
  const double = await startHubDouble();
  const intervals = [];
  try {
    const jar = { origin: double.origin, value: '' };
    const shellState = { mode: 'tasks', panelOpen: false, hubStatus: 'unknown' };
    const emitted = [];
    const ctx = {
      emit: (name, payload) => {
        emitted.push([name, payload]);
        if (name === 'pet:hub-status') shellState.hubStatus = payload.status;
        return true;
      },
      store: memoryStore(),
      getHubUrl: () => double.origin,
      session: fakeSession(jar),
      openMainUrl: () => {},
      getState: () => ({ ...shellState }),
      setInterval: (fn, ms) => { intervals.push(ms); return () => {}; },
    };
    // pet-main 의 loadDefaultHub 는 require('./pet-hub-client').createPetHub(ctx) 를 부른다.
    const clientModule = require('./pet-hub-client');
    assert.equal(typeof clientModule.createPetHub, 'function');
    const hub = clientModule.createPetHub(ctx);
    hub.attach(ctx);
    assert.deepEqual(intervals, [60000], 'attach 가 60초 폴링을 시작한다');
    // 셸 handler: callHub → 봉투로 상태(live=connected)를 정한다. 익명 세션이면 허브가 뒤이어 unauthorized 로 바로잡는다.
    const session = await hub.invoke('pet:hub-session', {});
    assert.equal(session.data.status, 'anonymous');
    shellState.hubStatus = 'connected'; // 셸 statusFromEnvelope(live) 의 결과를 흉내
    await settle();
    assert.equal(shellState.hubStatus, 'unauthorized');
    const list = await hub.invoke('pet:notices-list', {});
    assert.equal(list.kind, 'unauthorized');
    // 메인 창에서 로그인(같은 세션 쿠키) → 다음 호출부터 연결됨.
    jar.value = double.state.cookie.split('=')[1];
    const tasks = await hub.invoke('pet:tasks-list', {});
    assert.equal(tasks.kind, 'live');
    assert.equal(hub.status, 'connected');
    const seen = double.state.seen.find((x) => x.path === '/api/hub/tasks');
    assert.equal(seen.headers.cookie, double.state.cookie);
    // 대화: 패널이 닫힌 tasks 모드면 보고 있던 대화라도 답변은 알림.
    const who = { ownerId: 'glaceon', scope: 'all' };
    await hub.invoke('pet:chat-session', who);
    await hub.invoke('pet:chat-send', { ...who, message: '닫힌 패널' });
    assert.equal(hub.activity.list().notices.filter((n) => n.kind === 'reply').length, 1);
    shellState.mode = 'office';
    shellState.panelOpen = true;
    await hub.invoke('pet:chat-session', who);
    await hub.invoke('pet:chat-send', { ...who, message: '열린 대화' });
    assert.equal(hub.activity.list().notices.filter((n) => n.kind === 'reply').length, 0, '보고 있는 대화의 답은 알림이 아니다(앞 알림도 거둠)');
    assert.ok(emitted.some(([n]) => n === 'pet:chat-reply'));
    // 모르는 채널·셸 채널은 거절 봉투.
    assert.equal((await hub.invoke('pet:focus-start', { minutes: 25 })).error, 'invalid-input');
    assert.equal((await hub.invoke('nope', {})).error, 'invalid-input');
    // 허브 주소 변경.
    await hub.hubUrlChanged('');
    assert.equal(hub.status, 'not-configured');
    assert.equal((await hub.invoke('pet:tasks-list', {})).kind, 'not-configured');
    hub.dispose();
  } finally {
    double.server.close();
  }
});

test('invoke 채널표: 계약의 허브 채널 전부가 메서드로 이어진다', () => {
  const { PET_INVOKE } = require('../shared/contract');
  const hubChannels = PET_INVOKE.filter((c) => /^pet:(hub-session|tasks-|journal-|calendar-|notices-|chat-|council-)/.test(c));
  assert.deepEqual(hubChannels.map(hubChannelMethod).sort(), [...CHANNEL_METHODS].sort());
});
