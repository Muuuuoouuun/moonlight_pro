'use strict';
// Mac Tests/HubAPIContractTests · HubActivityContractTests · OfficeChatContractTests · HubDomainTests(model) 이식.
// 응답은 모두 메모리 대역 — 네트워크·허브 기록을 건드리지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createHubClient } = require('./pet-hub-client');
const {
  createHubApi, taskCommand, memoCommand, weekBounds, eventOccursOn, decodeEvent, localDateKey, OFFICE_OWNERS,
} = require('./pet-hub-api');
const { CHARACTERS } = require('../shared/contract');

const HUB = 'https://hub.example.test';
const STAMP = '2026-09-25T01:02:03.123456+00:00';

// replies: 응답 JSON(200) | { status, body } | Error(던짐). 기록: { method, path, body }
function scripted(replies) {
  const queue = [...replies];
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname + u.search, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    if (!queue.length) throw new Error(`예상 밖 허브 요청: ${init.method} ${u.pathname}${u.search}`);
    const next = queue.shift();
    if (next instanceof Error) throw next;
    const { status = 200, body = next } = next && next.__http ? next : { body: next };
    return new Response(JSON.stringify(body), { status });
  };
  const api = createHubApi(createHubClient({ origin: HUB, fetch }));
  return { api, calls };
}
const http = (status, body) => ({ __http: true, status, body });

async function rejects(promise, kind, error) {
  await assert.rejects(promise, (e) => {
    assert.equal(e.kind, kind, `kind ${e.kind} (${e.error})`);
    if (error) assert.equal(e.error, error);
    return true;
  });
}

const taskJSON = (id, { title = '할 일 계약 확인', status = 'todo', key = 'updatedAt' } = {}) => ({ id, title, status, [key]: STAMP });

function memoJSON(command, { body, revision, id } = {}) {
  return {
    id: id ?? command.entryId, body: body ?? command.body, title: command.title, occurredAt: command.occurredAt,
    revision: revision ?? command.expectedRevision + 1, noteMeta: command.noteMeta, contexts: command.contexts,
  };
}

// ── 할 일 ────────────────────────────────────────────────────────────
test('할 일 읽기: updatedAt/updated_at 모두 마이크로초·오프셋을 그대로 보존', async () => {
  const id = randomUUID();
  for (const key of ['updatedAt', 'updated_at']) {
    const { api, calls } = scripted([{ status: 'live', tasks: [taskJSON(id.toUpperCase(), { key })] }]);
    const page = await api.tasks();
    assert.equal(page.tasks.length, 1);
    assert.equal(page.tasks[0].id, id);
    assert.equal(page.tasks[0].updatedAt, STAMP);
    assert.equal(page.partial, false);
    assert.deepEqual(calls[0], { method: 'GET', path: '/api/hub/tasks', body: undefined });
  }
});

test('할 일 partial 은 구별된다', async () => {
  for (const envelope of [{ status: 'partial', tasks: [] }, { status: 'live', partial: true, tasks: [] }]) {
    const { api } = scripted([envelope]);
    assert.equal((await api.tasks()).partial, true);
  }
});

test('preview·error·알 수 없는 상태는 빈 성공이 되지 않는다', async () => {
  const expectations = [
    [{ status: 'preview', tasks: [] }, 'preview'], [{ status: 'live', source: 'preview', tasks: [] }, 'preview'],
    [{ status: 'error', tasks: [] }, 'error'], [{ status: 'unknown', tasks: [] }, 'error'],
    [{ status: 'ok', source: 'error', tasks: [] }, 'error'], [{ status: 'live', tasks: [{ id: 'not-a-uuid', title: 'x', status: 'todo' }] }, 'invalid'],
  ];
  for (const [envelope, kind] of expectations) {
    const { api } = scripted([envelope]);
    await rejects(api.tasks(), kind);
  }
});

