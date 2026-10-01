// 확인할 것 — 끝내기 영수증 저장소(확인할 것 스펙 §4.4·§4.5·§8). IO만 담당하고 판정은
// lib/check-items/suppression.js(순수)가 한다.
//
// 읽기 실패의 기본값은 "숨기지 않는다"다. 영수증·대상 보류·할 일 상태 중 하나라도 못 읽으면 그만큼
// 카드를 더 보여 주고 status로 알린다 — 누락 0건(운영자 프로필 §2)이 화면 정리보다 앞선다.

import { eqFilter, fetchSupabaseRowsDetailed, inFilter } from '@/lib/server-read';
import { insertSupabaseRecord, resolveDefaultWorkspaceId, resolveSupabaseConfig, updateSupabaseRecord } from '@/lib/server-write';
import { isCanonicalUuid } from '../uuid.js';
import { kstDayKey } from '../kst-day.js';
import { buildSignalOutcomeWrite } from '../check-items/outcome-input.js';

const TABLE = 'signal_outcomes';
const SELECT = 'id,request_id,signal_key,subject_type,subject_id,title,outcome,record_ref,snoozed_until,scheduled_start,scheduled_end,calendar_event_id,note,created_at,undone_at';
// 보류 최대 30일 + 할 일이 열려 있는 기간을 넉넉히 덮는 창. 이보다 오래된 할 일 영수증은 억제하지
// 않는다 — 카드가 다시 뜨는 쪽이 조용히 사라지는 쪽보다 낫다.
const WINDOW_DAYS = 45;
const WINDOW_LIMIT = 500;
const SUBJECT_TABLES = { deal: 'deals', lead: 'leads', account: 'customer_accounts' };
const OPEN_TASK_EXCLUDED = new Set(['done']);

const tableMissing = (error) => error?.status === 404 || /PGRST205|42P01/.test(String(error?.detail || ''));

function workspaceOrNull() {
  const workspaceId = resolveDefaultWorkspaceId();
  return resolveSupabaseConfig() && isCanonicalUuid(workspaceId) ? workspaceId : null;
}

export function receiptFromRow(row) {
  if (!row || !row.signal_key || !row.outcome) return null;
  return {
    id: row.id,
    signalKey: row.signal_key,
    subject: { type: row.subject_type, id: row.subject_id || null },
    title: row.title || '',
    outcome: row.outcome,
    recordRef: row.record_ref || null,
    snoozedUntil: row.snoozed_until || null,
    scheduledStart: row.scheduled_start || null,
    scheduledEnd: row.scheduled_end || null,
    calendarEventId: row.calendar_event_id || null,
    note: row.note || '',
    createdAt: row.created_at || null,
  };
}

// 오늘 끝낸 것 — 잡아 둔 일은 끝냄이 아니라 따로 센다(§4.5·§4.7).
export function finishedTodayFrom(rows, todayKey) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && !row.undone_at && row.outcome !== 'scheduled' && kstDayKey(row.created_at) === todayKey)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(receiptFromRow)
    .filter(Boolean);
}

/** 최근 창의 되돌리지 않은 영수증. */
export async function readSignalOutcomeWindow({ now = Date.now() } = {}) {
  const workspaceId = workspaceOrNull();
  if (!workspaceId) return { status: 'preview', rows: [] };
  try {
    const since = new Date(now - WINDOW_DAYS * 86400000).toISOString();
    const { rows, error } = await fetchSupabaseRowsDetailed(TABLE, {
      select: SELECT,
      filters: [['workspace_id', eqFilter(workspaceId)], ['undone_at', 'is.null'], ['created_at', `gte.${since}`]],
      order: 'created_at.desc',
      limit: WINDOW_LIMIT,
    });
    if (error && tableMissing(error)) return { status: 'preview', rows: [], reason: 'table-missing' };
    if (error || !Array.isArray(rows)) return { status: 'error', rows: [] };
    return { status: rows.length >= WINDOW_LIMIT ? 'partial' : 'live', rows };
  } catch {
    return { status: 'error', rows: [] };
  }
}

/** 영수증에 걸린 할 일 중 아직 열려 있다고 **확인된** id만. 못 읽으면 빈 집합(=억제하지 않음). */
export async function readOpenTaskIds(rows) {
  const workspaceId = workspaceOrNull();
  const ids = [...new Set((Array.isArray(rows) ? rows : [])
    .filter((row) => row?.outcome === 'task_created' && row.record_ref?.table === 'tasks' && isCanonicalUuid(row.record_ref.id))
    .map((row) => row.record_ref.id))];
  if (!workspaceId || !ids.length) return { status: 'live', ids: new Set() };
  try {
    const { rows: tasks, error } = await fetchSupabaseRowsDetailed('tasks', {
      select: 'id,status',
      filters: [['workspace_id', eqFilter(workspaceId)], ['id', inFilter(ids)]],
      limit: ids.length,
    });
    if (error || !Array.isArray(tasks)) return { status: 'error', ids: new Set() };
    return { status: 'live', ids: new Set(tasks.filter((task) => !OPEN_TASK_EXCLUDED.has(String(task.status))).map((task) => task.id)) };
  } catch {
    return { status: 'error', ids: new Set() };
  }
}

