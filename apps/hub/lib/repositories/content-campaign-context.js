import { fetchSupabaseRowsDetailed } from '@/lib/server-read';
import { resolveDefaultWorkspaceId } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';
import { mapBrands } from './content-ledger.js';

// This read verifies navigation context only. The workflow RPC cannot save campaign attribution.
export async function getContentCampaignContext(campaignId, {
  workspaceId = resolveDefaultWorkspaceId(), scope = 'all', fetchRows = fetchSupabaseRowsDetailed,
} = {}) {
  const empty = status => ({ status, campaign: null, attributionSupported: false });
  if (!isCanonicalUuid(campaignId) || !['all', 'personal', 'brand', 'classin', 'company'].includes(scope)) return empty('invalid-input');
  if (!isCanonicalUuid(workspaceId)) return empty('preview');
  try {
    const filters = [['workspace_id', `eq.${workspaceId}`]];
    const read = await fetchRows('campaigns', { select: '*', filters: [...filters, ['id', `eq.${campaignId.toLowerCase()}`]], limit: 1, dedupe: false });
    if (!read.configured) return empty('preview');
    if (read.error || !Array.isArray(read.rows)) return empty('error');
    const row = read.rows[0];
    if (!row || row.id !== campaignId.toLowerCase() || row.workspace_id !== workspaceId) return empty('not-found');
    let brand = null;
    if (row.brand_id) {
      if (!isCanonicalUuid(row.brand_id)) return empty('error');
      const brands = await fetchRows('brands', { select: '*', filters: [...filters, ['id', `eq.${row.brand_id}`]], limit: 1, dedupe: false });
      if (!brands.configured || brands.error || !Array.isArray(brands.rows)) return empty('error');
      if (brands.rows[0]?.id !== row.brand_id || brands.rows[0]?.workspace_id !== workspaceId) return empty('not-found');
      brand = mapBrands(brands.rows)[0];
    }
    const declaredScope = row.meta?.org_scope || null;
    const orgScope = declaredScope || brand?.orgScope || null;
    if (orgScope && !['personal', 'brand', 'classin', 'company'].includes(orgScope)) return empty('error');
    const company = orgScope === 'classin' || orgScope === 'company';
    if (declaredScope && brand?.orgScope && company !== ['classin', 'company'].includes(brand.orgScope)) return empty('error');
    if (scope !== 'all' && (!orgScope || (['classin', 'company'].includes(scope) ? !company : company))) return empty('not-found');
    return { status: 'live', attributionSupported: false, campaign: { id: row.id, name: row.name,
      workspaceId, brandId: brand?.id || null, orgScope, updatedAt: row.updated_at || row.created_at } };
  } catch { return empty('error'); }
}
