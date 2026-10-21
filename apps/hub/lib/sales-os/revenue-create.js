import { createHash } from 'node:crypto';
import { eqFilter, fetchSupabaseRows } from '../server-read.js';
import { insertSupabaseRecord } from '../server-write.js';
import { canonicalCreateContent, revenueCreateContent, validRevenueCreateId, REVENUE_CREATE_RECEIPT, CREATE_UNKNOWN_MESSAGE } from './revenue-create-command.js';

const digestFor = (table, workspaceId, payload) => createHash('sha256')
  .update(canonicalCreateContent({ table, workspaceId, content: revenueCreateContent(payload) })).digest('hex');
const unknown = reason => ({ status: 'unknown', reason, message: CREATE_UNKNOWN_MESSAGE });
const matches = (row, id, workspaceId, digest) => row?.id === id && row.workspace_id === workspaceId && row.meta?.[REVENUE_CREATE_RECEIPT] === digest;

// Read-only resolution never interprets absence as failure: a timed-out original
// request may still commit. A different receipt is a conflict, never an upsert.
export async function confirmRevenueCreate({ table, workspaceId, payload }) {
  const id = payload?.createId;
  if (!validRevenueCreateId(id)) return { status: 'error', reason: 'missing-or-invalid-create-id' };
  const rows = await fetchSupabaseRows(table, { select: '*',
    filters: [['id', eqFilter(id)], ['workspace_id', eqFilter(workspaceId)]], limit: 1, strictRows: true });
  if (!Array.isArray(rows) || rows.length !== 1) return unknown('original-create-unconfirmed');
  if (!matches(rows[0], id, workspaceId, digestFor(table, workspaceId, payload))) {
    return { status: 'conflict', reason: 'create-command-mismatch', message: '같은 등록 식별자에 다른 내용이 있습니다. 입력을 유지했으니 기존 기록을 확인하세요.' };
  }
  return { status: 'saved', id, record: rows[0], replayed: true };
}

export async function insertRevenueCreate({ table, workspaceId, payload, columns, metaPatch }) {
  const id = payload?.createId;
  if (!validRevenueCreateId(id)) return { status: 'error', reason: 'missing-or-invalid-create-id' };
  const digest = digestFor(table, workspaceId, payload);
  const record = { ...columns, id, workspace_id: workspaceId, meta: { ...metaPatch, [REVENUE_CREATE_RECEIPT]: digest } };
  const result = await insertSupabaseRecord(table, record, { returnRepresentation: true, select: '*' });
  if (result.persisted) return matches(result.record, id, workspaceId, digest)
    ? { status: 'saved', id, record: result.record } : unknown('create-acknowledgement-invalid');
  if (result.reason === 'duplicate') return confirmRevenueCreate({ table, workspaceId, payload });
  if (result.reason === 'missing-config') return { status: 'preview', reason: result.reason };
  if (['timeout', 'request-failed'].includes(result.reason) || /^http-5/.test(result.reason)) return unknown(result.reason);
  return { status: 'failed', reason: result.reason, detail: result.detail };
}
