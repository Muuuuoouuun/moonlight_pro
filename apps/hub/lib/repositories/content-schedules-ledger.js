import { eqFilter, fetchSupabaseRowsDetailed } from '@/lib/server-read';
import { insertSupabaseRecord, updateSupabaseRecord, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';
import { deriveScheduleState, latestSweepBoundary, validateScheduleInput } from '../content-schedule.js';

// 콘텐츠 예약 — 결과물마다 올릴 시각 하나(알림 방식). 스펙: docs/design-studies/2026-09-28-content-publishing-flow/.
// 상태 전이: scheduled → published | missed(밤 정리) | cancelled, missed·cancelled → scheduled(다시 예약).
const TABLE = 'content_schedules';
const SELECT = 'workspace_id,variant_id,content_id,title,channel,scheduled_at,status,revision,published_at,missed_at,created_at,updated_at';
const LIST_LIMIT = 100;
const context = () => {
  const workspaceId = resolveDefaultWorkspaceId();
  return resolveSupabaseConfig() && isCanonicalUuid(workspaceId) ? workspaceId : null;
};
const scoped = (workspaceId, variantId) => [['workspace_id', eqFilter(workspaceId)], ['variant_id', eqFilter(variantId)]];
const tableMissing = (error) => error?.status === 404 || /PGRST205|42P01/.test(String(error?.detail || ''));

function scheduleFromRow(row, workspaceId, now = Date.now()) {
  if (!row || row.workspace_id !== workspaceId || !isCanonicalUuid(row.variant_id) || !isCanonicalUuid(row.content_id)
    || !['scheduled', 'published', 'missed', 'cancelled'].includes(row.status) || !Number.isFinite(Date.parse(row.scheduled_at))
    || !Number.isSafeInteger(row.revision) || row.revision < 1) return null;
  return {
    variantId: row.variant_id, contentId: row.content_id, title: row.title || '', channel: row.channel || '',
    scheduledAt: new Date(row.scheduled_at).toISOString(), status: row.status, state: deriveScheduleState(row, now),
    revision: row.revision, publishedAt: row.published_at || null, missedAt: row.missed_at || null, createdAt: row.created_at || null, updatedAt: row.updated_at || null,
  };
}
const readError = () => ({ status: 'error', schedules: [], message: '예약 목록을 불러오지 못했어요. 다시 시도해 주세요.' });
const writeError = (httpStatus = 502) => ({ status: 'error', httpStatus, schedule: null, message: '예약 저장을 확인하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.' });
const invalid = (message = '예약 입력을 확인해 주세요.') => ({ status: 'invalid-input', httpStatus: 400, schedule: null, message });
const INVALID_MESSAGES = { 'time-in-past': '이미 지난 시각이에요. 지금 이후로 골라 주세요.', 'time-too-far': '1년 안의 시각만 예약할 수 있어요.', 'invalid-time': '올릴 시각을 확인해 주세요.' };

// 결과물 상태 교차 확인 — 발행 기록이 있는데 예약이 '올릴 차례'로 남는 일을 막는다(기록 저장 뒤 예약 표시 갱신이 실패해도).
async function publishedVariantIds(workspaceId, rows) {
  const ids = rows.filter((row) => row.status === 'scheduled' || row.status === 'missed').map((row) => row.variant_id).filter(isCanonicalUuid);
  if (!ids.length) return { ids: new Set(), failed: false };
  const batches = [];
  for (let offset = 0; offset < ids.length; offset += LIST_LIMIT) {
    const chunk = ids.slice(offset, offset + LIST_LIMIT);
    batches.push(fetchSupabaseRowsDetailed('content_variants', {
      select: 'id,status', filters: [['workspace_id', eqFilter(workspaceId)], ['id', `in.(${chunk.join(',')})`]], limit: chunk.length,
    }));
  }
  const results = await Promise.all(batches);
  if (results.some(({ rows: variants, error }) => error || !Array.isArray(variants))) return { ids: new Set(), failed: true };
  return { ids: new Set(results.flatMap(({ rows: variants }) => variants).filter((variant) => variant.status === 'published').map((variant) => variant.id)), failed: false };
}

/** scope: 'action' = 지금 올릴 글·놓친 글 / 'upcoming' = 앞으로 / 'all' = 최근 이력 포함(발행 로그). */
export async function listContentSchedules({ scope = 'all', now = Date.now() } = {}) {
  const workspaceId = context();
  if (!workspaceId) return { status: 'preview', schedules: [], message: '예약 저장 연결이 필요합니다.' };
  const baseFilters = [['workspace_id', eqFilter(workspaceId)]];
  const nowIso = new Date(now).toISOString();
  const queries = scope === 'action' ? [
    { order: 'scheduled_at.asc', filters: [...baseFilters, ['status', eqFilter('scheduled')], ['scheduled_at', `lte.${nowIso}`]] },
    { order: 'scheduled_at.desc', filters: [...baseFilters, ['status', eqFilter('missed')]] },
  ] : scope === 'upcoming' ? [
    { order: 'scheduled_at.asc', filters: [...baseFilters, ['status', eqFilter('scheduled')], ['scheduled_at', `gt.${nowIso}`]] },
  ] : [
    { order: 'scheduled_at.desc', filters: [...baseFilters, ['status', 'in.(scheduled,missed,published,cancelled)']] },
  ];
  try {
    const results = await Promise.all(queries.map((query) => fetchSupabaseRowsDetailed(TABLE, { select: SELECT, limit: LIST_LIMIT, ...query })));
    if (results.some(({ error }) => error && tableMissing(error))) return { status: 'preview', schedules: [], message: '예약 테이블이 아직 없습니다. 마이그레이션 적용이 필요합니다.' };
    if (results.some(({ rows, error }) => error || !Array.isArray(rows))) return readError();
    const rows = results.flatMap((result) => result.rows);
    const mapped = rows.map((row) => scheduleFromRow(row, workspaceId, now));
    if (mapped.some((row) => !row)) return readError();
    const published = await publishedVariantIds(workspaceId, rows);
    if (published.failed) return { ...readError(), message: '발행 여부를 확인하지 못해 예약 목록을 보여 주지 않아요. 다시 시도해 주세요.' };
    const schedules = mapped
      .map((row) => (published.ids.has(row.variantId) ? { ...row, status: 'published', state: 'published' } : row))
      .filter((row) => scope === 'all' || ['scheduled', 'due', 'missed'].includes(row.state))
      .filter((row) => scope !== 'action' || row.state === 'due' || row.state === 'missed')
      .filter((row) => scope !== 'upcoming' || row.state === 'scheduled');
    return { status: 'live', schedules };
  } catch { return readError(); }
}

async function readOne(workspaceId, variantId, now) {
  const { rows, error } = await fetchSupabaseRowsDetailed(TABLE, { select: SELECT, filters: scoped(workspaceId, variantId), limit: 2 });
  if (error || !Array.isArray(rows) || rows.length > 1) throw new Error('schedule-read-failed');
  return rows.length ? scheduleFromRow(rows[0], workspaceId, now) : null;
}

/** 예약하기·시각 바꾸기·놓친 예약 다시 잡기. expectedRevision 0 = 새 예약. 서버 시각이 아니라 입력한 시각이 전부다. */
export async function setContentSchedule(input, { now = Date.now() } = {}) {
  const checked = validateScheduleInput(input, now);
  if (!checked.ok) return invalid(INVALID_MESSAGES[checked.reason]);
  const workspaceId = context();
  if (!workspaceId) return writeError(503);
  const { variantId, contentId, scheduledAt, title, channel, expectedRevision } = checked.value;
  try {
    const record = { scheduled_at: scheduledAt, title, channel, status: 'scheduled', revision: expectedRevision + 1, published_at: null, missed_at: null, updated_at: new Date(now).toISOString() };
    const options = { returnRepresentation: true, select: SELECT };
    const result = expectedRevision === 0
      ? await insertSupabaseRecord(TABLE, { ...record, workspace_id: workspaceId, variant_id: variantId, content_id: contentId }, options)
      : await updateSupabaseRecord(TABLE, [...scoped(workspaceId, variantId), ['revision', eqFilter(expectedRevision)]], record, options);
    const schedule = scheduleFromRow(result.record, workspaceId, now);
    if (result.persisted && schedule) return { status: 'saved', schedule };
    const current = await readOne(workspaceId, variantId, now);
    if (current && current.revision === expectedRevision + 1 && current.scheduledAt === scheduledAt && current.status === 'scheduled') return { status: 'duplicate', schedule: current };
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', httpStatus: 409, schedule: current, message: '다른 창에서 바뀐 예약이에요. 최신 예약을 확인해 주세요.' };
    }
    if (!current && expectedRevision > 0) return { status: 'conflict', httpStatus: 409, schedule: null, message: '예약이 없어졌어요. 다시 예약해 주세요.' };
    return writeError();
  } catch { return writeError(); }
}

