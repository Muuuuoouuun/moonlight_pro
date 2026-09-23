import { fetchSupabaseRowsDetailed } from '@/lib/server-read';
import { resolveDefaultWorkspaceId, updateSupabaseRecord } from '@/lib/server-write';
import { performancePeriods, seoulDate } from '@/lib/content-performance';

const METRIC_KEYS = ['views', 'shares', 'replies'];
const CHANNEL_LABELS = { threads: 'Threads', x: 'X', instagram: 'Instagram', youtube_shorts: 'YouTube Shorts', reels: 'Reels', blog: 'Web', email: 'Email', unknown: '채널 미지정' };
const TYPE_CHANNELS = { threads_post: 'threads', social_post: 'x', x_thread: 'x', card_news: 'instagram', reels_script: 'reels', blog: 'blog', blog_insight: 'blog', landing_copy: 'blog', newsletter: 'email' };
const VARIANT_SELECT = 'id,workspace_id,content_id,title,channel,variant_type,status,published_at,updated_at,meta';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const datePart = value.slice(0, 10);
  const calendar = new Date(`${datePart}T00:00:00Z`);
  const date = new Date(value);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== datePart || !Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function metricsFrom(row) {
  const value = row.meta?.performance;
  return {
    ...Object.fromEntries(METRIC_KEYS.map(key => [key, Number.isSafeInteger(value?.[key]) && value[key] >= 0 ? value[key] : null])),
    capturedAt: timestamp(value?.capturedAt),
    source: typeof value?.source === 'string' ? value.source : null,
  };
}

function entryFrom(row) {
  return { id: row.id, updatedAt: row.updated_at, metrics: metricsFrom(row) };
}

async function readAll(table, select, { workspaceId, fetchRows, maxPages }) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const read = await fetchRows(table, { select, order: 'id.asc', limit: 500, filters: [['workspace_id', `eq.${workspaceId}`], ...(cursor ? [['id', `gt.${cursor}`]] : [])] });
    if (!read.configured) throw Object.assign(new Error('Supabase 연결이 필요합니다.'), { preview: true });
    if (read.error || !Array.isArray(read.rows)) throw new Error('콘텐츠 성과를 읽지 못했습니다. 다시 불러오세요.');
    // Continue even after a short page: PostgREST may impose a lower server limit.
    if (!read.rows.length) return rows;
    for (const row of read.rows) {
      if (row.workspace_id !== workspaceId || typeof row.id !== 'string' || !row.id || (cursor && row.id <= cursor)) {
        throw new Error('콘텐츠 성과 조회 범위 또는 페이지 순서를 확인할 수 없습니다.');
      }
      cursor = row.id;
      rows.push(row);
    }
  }
  throw new Error('콘텐츠 성과 조회 상한에 도달했습니다. 일부 결과를 집계하지 않습니다.');
}

export async function getContentPerformance({ year } = {}, {
  workspaceId = resolveDefaultWorkspaceId(), fetchRows = fetchSupabaseRowsDetailed,
  now = new Date(), maxPages = 100,
} = {}) {
  const generatedAt = new Date(now).toISOString();
  const periods = performancePeriods(now);
  const selectedYear = year === undefined ? periods.year : typeof year === 'number' || (typeof year === 'string' && /^\d{4}$/.test(year)) ? Number(year) : NaN;
  const empty = { workspaceId: workspaceId || null, year: Number.isInteger(selectedYear) ? selectedYear : periods.year, generatedAt, publications: [], brands: [], channels: [], excludedUndated: 0 };
  if (!Number.isInteger(selectedYear) || selectedYear < 1970 || selectedYear > 2100) return { ...empty, status: 'error', message: '연도는 1970~2100 사이의 정수여야 합니다.' };
  if (!workspaceId) return { ...empty, status: 'preview' };
  try {
    const results = await Promise.allSettled([
      readAll('brands', 'id,workspace_id,name', { workspaceId, fetchRows, maxPages }),
      readAll('content_items', 'id,workspace_id,title,brand_id', { workspaceId, fetchRows, maxPages }),
      readAll('content_variants', VARIANT_SELECT, { workspaceId, fetchRows, maxPages }),
    ]);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw (failures.find(result => !result.reason.preview) || failures[0]).reason;
    const [brands, items, variants] = results.map(result => result.value);
    const brandById = new Map(brands.map(brand => [brand.id, brand]));
    const itemById = new Map(items.map(item => [item.id, item]));
    const publications = [];
    let excludedUndated = 0;
    for (const variant of variants) {
      const publishedAt = timestamp(variant.published_at);
      if (!publishedAt) {
        if (variant.status === 'published') excludedUndated += 1;
        continue;
      }
      if (publishedAt > generatedAt) continue;
      const date = seoulDate(publishedAt);
      if (Number(date.slice(0, 4)) !== selectedYear && !(date >= periods.weekStart && date <= periods.today)) continue;
      const item = itemById.get(variant.content_id);
      if (!item || (item.brand_id && !brandById.has(item.brand_id))) throw new Error('발행 원고의 콘텐츠 또는 브랜드 연결을 확인할 수 없습니다.');
      const channel = typeof variant.channel === 'string' && variant.channel.trim() ? variant.channel.trim() : TYPE_CHANNELS[variant.variant_type] || 'unknown';
      publications.push({
        id: variant.id, contentId: item.id, title: variant.title?.trim() || item.title?.trim() || '제목 없음',
        brandId: item.brand_id || null, brandName: item.brand_id ? brandById.get(item.brand_id).name : '브랜드 미지정',
        channel, publishedAt, updatedAt: variant.updated_at || null, metrics: metricsFrom(variant),
        href: `/dashboard/content/studio?item=${encodeURIComponent(item.id)}&variant=${encodeURIComponent(variant.id)}`,
      });
    }
    publications.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
    return { ...empty, status: 'live', publications, excludedUndated,
      brands: brands.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      channels: [...new Set(publications.map(row => row.channel))].sort().map(value => ({ value, label: CHANNEL_LABELS[value] || value })),
    };
  } catch (error) {
    return { ...empty, status: error.preview ? 'preview' : 'error', message: error.message || '콘텐츠 성과를 읽지 못했습니다.' };
  }
}

