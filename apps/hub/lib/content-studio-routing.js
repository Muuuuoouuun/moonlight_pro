import { isCanonicalUuid } from './uuid.js';

export function shouldRestoreActiveStudioDraft({ itemParam, newParam } = {}) {
  return !itemParam && newParam !== "draft";
}

// Older brand, queue and log links use slugs; the write contract requires a UUID.
// A failed or incomplete catalog read must never turn an unresolved slug into an ID.
export async function resolveStudioBrandId(reference, { fetchImpl = fetch } = {}) {
  const ref = String(reference || '').trim();
  if (!ref || isCanonicalUuid(ref)) return ref.toLowerCase();
  const response = await fetchImpl('/api/hub/content/catalog', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const catalog = await response.json();
  if (!response.ok || catalog?.source !== 'supabase' || !['live', 'partial'].includes(catalog?.status) || !Array.isArray(catalog?.brands)) {
    throw new Error('선택한 브랜드를 확인하지 못했습니다. 브랜드 목록을 다시 불러와주세요.');
  }
  const brand = catalog.brands.find((entry) => entry?.key === ref || entry?.slug === ref);
  if (brand && isCanonicalUuid(brand.id)) return brand.id.toLowerCase();
  throw new Error(catalog.status === 'partial'
    ? '브랜드 목록을 일부만 읽어 선택한 브랜드를 확인하지 못했습니다. 브랜드 목록에서 다시 선택해주세요.'
    : '선택한 브랜드를 찾지 못했습니다. 브랜드 목록에서 다시 선택해주세요.');
}

export async function resolveStudioCampaignContext(reference, { scope = 'all', fetchImpl = fetch } = {}) {
  if (!isCanonicalUuid(reference)) throw new Error('캠페인 주소를 확인해주세요. 확인되지 않은 캠페인에 초안을 연결할 수 없습니다.');
  const query = new URLSearchParams({ campaign: reference.toLowerCase(), scope });
  const response = await fetchImpl('/api/hub/content/workflow?' + query, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || data?.status !== 'live' || data.campaign?.id !== reference.toLowerCase()
      || (data.campaign.brandId && !isCanonicalUuid(data.campaign.brandId))) {
    throw new Error(data?.status === 'not-found' ? '현재 범위에서 캠페인을 찾을 수 없습니다. 원래 캠페인 링크를 다시 확인해주세요.'
      : '캠페인을 확인하지 못했습니다. 같은 링크로 다시 불러와주세요.');
  }
  return data.campaign;
}

export function campaignStudioHref(campaign, scope = '') {
  if (!isCanonicalUuid(campaign?.id)) return null;
  const params = new URLSearchParams({ new: 'draft', campaign: campaign.id.toLowerCase() });
  if (scope && scope !== 'all') params.set('scope', scope);
  if (isCanonicalUuid(campaign.brandId)) params.set('brand', campaign.brandId.toLowerCase());
  return '/dashboard/content/studio?' + params;
}

export function studioWithoutCampaignHref(campaignContext, scope = '') {
  const params = new URLSearchParams({ new: 'draft' });
  if (scope && scope !== 'all') params.set('scope', scope);
  if (isCanonicalUuid(campaignContext?.brandId)) params.set('brand', campaignContext.brandId.toLowerCase());
  return '/dashboard/content/studio?' + params;
}

export function studioDocumentQuery(draft, draftKey, { scope = '', campaignId = null } = {}) {
  const query = new URLSearchParams();
  if (draft.contentId) query.set('item', draft.contentId);
  if (draft.variantId) query.set('variant', draft.variantId);
  if (!draft.contentId) {
    query.set('new', 'draft');
    query.set('draft', draftKey);
    // Also preserves an unresolved query ref during the initial catalog lookup.
    if (draft.brandId) query.set('brand', draft.brandId);
  }
  if (scope && scope !== 'all') query.set('scope', scope);
  if (campaignId !== null) query.set('campaign', campaignId);
  return query.toString();
}
