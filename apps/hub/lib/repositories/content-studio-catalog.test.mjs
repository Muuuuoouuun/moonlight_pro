import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getContentStudioCatalog } from './content-studio-catalog.js';
const workspaceId = '11111111-1111-1111-1111-111111111111';
test('Studio reads only the brand catalog and preserves scope without returning private brand guidance', async () => {
  const calls = [];
  const result = await getContentStudioCatalog({ workspaceId, fetchRows: async (table, options) => {
    calls.push({ table, options });
    return { configured: true, rows: [{ id: 'brand', slug: 'classmoon', name: 'Class.Moon', meta: { org_scope: 'classin', voice: 'private wording' } }] };
  } });
  assert.equal(result.status, 'live');
  assert.deepEqual(result.brands, [{ id: 'brand', key: 'classmoon', name: 'Class.Moon', orgScope: 'classin' }]);
  assert.equal(calls.length, 1); assert.equal(calls[0].table, 'brands');
  assert.ok(calls[0].options.filters.some(([k,v]) => k === 'workspace_id' && v === 'eq.' + workspaceId));
  assert.doesNotMatch(JSON.stringify(result), /private wording/);
});
test('brand catalog distinguishes preview, failure and a truncated list', async () => {
  const preview = await getContentStudioCatalog({ workspaceId, fetchRows: async () => ({ configured: false }) });
  assert.equal(preview.status, 'preview');
  const failure = await getContentStudioCatalog({ workspaceId, fetchRows: async () => ({ configured: true, error: {}, rows: null }) });
  assert.equal(failure.status, 'error');
  const partial = await getContentStudioCatalog({ workspaceId, fetchRows: async () => ({ configured: true, rows: Array.from({ length: 81 }, (_, i) => ({ id: String(i), name: String(i) })) }) });
  assert.equal(partial.status, 'partial'); assert.equal(partial.brands.length, 80);
});
