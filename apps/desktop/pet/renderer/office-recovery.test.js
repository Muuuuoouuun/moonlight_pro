'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { createHubClient } = require('../main/pet-hub-client');
const { createPetHub } = require('../main/pet-hub');
const { createHubBridge } = require('../main/pet-hub-bridge');
const C = require('../shared/contract');
const envelope = require('./model/envelope-view');
const flush = () => new Promise(resolve => setImmediate(resolve));
const rejected = error => ({ status: 409, body: { status: 'conflict', error, persisted: false } });

async function setup(t, firstReply) {
  const elements = [], segments = [], requests = [], stored = new Map(), timers = new Set();
  const store = {
    get: async key => structuredClone(stored.get(key)),
    set: async (key, value) => { stored.set(key, structuredClone(value)); return { ok: true }; },
  };
  let detail, readReply = null, poll;
  const hub = createPetHub({ origin: 'https://hub.example.test', store,
    setTimeout: fn => { const timer = { fn }; timers.add(timer); return timer; }, clearTimeout: timer => timers.delete(timer),
    fetch: async (url, init) => {
    const route = new URL(url).pathname, input = init.body ? JSON.parse(init.body) : null;
    requests.push({ route, method: init.method, input });
    const reply = body => new Response(JSON.stringify(body), { status: 200 });
    if (route === '/api/operator/session') return reply({ status: 'anonymous', configured: true });
    if (route === '/api/hub/office/inbox') return reply({ status: 'ready', source: 'live', items: [], hasMore: false, nextCursor: null });
    if (route === '/api/hub/office/meetings' && init.method === 'GET') return reply({ status: 'ready', meetings: detail ? [detail.meeting] : [], nextCursor: null });
    if (route === '/api/hub/office/meetings' && init.method === 'POST') {
      detail = { status: 'ready', persisted: true, meeting: { meetingId: input.meetingId, title: input.title, scope: input.scope,
        ownerId: input.ownerId, reviewers: [], mode: 'chat', revision: 1, state: 'open',
        createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z' }, turns: [] };
      return reply(detail);
    }
    if (route.endsWith('/turns')) {
      if (firstReply) {
        const response = firstReply; firstReply = null;
        detail.meeting.revision = 2;
        if (response.unknownWireSnapshot) {
          detail = { ...detail, status: 'unknown', turns: [{ id: input.requestId, roundNumber: 1, state: 'unknown',
            request: { message: input.message, ownerId: 'eevee', mode: 'chat' }, result: { status: 'unknown' }, finishedAt: '2026-10-19T00:05:00Z' }] };
          return new Response(JSON.stringify(detail), { status: 202 });
        }
        if (response.body?.error === 'meeting-closed') detail.meeting.state = 'closed';
        if (response.timeout) { for (const timer of timers) timer.fn(); throw new Error('isolated timeout'); }
        if (response.offline) throw new Error('isolated response lost');
        return new Response(JSON.stringify(response.body), { status: response.status });
      }
      detail = { ...detail, status: 'generated', turns: [{ id: input.requestId, roundNumber: 1, state: 'generated',
        request: { message: input.message, ownerId: 'eevee', mode: 'chat' },
        result: { scope: 'personal', ownerId: 'eevee', mode: 'chat', answer: '확인된 답변', nextAction: '검토하기' } }] };
      return reply(detail);
    }
    if (detail && route.endsWith(`/${detail.meeting.meetingId}`)) return readReply ? readReply(structuredClone(detail)) : reply({ ...detail, status: 'ready' });
    throw new Error(`Unexpected isolated request: ${route}`);
  } });
  function element(tag, attrs = {}, ...children) {
    const el = { tag, children: [], value: '', disabled: false, hidden: false, classList: { toggle() {} },
      append(...next) { this.children.push(...next.filter(Boolean)); }, querySelector() { return null; },
      querySelectorAll() { return []; }, remove() {}, focus() {}, events: {}, addEventListener(name, listener) { this.events[name] = listener; }, ...attrs };
    el.textContent = attrs.text || ''; el.append(...children); elements.push(el); return el;
  }
  const U = { h: element, clear: el => { el.children = []; return el; },
    segmented: (_items, _value, change) => { const el = element('nav'); el.select = () => {}; el.choose = change; segments.push(el); return el; },
    quiet: (text, options = {}) => element('button', { text, ...options }),
    action: (text, options = {}) => element('button', { text, ...options }),
    notice: view => element('div', { text: view.message }), skeleton: () => element('div'), clock: () => '12:00' };
  const context = { window: {}, crypto: { randomUUID }, setInterval: fn => { poll = fn; return 1; }, clearInterval() {}, navigator: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'modes/office.js'), 'utf8'), context);
  const ctx = { B: { store, invoke: createHubBridge(() => hub) }, U, C,
    M: { platform: { isMac: () => false }, envelope, officeDiagnostic: require('./model/office-diagnostic') }, state: { hubUrl: hub.origin, hubStatus: 'connected', character: 'brown' },
    openHub() {}, handleAction() {}, isShown: () => true };
  const surface = context.window.PetModes.office.create(ctx);
  t.after(() => { surface.destroy(); hub.dispose(); });
  await flush(); segments[0].choose('chat'); await flush();
  const editor = elements.find(el => el.tag === 'textarea');
  editor.value = '충돌 뒤에도 보존할 질문';
  await surface.primary(); await flush();
  return { surface, editor, stored, requests, ctx, segments, replaceSession: () => hub.sessionChanged(), poll: () => poll(),
    read: fn => { readReply = fn; }, wire: () => structuredClone(detail), setWire: value => { detail = value; },
    remount: async () => {
      surface.destroy(); const restored = context.window.PetModes.office.create(ctx);
      t.after(() => restored.destroy()); await flush();
      return { surface: restored, editor: elements.filter(el => el.tag === 'textarea').at(-1) };
    },
    sends: () => requests.filter(req => req.route.endsWith('/turns')) };

}

