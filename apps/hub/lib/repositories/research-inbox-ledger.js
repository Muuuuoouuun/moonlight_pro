import { fetchSupabaseRowsDetailed, inFilter } from '@/lib/server-read';
import { resolveDefaultWorkspaceId } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';

const empty = status => ({ status, briefs: [] });

export async function listResearchBriefs({
  workspaceId = resolveDefaultWorkspaceId(), fetchRows = fetchSupabaseRowsDetailed,
} = {}) {
  if (!isCanonicalUuid(workspaceId)) return empty('preview');
  try {
    const scoped = [['workspace_id', `eq.${workspaceId}`]];
    const roots = await fetchRows('research_briefs', {
      select: 'id,workspace_id,brand_id,latest_revision,state,state_version,created_at,updated_at',
      filters: scoped, order: 'created_at.desc,id.desc', limit: 101, dedupe: false,
    });
    if (!roots.configured) return empty('preview');
    if (roots.error || !Array.isArray(roots.rows)) return empty('error');
    if (!roots.rows.length) return empty('live');
    const rows = roots.rows.slice(0, 100);
    const filters = [...scoped, ['brief_id', inFilter(rows.map(row => row.id))]];
    const [revisions, promotions] = await Promise.all([
      fetchRows('research_brief_revisions', { select: 'brief_id,revision,payload,created_at', filters, limit: 101, dedupe: false }),
      fetchRows('research_promotions', { select: 'brief_id,revision,content_id,variant_id,destination,created_at', filters, limit: 101, dedupe: false }),
    ]);
    if (revisions.error || promotions.error || !Array.isArray(revisions.rows) || !Array.isArray(promotions.rows)) return empty('error');
    const byRevision = new Map(revisions.rows.map(row => [`${row.brief_id}:${row.revision}`, row]));
    const byPromotion = new Map(promotions.rows.map(row => [row.brief_id, row]));
    const briefs = rows.map(root => {
      const revision = byRevision.get(`${root.id}:${root.latest_revision}`);
      if (!revision || !revision.payload || typeof revision.payload !== 'object') return null;
      return { ...revision.payload, id: root.id, brandId: root.brand_id, revision: root.latest_revision,
        stateVersion: root.state_version,
        state: root.state, createdAt: root.created_at, updatedAt: root.updated_at,
        promotion: byPromotion.get(root.id) || null };
    });
    if (briefs.some(brief => !brief)) return empty('error');
    return { status: roots.rows.length > 100 ? 'partial' : 'live', briefs };
  } catch { return empty('error'); }
}
