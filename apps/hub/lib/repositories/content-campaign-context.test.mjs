import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentCampaignContext } from './content-campaign-context.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const brandId = '33333333-3333-4333-8333-333333333333';
const row = { id: campaignId, workspace_id: workspaceId, brand_id: brandId, name: '연결 검증', created_at: '2026-10-05T00:00:00Z' };
const detailed = rows => ({ configured: true, error: null, rows });

test('campaign context uses exact scoped reads and honestly reports unsupported attribution', async () => {
  const calls = [];
  const result = await getContentCampaignContext(campaignId, { workspaceId, scope: 'classin', fetchRows: async (table, options) => {
    calls.push([table, options]);
    return detailed(table === 'campaigns' ? [row] : [{ id: brandId, workspace_id: workspaceId, name: '회사 브랜드', slug: 'class.moon', meta: { org_scope: 'classin' } }]);
  } });
  assert.equal(result.status, 'live');
  assert.equal(result.attributionSupported, false);
  assert.equal(result.campaign.id, campaignId);
  assert.equal(result.campaign.brandId, brandId);
  assert.equal(result.campaign.orgScope, 'classin');
  assert.ok(calls.every(([, options]) => options.limit === 1 && options.filters.some(([key, value]) => key === 'workspace_id' && value === `eq.${workspaceId}`)));
  assert.deepEqual(calls[0][1].filters[1], ['id', `eq.${campaignId}`]);
  assert.deepEqual(calls[1][1].filters[1], ['id', `eq.${brandId}`]);
});

test('personal/company, missing/invalid and failed contexts never produce a confirmed campaign', async () => {
  const fetchRows = async table => detailed(table === 'campaigns' ? [row] : [{ id: brandId, workspace_id: workspaceId, meta: { org_scope: 'classin' } }]);
  for (const scope of ['personal', 'brand']) {
    const result = await getContentCampaignContext(campaignId, { workspaceId, scope, fetchRows });
    assert.equal(result.status, 'not-found'); assert.equal(result.campaign, null);
  }
  const personalRead = async table => detailed(table === 'campaigns' ? [row] : [{ id: brandId, workspace_id: workspaceId, meta: { org_scope: 'personal' } }]);
  assert.equal((await getContentCampaignContext(campaignId, { workspaceId, scope: 'company', fetchRows: personalRead })).status, 'not-found');
  for (const id of ['', 'legacy-campaign-id']) {
    assert.equal((await getContentCampaignContext(id, { workspaceId, fetchRows: () => assert.fail('invalid ID must not query') })).status, 'invalid-input');
  }
  assert.equal((await getContentCampaignContext(campaignId, { workspaceId, fetchRows: async () => detailed([]) })).status, 'not-found');
  assert.equal((await getContentCampaignContext(campaignId, { workspaceId, fetchRows: async () => detailed([{ ...row, workspace_id: 'other' }]) })).status, 'not-found');
  assert.equal((await getContentCampaignContext(campaignId, { workspaceId, fetchRows: async () => ({ configured: true, rows: [], error: 'unavailable' }) })).status, 'error');
  assert.equal((await getContentCampaignContext(campaignId, { workspaceId: '', fetchRows: () => assert.fail('no workspace') })).status, 'preview');
});
