import assert from 'node:assert/strict';
import { test } from 'node:test';
let repository;
try { repository = await import('./content-performance-ledger.js'); } catch {}
const workspaceId = '11111111-1111-1111-1111-111111111111';
const contentId = '22222222-2222-2222-2222-222222222222';
const brandId = '33333333-3333-3333-3333-333333333333';
const variantId = '44444444-4444-4444-4444-444444444444';
const now = '2026-01-01T06:00:00.000Z';
const updatedAt = '2025-12-31T10:00:00.123456+00:00';
const row = (overrides = {}) => ({ id: variantId, workspace_id: workspaceId, content_id: contentId, title: '원고', channel: 'threads', variant_type: 'threads_post', status: 'published', published_at: '2025-12-31T16:00:00Z', updated_at: updatedAt, meta: {}, ...overrides });
const detailed = rows => ({ configured: true, error: null, rows });
const deps = extra => ({ workspaceId, now, ...extra });
function pagedReader(variants, calls = []) {
  const tables = { brands: [{ id: brandId, workspace_id: workspaceId, name: '브랜드' }], content_items: [{ id: contentId, workspace_id: workspaceId, brand_id: brandId, title: '아이템' }], content_variants: variants };
  return async (table, options) => {
    calls.push({ table, options });
    const cursor = options.filters.find(([key, value]) => key === 'id' && value.startsWith('gt.'))?.[1].slice(3);
    return detailed(tables[table].filter(value => !cursor || value.id > cursor).sort((a,b) => a.id.localeCompare(b.id)).slice(0, 100));
  };
}

test('reads past 160 with scoped ID pagination and compact projections, including short server pages', async () => {
  assert.ok(repository, 'performance repository must exist');
  const rows = Array.from({ length: 261 }, (_, i) => row({ id: `44444444-4444-4444-4444-${String(i).padStart(12, '0')}` }));
  const calls = [];
  const result = await repository.getContentPerformance({ year: 2026, workspaceId: 'foreign' }, deps({ fetchRows: pagedReader(rows, calls) }));
  assert.equal(result.status, 'live'); assert.equal(result.publications.length, 261);
  assert.equal(result.workspaceId, workspaceId);
  assert.ok(calls.every(({ options }) => options.filters.some(([key,value]) => key === 'workspace_id' && value === `eq.${workspaceId}`)));
  assert.ok(calls.every(({ options }) => options.order === 'id.asc' && !options.select.includes('*') && !options.select.split(',').includes('body')));
  assert.equal(calls.filter(({table}) => table === 'content_variants').length, 4);
  assert.ok(calls.every(({table}) => table !== 'content_publish_logs'));
});

test('counts dated variants regardless of archived status, excludes future and undated, and retains current week across years', async () => {
  assert.ok(repository);
  const variants = [row({ id: 'a', status: 'archived', published_at: '2025-12-29T00:00:00Z', channel: null, variant_type: 'x_thread', meta: { views: 999, performance: { views: 0, shares: null, replies: 3, capturedAt: now, source: 'manual' } } }), row({ id: 'b' }), row({ id: 'c', published_at: '2026-01-01T07:00:00Z' }), row({ id: 'd', published_at: null }), row({ id: 'e', published_at: 'invalid' }), row({ id: 'f', published_at: '2025-12-01T00:00:00Z' }), row({ id: 'g', status: 'draft', published_at: null })];
  const result = await repository.getContentPerformance({ year: 2026 }, deps({ fetchRows: pagedReader(variants) }));
  assert.deepEqual(result.publications.map(p => p.id).sort(), ['a','b']);
  assert.equal(result.excludedUndated, 2);
  const archived = result.publications.find(p => p.id === 'a');
  assert.equal(archived.channel, 'x'); assert.equal(archived.metrics.views, 0); assert.equal(archived.metrics.replies, 3);
  assert.equal(archived.publishedAt, '2025-12-29T00:00:00.000Z');
  assert.equal(archived.href, `/dashboard/content/studio?item=${contentId}&variant=a`);
  assert.equal(result.publications.find(p => p.id === 'b').metrics.views, null);
});

test('preview, page failures, cap, malformed cursor, foreign rows and broken references never become partial live results', async () => {
  assert.ok(repository);
  assert.equal((await repository.getContentPerformance({}, deps({ workspaceId: '', fetchRows: () => { throw Error('must not read'); } }))).status, 'preview');
  assert.equal((await repository.getContentPerformance({}, deps({ fetchRows: async () => ({ configured: false, rows: null }) }))).status, 'preview');
  for (const fetchRows of [async () => ({ configured: true, rows: null, error: { reason: 'failed' } }), pagedReader([row({ workspace_id: 'foreign' })]), pagedReader([row({ content_id: 'missing' })]), async () => detailed([{ id: 'a', workspace_id: workspaceId }])]) {
    const result = await repository.getContentPerformance({}, deps({ fetchRows, maxPages: 3 }));
    assert.equal(result.status, 'error'); assert.deepEqual(result.publications, []);
  }
  const cap = await repository.getContentPerformance({}, deps({ fetchRows: pagedReader([row()]), maxPages: 1 }));
  assert.equal(cap.status, 'error');
});

test('validates year strictly and defaults to KST year', async () => {
  assert.ok(repository);
  for (const year of ['2026oops', 1969, 2101, 2026.5, '']) {
    assert.equal((await repository.getContentPerformance({ year }, deps({ fetchRows: () => { throw Error('must not read'); } }))).status, 'error');
  }
  assert.equal((await repository.getContentPerformance({}, deps({ now: '2025-12-31T15:00:00Z', fetchRows: pagedReader([]) }))).year, 2026);
});

