import { eqFilter, fetchSupabaseRows } from '@/lib/server-read';
import { insertSupabaseRecord, updateSupabaseRecord, resolveDefaultWorkspaceId, resolveSupabaseConfig } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';

const TABLE = 'calendar_event_outcomes';
const SELECT = 'workspace_id,event_key,done,note,revision,updated_at';
const validKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const context = () => {
  const workspaceId = resolveDefaultWorkspaceId();
  return resolveSupabaseConfig() && isCanonicalUuid(workspaceId) ? workspaceId : null;
};
const filters = (workspaceId, eventKey) => [['workspace_id', eqFilter(workspaceId)], ['event_key', eqFilter(eventKey)]];
function outcomeFromRow(row, workspaceId, eventKey) {
  if (!row || row.workspace_id !== workspaceId || row.event_key !== eventKey
    || typeof row.done !== 'boolean' || typeof row.note !== 'string' || row.note.length > 4000
    || !Number.isSafeInteger(row.revision) || row.revision < 1 || !row.updated_at) return null;
  return { eventKey, done: row.done, note: row.note, revision: row.revision, updatedAt: row.updated_at };
}
const readError = () => ({ status: 'error', outcome: null, message: '일정 기록을 불러오지 못했어요. 다시 시도해 주세요.' });
const writeError = (httpStatus = 502) => ({ status: 'error', httpStatus, outcome: null, message: '저장을 확인하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.' });

export async function getCalendarOutcome(eventKey) {
  if (!validKey(eventKey)) return readError();
  const workspaceId = context();
  if (!workspaceId) return { status: 'preview', outcome: null, message: '일정 기록 저장 연결이 필요합니다.' };
  try {
    const rows = await fetchSupabaseRows(TABLE, { select: SELECT, filters: filters(workspaceId, eventKey), limit: 2 });
    if (!Array.isArray(rows) || rows.length > 1) return readError();
    const outcome = rows.length ? outcomeFromRow(rows[0], workspaceId, eventKey) : null;
    if (rows.length && !outcome) return readError();
    return { status: 'live', outcome: outcome || { eventKey, done: false, note: '', revision: 0, updatedAt: null } };
  } catch { return readError(); }
}

export async function saveCalendarOutcome(input) {
  if (!input || !validKey(input.eventKey) || typeof input.done !== 'boolean'
    || typeof input.note !== 'string' || input.note.length > 4000 || input.note.includes('\u0000')
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2147483647) {
    return { status: 'invalid-input', httpStatus: 400, outcome: null, message: '일정 기록 입력을 확인해 주세요.' };
  }
  const workspaceId = context();
  if (!workspaceId) return writeError(503);
  const { eventKey, done, note, expectedRevision } = input;
  try {
    const record = { done, note, revision: expectedRevision + 1, updated_at: new Date().toISOString() };
    const options = { returnRepresentation: true, select: SELECT };
    const result = expectedRevision === 0
      ? await insertSupabaseRecord(TABLE, { ...record, workspace_id: workspaceId, event_key: eventKey }, options)
      : await updateSupabaseRecord(TABLE, [...filters(workspaceId, eventKey), ['revision', eqFilter(expectedRevision)]], record, options);
    const outcome = outcomeFromRow(result.record, workspaceId, eventKey);
    if (result.persisted && outcome) return { status: 'saved', outcome };
    // An uncertain retry can observe the already committed value. Never overwrite a newer revision.
    const current = await getCalendarOutcome(eventKey);
    if (current.status !== 'live') return writeError();
    if (current.outcome.revision === expectedRevision + 1 && current.outcome.done === done && current.outcome.note === note) {
      return { status: 'duplicate', outcome: current.outcome };
    }
    if (current.outcome.revision !== expectedRevision) {
      return { status: 'conflict', httpStatus: 409, outcome: current.outcome, message: '다른 창에서 변경된 기록이 있어요. 현재 기록을 확인해 주세요.' };
    }
    return writeError();
  } catch { return writeError(); }
}
