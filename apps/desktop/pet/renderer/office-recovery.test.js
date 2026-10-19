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
  let detail;
  const hub = createPetHub({ origin: 'https://hub.example.test', store,
    setTimeout: fn => { const timer = { fn }; timers.add(timer); return timer; }, clearTimeout: timer => timers.delete(timer),
    fetch: async (url, init) => {
    const route = new URL(url).pathname, input = init.body ? JSON.parse(init.body) : null;
    requests.push({ route, method: init.method, input });
    const reply = body => new Response(JSON.stringify(body), { status: 200 });
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
    if (detail && route.endsWith(`/${detail.meeting.meetingId}`)) return reply({ ...detail, status: 'ready' });
    throw new Error(`Unexpected isolated request: ${route}`);
  } });
  function element(tag, attrs = {}, ...children) {
    const el = { tag, children: [], value: '', disabled: false, hidden: false, classList: { toggle() {} },
      append(...next) { this.children.push(...next.filter(Boolean)); }, querySelector() { return null; },
      querySelectorAll() { return []; }, remove() {}, focus() {}, addEventListener() {}, ...attrs };
    el.textContent = attrs.text || ''; el.append(...children); elements.push(el); return el;
  }
  const U = { h: element, clear: el => { el.children = []; return el; },
    segmented: (_items, _value, change) => { const el = element('nav'); el.select = () => {}; el.choose = change; segments.push(el); return el; },
    quiet: (text, options = {}) => element('button', { text, ...options }),
    action: (text, options = {}) => element('button', { text, ...options }),
    notice: view => element('div', { text: view.message }), skeleton: () => element('div'), clock: () => '12:00' };
  const context = { window: {}, crypto: { randomUUID }, setInterval: () => 1, clearInterval() {}, navigator: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'modes/office.js'), 'utf8'), context);
  const surface = context.window.PetModes.office.create({ B: { store, invoke: createHubBridge(() => hub) }, U, C,
    M: { platform: { isMac: () => false }, envelope }, state: { hubUrl: hub.origin, hubStatus: 'connected', character: 'brown' },
    openHub() {}, handleAction() {}, isShown: () => true });
  t.after(() => { surface.destroy(); hub.dispose(); });
  await flush(); segments[0].choose('chat'); await flush();
  const editor = elements.find(el => el.tag === 'textarea');
  editor.value = '충돌 뒤에도 보존할 질문';
  await surface.primary(); await flush();
  return { surface, editor, stored, sends: () => requests.filter(req => req.route.endsWith('/turns')) };
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