const payload = extra => ({ variantId, expectedUpdatedAt: updatedAt, views: 0, shares: null, replies: 12, ...extra });
test('manual write preserves sibling metadata and uses workspace/id/exact timestamp CAS with server capture time', async () => {
  assert.ok(repository);
  let write;
  const result = await repository.saveContentPerformance(payload(), deps({ fetchRows: async (table, options) => {
    assert.equal(table, 'content_variants');
    assert.deepEqual(options.filters, [['workspace_id', `eq.${workspaceId}`], ['id', `eq.${variantId}`]]);
    return detailed([row({ meta: { brief: { audience: 'reader' }, origin: 'studio', performance: { views: 999 } } })]);
  }, updateRecord: async (table, filters, patch, options) => {
    write = { table, filters, patch, options };
    return { persisted: true, record: { id: variantId, updated_at: now, meta: patch.meta } };
  } }));
  assert.equal(result.status, 'saved');
  assert.deepEqual(write.filters, [['workspace_id', `eq.${workspaceId}`], ['id', `eq.${variantId}`], ['updated_at', `eq.${updatedAt}`]]);
  assert.equal(write.options.returnRepresentation, true);
  assert.deepEqual(write.patch.meta.brief, { audience: 'reader' }); assert.equal(write.patch.meta.origin, 'studio');
  assert.deepEqual(write.patch.meta.performance, { views: 0, shares: null, replies: 12, capturedAt: now, source: 'manual' });
  assert.equal(write.patch.updated_at, now);
  assert.deepEqual(result.entry, { id: variantId, updatedAt: now, metrics: write.patch.meta.performance });
});

test('rejects malformed metrics, empty updates, unknown client fields and unsafe timestamps before reads', async () => {
  assert.ok(repository);
  const invalid = [payload({ views: -1 }), payload({ views: '1' }), payload({ shares: 1.5 }), payload({ replies: Number.MAX_SAFE_INTEGER + 1 }), payload({ views: null, replies: null }), payload({ expectedUpdatedAt: '2026-01-01' }), payload({ expectedUpdatedAt: 'bad' }), payload({ variantId: 'bad' }), payload({ workspaceId: 'foreign' }), payload({ source: 'api' }), [], null];
  for (const value of invalid) {
    const result = await repository.saveContentPerformance(value, deps({ fetchRows: () => { throw Error('must not read'); } }));
    assert.equal(result.status, 'invalid-input');
  }
});

test('rejects foreign, absent, undated and future variants without writes', async () => {
  assert.ok(repository);
  for (const rows of [[], [row({ workspace_id: 'foreign' })], [row({ published_at: null })], [row({ published_at: '2026-01-02T00:00:00Z' })]]) {
    const result = await repository.saveContentPerformance(payload(), deps({ fetchRows: async () => detailed(rows), updateRecord: () => { throw Error('must not write'); } }));
    assert.ok(['not-found', 'invalid-input', 'error'].includes(result.status));
  }
});

test('pre-read and racing CAS conflicts do not retry; read and ambiguous write failures are honest', async () => {
  assert.ok(repository);
  const stale = await repository.saveContentPerformance(payload(), deps({ fetchRows: async () => detailed([row({ updated_at: now })]), updateRecord: () => { throw Error('must not write'); } }));
  assert.equal(stale.status, 'conflict');
  for (const reason of ['no-matching-row', 'timeout', 'http-500']) {
    let writes = 0;
    const result = await repository.saveContentPerformance(payload(), deps({ fetchRows: async () => detailed([row()]), updateRecord: async () => { writes++; return { persisted: false, reason }; } }));
    assert.equal(result.status, reason === 'no-matching-row' ? 'conflict' : 'error'); assert.equal(writes, 1);
  }
  assert.equal((await repository.saveContentPerformance(payload(), deps({ fetchRows: async () => ({ configured: true, error: 'failed', rows: null }) }))).status, 'error');
  assert.equal((await repository.saveContentPerformance(payload(), deps({ fetchRows: async () => ({ configured: false, rows: null }) }))).status, 'preview');
});

test('a failure after a successful page discards every partial publication', async () => {
  const read = pagedReader([row()]);
  let variantPages = 0;
  const result = await repository.getContentPerformance({ year: 2026 }, deps({ fetchRows: async (table, options) => {
    if (table === 'content_variants' && ++variantPages === 2) return { configured: true, error: { reason: 'timeout' }, rows: null };
    return read(table, options);
  } }));
  assert.equal(variantPages, 2);
  assert.equal(result.status, 'error');
  assert.deepEqual(result.publications, []);
});

test('unknown channels stay explicitly unknown and unrelated metric keys are never inferred', async () => {
  const result = await repository.getContentPerformance({ year: 2026 }, deps({ fetchRows: pagedReader([row({ channel: null, variant_type: 'unrecognized', meta: { views: 99, analytics: { views: 50 }, performance: { views: '3', shares: -1, replies: 0 } } })]) }));
  assert.equal(result.status, 'live');
  assert.equal(result.publications[0].channel, 'unknown');
  assert.deepEqual(result.channels, [{ value: 'unknown', label: '채널 미지정' }]);
  assert.deepEqual(result.publications[0].metrics, { views: null, shares: null, replies: 0, capturedAt: null, source: null });
});