/** 고객·거래·리드 카드의 대상 meta.nudges — 보류의 정본(넛지와 같은 저장). */
export async function readSubjectNudges(items) {
  const workspaceId = workspaceOrNull();
  const byType = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const { type, id } = item?.subject || {};
    if (!SUBJECT_TABLES[type] || !isCanonicalUuid(String(id || ''))) continue;
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(String(id));
  }
  const map = new Map();
  if (!workspaceId || !byType.size) return { status: 'live', map };
  try {
    const results = await Promise.all([...byType].map(async ([type, ids]) => {
      const list = [...ids];
      const { rows, error } = await fetchSupabaseRowsDetailed(SUBJECT_TABLES[type], {
        select: 'id,nudges:meta->nudges',
        filters: [['workspace_id', eqFilter(workspaceId)], ['id', inFilter(list)]],
        limit: list.length,
      });
      if (error || !Array.isArray(rows)) return false;
      for (const row of rows) map.set(`${type}:${row.id}`, row.nudges && typeof row.nudges === 'object' ? row.nudges : null);
      return true;
    }));
    return { status: results.every(Boolean) ? 'live' : 'error', map };
  } catch {
    return { status: 'error', map };
  }
}

async function readByRequest(workspaceId, requestId) {
  const { rows, error } = await fetchSupabaseRowsDetailed(TABLE, {
    select: SELECT,
    filters: [['workspace_id', eqFilter(workspaceId)], ['request_id', eqFilter(requestId)]],
    limit: 1,
  });
  if (error || !Array.isArray(rows)) return { ok: false, row: null };
  return { ok: true, row: rows[0] || null };
}

/** 영수증 한 줄. 같은 requestId 재시도는 duplicate. */
export async function recordSignalOutcome(input, { now = Date.now() } = {}) {
  const todayKey = kstDayKey(new Date(now));
  const checked = buildSignalOutcomeWrite(input, { todayKey });
  if (!checked.ok) return { status: 'invalid-input', httpStatus: 400, reason: checked.reason };
  const workspaceId = workspaceOrNull();
  if (!workspaceId) return { status: 'preview', httpStatus: 202, receipt: null, message: '저장소 연결이 필요합니다. 끝낸 것으로 세지 않았습니다.' };
  const record = { ...checked.row, id: checked.row.request_id, workspace_id: workspaceId };
  try {
    const result = await insertSupabaseRecord(TABLE, record, { returnRepresentation: true, select: SELECT });
    if (result.persisted && result.record) return { status: 'saved', httpStatus: 200, receipt: receiptFromRow(result.record) };
    if (result.reason === 'duplicate') {
      const existing = await readByRequest(workspaceId, record.request_id);
      if (existing.row && existing.row.signal_key === record.signal_key && existing.row.outcome === record.outcome) {
        return { status: 'duplicate', httpStatus: 200, receipt: receiptFromRow(existing.row) };
      }
      return { status: 'conflict', httpStatus: 409, reason: 'request-reused' };
    }
    if (tableMissing({ status: Number(String(result.reason || '').replace('http-', '')), detail: result.detail })) {
      return { status: 'preview', httpStatus: 202, receipt: null, message: '영수증 테이블이 아직 없습니다. 마이그레이션 적용이 필요합니다.' };
    }
    return { status: 'failed', httpStatus: 502, reason: result.reason || 'insert-failed' };
  } catch {
    return { status: 'failed', httpStatus: 502, reason: 'insert-failed' };
  }
}

/** 되돌리기 — 보류·잡아 둔 일만(§4.5). 행은 지우지 않고 undone_at을 남긴다. */
export async function undoSignalOutcome({ id } = {}, { now = Date.now() } = {}) {
  if (!isCanonicalUuid(String(id || ''))) return { status: 'invalid-input', httpStatus: 400, reason: 'invalid-id' };
  const workspaceId = workspaceOrNull();
  if (!workspaceId) return { status: 'preview', httpStatus: 202 };
  try {
    const result = await updateSupabaseRecord(TABLE,
      [['workspace_id', eqFilter(workspaceId)], ['id', eqFilter(id)], ['undone_at', 'is.null'], ['outcome', 'in.(snoozed,scheduled)']],
      { undone_at: new Date(now).toISOString() },
      { returnRepresentation: true, select: SELECT });
    if (result.persisted && result.record) return { status: 'saved', httpStatus: 200, receipt: receiptFromRow(result.record) };
    return { status: 'conflict', httpStatus: 409, reason: 'not-undoable' };
  } catch {
    return { status: 'failed', httpStatus: 502, reason: 'update-failed' };
  }
}

/** 확인할 것 조립 — daily-brief 라우트가 부른다. */
export async function readCheckItemContext(items, { now = Date.now() } = {}) {
  const outcomes = await readSignalOutcomeWindow({ now });
  const [tasks, nudges] = await Promise.all([readOpenTaskIds(outcomes.rows), readSubjectNudges(items)]);
  const todayKey = kstDayKey(new Date(now));
  const states = [outcomes.status, tasks.status, nudges.status];
  return {
    status: states.includes('error') ? 'error' : outcomes.status === 'preview' ? 'preview' : states.includes('partial') ? 'partial' : 'live',
    todayKey,
    outcomes: outcomes.rows,
    openTaskIds: tasks.ids,
    nudgesBySubject: nudges.map,
    finishedToday: finishedTodayFrom(outcomes.rows, todayKey),
  };
}
