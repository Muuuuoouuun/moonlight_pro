import assert from "node:assert/strict";
import { test } from "node:test";

let routing = null;

try {
  routing = await import("./content-studio-routing.js");
} catch {
  // Red phase: explicit new-draft routes do not yet bypass the active local draft.
}

test("restores an active local draft only for an unqualified Studio visit", () => {
  assert.ok(routing, "content-studio-routing.js must exist");
  assert.equal(
    routing.shouldRestoreActiveStudioDraft({ itemParam: null, newParam: null }),
    true,
  );
  assert.equal(
    routing.shouldRestoreActiveStudioDraft({ itemParam: "item-1", newParam: null }),
    false,
  );
  assert.equal(
    routing.shouldRestoreActiveStudioDraft({ itemParam: null, newParam: "draft" }),
    false,
  );
});

test('brand links resolve slugs to durable IDs while UUID and unbranded drafts skip the catalog', async () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const noFetch = async () => assert.fail('UUID and unbranded drafts need no lookup');
  assert.equal(await routing.resolveStudioBrandId('', { fetchImpl: noFetch }), '');
  assert.equal(await routing.resolveStudioBrandId(id.toUpperCase(), { fetchImpl: noFetch }), id);
  for (const status of ['live', 'partial']) {
    const fetchImpl = async (url) => {
      assert.equal(url, '/api/hub/content/catalog');
      return { ok: true, json: async () => ({ source: 'supabase', status, brands: [{ key: 'writing-brand', id }] }) };
    };
    assert.equal(await routing.resolveStudioBrandId('writing-brand', { fetchImpl }), id);
  }
});

test('unverified catalogs never seed a slug as the brand ID', async () => {
  for (const catalog of [
    { status: 'error', source: 'error' },
    { status: 'preview', source: 'preview', brands: [] },
    { status: 'live', source: 'supabase', brands: null },
    { status: 'live', source: 'supabase', brands: [null] },
    { status: 'live', source: 'supabase', brands: [{ key: 'writing-brand', id: 'invalid' }] },
  ]) {
    await assert.rejects(routing.resolveStudioBrandId('writing-brand', { fetchImpl: async () => ({ ok: true, json: async () => catalog }) }));
  }
  await assert.rejects(routing.resolveStudioBrandId('missing', { fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'partial', source: 'supabase', brands: [] }) }) }), /일부만 읽어/);
  await assert.rejects(routing.resolveStudioBrandId('missing', { fetchImpl: async () => ({ ok: false, json: async () => ({ status: 'live', source: 'supabase', brands: [] }) }) }), /확인하지 못/);
});

test('a new draft URL retains its brand through lookup and reload; persisted items use their own identity', () => {
  for (const brandId of ['writing-brand', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']) {
    const query = new URLSearchParams(routing.studioDocumentQuery({ brandId }, 'draft-key'));
    assert.equal(query.get('brand'), brandId);
    assert.equal(query.get('draft'), 'draft-key');
    assert.equal(query.get('new'), 'draft');
  }
  const query = new URLSearchParams(routing.studioDocumentQuery({ contentId: 'item', variantId: 'variant', brandId: 'ignored-query-brand' }, 'old-draft'));
  assert.deepEqual([...query], [['item', 'item'], ['variant', 'variant']]);
});

test('Campaign links use durable IDs and retain scope, brand and unresolved references', () => {
  const campaignId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const brandId = '11111111-2222-4333-8444-555555555555';
  assert.equal(routing.campaignStudioHref({ id: 'local-campaign-123' }), null);
  const url = new URL(routing.campaignStudioHref({ id: campaignId, brandId }, 'classin'), 'https://local.test');
  assert.equal(url.searchParams.get('campaign'), campaignId);
  assert.equal(url.searchParams.get('brand'), brandId);
  assert.equal(url.searchParams.get('scope'), 'classin');
  const draftQuery = new URLSearchParams(routing.studioDocumentQuery({ brandId }, 'draft-key', { scope: 'classin', campaignId: 'legacy-unresolved' }));
  assert.equal(draftQuery.get('campaign'), 'legacy-unresolved');
  assert.equal(draftQuery.get('scope'), 'classin');
  assert.equal(draftQuery.get('brand'), brandId);
  assert.equal(new URLSearchParams(routing.studioDocumentQuery({}, 'key', { campaignId: '' })).has('campaign'), true);
  const unlinked = new URL(routing.studioWithoutCampaignHref({ brandId }, 'classin'), 'https://local.test');
  assert.equal(unlinked.searchParams.has('campaign'), false);
  assert.equal(unlinked.searchParams.get('brand'), brandId);
  assert.equal(unlinked.searchParams.get('scope'), 'classin');
});

test('Campaign context needs a current matching read and failures can retry the same reference', async () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  let calls = 0;
  const fetchImpl = async url => {
    calls++; assert.equal(new URL(url, 'https://local.test').searchParams.get('campaign'), id);
    return { ok: true, json: async () => calls === 1 ? { status: 'error' } : { status: 'live', campaign: { id, brandId: null } } };
  };
  await assert.rejects(routing.resolveStudioCampaignContext(id, { fetchImpl }), /확인하지 못/);
  assert.equal((await routing.resolveStudioCampaignContext(id, { fetchImpl })).id, id);
  await assert.rejects(routing.resolveStudioCampaignContext('old-slug', { fetchImpl: () => assert.fail('invalid references must not query') }));
  for (const data of [{ status: 'preview' }, { status: 'not-found' }, { status: 'live', campaign: { id: 'other' } }]) {
    await assert.rejects(routing.resolveStudioCampaignContext(id, { fetchImpl: async () => ({ ok: true, json: async () => data }) }));
  }
});
