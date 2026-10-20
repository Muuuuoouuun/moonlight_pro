import { createHash } from 'node:crypto';

// Transport limits, not a DB aggregation or wire-stream memory guarantee. The
// existing Desktop logical-turn ceiling remains independent of chunk count.
export const MEETING_PAGE_VERSION = 1;
export const MEETING_PAGE_BYTES = 262144;
export const MEETING_CHUNK_BYTES = 180224;
export const MEETING_MAX_BYTES = 256 * 1024 * 1024;
export const MEETING_MAX_PAGES = 2048;
export const MEETING_MAX_TURNS = 1000;
export const MEETING_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const error = reason => ({ status:'error', source:'error', error:reason, historyComplete:false });
export const meetingEnvelopeBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
// Object key order returned by JSONB is not an identity. Array order is.
export function canonicalMeetingJson(value) {
 return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export function meetingUnresolved(detail, observedAt) {
 const running = detail.turns.filter(turn => turn.state === 'running').length;
 const unknown = detail.turns.filter(turn => turn.state === 'unknown').length;
 return { running, unknown, total:running + unknown, observedAt };
}
function decodeCursor(raw, now) {
 if (typeof raw !== 'string' || raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('office-meeting-page-cursor-invalid');
 let point;
 try { point = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch { throw new Error('office-meeting-page-cursor-invalid'); }
 if (!point || Object.keys(point).sort().join(',') !== 'binding,expiresAt,index,observedAt,snapshotId,version'
  || point.version !== MEETING_PAGE_VERSION || !hex(point.binding) || !hex(point.snapshotId)
  || !integer(point.index, 1, MEETING_MAX_PAGES - 1)
  || !integer(point.observedAt, 0, now) || point.expiresAt !== point.observedAt + MEETING_SNAPSHOT_TTL_MS) throw new Error('office-meeting-page-cursor-invalid');
 if (now >= point.expiresAt) throw new Error('office-meeting-snapshot-expired');
 return point;
}
export function createMeetingPage(detail, { identity, origin, meetingId, scope, cursor = null, now = Date.now() }, limits = {}) {
 try {
  if (detail?.status !== 'ready' || detail.persisted !== true) return detail;
  if (!Array.isArray(detail.turns) || detail.meeting?.meetingId !== meetingId || detail.meeting.scope !== scope) return error('office-meeting-page-identity-mismatch');
  const maxBytes = Math.min(limits.maxBytes ?? MEETING_MAX_BYTES, MEETING_MAX_BYTES);
  const maxPages = Math.min(limits.maxPages ?? MEETING_MAX_PAGES, MEETING_MAX_PAGES);
  if (!integer(maxBytes, 1, MEETING_MAX_BYTES) || !integer(maxPages, 1, MEETING_MAX_PAGES)) return error('office-meeting-page-limit-invalid');
  if (detail.turns.length > MEETING_MAX_TURNS) return error('office-meeting-turn-limit');
  const seen = new Set();
  for (const [index, turn] of detail.turns.entries()) {
   if (!uuid(turn.id) || seen.has(turn.id.toLowerCase()) || !Number.isSafeInteger(turn.roundNumber) || turn.roundNumber < 1 || (index > 0 && turn.roundNumber <= detail.turns[index-1].roundNumber)) return error('office-meeting-turn-order-invalid');
   seen.add(turn.id.toLowerCase());
  }
  // A fresh, authorized full RPC read is required for EVERY page. Digest the
  // entire public projection: finish, time-dependent state and receipts count.
  const body = Buffer.from(canonicalMeetingJson(detail), 'utf8');
  const pageCount = Math.max(1, Math.ceil(body.length / MEETING_CHUNK_BYTES));
  if (body.length > maxBytes || pageCount > maxPages) return error('office-meeting-restoration-limit');
  const binding = hash(JSON.stringify([MEETING_PAGE_VERSION, identity.workspaceId, identity.operatorId, origin, meetingId, scope]));
  const payloadHash = hash(body), snapshotId = hash(JSON.stringify([MEETING_PAGE_VERSION, binding, payloadHash]));
  const point = cursor === null ? { version:MEETING_PAGE_VERSION, binding, snapshotId, index:0, observedAt:now, expiresAt:now + MEETING_SNAPSHOT_TTL_MS } : decodeCursor(cursor, now);
  if (point.binding !== binding) return error('office-meeting-page-scope-mismatch');
  if (point.snapshotId !== snapshotId) return error('office-meeting-snapshot-changed');
  if (point.index >= pageCount) return error('office-meeting-page-cursor-invalid');
  const offset = point.index * MEETING_CHUNK_BYTES, chunk = body.subarray(offset, offset + MEETING_CHUNK_BYTES);
  const observedAt = new Date(point.observedAt).toISOString();
  const nextCursor = point.index + 1 < pageCount ? Buffer.from(JSON.stringify({ ...point, index:point.index + 1 })).toString('base64url') : null;
  const page = { status:'ready', persisted:true, historyComplete:false,
   page:{ version:MEETING_PAGE_VERSION, meetingId, scope, binding, snapshotId, payloadHash,
    observedAt, expiresAt:new Date(point.expiresAt).toISOString(), index:point.index, pageCount, totalBytes:body.length,
    totalTurns:detail.turns.length, offset, chunkBytes:chunk.length, chunkHash:hash(chunk), encoding:'base64', data:chunk.toString('base64'), nextCursor },
   unresolved:meetingUnresolved(detail, observedAt) };
  return meetingEnvelopeBytes(page) <= MEETING_PAGE_BYTES ? page : error('office-meeting-page-budget');
 } catch (cause) {
  return error(['office-meeting-page-cursor-invalid','office-meeting-snapshot-expired'].includes(cause.message) ? cause.message : 'office-meeting-page-unavailable');
 }
}

// Legacy full responses remain compatible until each consumer migrates. The
// bounded protocol is opt-in; writes return receipts and are never retried here.
export function boundMeetingResponse(result, { read, negotiated = false, meetingId, requestId } = {}) {
 if (meetingEnvelopeBytes(result) <= MEETING_PAGE_BYTES) return result;
 if (!negotiated) return result;
 if (read) return error('office-meeting-paging-required');
 const matches = result.meeting?.meetingId === meetingId;
 const accepted = matches && (!requestId || result.turn?.id === requestId || result.turns?.some(turn => turn.id === requestId));
 return { status:'accepted', receiptVersion:MEETING_PAGE_VERSION, meetingId, ...(requestId ? { requestId } : {}),
  persisted:accepted && result.persisted === true ? true : null,
  outcome:accepted && ['ready','generated','running','unknown','error'].includes(result.status) ? result.status : 'unknown',
  historyComplete:false, recovery:{ method:'GET', readVersion:MEETING_PAGE_VERSION }, businessWrites:false };
}
