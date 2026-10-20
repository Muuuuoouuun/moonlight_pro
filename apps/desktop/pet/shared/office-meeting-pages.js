'use strict';
// Pure transport protocol shared by the Hub browser and Desktop main process.
// SHA-256 is injected so this file contains no Node/browser-specific imports.
const LIMITS = Object.freeze({ pageBytes:262144, chunkBytes:180224, totalBytes:256 * 1024 * 1024,
  pages:2048, turns:1000, cursorLength:2048, ttlMs:300000, restoreMs:120000, entries:3, failures:3 });
const bytes = value => new TextEncoder().encode(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const reject = (code = 'office-meeting-page-invalid') => { const error = new Error(code); error.error = code; throw error; };
const cursorValid = value => typeof value === 'string' && value.length > 0 && value.length <= LIMITS.cursorLength && /^[A-Za-z0-9_-]+$/.test(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function unresolved(detail, observedAt) {
 const running = detail.turns.filter(turn => turn.state === 'running').length;
 const unknown = detail.turns.filter(turn => turn.state === 'unknown').length;
 return { running, unknown, total:running + unknown, observedAt };
}
function createPageAssembly({ id, scope, digest, now = Date.now }) {
 let first = null, count = 0, length = 0, next = null;
 const chunks = [], cursors = new Set();
 return {
  get expiresAt() { return first ? Date.parse(first.expiresAt) : 0; },
  get nextCursor() { return next; },
  get size() { return length; },
  get progress() { return { complete:false, verifiedPages:count, totalPages:first?.pageCount ?? null, verifiedBytes:length,
   totalBytes:first?.totalBytes ?? null, snapshotId:first?.snapshotId ?? null, unresolved:first?.unresolved ?? null }; },
  async accept(envelope) {
   if (!object(envelope) || bytes(JSON.stringify(envelope)).length > LIMITS.pageBytes || envelope.status !== 'ready'
    || envelope.persisted !== true || envelope.historyComplete !== false || !object(envelope.page)) reject();
   const p = envelope.page, u = envelope.unresolved;
   if (p.version !== 1 || p.meetingId !== id || p.scope !== scope || !hex(p.binding) || !hex(p.snapshotId) || !hex(p.payloadHash)
    || !integer(p.totalBytes, 1, LIMITS.totalBytes) || !integer(p.pageCount, 1, LIMITS.pages)
    || p.pageCount !== Math.ceil(p.totalBytes / LIMITS.chunkBytes) || !integer(p.totalTurns, 0, LIMITS.turns)
    || !integer(p.index, 0, p.pageCount - 1) || p.index !== count || p.offset !== count * LIMITS.chunkBytes
    || p.chunkBytes !== Math.min(LIMITS.chunkBytes, p.totalBytes - p.offset) || !hex(p.chunkHash) || p.encoding !== 'base64'
    || !stamp(p.observedAt) || !stamp(p.expiresAt) || Date.parse(p.expiresAt) - Date.parse(p.observedAt) !== LIMITS.ttlMs
    || Date.parse(p.observedAt) > now() + 30000 || now() >= Date.parse(p.expiresAt)
    || !object(u) || !integer(u.running, 0, p.totalTurns) || !integer(u.unknown, 0, p.totalTurns)
    || u.total !== u.running + u.unknown || u.total > p.totalTurns || u.observedAt !== p.observedAt) reject();
   const last = count === p.pageCount - 1;
   if (last ? p.nextCursor !== null : !cursorValid(p.nextCursor) || cursors.has(p.nextCursor)) reject();
   const metadata = Object.fromEntries(['version','meetingId','scope','binding','snapshotId','payloadHash','observedAt','expiresAt','pageCount','totalBytes','totalTurns'].map(key => [key, p[key]]));
   metadata.unresolved = { running:u.running, unknown:u.unknown, total:u.total, observedAt:u.observedAt };
   if (first && !same(metadata, first)) reject('office-meeting-snapshot-changed');
   if (await digest(bytes(JSON.stringify([1,p.binding,p.payloadHash]))) !== p.snapshotId) reject();
   if (typeof p.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.data)) reject();
   let chunk;
   try { chunk = Uint8Array.from(atob(p.data), character => character.charCodeAt(0)); } catch { reject(); }
   if (chunk.length !== p.chunkBytes || await digest(chunk) !== p.chunkHash) reject();
   // Nothing advances until this page is verified. A failed fetch can retry its
   // exact cursor without appending a duplicate logical turn or byte range.
   if (!first) first = metadata;
   chunks.push(chunk); length += chunk.length; count++; next = p.nextCursor;
   if (next) { cursors.add(next); return null; }
   if (length !== first.totalBytes || count !== first.pageCount) reject();
   const joined = new Uint8Array(length); let offset = 0;
   for (const part of chunks) { joined.set(part, offset); offset += part.length; }
   if (await digest(joined) !== first.payloadHash) reject();
   let detail;
   try { detail = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(joined)); } catch { reject(); }
   if (detail?.status !== 'ready' || detail.persisted !== true || detail.meeting?.meetingId !== id || detail.meeting.scope !== scope
    || !Array.isArray(detail.turns) || detail.turns.length !== first.totalTurns) reject();
   const seen = new Set();
   for (const [index, turn] of detail.turns.entries()) {
    if (!uuid(turn.id) || seen.has(turn.id.toLowerCase()) || !Number.isSafeInteger(turn.roundNumber) || turn.roundNumber < 1 || (index > 0 && turn.roundNumber <= detail.turns[index-1].roundNumber)) reject();
    seen.add(turn.id.toLowerCase());
   }
   if (!same(unresolved(detail, first.observedAt), first.unresolved)) reject();
   return { ...detail, historyComplete:true, observedAt:first.observedAt, unresolved:first.unresolved,
    restoration:{ version:1, snapshotId:first.snapshotId, observedAt:first.observedAt, expiresAt:first.expiresAt,
     pageCount:first.pageCount, totalBytes:first.totalBytes, totalTurns:first.totalTurns, complete:true } };
  },
 };
}
function createMeetingReader({ read, digest, now = Date.now, limits = {} }) {
 const maxBytes = Math.min(limits.totalBytes ?? LIMITS.totalBytes, LIMITS.totalBytes);
 const restoreMs = Math.min(limits.restoreMs ?? LIMITS.restoreMs, LIMITS.restoreMs);
 const records = new Map();
 let reservedBytes = 0;
 function progressError(error, record) {
  error.progress = { ...(record.assembly?.progress ?? record.savedProgress ?? { complete:false, verifiedPages:0 }), resumeAvailable:Boolean(record.assembly) };
  return error;
 }
 function cachedBytes() { return [...records.values()].reduce((sum, record) => sum + (record.assembly?.size ?? 0), 0); }
 return async function restore(id, scope, { signal } = {}) {
  const key = `${scope}:${id}`;
  let record = records.get(key);
  if (record?.pending) return record.pending;
  // Expired/invalid transport buffers are not durable meeting records. Their
  // bounded progress metadata can be replaced; visible complete history and
  // drafts are owned by the caller and never changed by this reader.
  for (const [storedKey, stored] of records) if (storedKey !== key && !stored.pending
    && (!stored.assembly || stored.assembly.expiresAt <= now())) records.delete(storedKey);
  if (!record) {
   if (records.size >= LIMITS.entries) reject('office-meeting-cache-limit');
   record = { assembly:null, savedProgress:null, failures:0 }; records.set(key, record);
  }
  if (record.assembly && record.assembly.expiresAt <= now()) {
   record.savedProgress = record.assembly.progress; record.assembly = null; record.failures = 0;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once:true });
  const timer = setTimeout(cancel, restoreMs), started = now();
  const run = async () => {
   try {
    for (let requests = 0; requests < LIMITS.pages; requests++) {
     if (controller.signal.aborted || now() - started >= restoreMs) reject('office-meeting-restoration-timeout');
     const query = new URLSearchParams({ readVersion:'1', scope });
     if (record.assembly?.nextCursor) query.set('cursor', record.assembly.nextCursor);
     const envelope = await new Promise((resolve, rejectRead) => {
      const abortRead = () => rejectRead(Object.assign(new Error('office-meeting-restoration-timeout'), {error:'office-meeting-restoration-timeout'}));
      controller.signal.addEventListener('abort', abortRead, {once:true});
      Promise.resolve().then(() => read(`/api/hub/office/meetings/${id}?${query}`, {signal:controller.signal}))
       .then(resolve, rejectRead).finally(() => controller.signal.removeEventListener('abort', abortRead));
     });
     if (controller.signal.aborted || now() - started >= restoreMs) reject('office-meeting-restoration-timeout');
     if (!envelope?.page) {
      // Compatible old servers may ignore negotiation and send full history.
      if (record.assembly || bytes(JSON.stringify(envelope)).length > LIMITS.pageBytes || envelope?.historyComplete === false) reject();
      records.delete(key); return envelope;
     }
     if (!record.assembly) record.assembly = createPageAssembly({ id, scope, digest, now });
     if (!integer(envelope.page.chunkBytes,1,LIMITS.chunkBytes)) reject();
     if (cachedBytes() + reservedBytes + envelope.page.chunkBytes > maxBytes) reject('office-meeting-cache-limit');
     reservedBytes += envelope.page.chunkBytes;
     let detail;
     try { detail = await record.assembly.accept(envelope); } finally { reservedBytes -= envelope.page.chunkBytes; }
     if (detail) { records.delete(key); return detail; }
    }
    reject('office-meeting-page-limit');
   } catch (error) {
    record.failures++;
    if (record.failures >= LIMITS.failures || /snapshot|page-|restoration-timeout/.test(error.error || error.message)) {
     record.savedProgress = record.assembly?.progress ?? record.savedProgress;
     record.assembly = null; record.failures = 0;
    }
    throw progressError(error, record);
   } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel); record.pending = null;
   }
  };
  // Publish the pending promise before run can fail synchronously (for example,
  // an already-aborted signal). Its finally must clear this published promise.
  record.pending = Promise.resolve().then(run);
  return record.pending;
 };
}
module.exports = { LIMITS, createPageAssembly, createMeetingReader };
