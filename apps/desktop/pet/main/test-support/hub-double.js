'use strict';
// 테스트 전용 — 허브 계약만 흉내 내는 fetch 대역(프로세스 안 함수 — 서버·포트를 열지 않는다. 패키징에서 빠진다:
// package.json build.files '!pet/**/test-support/**'). createPetHub({ ...ctx, fetch: double.fetch }) 로 꽂는다.
// 세션 쿠키가 없으면 401, 쓰기에 Origin 이 허브 origin 과 다르면 403(허브 hub-write-guard 와 같은 판정).
// origin 밖 주소는 연결 실패(TypeError 'fetch failed')로 답한다. 업무 데이터는 들고 있지 않다 — 테스트가 state 에 넣는다.
const { randomUUID } = require('node:crypto');

const SESSION_COOKIE = 'com_moon_operator_session=operator-session';
const DOUBLE_ORIGIN = 'http://127.0.0.1:3159';

function createHubDouble(origin = DOUBLE_ORIGIN) {
  const state = {
    tasks: [], memos: new Map(), inquiries: [], unreadCount: 0, events: [], seen: [], chatDelay: 0, cookie: SESSION_COOKIE,
  };
  let stamp = 0;
  const nextStamp = () => `2026-09-27T01:02:${String(stamp += 1).padStart(2, '0')}.123456+00:00`;
  const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

  async function fetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.origin !== origin) throw new TypeError('fetch failed');
    const method = String(init.method || 'GET').toUpperCase();
    const headerBag = new Headers(init.headers || {});
    const headers = Object.fromEntries(headerBag.entries());
    let body = null;
    try {
      body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    state.seen.push({ method, path: url.pathname, search: url.search, headers, body });
    if (url.pathname === '/api/operator/session' && method === 'GET') {
      return json(200, { status: headers.cookie === state.cookie ? 'authenticated' : 'anonymous', configured: true, reason: null });
    }
    if (headers.cookie !== state.cookie) return json(401, { status: 'unauthorized' });
    if (method !== 'GET' && headers.origin !== origin) return json(403, { status: 'forbidden', error: 'same-origin-required' });
    if (url.pathname === '/api/hub/tasks') {
      if (method === 'GET') return json(200, { status: 'live', tasks: state.tasks });
      if (method === 'POST') {
        const task = { id: body.id, title: body.title, status: body.status, updated_at: nextStamp() };
        state.tasks.unshift(task);
        return json(200, { status: 'saved', task });
      }
      if (method === 'PATCH') {
        const task = state.tasks.find((t) => t.id === body.id);
        if (!task || task.updated_at !== body.expectedUpdatedAt) return json(409, { status: 'conflict', error: 'stale' });
        task.status = body.status;
        task.updated_at = nextStamp();
        return json(200, { status: 'saved', task });
      }
    }
    if (url.pathname === '/api/hub/journal') {
      if (method === 'GET') return json(200, { status: 'live', entry: state.memos.get(url.searchParams.get('note')) || null });
      const previous = state.memos.get(body.entryId);
      if ((previous ? previous.revision : 0) !== body.expectedRevision) return json(409, { status: 'conflict', error: 'revision-conflict' });
      const entry = {
        id: body.entryId, body: body.body, title: body.title, occurredAt: body.occurredAt, revision: body.expectedRevision + 1,
        noteMeta: body.noteMeta, contexts: body.contexts,
      };
      state.memos.set(body.entryId, entry);
      return json(200, { status: 'saved', entry });
    }
    if (url.pathname === '/api/calendar/google/event') return json(200, { status: 'live', events: state.events });
    if (url.pathname === '/api/hub/inquiries') {
      return json(200, { status: 'live', source: 'supabase', rows: state.inquiries, unreadCount: state.unreadCount });
    }
    if (url.pathname === '/api/hub/office/chat') {
      if (state.chatDelay) await new Promise((resolve) => setTimeout(resolve, state.chatDelay));
      return json(200, {
        status: 'generated', version: '2026-09-22.v3', ownerId: body.ownerId, mode: 'chat', scope: body.scope, lens: null, simulation: false,
        participants: [], answer: `${body.message}에 대한 답`, nextAction: '다음 행동',
        context: { source: 'provided', scope: body.scope, projects: [], note: '입력 기준' },
        log: { persisted: true, runId: randomUUID() }, businessWrites: false,
      });
    }
    return json(404, { status: 'error' });
  }

  return { state, origin, fetch };
}

// 허브 문의 원장 한 행(미확인). seq 가 오르면 새 수신 메시지.
function inquiryRow(id = randomUUID(), seq = 3, subject = '새 제휴 문의') {
  return {
    id, subject, kind: 'partnership', status: 'new', classification: 'inquiry', sources: ['webhook'], unread: true,
    last_inbound_seq: seq, last_read_seq: 1, updated_at: '2026-09-27T00:00:00Z',
  };
}

module.exports = { createHubDouble, inquiryRow, SESSION_COOKIE, DOUBLE_ORIGIN };
