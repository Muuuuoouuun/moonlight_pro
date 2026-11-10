import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveOfficeVerdict, OFFICE_VERDICT_VALUES, OFFICE_VERDICT_REASONS } from './office-verdict-client.js';

test('labels and envelope normalization', async () => {
  assert.deepEqual(OFFICE_VERDICT_VALUES.map(v => v.label), ['그대로', '고쳐', '버림']);
  assert.deepEqual(OFFICE_VERDICT_REASONS.map(v => v.id), ['context', 'wrong', 'useless']);
  const before = globalThis.fetch;
  try {
    let sent;
    const reply = (body, status = 200) => { globalThis.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json(body, { status }); }; };
    reply({ ok: true, status: 'saved' });
    assert.deepEqual(await saveOfficeVerdict({ runId: 'r', value: 'kept', reason: 'wrong' }), { status: 'saved' });
    assert.equal(sent.url, '/api/hub/office/verdict');
    assert.deepEqual(sent.body, { runId: 'r', value: 'kept' });
    reply({ status: 'preview' }, 202);
    assert.deepEqual(await saveOfficeVerdict({ runId: 'r', value: 'dropped', reason: 'wrong' }), { status: 'preview' });
    assert.deepEqual(sent.body, { runId: 'r', value: 'dropped', reason: 'wrong' });
    reply({ ok: false, status: 'failed', error: 'office-verdict-save-failed' }, 502);
    assert.deepEqual(await saveOfficeVerdict({ runId: 'r', value: 'kept' }), { status: 'error', error: 'office-verdict-save-failed' });
    globalThis.fetch = async () => { throw new Error('down'); };
    assert.deepEqual(await saveOfficeVerdict({ runId: 'r', value: 'kept' }), { status: 'error', error: 'network' });
  } finally { globalThis.fetch = before; }
});
