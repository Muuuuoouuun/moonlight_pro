import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeContentWorkflow, normalizeContentWorkflow } from '../../engine/lib/content-workflow.ts';
import { createStudioSaveQueue } from './content-studio-save-queue.js';
import { buildStudioSave, emptyStudioDraft } from './content-workflow-client.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const requestId = '22222222-2222-2222-2222-222222222222';
const contentId = '33333333-3333-3333-3333-333333333333';
const variantId = '44444444-4444-4444-4444-444444444444';
const nextRequestId = '55555555-5555-5555-5555-555555555555';
const timestamp = '2026-10-05T00:00:01Z';
const sceneBody = duration => JSON.stringify({ scenes: [{ id: 'scene-1', visual: '합성 화면', spoken: '합성 대사', subtitle: '', duration, notes: '' }] });
const legacyDraft = () => ({ ...emptyStudioDraft(), variantType: 'reels_script', channel: 'reels', body: sceneBody(0) });
const legacyCommand = () => buildStudioSave(legacyDraft(), requestId);
// Captured with actual 7719e9ed normalizeContentWorkflow for the synthetic command
// above. This snapshot ensures a newer validator keeps the accepted receipt hash.
const legacyHash = 'c3f3f1f4bd7c4567cde81a677ab831d051cdcc7cd0c27df939b49b273e8beb57';
const acceptedResponse = () => ({ status: 'saved', contentId, variantId,
  item: { id: contentId, workspace_id: workspaceId, updated_at: timestamp },
  variant: { id: variantId, workspace_id: workspaceId, content_id: contentId, updated_at: timestamp,
    body: sceneBody(0), variant_type: 'reels_script', channel: 'reels' },
});
const acceptedReceipt = () => ({ workspace_id: workspaceId, request_id: requestId, request_hash: legacyHash, response: acceptedResponse() });
const noRpc = async () => assert.fail('receipt recovery and new invalid input must never invoke persistence');

test('a same-workspace, same-request, same-hash legacy receipt recovers before new scene validation', async () => {
  const request = legacyCommand(), before = structuredClone(request), receipt = acceptedReceipt();
  assert.equal(normalizeContentWorkflow(request, { workspaceId }).ok, false);
  const result = await executeContentWorkflow(request, { workspaceId }, { rpc: noRpc,
    read: async (table, options) => {
      assert.equal(table, 'content_workflow_receipts');
      assert.deepEqual(options.filters, [['workspace_id', `eq.${workspaceId}`], ['request_id', `eq.${requestId}`]]);
      assert.equal(options.limit, 2);
      assert.equal(options.dedupe, false);
      return { configured: true, rows: [structuredClone(receipt)] };
    },
  });
  assert.deepEqual(result, { ...receipt.response, status: 'duplicate' });
  assert.equal(result.variant.body, sceneBody(0), 'replay does not repair or reserialize accepted content');
  assert.deepEqual(request, before);
  assert.deepEqual(receipt, acceptedReceipt());
});

test('changed content cannot recover a same-ID receipt with a different hash', async () => {
  const request = legacyCommand(); request.item.title = '수정한 합성 제목';
  const result = await executeContentWorkflow(request, { workspaceId }, {
    rpc: noRpc, read: async () => ({ configured: true, rows: [acceptedReceipt()] }),
  });
  assert.deepEqual(result, { status: 'conflict', error: 'request-id-reused' });
});

test('foreign, ambiguous or malformed receipts fail closed without becoming definitive scene rejection', async () => {
  const foreignWorkspace = acceptedReceipt(); foreignWorkspace.workspace_id = nextRequestId;
  const foreignRequest = acceptedReceipt(); foreignRequest.request_id = nextRequestId;
  const foreignVariant = acceptedReceipt(); foreignVariant.response.variant.workspace_id = nextRequestId;
  const wrongParent = acceptedReceipt(); wrongParent.response.variant.content_id = nextRequestId;
  const noVersion = acceptedReceipt(); delete noVersion.response.item.updated_at;
  const malformed = acceptedReceipt(); malformed.response = { status: 'saved' };
  for (const rows of [[foreignWorkspace], [foreignRequest], [foreignVariant], [wrongParent], [noVersion], [malformed], [acceptedReceipt(), acceptedReceipt()]]) {
    const result = await executeContentWorkflow(legacyCommand(), { workspaceId }, {
      rpc: noRpc, read: async () => ({ configured: true, rows }),
    });
    assert.deepEqual(result, { status: 'unknown', error: 'workflow-receipt-unconfirmed' });
  }
});

