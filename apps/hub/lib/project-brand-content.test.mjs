import assert from 'node:assert/strict';
import test from 'node:test';
import { readProjectBrandContentEnvelope, selectProjectBrandContent, projectBrandContentMessage } from './project-brand-content.js';

const item = { id: 'synthetic-video', brandId: 'brand-a', title: '테스트 영상' };
test('HTTP 200 error and malformed envelopes are not successful empty content', () => {
  for (const data of [null, {}, { status: 'error' }, { source: 'error', items: [] }, { status: 'live', source: 'supabase' }, { status: 'unknown', source: 'supabase', items: [] }]) {
    assert.deepEqual(readProjectBrandContentEnvelope(data), { state: 'error', items: [] });
  }
  assert.equal(readProjectBrandContentEnvelope({ status: 'live', source: 'supabase', items: [item] }, false).state, 'error');
});
test('live empty, partial and preview retain distinct truth states', () => {
  assert.deepEqual(readProjectBrandContentEnvelope({ status: 'live', source: 'supabase', items: [] }), { state: 'live', items: [] });
  assert.deepEqual(readProjectBrandContentEnvelope({ status: 'partial', source: 'supabase', items: [item] }), { state: 'partial', items: [item] });
  assert.equal(readProjectBrandContentEnvelope({ status: 'live', source: 'supabase', partial: true, items: [item] }).state, 'partial');
  assert.deepEqual(readProjectBrandContentEnvelope({ status: 'preview', source: 'preview', items: [item] }), { state: 'preview', items: [] });
});
test('brand-only attribution stays bounded and never invents a project relationship', () => {
  const rows = [item, { id: 'other', brandId: 'brand-b' }, ...Array.from({ length: 6 }, (_, i) => ({ id: `item-${i}`, brandId: 'brand-a' }))];
  assert.equal(selectProjectBrandContent(rows, 'brand-a').length, 5);
  assert.deepEqual(selectProjectBrandContent(rows, 'brand-b'), [rows[1]]);
  assert.deepEqual(selectProjectBrandContent(rows, null), []);
  assert.deepEqual(selectProjectBrandContent(rows, 'unknown'), []);
});
test('unread, error and unconfigured states never claim an empty successful ledger', () => {
  for (const state of ['idle', 'loading', 'error', 'preview', 'partial']) assert.ok(projectBrandContentMessage(state, true));
  assert.equal(projectBrandContentMessage('live', true), '');
  assert.match(projectBrandContentMessage('live', false), /브랜드가 지정되지/);
});
