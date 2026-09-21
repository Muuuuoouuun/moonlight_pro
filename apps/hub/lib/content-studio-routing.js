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

export function studioDocumentQuery(draft, draftKey) {
  const query = new URLSearchParams();
  if (draft.contentId) query.set('item', draft.contentId);
  if (draft.variantId) query.set('variant', draft.variantId);
  if (!draft.contentId) {
    query.set('new', 'draft');
    query.set('draft', draftKey);
    // Also preserves an unresolved query ref during the initial catalog lookup.
    if (draft.brandId) query.set('brand', draft.brandId);
  }
  return query.toString();
}