test('할 일 생성: saved·duplicate 영수증이 id·제목·상태와 맞아야 한다', async () => {
  const command = taskCommand('할 일 계약 확인');
  assert.match(command.id, /^[0-9a-f-]{36}$/);
  for (const status of ['saved', 'duplicate']) {
    const { api, calls } = scripted([{ status, task: taskJSON(command.id, { key: 'updated_at' }) }]);
    const task = await api.createTask(command);
    assert.equal(task.id, command.id);
    assert.equal(task.title, command.title);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/api/hub/tasks');
    assert.deepEqual(calls[0].body, { id: command.id, title: '할 일 계약 확인', status: 'todo', source: 'desktop-pet' });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(command)), command, '보류 저장 뒤에도 같은 명령');
});

test('할 일 영수증 거절 — 없음·preview·다른 id·다른 제목·다른 상태', async () => {
  const command = taskCommand('할 일 계약 확인');
  const bad = [
    [{ status: 'saved' }, 'error'], [{ status: 'preview', task: taskJSON(command.id) }, 'preview'],
    [{ status: 'saved', task: taskJSON(randomUUID()) }, 'error'], [{ status: 'saved', task: taskJSON(command.id, { title: '다른 내용' }) }, 'error'],
    [{ status: 'saved', task: taskJSON(command.id, { status: 'done' }) }, 'error'],
  ];
  for (const [receipt, kind] of bad) {
    const { api } = scripted([receipt]);
    await rejects(api.createTask(command), kind);
  }
  const { api, calls } = scripted([]);
  for (const title of ['', '   ', 'x'.repeat(301)]) await rejects(api.createTask({ ...command, title }), 'error', 'invalid-input');
  await api.createTask({ ...command, title: '가'.repeat(300) }).catch(() => {});
  assert.equal(calls.length, 1, '300자는 보낸다(대역 응답 없음으로 실패)');
});

test('할 일 완료: PATCH 세 키만, expectedUpdatedAt 은 원문 그대로', async () => {
  const id = randomUUID();
  const { api, calls } = scripted([{ status: 'saved', task: taskJSON(id, { status: 'done', key: 'updated_at' }) }]);
  const saved = await api.setTask({ id, updatedAt: STAMP }, true);
  assert.equal(saved.status, 'done');
  assert.equal(calls[0].method, 'PATCH');
  assert.deepEqual(calls[0].body, { id, status: 'done', expectedUpdatedAt: STAMP });
});

test('버전 없는 할 일은 보내지 않고, 409 는 새 버전으로 몰래 재시도하지 않는다', async () => {
  const id = randomUUID();
  const none = scripted([]);
  await rejects(none.api.setTask({ id, updatedAt: null }, true), 'conflict', 'missing-version');
  assert.equal(none.calls.length, 0);
  const conflict = scripted([http(409, { status: 'conflict' })]);
  await rejects(conflict.api.setTask({ id, updatedAt: STAMP }, true), 'conflict');
  assert.equal(conflict.calls.length, 1);
  const mismatch = scripted([{ status: 'saved', task: taskJSON(id, { status: 'todo' }) }]);
  await rejects(mismatch.api.setTask({ id, updatedAt: STAMP }, true), 'error', 'save-not-verified');
});

