'use strict';
// 테스트 전용 — 허브 계약만 흉내 내는 로컬 http 서버(패키징에서 빠진다: package.json build.files '!pet/**/test-support/**').
// 세션 쿠키가 없으면 401, 쓰기에 Origin 이 허브 origin 과 다르면 403(허브 hub-write-guard 와 같은 판정).
// 업무 데이터는 들고 있지 않다 — 테스트가 state 에 그때그때 넣는다.
const http = require('node:http');
const { randomUUID } = require('node:crypto');

const SESSION_COOKIE = 'com_moon_operator_session=operator-session';

function startHubDouble() {
  const state = {
    tasks: [], memos: new Map(), inquiries: [], unreadCount: 0, events: [], seen: [], chatDelay: 0, cookie: SESSION_COOKIE,
  };
  let stamp = 0;
  const nextStamp = () => `2026-09-27T01:02:${String(stamp += 1).padStart(2, '0')}.123456+00:00`;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      state.seen.push({ method: req.method, path: url.pathname, search: url.search, headers: req.headers, body });
      const send = (status, value) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(value));
      };
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (url.pathname === '/api/operator/session' && req.method === 'GET') {
        return send(200, { status: req.headers.cookie === state.cookie ? 'authenticated' : 'anonymous', configured: true, reason: null });
      }
      if (req.headers.cookie !== state.cookie) return send(401, { status: 'unauthorized' });
      if (req.method !== 'GET' && req.headers.origin !== origin) return send(403, { status: 'forbidden', error: 'same-origin-required' });
      if (url.pathname === '/api/hub/tasks') {
        if (req.method === 'GET') return send(200, { status: 'live', tasks: state.tasks });
        if (req.method === 'POST') {
          const task = { id: body.id, title: body.title, status: body.status, updated_at: nextStamp() };
          state.tasks.unshift(task);
          return send(200, { status: 'saved', task });
        }
        if (req.method === 'PATCH') {
          const task = state.tasks.find((t) => t.id === body.id);
          if (!task || task.updated_at !== body.expectedUpdatedAt) return send(409, { status: 'conflict', error: 'stale' });
          task.status = body.status;
          task.updated_at = nextStamp();
          return send(200, { status: 'saved', task });
        }
      }
      if (url.pathname === '/api/hub/journal') {
        if (req.method === 'GET') return send(200, { status: 'live', entry: state.memos.get(url.searchParams.get('note')) || null });
        const previous = state.memos.get(body.entryId);
        if ((previous ? previous.revision : 0) !== body.expectedRevision) return send(409, { status: 'conflict', error: 'revision-conflict' });
        const entry = {
          id: body.entryId, body: body.body, title: body.title, occurredAt: body.occurredAt, revision: body.expectedRevision + 1,
          noteMeta: body.noteMeta, contexts: body.contexts,
        };
        state.memos.set(body.entryId, entry);
        return send(200, { status: 'saved', entry });
      }
      if (url.pathname === '/api/calendar/google/event') return send(200, { status: 'live', events: state.events });
      if (url.pathname === '/api/hub/inquiries') {
        return send(200, { status: 'live', source: 'supabase', rows: state.inquiries, unreadCount: state.unreadCount });
      }
      if (url.pathname === '/api/hub/office/chat') {
        const reply = {
          status: 'generated', version: '2026-09-22.v3', ownerId: body.ownerId, mode: 'chat', scope: body.scope, lens: null, simulation: false,
          participants: [], answer: `${body.message}에 대한 답`, nextAction: '다음 행동',
          context: { source: 'provided', scope: body.scope, projects: [], note: '입력 기준' },
          log: { persisted: true, runId: randomUUID() }, businessWrites: false,
        };
        return setTimeout(() => send(200, reply), state.chatDelay);
      }
      return send(404, { status: 'error' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, origin: `http://127.0.0.1:${server.address().port}` })));
}

// 허브 문의 원장 한 행(미확인). seq 가 오르면 새 수신 메시지.
function inquiryRow(id = randomUUID(), seq = 3, subject = '새 제휴 문의') {
  return {
    id, subject, kind: 'partnership', status: 'new', classification: 'inquiry', sources: ['webhook'], unread: true,
    last_inbound_seq: seq, last_read_seq: 1, updated_at: '2026-09-27T00:00:00Z',
  };
}

module.exports = { startHubDouble, inquiryRow, SESSION_COOKIE };
