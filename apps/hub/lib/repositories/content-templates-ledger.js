import { eqFilter, fetchSupabaseRows, fetchSupabaseRowsDetailed } from '@/lib/server-read';
import { deleteSupabaseRecord, insertSupabaseRecord, updateSupabaseRecord, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';

// Studio AI 템플릿 — 'AI 요청문 + 글 틀'. 스펙: docs/superpowers/specs/2026-09-23-studio-simplification.md §7.
const TABLE = 'content_prompt_templates';
const SELECT = 'id,workspace_id,name,request,skeleton,revision,updated_at';
export const TEMPLATE_LIMITS = { name: 60, request: 2000, skeleton: 4000, count: 100 };
const context = () => {
  const workspaceId = resolveDefaultWorkspaceId();
  return resolveSupabaseConfig() && isCanonicalUuid(workspaceId) ? workspaceId : null;
};
const scoped = (workspaceId, id) => [['workspace_id', eqFilter(workspaceId)], ['id', eqFilter(id)]];
const text = (value, max, { required = false } = {}) => typeof value === 'string' && !value.includes('\u0000')
  && value.length <= max && (!required || value.trim().length > 0);

function templateFromRow(row, workspaceId) {
  if (!row || row.workspace_id !== workspaceId || !isCanonicalUuid(row.id)
    || !text(row.name, TEMPLATE_LIMITS.name, { required: true }) || !text(row.request, TEMPLATE_LIMITS.request)
    || !text(row.skeleton, TEMPLATE_LIMITS.skeleton) || !Number.isSafeInteger(row.revision) || row.revision < 1) return null;
  return { id: row.id, name: row.name, request: row.request, skeleton: row.skeleton, revision: row.revision, updatedAt: row.updated_at || null };
}
const tableMissing = (error) => error.status === 404 || /PGRST205|42P01/.test(String(error.detail || ''));
const readError = () => ({ status: 'error', templates: [], message: 'AI 템플릿을 불러오지 못했어요. 다시 시도해 주세요.' });
const writeError = (httpStatus = 502) => ({ status: 'error', httpStatus, template: null, message: '템플릿 저장을 확인하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.' });
const invalid = (message = '템플릿 입력을 확인해 주세요.') => ({ status: 'invalid-input', httpStatus: 400, template: null, message });

export async function listContentTemplates() {
  const workspaceId = context();
  if (!workspaceId) return { status: 'preview', templates: [], message: 'AI 템플릿 저장 연결이 필요합니다.' };
  try {
    const { rows, error } = await fetchSupabaseRowsDetailed(TABLE, { select: SELECT, filters: [['workspace_id', eqFilter(workspaceId)]], order: 'name.asc', limit: TEMPLATE_LIMITS.count });
    // 마이그레이션 0044 적용 전(테이블 없음)은 장애가 아니라 설정 대기 상태다.
    if (error && tableMissing(error)) return { status: 'preview', templates: [], message: 'AI 템플릿 테이블이 아직 없습니다. 마이그레이션 적용이 필요합니다.' };
    if (!Array.isArray(rows)) return readError();
    const templates = rows.map((row) => templateFromRow(row, workspaceId));
    if (templates.some((template) => !template)) return readError();
    return { status: 'live', templates };
  } catch { return readError(); }
}

async function readOne(workspaceId, id) {
  const rows = await fetchSupabaseRows(TABLE, { select: SELECT, filters: scoped(workspaceId, id), limit: 2 });
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('template-read-failed');
  return rows.length ? templateFromRow(rows[0], workspaceId) : null;
}

// expectedRevision 0 = 새 템플릿(id는 클라이언트가 만든 UUID — 불확실한 재시도를 중복으로 판정한다).
export async function saveContentTemplate(input) {
  if (!input || !isCanonicalUuid(input.id) || !text(input.name, TEMPLATE_LIMITS.name, { required: true })
    || !text(input.request, TEMPLATE_LIMITS.request) || !text(input.skeleton, TEMPLATE_LIMITS.skeleton)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2147483647) return invalid();
  if (!input.request.trim() && !input.skeleton.trim()) return invalid('AI 요청이나 글 틀 중 하나는 적어 주세요.');
  const workspaceId = context();
  if (!workspaceId) return writeError(503);
  const { id, expectedRevision } = input;
  const fields = { name: input.name.trim(), request: input.request, skeleton: input.skeleton };
  try {
    const record = { ...fields, revision: expectedRevision + 1, updated_at: new Date().toISOString() };
    const options = { returnRepresentation: true, select: SELECT };
    const result = expectedRevision === 0
      ? await insertSupabaseRecord(TABLE, { ...record, id, workspace_id: workspaceId }, options)
      : await updateSupabaseRecord(TABLE, [...scoped(workspaceId, id), ['revision', eqFilter(expectedRevision)]], record, options);
    const template = templateFromRow(result.record, workspaceId);
    if (result.persisted && template) return { status: 'saved', template };
    // 불확실한 결과는 다시 읽어 판정한다. 더 새 revision을 덮어쓰지 않는다.
    const current = await readOne(workspaceId, id);
    if (current && current.revision === expectedRevision + 1 && current.name === fields.name
      && current.request === fields.request && current.skeleton === fields.skeleton) return { status: 'duplicate', template: current };
    if (expectedRevision > 0 && !current) return { status: 'conflict', httpStatus: 409, template: null, message: '다른 창에서 삭제된 템플릿이에요.' };
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict', httpStatus: 409, template: current, message: '다른 창에서 바뀐 템플릿이에요. 최신 내용을 확인해 주세요.' };
    }
    return writeError();
  } catch { return writeError(); }
}

export async function deleteContentTemplate(input) {
  if (!input || !isCanonicalUuid(input.id)) return invalid();
  const workspaceId = context();
  if (!workspaceId) return writeError(503);
  try {
    const result = await deleteSupabaseRecord(TABLE, scoped(workspaceId, input.id));
    if (result.persisted) return { status: 'deleted', id: input.id };
    // 이미 없는 템플릿은 삭제가 끝난 것으로 본다(재시도 멱등).
    if (result.reason === 'no-matching-row' && !(await readOne(workspaceId, input.id))) return { status: 'deleted', id: input.id };
    return writeError();
  } catch { return writeError(); }
}
