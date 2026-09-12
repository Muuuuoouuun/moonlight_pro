import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as storage from './content-studio-storage.js';

test('ordinary edits retain durable pending operations in the same mirror record', () => {
  assert.equal(typeof storage.mergeStudioMirror, 'function');
  const pendingSave = { sent: { body: 'sent' }, request: { requestId: 'stable' } };
  const pendingMutation = { command: { action: 'restore_revision' }, request: { requestId: 'mutation' } };
  const existing = { draft: { body: 'old' }, dirty: true, pendingSave, pendingMutation };
  const edited = storage.mergeStudioMirror(existing, { draft: { body: 'new typing' }, dirty: true });
  assert.deepEqual(edited.pendingSave, pendingSave);
  assert.deepEqual(edited.pendingMutation, pendingMutation);
  const acknowledged = storage.mergeStudioMirror(edited, { draft: { body: 'new typing', contentId: 'saved' }, dirty: false, pendingSave: null, pendingMutation: null });
  assert.equal(acknowledged.pendingSave, null);
  assert.equal(acknowledged.pendingMutation, null);
  assert.equal(acknowledged.draft.contentId, 'saved');
});

test('exact recovery pointers isolate scope, variant and stable new-draft identity', () => {
  assert.equal(typeof storage.studioDocumentPointerKey, 'function');
  const key = storage.studioDocumentPointerKey;
  const a = { scope: 'growth', contentId: 'item', variantId: 'one' };
  assert.notEqual(key(a), key({ ...a, scope: 'sales' }));
  assert.notEqual(key(a), key({ ...a, variantId: 'two' }));
  assert.equal(key({ scope: 'all', draftKey: 'stable' }), key({ scope: 'all', draftKey: 'stable' }));
  assert.notEqual(key({ scope: 'all', draftKey: 'one' }), key({ scope: 'all', draftKey: 'two' }));
});
