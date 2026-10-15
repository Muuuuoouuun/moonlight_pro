import test from 'node:test';
import assert from 'node:assert/strict';
import { listResearchBriefs } from './research-inbox-ledger.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const briefId = '22222222-2222-4222-8222-222222222222';
const brandId = '33333333-3333-4333-8333-333333333333';

test('returns preview without a workspace and never reads storage', async () => {
  const result = await listResearchBriefs({ workspaceId: '', fetchRows: () => { throw Error('must not read'); } });
  assert.deepEqual(result, { status: 'preview', briefs: [] });
});

test('joins current immutable revision to a scoped root and promotion', async () => {
  const calls = [];
  const fetchRows = async (table, options) => {
    calls.push([table, options]);
    if (table === 'research_briefs') return { configured: true, error: null, rows: [{ id: briefId, workspace_id: workspaceId, brand_id: brandId, latest_revision: 1, state_version: 2, state: 'promoted', created_at: '2026-09-30T00:00:00Z' }] };
    if (table === 'research_brief_revisions') return { configured: true, error: null, rows: [{ brief_id: briefId, revision: 1, payload: { title: '검증한 변화', draft: '원고' } }] };
    return { configured: true, error: null, rows: [{ brief_id: briefId, content_id: '44444444-4444-4444-8444-444444444444', destination: 'idea' }] };
  };
  const result = await listResearchBriefs({ workspaceId, fetchRows });
  assert.equal(result.status, 'live');
  assert.equal(result.briefs[0].title, '검증한 변화');
  assert.equal(result.briefs[0].promotion.destination, 'idea');
  assert.equal(result.briefs[0].stateVersion, 2);
  assert.ok(calls.every(([, options]) => options.filters.some(([key, value]) => key === 'workspace_id' && value === `eq.${workspaceId}`)));
});

test('a failed revision read is an error, never an empty inbox', async () => {
  const fetchRows = async table => table === 'research_briefs'
    ? { configured: true, error: null, rows: [{ id: briefId, workspace_id: workspaceId, latest_revision: 1 }] }
    : { configured: true, error: { status: 503 }, rows: null };
  assert.deepEqual(await listResearchBriefs({ workspaceId, fetchRows }), { status: 'error', briefs: [] });
});

test('an old deep link reads exactly one scoped root and its current revision', async () => {
  const calls = [];
  const fetchRows = async (table, options) => {
    calls.push([table, options]);
    if (table === 'research_briefs') {
      assert.ok(options.filters.some(([key, value]) => key === 'id' && value === `eq.${briefId}`));
      assert.equal(options.limit, 1);
      return { configured: true, rows: [{ id: briefId, workspace_id: workspaceId, brand_id: brandId, latest_revision: 17, state: 'new' }] };
    }
    if (table === 'research_brief_revisions') {
      assert.ok(options.filters.some(([key, value]) => key === 'revision' && value === 'eq.17'));
      return { configured: true, rows: [{ brief_id: briefId, revision: 17, payload: { title: '오래된 원본' } }] };
    }
    return { configured: true, rows: [] };
  };
  const result = await listResearchBriefs({ workspaceId, briefId, brandId, fetchRows });
  assert.equal(result.status, 'live');
  assert.equal(result.briefs[0].id, briefId);
  assert.equal(result.briefs[0].revision, 17);
  assert.ok(calls.every(([, options]) => options.filters.some(([key, value]) => key === 'workspace_id' && value === `eq.${workspaceId}`)));
});

test('missing or differently scoped deep links never return another research item', async () => {
  const calls = [];
  const result = await listResearchBriefs({ workspaceId, briefId, brandId, fetchRows: async (table, options) => {
    calls.push(table);
    assert.ok(options.filters.some(([key, value]) => key === 'brand_id' && value === `eq.${brandId}`));
    return { configured: true, rows: [] };
  } });
  assert.deepEqual(result, { status: 'not-found', briefs: [] });
  assert.deepEqual(calls, ['research_briefs']);
  for (const invalid of ['', 'old-slug', 'abc,or(workspace_id.eq.other)']) {
    assert.deepEqual(await listResearchBriefs({ workspaceId, briefId: invalid, fetchRows: () => assert.fail('invalid ID must not query') }), { status: 'invalid-input', briefs: [] });
  }
});