// ── 메모 ─────────────────────────────────────────────────────────────
test('메모 저장: 영수증과 같은 id 재조회가 일치해야 verified', async () => {
  const command = memoCommand('  원문 유지\n두 번째 줄 🌓  ', null);
  for (const status of ['saved', 'duplicate']) {
    const entry = memoJSON(command);
    const { api, calls } = scripted([{ status, entry }, { status: 'live', entry }]);
    const saved = await api.saveMemo(command);
    assert.equal(saved.id, command.entryId);
    assert.equal(saved.body, command.body);
    assert.equal(saved.revision, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual([calls[0].method, calls[0].path], ['POST', '/api/hub/journal']);
    assert.deepEqual([calls[1].method, calls[1].path], ['GET', `/api/hub/journal?note=${command.entryId}`]);
    assert.equal(calls[0].body.requestId, command.requestId.toLowerCase());
    assert.equal(calls[0].body.entryId, command.entryId.toLowerCase());
    assert.equal(calls[0].body.body, command.body, '공백 보존');
    assert.equal(calls[0].body.occurredAt, command.occurredAt);
    assert.equal(calls[0].body.expectedRevision, 0);
    assert.deepEqual(calls[0].body.noteMeta, { kind: 'note', enhancement: '' });
    assert.deepEqual(calls[0].body.contexts, []);
    assert.equal(calls[0].body.action, 'save');
  }
  assert.match(command.occurredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('재조회의 id·본문·revision 불일치, preview·error 재조회는 저장 확인이 아니다', async () => {
  const command = memoCommand('원문', null);
  const entry = memoJSON(command);
  for (const detail of [memoJSON(command, { body: '다른 원문' }), memoJSON(command, { revision: 2 }), memoJSON(command, { id: randomUUID() })]) {
    const { api } = scripted([{ status: 'saved', entry }, { status: 'live', entry: detail }]);
    await assert.rejects(api.saveMemo(command));
  }
  for (const status of ['preview', 'error']) {
    const { api } = scripted([{ status: 'saved', entry }, { status, entry }]);
    await assert.rejects(api.saveMemo(command));
  }
});

test('영수증이 없거나 어긋나면 재조회 전에 실패', async () => {
  const command = memoCommand('원문', null);
  const receipts = [
    { status: 'saved' }, { status: 'preview' }, { status: 'conflict', entry: memoJSON(command, { body: 'Hub 변경' }) },
    { status: 'duplicate', entry: memoJSON(command, { body: '나중에 Hub에서 수정' }) }, { status: 'saved', entry: memoJSON(command, { id: randomUUID() }) },
  ];
  for (const receipt of receipts) {
    const { api, calls } = scripted([receipt]);
    await assert.rejects(api.saveMemo(command));
    assert.equal(calls.length, 1);
  }
});

test('기존 메모 편집은 제목·날짜·메타·맥락을 보존하고 최신 revision 을 쓴다', async () => {
  const previous = {
    id: randomUUID(), body: '이전 원문', title: '기존 제목', occurredAt: '2026-09-24T03:04:05.123456+09:00', revision: 4,
    noteMeta: { kind: 'idea', enhancement: '기존 보강', tags: ['기록', '검토'] }, contexts: [{ type: 'project', id: randomUUID() }],
  };
  const command = memoCommand('수정 원문', previous);
  assert.deepEqual(JSON.parse(JSON.stringify(command)), command, '재시작 뒤에도 같은 명령');
  const entry = memoJSON(command);
  const { api, calls } = scripted([{ status: 'saved', entry }, { status: 'live', entry }]);
  const saved = await api.saveMemo(command);
  const sent = calls[0].body;
  assert.deepEqual(sent.noteMeta, previous.noteMeta);
  assert.deepEqual(sent.contexts, previous.contexts);
  assert.equal(sent.title, previous.title);
  assert.equal(sent.occurredAt, previous.occurredAt);
  assert.equal(sent.expectedRevision, 4);
  assert.equal(sent.entryId, previous.id);
  assert.equal(sent.body, '수정 원문');
  assert.equal(saved.revision, 5);
  assert.deepEqual(saved.noteMeta, previous.noteMeta);
});

test('revision 이 기대치를 넘지 않으면 저장 증거가 아니다', async () => {
  const command = memoCommand('원문', null);
  for (const revision of [0, -1]) {
    const entry = memoJSON(command, { revision });
    const { api } = scripted([{ status: 'saved', entry }, { status: 'live', entry }]);
    await assert.rejects(api.saveMemo(command));
  }
  const previous = { id: randomUUID(), body: '이전', title: '', occurredAt: command.occurredAt, revision: 4, noteMeta: command.noteMeta, contexts: [] };
  const edit = memoCommand('수정', previous);
  const unchanged = memoJSON(edit, { revision: 4 });
  const { api } = scripted([{ status: 'saved', entry: unchanged }, { status: 'live', entry: unchanged }]);
  await rejects(api.saveMemo(edit), 'conflict');
});

test('바뀐 duplicate 는 conflict, 남의 영수증은 save-not-verified', async () => {
  const command = memoCommand('충돌 분류', null);
  const changed = scripted([{ status: 'duplicate', entry: memoJSON(command, { body: '원격 변경' }) }]);
  await rejects(changed.api.saveMemo(command), 'conflict', 'memo-conflict');
  const unrelated = scripted([{ status: 'saved', entry: memoJSON(command, { id: randomUUID() }) }]);
  await rejects(unrelated.api.saveMemo(command), 'error', 'save-not-verified');
  const empty = scripted([]);
  await rejects(empty.api.saveMemo({ ...command, body: ' \n' }), 'error', 'invalid-input');
  await rejects(empty.api.saveMemo({ ...command, body: 'x'.repeat(20001) }), 'error', 'invalid-input');
  assert.equal(empty.calls.length, 0);
});

// ── 일정 ─────────────────────────────────────────────────────────────
test('일정: partial 유지, 출처가 다른 같은 id 는 key 로 구별, 정확한 범위 전송', async () => {
  const from = new Date('2026-09-20T15:00:00Z');
  const to = new Date('2026-09-27T15:00:00Z');
  const events = [
    { id: 'same-id', source: 'personal', title: '개인 일정', start: '2026-09-25T09:00:00+09:00', end: '2026-09-25T10:00:00+09:00', allDay: false },
    { id: 'same-id', source: 'company', title: '업무 일정', start: '2026-09-25T11:00:00+09:00', end: '2026-09-25T12:00:00+09:00', allDay: false },
  ];
  const { api, calls } = scripted([{ status: 'partial', events }]);
  const page = await api.calendar(from, to);
  assert.equal(page.partial, true);
  assert.deepEqual(page.events.map((e) => e.key), ['personal:same-id', 'company:same-id']);
  const url = new URL(calls[0].path, HUB);
  assert.equal(calls[0].method, 'GET');
  assert.equal(url.pathname, '/api/calendar/google/event');
  assert.equal(url.searchParams.get('timeMin'), '2026-09-20T15:00:00Z');
  assert.equal(url.searchParams.get('timeMax'), '2026-09-27T15:00:00Z');
});

test('일정 형식이 틀리면 invalid (시간대 없는 시각, 깨진 종일 날짜)', async () => {
  for (const row of [
    { id: 'a', title: 't', start: '2026-09-25T09:00:00', allDay: false },
    { id: 'a', title: 't', start: '2026-13-40', allDay: true },
    { id: 'a', title: 't', start: '2026-09-25T09:00:00Z', end: 'nope', allDay: false },
    { id: 'a', title: 't', start: '2026-09-25T09:00:00Z' },
  ]) {
    const { api } = scripted([{ status: 'live', events: [row] }]);
    await rejects(api.calendar(new Date(), new Date()), 'invalid');
  }
});

test('종일 일정은 이 PC 날짜에서 시작하고 end 는 배타', () => {
  const event = decodeEvent({ id: 'x', title: '날짜 경계', start: '2026-09-25T00:00:00', end: '2026-09-27T00:00:00', allDay: true });
  const first = new Date(2026, 8, 25).getTime();
  assert.equal(event.start, '2026-09-25');
  assert.equal(event.end, '2026-09-27');
  assert.equal(eventOccursOn(event, first), true);
  assert.equal(eventOccursOn(event, new Date(2026, 8, 26).getTime()), true);
  assert.equal(eventOccursOn(event, new Date(2026, 8, 27).getTime()), false);
  const single = decodeEvent({ id: 'y', title: '하루', start: '2026-09-25', allDay: true });
  assert.equal(eventOccursOn(single, first), true);
  assert.equal(eventOccursOn(single, new Date(2026, 8, 26).getTime()), false);
});

test('주는 월요일 00:00 ~ 다음 월요일, 일요일도 같은 주', () => {
  const sunday = weekBounds('2026-09-27');
  assert.equal(localDateKey(sunday.start), '2026-09-21');
  assert.equal(localDateKey(sunday.end), '2026-09-28');
  const monday = weekBounds('2026-09-21');
  assert.equal(monday.start, sunday.start);
  assert.equal(new Date(monday.start).getHours(), 0);
  assert.equal(new Date(monday.start).getDay(), 1);
  assert.throws(() => weekBounds('not-a-date'));
});

test('calendarWeek: 주 범위로 조회하고 각 일정이 걸친 날짜를 붙인다', async () => {
  const events = [
    { id: 'm', source: 'google', title: '종일 이틀', start: '2026-09-26', end: '2026-09-28', allDay: true },
    { id: 't', source: 'google', title: '회의', start: new Date(2026, 8, 23, 10).toISOString(), end: new Date(2026, 8, 23, 11).toISOString(), allDay: false },
  ];
  const { api, calls } = scripted([{ status: 'live', events }]);
  const week = await api.calendarWeek('2026-09-24');
  const url = new URL(calls[0].path, HUB);
  assert.equal(url.searchParams.get('timeMin'), new Date(2026, 8, 21).toISOString().replace('.000Z', 'Z'));
  assert.equal(url.searchParams.get('timeMax'), new Date(2026, 8, 28).toISOString().replace('.000Z', 'Z'));
  assert.equal(week.weekStart, '2026-09-21');
  assert.equal(week.status, 'live');
  const byId = Object.fromEntries(week.events.map((e) => [e.id, e]));
  assert.deepEqual(byId.m.dates, ['2026-09-26', '2026-09-27']);
  assert.deepEqual(byId.t.dates, ['2026-09-23']);
  assert.deepEqual(week.events.map((e) => e.id), ['t', 'm'], '시작 순');
});

// ── 문의 ─────────────────────────────────────────────────────────────
function inquiryRow(id = randomUUID(), sequence = 4) {
  return {
    id: id.toUpperCase(), subject: '문의 계약 검증', kind: 'support', status: 'new', classification: 'inquiry', sources: ['gmail'],
    unread: true, last_inbound_seq: sequence, last_read_seq: 1, updated_at: STAMP, received_at: '2026-09-25T01:02:00Z',
  };
}
const inquiryPage = (rows, { count, status = 'live', source = 'supabase' } = {}) => ({ status, source, rows, unreadCount: count ?? rows.length });

test('문의: 정확한 전체 수는 25행 미리보기와 별개, 알림 키는 수신 순번', async () => {
  const id = randomUUID();
  const { api, calls } = scripted([inquiryPage([inquiryRow(id)], { count: 42 })]);
  const page = await api.inquiries();
  assert.equal(page.unreadCount, 42);
  assert.equal(page.inquiries.length, 1);
  assert.deepEqual(calls[0], { method: 'GET', path: '/api/hub/inquiries?filter=unread&pageSize=25', body: undefined });
  const item = page.inquiries[0];
  assert.equal(item.id, id);
  assert.equal(item.title, '문의 계약 검증');
  assert.equal(item.subtitle, '지원 문의 · 메일');
  assert.ok(item.updatedAt);
  assert.equal(item.token, `inquiry:${id}:4`);
  assert.equal(item.path, `/dashboard/revenue/inquiries?inquiry=${id}`);
});

test('문의: 확인된 live 0 만 빈 받은함, 나머지 상태는 성공이 아니다', async () => {
  const empty = scripted([inquiryPage([])]);
  assert.deepEqual(await empty.api.inquiries(), { inquiries: [], unreadCount: 0 });
  for (const status of ['partial', 'error', 'unknown']) {
    const { api } = scripted([inquiryPage([], { status })]);
    await assert.rejects(api.inquiries());
  }
  for (const source of ['error', 'unknown']) {
    const { api } = scripted([inquiryPage([], { source })]);
    await assert.rejects(api.inquiries());
  }
  for (const envelope of [inquiryPage([], { status: 'preview' }), inquiryPage([], { source: 'preview' })]) {
    const { api } = scripted([envelope]);
    await rejects(api.inquiries(), 'preview');
  }
});

test('문의: 인증·네트워크·오류 봉투는 그대로 전해진다', async () => {
  const cases = [[http(401, { status: 'unauthorized' }), 'unauthorized'], [new TypeError('fetch failed'), 'error'], [{ status: 'ok', source: 'error' }, 'error']];
  for (const [reply, kind] of cases) {
    const { api } = scripted([reply]);
    await rejects(api.inquiries(), kind);
  }
});

test('문의: 새 수신 메시지만 알림 키를 바꾼다', async () => {
  const id = randomUUID();
  const first = inquiryRow(id);
  const edited = { ...first, updated_at: '2026-09-25T02:03:04Z', subject: '분류 수정 뒤 제목', kind: 'sales' };
  const readEdited = { ...first, last_read_seq: 2 };
  const tokens = [];
  for (const row of [first, edited, readEdited, inquiryRow(id, 5)]) {
    const { api } = scripted([inquiryPage([row])]);
    tokens.push((await api.inquiries()).inquiries[0].token);
  }
  assert.equal(tokens[0], tokens[1]);
  assert.equal(tokens[0], tokens[2]);
  assert.notEqual(tokens[0], tokens[3]);
});

test('문의: 신뢰할 수 없는 id 는 이동 대상이 되지 않고, 서버 URL 은 무시', async () => {
  for (const badId of ['https://elsewhere.test/', '../settings', `${randomUUID()}&next=https://elsewhere.test`, 'not-a-uuid']) {
    const { api } = scripted([inquiryPage([{ ...inquiryRow(), id: badId }])]);
    await assert.rejects(api.inquiries());
  }
  const { api } = scripted([inquiryPage([{ ...inquiryRow(), href: 'https://elsewhere.test/', source_url: 'file:///private/ignored' }])]);
  const item = (await api.inquiries()).inquiries[0];
  assert.ok(item.path.startsWith('/dashboard/revenue/inquiries?inquiry='));
  assert.ok(!item.path.includes('elsewhere'));
});

test('문의: 잘못된 행·중복·개수는 닫힌 실패', async () => {
  const mutations = [
    ['unread', false], ['last_inbound_seq', 0], ['last_inbound_seq', 9007199254740992], ['last_read_seq', -1], ['last_read_seq', 4],
    ['subject', ' \n '], ['status', 'closed'], ['classification', 'ignored'], ['updated_at', 'invalid-date'], ['kind', 'spam'],
    ['sources', ['fax']], ['last_inbound_seq', 4.5],
  ];
  for (const [field, value] of mutations) {
    const { api } = scripted([inquiryPage([{ ...inquiryRow(), [field]: value }])]);
    await assert.rejects(api.inquiries(), `${field}=${JSON.stringify(value)}`);
  }
  const row = inquiryRow();
  const duplicate = scripted([inquiryPage([row, row])]);
  await assert.rejects(duplicate.api.inquiries());
  for (const count of [-1, 0]) {
    const { api } = scripted([inquiryPage([inquiryRow()], { count })]);
    await assert.rejects(api.inquiries());
  }
  const tooMany = scripted([inquiryPage(Array.from({ length: 26 }, () => inquiryRow()))]);
  await assert.rejects(tooMany.api.inquiries());
});

test('문의: updated_at 이 없으면 received_at, 둘 다 없으면 날짜 모름', async () => {
  const row = inquiryRow();
  delete row.updated_at;
  const fallback = scripted([inquiryPage([row])]);
  assert.equal((await fallback.api.inquiries()).inquiries[0].updatedAt, '2026-09-25T01:02:00.000Z');
  delete row.received_at;
  const undated = scripted([inquiryPage([row])]);
  assert.equal((await undated.api.inquiries()).inquiries[0].updatedAt, null);
});

// ── Office 대화 ──────────────────────────────────────────────────────
function officeResponse(owner = 'sylveon', scope = 'personal') {
  return {
    status: 'generated', version: '2026-09-22.v3', ownerId: owner, mode: 'chat', scope, lens: null, simulation: false,
    participants: [], answer: '원문의 목적부터 한 문장으로 정리해 주세요.', nextAction: '독자와 전달할 내용을 적어 주세요.',
    context: { source: 'provided', scope, projects: [], note: '입력한 내용만 참고합니다.' },
    log: { persisted: false, runId: null }, businessWrites: false,
  };
}
const command = { ownerId: 'sylveon', scope: 'personal', message: '문장을 다듬어 주세요 🌸', history: [] };

test('대화 요청: 서버가 받는 키만, 한 번만, 담당·범위·원문 보존', async () => {
  const question = '  한글 / 링크? 🧑🏽‍💻\n"인용" & <문장>  ';
  const history = [{ role: 'user', text: '이전 질문 🌙' }, { role: 'assistant', text: '지난 답변\n두 줄' }];
  const { api, calls } = scripted([officeResponse()]);
  const reply = await api.officeChat({ ownerId: 'sylveon', scope: 'personal', message: question, history });
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].method, calls[0].path], ['POST', '/api/hub/office/chat']);
  const body = calls[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['history', 'includeProjects', 'lens', 'message', 'mode', 'ownerId', 'participants', 'scope']);
  assert.equal(body.ownerId, 'sylveon');
  assert.equal(body.mode, 'chat');
  assert.equal(body.scope, 'personal');
  assert.equal(body.lens, null);
  assert.equal(body.includeProjects, false);
  assert.deepEqual(body.participants, []);
  assert.equal(body.message, question);
  assert.deepEqual(body.history, history);
  assert.equal(reply.answer, officeResponse().answer);
  assert.equal(reply.persisted, false);
  assert.equal(reply.runId, null);
});

test('아홉 담당 모두 선택 가능, 범위 ID 는 허브 계약과 같다', async () => {
  assert.deepEqual(OFFICE_OWNERS, CHARACTERS.map((c) => c.officeId));
  assert.equal(new Set(OFFICE_OWNERS).size, 9);
  assert.deepEqual(CHARACTERS.map((c) => c.name), ['이브이', '샤미드', '쥬피썬더', '부스터', '에브이', '블래키', '리피아', '글레이시아', '님피아']);
  for (const owner of OFFICE_OWNERS) {
    const { api } = scripted([officeResponse(owner, 'classin')]);
    await api.officeChat({ ownerId: owner, scope: 'classin', message: '계약 확인' });
  }
});

test('실행 기록 메타가 모순되면 닫힌 실패, 유효한 runId 는 소문자', async () => {
  const id = randomUUID().toUpperCase();
  const ok = scripted([{ ...officeResponse(), log: { persisted: true, runId: id } }]);
  const reply = await ok.api.officeChat(command);
  assert.equal(reply.persisted, true);
  assert.equal(reply.runId, id.toLowerCase());
  for (const log of [{ persisted: true, runId: null }, { persisted: true, runId: 'not-a-uuid' }, { persisted: false, runId: id }, { runId: null }]) {
    const { api } = scripted([{ ...officeResponse(), log }]);
    await rejects(api.officeChat(command), 'invalid');
  }
});

test('남의 권한 필드·누락 필드·Council 필드는 이 담당의 답이 아니다', async () => {
  const mutations = [['ownerId', 'umbreon'], ['scope', 'classin'], ['version', 'next-version'], ['mode', 'council'], ['simulation', true],
    ['participants', ['sylveon']], ['lens', 'legend'], ['businessWrites', true]];
  for (const [key, value] of mutations) {
    const { api } = scripted([{ ...officeResponse(), [key]: value }]);
    await rejects(api.officeChat(command), 'invalid');
  }
  for (const key of ['lens', 'version', 'simulation', 'participants', 'businessWrites', 'context', 'log']) {
    const body = officeResponse();
    delete body[key];
    const { api } = scripted([body]);
    await rejects(api.officeChat(command), 'invalid');
  }
  for (const key of ['recommendation', 'evidence', 'dissent', 'discussion']) {
    const { api } = scripted([{ ...officeResponse(), [key]: null }]);
    await rejects(api.officeChat(command), 'invalid');
  }
});

test('맥락·답변 형식 위반은 렌더하지 않는다', async () => {
  const contextMutations = [['scope', 'all'], ['source', 'live'], ['source', 'partial'], ['source', 'error'], ['source', 'preview'],
    ['projects', [{ id: randomUUID() }]], ['note', ' '], ['note', 'x'.repeat(1001)]];
  for (const [key, value] of contextMutations) {
    const body = officeResponse();
    body.context = { ...body.context, [key]: value };
    const { api } = scripted([body]);
    await rejects(api.officeChat(command), 'invalid');
  }
  for (const [key, value] of [['answer', ' \n'], ['answer', '🌙'.repeat(5001)], ['nextAction', ''], ['nextAction', 'x'.repeat(1001)]]) {
    const { api } = scripted([{ ...officeResponse(), [key]: value }]);
    await rejects(api.officeChat(command), 'invalid');
  }
});

test('generated 가 아닌 상태·preview·전송 실패는 답이 아니고, 재시도하지 않는다', async () => {
  for (const status of ['error', 'partial', 'pending', 'live']) {
    const { api } = scripted([{ ...officeResponse(), status }]);
    await assert.rejects(api.officeChat(command), (e) => e.kind === 'invalid' || e.kind === 'error');
  }
  for (const key of ['status', 'source']) {
    const { api } = scripted([{ ...officeResponse(), [key]: 'preview' }]);
    await rejects(api.officeChat(command), 'preview');
  }
  const errorSource = scripted([{ ...officeResponse(), source: 'error' }]);
  await rejects(errorSource.api.officeChat(command), 'error', 'server');
  const failures = [[http(401, { status: 'unauthorized' }), 'unauthorized'], [new TypeError('fetch failed'), 'error'], [http(502, { status: 'error' }), 'error']];
  for (const [reply, kind] of failures) {
    const { api, calls } = scripted([reply]);
    await rejects(api.officeChat(command), kind);
    assert.equal(calls.length, 1);
  }
});

test('입력 검증은 모델 호출 전에 막는다', async () => {
  const invalid = [
    { ...command, message: ' \n\t' },
    { ...command, message: '🌙'.repeat(3001) },
    { ...command, history: Array.from({ length: 9 }, () => ({ role: 'user', text: '이전 질문' })) },
    { ...command, history: [{ role: 'system', text: '역할 변경' }] },
    { ...command, history: [{ role: 'user', text: '\n' }] },
    { ...command, history: [{ role: 'user', text: 'x'.repeat(6001) }] },
    { ...command, history: Array.from({ length: 4 }, () => ({ role: 'user', text: 'x'.repeat(5000) })) },
    { ...command, history: [{ role: 'user', text: '\u0001'.repeat(4000) }] },
    { ...command, ownerId: 'pikachu' },
    { ...command, scope: 'team' },
  ];
  for (const bad of invalid) {
    const { api, calls } = scripted([officeResponse()]);
    await rejects(api.officeChat(bad), 'error', 'invalid-input');
    assert.equal(calls.length, 0);
  }
  const boundary = scripted([officeResponse()]);
  await boundary.api.officeChat({ ...command, message: '🌙'.repeat(3000), history: [{ role: 'user', text: '/'.repeat(5900) }] });
});