async function transition(variantId, expectedRevision, patch, { now = Date.now(), accept }) {
  if (!isCanonicalUuid(variantId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return invalid();
  const workspaceId = context();
  if (!workspaceId) return writeError(503);
  try {
    const current = await readOne(workspaceId, variantId, now);
    if (!current) return { status: 'conflict', httpStatus: 409, schedule: null, message: '예약이 없어요.' };
    if (accept(current)) return { status: 'duplicate', schedule: current };
    if (current.revision !== expectedRevision) return { status: 'conflict', httpStatus: 409, schedule: current, message: '다른 창에서 바뀐 예약이에요. 최신 예약을 확인해 주세요.' };
    const result = await updateSupabaseRecord(TABLE, [...scoped(workspaceId, variantId), ['revision', eqFilter(expectedRevision)]],
      { ...patch, revision: expectedRevision + 1, updated_at: new Date(now).toISOString() }, { returnRepresentation: true, select: SELECT });
    const schedule = scheduleFromRow(result.record, workspaceId, now);
    if (result.persisted && schedule) return { status: 'saved', schedule };
    return writeError();
  } catch { return writeError(); }
}

/** 예약 해제 — 행은 남겨 이력이 된다. */
export const cancelContentSchedule = (input, options) => transition(input?.variantId, input?.expectedRevision, { status: 'cancelled' }, { ...options, accept: (row) => row.status === 'cancelled' });
/** 발행 기록 뒤 표시 갱신(밤 정리도 결과물 상태로 같은 결론에 이르므로 실패해도 안전하다). */
export const completeContentSchedule = (input, options) => transition(input?.variantId, input?.expectedRevision, { status: 'published', published_at: new Date(options?.now ?? Date.now()).toISOString() }, { ...options, accept: (row) => row.status === 'published' });

/**
 * 밤 정리 — 가장 최근 밤 정리 시각 이전에 올릴 시각이 지난 미발행 예약을 '놓침'으로 바꾼다.
 * 결과물이 이미 발행 상태면 놓침이 아니라 발행으로 바로잡는다. 낮에 불러도 어제 밤 경계까지만 본다.
 */
export async function sweepContentSchedules({ now = Date.now() } = {}) {
  const workspaceId = context();
  if (!workspaceId) return { status: 'preview', missed: 0, published: 0 };
  const boundary = new Date(latestSweepBoundary(now)).toISOString();
  try {
    // Keep the scheduled work ahead of old missed history; each status gets its own batch.
    const results = await Promise.all(['scheduled', 'missed'].map((status) => fetchSupabaseRowsDetailed(TABLE, {
      select: SELECT, order: 'scheduled_at.asc', limit: 500,
      filters: [['workspace_id', eqFilter(workspaceId)], ['status', eqFilter(status)], ['scheduled_at', `lte.${boundary}`]],
    })));
    if (results.some(({ error }) => error && tableMissing(error))) return { status: 'preview', missed: 0, published: 0 };
    if (results.some(({ rows, error }) => error || !Array.isArray(rows))) return { status: 'error', missed: 0, published: 0, error: 'schedule-read-failed' };
    const rows = results.flatMap((result) => result.rows);
    const published = await publishedVariantIds(workspaceId, rows);
    // 발행 여부를 확인하지 못하면 놓침으로 단정하지 않는다 — 다음 정리 때 다시 본다.
    if (published.failed) return { status: 'error', missed: 0, published: 0, error: 'variant-read-failed' };
    let missed = 0, done = 0, failed = 0;
    for (const row of rows) {
      const isPublished = published.ids.has(row.variant_id);
      if (row.status === 'missed' && !isPublished) continue;
      const patch = isPublished
        ? { status: 'published', published_at: new Date(now).toISOString() }
        : { status: 'missed', missed_at: new Date(now).toISOString() };
      const result = await updateSupabaseRecord(TABLE, [...scoped(workspaceId, row.variant_id), ['revision', eqFilter(row.revision)], ['status', eqFilter(row.status)]],
        { ...patch, revision: row.revision + 1, updated_at: new Date(now).toISOString() }, { returnRepresentation: true, select: SELECT });
      if (result.persisted) { if (isPublished) done += 1; else missed += 1; } else failed += 1;
    }
    return { status: failed ? 'partial' : 'ok', missed, published: done, failed, boundary };
  } catch { return { status: 'error', missed: 0, published: 0, error: 'sweep-failed' }; }
}