for (const code of ['meeting-revision-changed', 'meeting-closed']) {
  test(`verified preclaim ${code} releases only the unsent pending command`, async t => {
    const state = await setup(t, rejected(code));
    assert.equal(state.stored.get('petOffice.pending'), null);
    assert.equal(state.editor.value, '충돌 뒤에도 보존할 질문');
    assert.equal(state.sends().length, 1, 'no automatic resend after rejection');
    await state.surface.primary();
    assert.equal(state.sends().length, 1, 'refresh is required before another explicit send');
    await state.surface.refresh(); await flush();
    assert.equal(state.sends().length, 1, 'GET recovery does not generate a turn');
    if (code === 'meeting-closed') {
      assert.equal(state.editor.disabled, true, 'closed meeting remains read-only');
      await state.surface.primary();
      assert.equal(state.sends().length, 1);
    } else {
      assert.equal(state.editor.disabled, false);
      await state.surface.primary();
      assert.equal(state.sends().length, 2);
      assert.notEqual(state.sends()[0].input.requestId, state.sends()[1].input.requestId);
      assert.equal(state.sends()[1].input.expectedRevision, 2);
      assert.equal(state.editor.value, '', 'only verified generated result clears the draft');
    }
  });
}

for (const [name, reply] of [
  ['unclassified conflict', rejected('conflict')],
  ['reused request ID', rejected('meeting-request-id-reused')],
  ['missing persistence assertion', { status: 409, body: { status: 'conflict', error: 'meeting-revision-changed' } }],
  ['contradictory persistence', { status: 409, body: { ...rejected('meeting-revision-changed').body, persisted: true } }],
  ['conflict with existing receipt', { status: 409, body: { ...rejected('meeting-revision-changed').body, turn: { id: randomUUID() } } }],
  ['unknown claim outcome', { status: 202, body: { status: 'unknown', error: 'office-meeting-outcome-unknown', persisted: null } }],
  ['server failure', { status: 502, body: { status: 'error', persisted: false } }],
  ['lost response', { offline: true }],
  ['timeout', { timeout: true }],
  ['preview before generation', { status: 202, body: { status: 'preview', error: 'office-engine-not-configured', persisted: false } }],
]) {
  test(`${name} keeps pending identity and input after GET recovery`, async t => {
    const state = await setup(t, reply), pending = state.stored.get('petOffice.pending');
    assert.equal(pending.phase, 'send');
    await state.surface.refresh(); await flush();
    assert.deepEqual(state.stored.get('petOffice.pending'), pending);
    assert.equal(state.editor.value, '충돌 뒤에도 보존할 질문');
    assert.equal(state.editor.disabled, true);
    await state.surface.primary();
    assert.equal(state.sends().length, 1);
  });
}

test('preclaim classification is restricted to the exact Office turn POST contract', async () => {
  const id = randomUUID(), exact = `/api/hub/office/meetings/${id}/turns`;
  for (const [route, method, code] of [[exact, 'POST', 'meeting-revision-changed'], [exact, 'GET', 'conflict'],
    [exact + '?retry=1', 'POST', 'conflict'], ['/api/hub/journal', 'POST', 'conflict']]) {
    const client = createHubClient({ origin: 'https://hub.example.test', fetch: async () => new Response(JSON.stringify(rejected('meeting-revision-changed').body), { status: 409 }) });
    await assert.rejects(client.request(route, { method, body: { requestId: randomUUID() } }), error => error.kind === 'conflict' && error.error === code);
  }
});