test('receipt read failure preserves uncertainty while confirmed absence still rejects a new invalid command', async () => {
  for (const read of [undefined, async () => ({ configured: false, rows: null }),
    async () => ({ configured: true, rows: null, error: 'synthetic read failure' }), async () => { throw Error('synthetic offline'); }]) {
    const result = await executeContentWorkflow(legacyCommand(), { workspaceId }, { read, rpc: noRpc });
    assert.deepEqual(result, { status: 'unknown', error: 'workflow-receipt-unconfirmed' });
  }
  const result = await executeContentWorkflow(legacyCommand(), { workspaceId }, {
    read: async () => ({ configured: true, rows: [] }), rpc: noRpc,
  });
  assert.deepEqual(result, { status: 'invalid-input', error: 'invalid-reels-script-duration', sceneNumber: 1 });
});

for (const retryMode of ['read-error', 'receipt-not-visible']) {
  test(`lost legacy creation with ${retryMode} retains its receipt and corrects the existing item`, async () => {
    let state = { draft: legacyDraft(), dirty: true }, storedPending = null, mode = 'normal', writes = 0, createdItems = 0, ids = 0;
    const receipts = new Map(), requests = [];
    const read = async (table, options) => {
      assert.equal(table, 'content_workflow_receipts');
      assert.equal(options.filters[0][1], `eq.${workspaceId}`);
      const id = options.filters[1][1].slice(3);
      if (mode === 'read-error') return { configured: true, rows: null, error: 'synthetic read failure' };
      if (mode === 'receipt-not-visible') return { configured: true, rows: [] };
      return { configured: true, rows: receipts.has(id) ? [structuredClone(receipts.get(id))] : [] };
    };
    const rpc = async (_name, params) => {
      writes++;
      assert.equal(params.p_command.contentId, contentId, 'correction updates the recovered item, never creates another');
      assert.equal(params.p_command.variantId, variantId);
      assert.equal(params.p_command.expectedItemUpdatedAt, timestamp);
      assert.equal(params.p_command.expectedVariantUpdatedAt, timestamp);
      const response = acceptedResponse(); response.variant.body = params.p_command.variant.body;
      receipts.set(params.p_request_id, { workspace_id: workspaceId, request_id: params.p_request_id, request_hash: params.p_request_hash, response });
      return { ok: true, data: response };
    };
    const queue = createStudioSaveQueue({ get: () => state,
      commit: next => { state = next; storedPending = null; },
      persistPending: async pending => { storedPending = structuredClone(pending); },
      requestId: () => ids++ === 0 ? requestId : nextRequestId,
      send: async request => {
        requests.push(structuredClone(request));
        if (requests.length === 1) {
          assert.deepEqual(request, legacyCommand());
          receipts.set(requestId, acceptedReceipt()); createdItems++;
          throw Error('synthetic response lost after legacy commit');
        }
        return executeContentWorkflow(request, { workspaceId }, { rpc, read });
      },
    });
    await assert.rejects(queue.flush(), /response lost/);
    assert.equal(storedPending.outcomeUncertain, true);
    mode = retryMode;
    await assert.rejects(queue.flush());
    assert.equal(storedPending.request.requestId, requestId);
    assert.equal(storedPending.request.contentId, null);
    assert.equal(state.draft.contentId, null);
    assert.equal(state.draft.body, sceneBody(0));
    assert.equal(state.dirty, true);
    assert.equal(writes, 0);
    state = { draft: { ...state.draft, body: sceneBody(10) }, dirty: true };
    mode = 'normal';
    await queue.flush();
    assert.equal(createdItems, 1);
    assert.equal(writes, 1);
    assert.equal(requests[0].requestId, requests[1].requestId);
    assert.equal(requests[1].requestId, requests[2].requestId);
    assert.equal(requests[3].requestId, nextRequestId);
    assert.equal(requests[3].contentId, contentId);
    assert.equal(state.draft.contentId, contentId);
    assert.equal(state.draft.body, sceneBody(10));
    assert.equal(state.dirty, false);
    assert.equal(storedPending, null);
  });
}