export async function saveContentPerformance(payload, {
  workspaceId = resolveDefaultWorkspaceId(), fetchRows = fetchSupabaseRowsDetailed,
  updateRecord = updateSupabaseRecord, now = new Date(),
} = {}) {
  const allowedKeys = new Set(['variantId', 'expectedUpdatedAt', ...METRIC_KEYS]);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).some(key => !allowedKeys.has(key))
    || !UUID.test(payload.variantId || '') || !timestamp(payload.expectedUpdatedAt)
    || METRIC_KEYS.some(key => payload[key] != null && (!Number.isSafeInteger(payload[key]) || payload[key] < 0))
    || !METRIC_KEYS.some(key => payload[key] != null)) {
    return { status: 'invalid-input', message: '원고와 수정 시각, 0 이상의 정수 수치를 확인하세요. 최소 한 가지 수치가 필요합니다.' };
  }
  if (!workspaceId) return { status: 'preview', message: '워크스페이스 연결이 필요합니다.' };
  try {
    const filters = [['workspace_id', `eq.${workspaceId}`], ['id', `eq.${payload.variantId}`]];
    const read = await fetchRows('content_variants', { select: VARIANT_SELECT, filters, limit: 1 });
    if (!read.configured) return { status: 'preview', message: 'Supabase 연결이 필요합니다.' };
    if (read.error || !Array.isArray(read.rows)) return { status: 'error', message: '저장할 원고를 읽지 못했습니다.' };
    const row = read.rows[0];
    if (!row) return { status: 'not-found', message: '이 워크스페이스에서 원고를 찾을 수 없습니다.' };
    if (row.workspace_id !== workspaceId || row.id !== payload.variantId) return { status: 'error', message: '원고의 조회 범위를 확인할 수 없습니다.' };
    const capturedAt = new Date(now).toISOString();
    const publishedAt = timestamp(row.published_at);
    if (!publishedAt || publishedAt > capturedAt) return { status: 'invalid-input', message: '실제로 발행한 원고에만 성과를 기록할 수 있습니다.' };
    const conflict = { status: 'conflict', message: '다른 창에서 원고가 변경되었습니다. 다시 불러온 뒤 입력을 확인하고 저장하세요.' };
    if (row.updated_at !== payload.expectedUpdatedAt) return { ...conflict, entry: entryFrom(row) };
    const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? row.meta : {};
    const performance = { ...Object.fromEntries(METRIC_KEYS.map(key => [key, payload[key] ?? null])), capturedAt, source: 'manual' };
    const result = await updateRecord('content_variants', [...filters, ['updated_at', `eq.${payload.expectedUpdatedAt}`]],
      { meta: { ...meta, performance }, updated_at: capturedAt },
      { returnRepresentation: true, select: 'id,updated_at,meta' });
    if (result.reason === 'no-matching-row') return conflict;
    if (!result.persisted || !result.record) return { status: 'error', message: '저장 결과를 확인하지 못했습니다. 다시 불러와 확인하세요.', reason: result.reason };
    return { status: 'saved', entry: entryFrom(result.record) };
  } catch {
    return { status: 'error', message: '저장 결과를 확인하지 못했습니다. 다시 불러와 확인하세요.' };
  }
}