const visibleText = el => [el.textContent || '', ...(el.children || []).map(visibleText)].join(' ');
const wireReply = data => new Response(JSON.stringify({ ...data, status: 'ready' }), { status: 200 });
function completed(data) {
  data.turns[0].state = 'generated';
  data.turns[0].result = { scope: 'personal', ownerId: 'eevee', mode: 'chat', answer: '검증된 합성 완료', nextAction: '검토' };
  return data;
}

test('persistent unknown discloses identity and rechecks GET only without polling or changing historical command', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  assert.match(visibleText(s.surface.el), /unknown · 분류 근거 부족/);
  assert.match(visibleText(s.surface.el), new RegExp(pending.requestId));
  const count = s.requests.length;
  for (let i = 0; i < 10; i++) s.poll();
  await flush(); assert.equal(s.requests.length, count, 'pending requests are not polled');
  for (let i = 0; i < 3; i++) { await s.surface.refresh(); await s.surface.primary(); }
  assert.equal(s.requests.slice(count).length, 3);
  assert.ok(s.requests.slice(count).every(r => r.method === 'GET' && r.route.endsWith(`/${pending.id}`)));
  assert.equal(s.sends().length, 1);
  assert.equal(pending.revision, 1, 'original historical revision');
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.equal(s.editor.value, pending.message);
});

test('reopening restores original pending command and only GET rechecks it', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  const before = s.requests.length, restored = await s.remount();
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.equal(restored.editor.value, pending.message);
  assert.match(visibleText(restored.surface.el), /unknown · 분류 근거 부족/);
  assert.ok(s.requests.slice(before).every(r => r.method === 'GET'));
  assert.equal(s.sends().length, 1);
});

test('failed recheck keeps last valid observation, original request and visible history', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  s.read(() => new Response(JSON.stringify({ status: 'error' }), { status: 502 }));
  await s.surface.refresh();
  const text = visibleText(s.surface.el);
  assert.match(text, /unknown · 분류 근거 부족/);
  assert.match(text, /이전 관측/);
  assert.match(text, /최근 조회 결과 조회 실패/);
  assert.match(text, /충돌 뒤에도 보존할 질문/);
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.equal(s.sends().length, 1);
});

test('generated completion clears only matching pending and preserves a subsequently modified draft exactly', async t => {
  for (const draft of ['수정한 다음 질문', '충돌 뒤에도 보존할 질문 ']) {
    const s = await setup(t, { unknownWireSnapshot: true });
    s.editor.value = draft; s.editor.events.input();
    s.setWire(completed(s.wire()));
    await s.surface.refresh();
    assert.equal(s.stored.get('petOffice.pending'), null);
    assert.equal(s.editor.value, draft);
    assert.equal(s.sends().length, 1);
    assert.match(visibleText(s.surface.el), /일치하는 완료 결과 확인/);
  }
});

test('matching generated receipt still clears an unchanged draft', async t => {
  const s = await setup(t, { unknownWireSnapshot: true });
  s.setWire(completed(s.wire())); await s.surface.refresh();
  assert.equal(s.stored.get('petOffice.pending'), null);
  assert.equal(s.editor.value, '');
  assert.equal(s.sends().length, 1);
});

test('reverse response order and a later stale snapshot cannot regress verified completion', async t => {
  const s = await setup(t, { unknownWireSnapshot: true });
  const old = s.wire(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const invoke = s.ctx.B.invoke; let first = true;
  s.ctx.B.invoke = async (...args) => {
    const response = await invoke(...args);
    // Delay delivery only after the real transport/bridge has validated it.
    // Holding HTTP open would coalesce the second GET into the same snapshot.
    if (args[0] === 'pet:office-meeting' && first) { first = false; entered(); await held; }
    return response;
  };
  s.read(() => wireReply(old));
  const slow = s.surface.refresh(); await started;
  s.read(() => wireReply(completed(s.wire())));
  await s.surface.refresh();
  release(); await slow;
  assert.match(visibleText(s.surface.el), /검증된 합성 완료/);
  s.read(() => wireReply(old)); await s.surface.refresh();
  assert.match(visibleText(s.surface.el), /검증된 합성 완료/);
  assert.match(visibleText(s.surface.el), /완료 결과 유지/);
  assert.equal(s.stored.get('petOffice.pending'), null);
  assert.equal(s.sends().length, 1);
});

test('actual transport coalesces concurrent GET restoration while retaining unknown pending and edited draft', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  s.editor.value = ' 공동 조회 중에도 보존할 입력\n'; s.editor.events.input();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  s.read(data => new Promise(resolve => { release = () => resolve(wireReply(data)); entered(); }));
  const before = s.requests.length;
  const first = s.surface.refresh(); await started;
  const second = s.surface.refresh(); await flush();
  assert.equal(s.requests.length - before, 1, 'one actual HTTP GET is shared');
  release(); await Promise.all([first, second]);
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.equal(s.editor.value, ' 공동 조회 중에도 보존할 입력\n');
  assert.match(visibleText(s.surface.el), /unknown · 분류 근거 부족/);
  assert.equal(s.sends().length, 1);
});