test('restored pre-upgrade pending commands cannot be released by a later scene validator', async () => {
  let storedPending, state = { draft: legacyDraft(), dirty: true };
  const pending = { sent: structuredClone(state.draft), request: legacyCommand() };
  const queue = createStudioSaveQueue({ get: () => state, initialPending: pending,
    commit: () => assert.fail('cannot acknowledge an unconfirmed save'),
    requestId: () => assert.fail('cannot mint another creation request'),
    persistPending: async value => { storedPending = structuredClone(value); },
    send: request => executeContentWorkflow(request, { workspaceId }, { rpc: noRpc, read: async () => ({ configured: true, rows: [] }) }),
  });
  await assert.rejects(queue.flush(), /이전 저장 결과를 확인하지 못했습니다/);
  assert.equal(storedPending.request.requestId, requestId);
  assert.equal(storedPending.outcomeUncertain, true);
  assert.equal(state.draft.body, sceneBody(0));
  state.draft = { ...state.draft, body: sceneBody(10) };
  await assert.rejects(queue.flush(), /이전 저장 결과를 확인하지 못했습니다/);
  assert.equal(storedPending.request.variant.body, sceneBody(0));
  assert.equal(state.draft.body, sceneBody(10));
});

test('a newly rejected invalid creation can still save corrected input with a new ID', async () => {
  let state = { draft: legacyDraft(), dirty: true }, pending, ids = 0, writes = 0;
  const requests = [];
  const queue = createStudioSaveQueue({ get: () => state, commit: next => { state = next; pending = null; },
    requestId: () => ids++ === 0 ? requestId : nextRequestId, persistPending: async value => { pending = value; },
    send: request => {
      requests.push(structuredClone(request));
      return executeContentWorkflow(request, { workspaceId }, {
        read: async () => ({ configured: true, rows: [] }),
        rpc: async (_name, params) => {
          writes++;
          const response = acceptedResponse(); response.variant.body = params.p_command.variant.body;
          return { ok: true, data: response };
        },
      });
    },
  });
  await assert.rejects(queue.flush(), /1번 장면/);
  assert.equal(pending, null);
  assert.equal(writes, 0);
  assert.equal(state.draft.body, sceneBody(0));
  state = { draft: { ...state.draft, body: sceneBody(10) }, dirty: true };
  await queue.flush();
  assert.equal(requests[1].requestId, nextRequestId);
  assert.equal(writes, 1);
  assert.equal(state.draft.body, sceneBody(10));
});

test('late response loss after switching documents cannot overwrite the previous recovery receipt', async () => {
  let active = true, rejectSend, stored = 0;
  const queue = createStudioSaveQueue({
    get: () => ({ draft: { ...legacyDraft(), body: sceneBody(10) }, dirty: true }),
    isCurrent: () => active, requestId: () => requestId,
    commit: () => assert.fail('cannot adopt a departed document'),
    persistPending: async () => { stored++; },
    send: () => new Promise((_resolve, reject) => { rejectSend = reject; }),
  });
  const pending = queue.flush();
  await new Promise(resolve => setImmediate(resolve));
  active = false;
  rejectSend(Error('synthetic response lost'));
  await assert.rejects(pending, /document-changed/);
  assert.equal(stored, 1, 'only the pre-send receipt was persisted for the departed document');
});
