import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStudioDraft } from './content-workflow-client.js';
let createStudioSaveQueue;
try { ({ createStudioSaveQueue } = await import('./content-studio-save-queue.js')); } catch {}
const success = (request) => ({
  status: 'saved', item: { id: 'item', workspace_id: 'workspace', updated_at: 'new-item' },
  variant: { id: 'variant', updated_at: 'new-variant', body: request.variant.body },
});
test('retry sends the identical creation receipt before saving later edits', async () => {
  assert.ok(createStudioSaveQueue);
  let draft = { ...emptyStudioDraft(), body: '첫 번째' }, dirty = true, fail = true;
  const requests = [];
  const queue = createStudioSaveQueue({
    get: () => ({ draft, dirty }), commit: (state) => ({ draft, dirty } = state),
    send: async (request) => { requests.push(request); if (fail) throw Error('offline'); return success(request); },
    requestId: () => String(requests.length),
  });
  await assert.rejects(queue.flush(), /offline/);
  draft = { ...draft, body: '두 번째' };
  fail = false;
  await queue.flush();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[2].contentId, 'item');
  assert.equal(requests[2].variant.body, '두 번째');
  assert.equal(draft.body, '두 번째');
  assert.equal(dirty, false);
});
test('concurrent flushes serialize and retain typing during an in-flight save', async () => {
  assert.ok(createStudioSaveQueue);
  let draft = { ...emptyStudioDraft(), body: '첫 번째' }, dirty = true, resolve;
  const requests = [];
  const queue = createStudioSaveQueue({
    get: () => ({ draft, dirty }), commit: (state) => ({ draft, dirty } = state),
    send: (request) => { requests.push(request); return requests.length === 1 ? new Promise((done) => { resolve = () => done(success(request)); }) : Promise.resolve(success(request)); },
    requestId: () => String(requests.length),
  });
  const first = queue.flush();
  await Promise.resolve();
  draft = { ...draft, body: '입력 중인 문장' };
  const second = queue.flush();
  resolve();
  await Promise.all([first, second]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].variant.body, '입력 중인 문장');
  assert.equal(dirty, false);
});
test('HTTP success without durable rows retains dirty state and the request for retry', async () => {
  assert.ok(createStudioSaveQueue);
  let draft = { ...emptyStudioDraft(), sourceIdea: '메모' }, dirty = true;
  const requests = [];
  const queue = createStudioSaveQueue({
    get: () => ({ draft, dirty }), commit: () => assert.fail('must not acknowledge preview'),
    send: async (request) => { requests.push(request); return { status: 'preview' }; }, requestId: () => 'stable',
  });
  await assert.rejects(queue.flush());
  await assert.rejects(queue.flush());
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(dirty, true);
  assert.equal(draft.contentId, null);
});

test('persists an uncertain creation before sending and resumes its receipt after reload', async () => {
  let state = { draft: { ...emptyStudioDraft(), body: '생성 원문' }, dirty: true };
  let record = { ...state }, stored = false;
  const requests = [];
  const first = createStudioSaveQueue({
    get: () => state, commit: (next) => { state = next; }, requestId: () => 'original-receipt',
    persistPending: async (pending) => { record = { ...state, pendingSave: structuredClone(pending) }; stored = true; },
    send: async (request) => { assert.equal(stored, true, 'persist receipt before the server can accept a creation'); requests.push(request); throw Error('response lost'); },
  });
  await assert.rejects(first.flush(), /response lost/);
  state = { draft: { ...record.draft, body: '복구 후 수정' }, dirty: true };
  const second = createStudioSaveQueue({
    get: () => state, initialPending: record.pendingSave, requestId: () => 'after-replay',
    persistPending: async (pending) => { record = { ...state, pendingSave: structuredClone(pending) }; },
    commit: async (next) => { state = next; record = { ...state, pendingSave: null }; },
    send: async (request) => { requests.push(request); return success(request); },
  });
  await second.flush();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[2].contentId, 'item');
  assert.equal(requests[2].variant.body, '복구 후 수정');
  assert.equal(record.pendingSave, null);
});

test('definitive validation rejection releases the receipt so corrected input can save', async () => {
  let state = { draft: { ...emptyStudioDraft(), body: '너무 긴 글' }, dirty: true }, pending;
  const requests = [];
  const queue = createStudioSaveQueue({
    get: () => state, commit: (next) => { state = next; },
    persistPending: async (value) => { pending = value; }, requestId: () => 'request-' + requests.length,
    send: async (request) => { requests.push(request); return requests.length === 1 ? { status: 'payload-too-large', error: 'payload-too-large' } : success(request); },
  });
  await assert.rejects(queue.flush());
  assert.equal(pending, null);
  state = { draft: { ...state.draft, body: '짧은 글' }, dirty: true };
  await queue.flush();
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.equal(requests[1].variant.body, '짧은 글');
});

test('changing documents during a request prevents adoption and further saves', async () => {
  let active = true, finish;
  const state = { draft: { ...emptyStudioDraft(), body: '이전 문서' }, dirty: true };
  let writes = 0, adopted = 0;
  const queue = createStudioSaveQueue({
    get: () => state, isCurrent: () => active, persistPending: async () => {},
    commit: () => { adopted++; state.dirty = false; }, send: (request) => { writes++; return new Promise((resolve) => { finish = () => resolve(success(request)); }); },
  });
  const pending = queue.flush();
  await new Promise((resolve) => setImmediate(resolve));
  active = false;
  finish();
  await assert.rejects(pending, /document-changed/);
  assert.equal(adopted, 0);
  assert.equal(writes, 1);
});

test('storage failure prevents sending a creation without a durable receipt', async () => {
  const queue = createStudioSaveQueue({
    get: () => ({ draft: emptyStudioDraft(), dirty: true }), commit: () => assert.fail('must not adopt'),
    persistPending: async () => { throw Error('storage full'); }, send: () => assert.fail('must not send'),
  });
  await assert.rejects(queue.flush(), /storage full/);
});