test('selection change ignores a late generated response and retains pending', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  s.read(data => new Promise(resolve => { release = () => resolve(wireReply(completed(data))); entered(); }));
  const slow = s.surface.refresh(); await started;
  s.segments[1].choose('classin'); await flush();
  release(); await slow;
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.doesNotMatch(visibleText(s.surface.el), /검증된 합성 완료/);
  assert.equal(s.sends().length, 1);
});

test('session transition rejects late results even at the same origin', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  s.read(data => new Promise(resolve => { release = () => resolve(wireReply(completed(data))); entered(); }));
  const slow = s.surface.refresh(); await started;
  // Renderer-level context transition invalidates the in-flight callback; the
  // pure model separately covers account and connection generation boundaries.
  const previous = { ...s.ctx.state };
  s.ctx.state = { ...previous, hubStatus: 'unauthorized' };
  s.surface.onState(s.ctx.state, previous);
  release(); await slow;
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.doesNotMatch(visibleText(s.surface.el), /검증된 합성 완료/);
});


test('actual transport rejects old-connection completion without relying on renderer events', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  s.read(data => new Promise(resolve => { release = () => resolve(wireReply(completed(data))); entered(); }));
  const slow = s.surface.refresh(); await started;
  await s.replaceSession();
  release(); await slow;
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.doesNotMatch(visibleText(s.surface.el), /검증된 합성 완료/);
  assert.match(visibleText(s.surface.el), /연결 세대 변경/);
  assert.equal(s.sends().length, 1);
});

test('meeting GET without target turn preserves unknown identity and last observation', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  s.read(data => wireReply({ ...data, turns: [] })); await s.surface.refresh();
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.match(visibleText(s.surface.el), /unknown · 분류 근거 부족/);
  assert.match(visibleText(s.surface.el), /대상 요청 미포함|대상 요청을 확인하지 못함/);
  assert.equal(s.sends().length, 1);
});

test('unknown loaded without a local command offers read-only diagnostics and blocks new sends', async t => {
  const s = await setup(t, { unknownWireSnapshot: true });
  s.stored.set('petOffice.pending', null); // synthetic another-client restoration, no product cleanup action
  const restored = await s.remount();
  assert.match(visibleText(restored.surface.el), /이 기기에 원래 전송 명령이 없어요/);
  restored.editor.value = '다른 새 질문'; await restored.surface.primary();
  assert.equal(s.sends().length, 1);
  assert.equal(s.stored.get('petOffice.pending'), null, 'does not synthesize historical command');
});


test('ordinary selected history also survives an interrupted refresh after reopening', async t => {
  const s = await setup(t, null), restored = await s.remount();
  assert.match(visibleText(restored.surface.el), /확인된 답변/);
  s.read(() => new Response(JSON.stringify({ status: 'error' }), { status: 502 }));
  await restored.surface.refresh();
  assert.match(visibleText(restored.surface.el), /확인된 답변/);
  assert.match(visibleText(restored.surface.el), /이전 확인 기록/);
  assert.equal(s.sends().length, 1);
});

test('origin switch invalidates an in-flight diagnostic and keeps the original scoped pending', async t => {
  const s = await setup(t, { unknownWireSnapshot: true }), pending = structuredClone(s.stored.get('petOffice.pending'));
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  s.read(data => new Promise(resolve => { release = () => resolve(wireReply(completed(data))); entered(); }));
  const slow = s.surface.refresh(); await started;
  const previous = { ...s.ctx.state };
  s.ctx.state = { ...previous, hubUrl: 'https://another.example.test' };
  s.surface.onState(s.ctx.state, previous);
  release(); await slow;
  assert.deepEqual(s.stored.get('petOffice.pending'), pending);
  assert.doesNotMatch(visibleText(s.surface.el), /검증된 합성 완료|원래 요청/);
});
