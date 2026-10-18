'use strict';
// Windows reads the same durable Office records as the native companion.
const { fail } = require('./pet-hub-client');
const { CHARACTERS } = require('../shared/contract');
const owners = CHARACTERS.map(c => c.officeId);
const scopes = ['personal', 'classin'];
const modes = ['chat', 'draft', 'review', 'council', 'answer'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = v => typeof v === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(v);
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\0');
const invalid = () => { throw fail('invalid', 'invalid-response'); };
const input = valid => { if (!valid) throw fail('error', 'invalid-input'); };
const stamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return null;
  // Preserve Postgres microseconds when ordering equal-millisecond inbox rows.
  const whole = value.replace(/\.\d+/, '');
  return BigInt(Date.parse(whole)) * 1000000n + BigInt((value.match(/\.(\d+)/)?.[1] || '').padEnd(9, '0'));
};
const older = (a, b) => stamp(a.createdAt) < stamp(b.createdAt)
  || (stamp(a.createdAt) === stamp(b.createdAt) && a.requestId.toLowerCase() < (b.requestId || b.id).toLowerCase());
const same = (a, b) => ['requestId', 'intent', 'scope', 'ownerId', 'createdAt', 'mode'].every(k => a[k] === b[k])
  && Object.keys(a.originRef).every(k => a.originRef[k] === b.originRef[k]) && JSON.stringify(a.participants) === JSON.stringify(b.participants);

function summary(row, scope, metadataOnly = false) {
  const keys = ['requestId', 'intent', 'scope', 'originRef', 'ownerId', 'mode', 'participants', 'createdAt', 'status', 'state', 'expired'];
  if (!object(row) || (metadataOnly && (Object.keys(row).length !== keys.length || Object.keys(row).some(k => !keys.includes(k))))
    || !uuid(row.requestId) || row.scope !== scope || !scopes.includes(scope) || !owners.includes(row.ownerId)
    || !modes.includes(row.mode) || stamp(row.createdAt) === null || !['running', 'generated', 'unknown', 'error', 'expired'].includes(row.state)
    || row.status !== row.state || row.expired !== (row.state === 'expired') || !Array.isArray(row.participants)
    || new Set(row.participants).size !== row.participants.length || row.participants.some(p => !owners.includes(p))
    || (row.mode === 'council' ? row.participants.length < 2 || row.participants.length > 3 || !row.participants.includes(row.ownerId) : row.participants.length !== 0)
    || !object(row.originRef)) invalid();
  const origin = row.originRef;
  if (row.intent === 'weekly_report') {
    const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
    if (Object.keys(origin).length !== 3 || !day(origin.periodStart) || !day(origin.periodEnd)
      || Date.parse(origin.periodEnd) - Date.parse(origin.periodStart) !== 6 * 86400000 || !text(origin.timezone, 80)) invalid();
    try { new Intl.DateTimeFormat('en', { timeZone: origin.timezone }); } catch { invalid(); }
  } else if (row.intent === 'customer_reply') {
    if (Object.keys(origin).length !== 2 || !['lead', 'customer_account', 'deal'].includes(origin.entityType) || !uuid(origin.entityId)) invalid();
  } else invalid();
  return Object.fromEntries(keys.map(k => [k, row[k]]));
}

function meeting(row, scope) {
  if (!object(row) || !uuid(row.meetingId) || row.scope !== scope || !scopes.includes(scope) || !text(row.title, 200)
    || !owners.includes(row.ownerId) || !modes.slice(0, 4).includes(row.mode) || !Array.isArray(row.reviewers)
    || row.reviewers.length > 2 || new Set(row.reviewers).size !== row.reviewers.length || row.reviewers.some(p => !owners.includes(p) || p === row.ownerId)
    || (row.mode === 'council' ? row.reviewers.length === 0 : row.reviewers.length !== 0)
    || !Number.isSafeInteger(row.revision) || row.revision < 1 || !['open', 'closed'].includes(row.state)
    || stamp(row.createdAt) === null || stamp(row.updatedAt) === null) invalid();
  return { meetingId: row.meetingId, scope, title: row.title, ownerId: row.ownerId, reviewers: row.reviewers,
    mode: row.mode, revision: row.revision, state: row.state, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function meetingDetail(json, id, scope) {
  if (!object(json) || json.persisted !== true || !['ready', 'generated', 'running', 'unknown'].includes(json.status)
    || !Array.isArray(json.turns) || json.turns.length > 1000 || json.meeting?.meetingId !== id) invalid();
  const m = meeting(json.meeting, scope), seen = new Set();
  const turns = json.turns.map(row => {
    if (!object(row) || !uuid(row.id) || seen.has(row.id) || !Number.isSafeInteger(row.roundNumber) || row.roundNumber < 1
      || !['running', 'generated', 'unknown', 'error'].includes(row.state) || !object(row.request)
      || !text(row.request.message, 6000) || !owners.includes(row.request.ownerId) || !modes.slice(0, 4).includes(row.request.mode)) invalid();
    seen.add(row.id);
    const result = row.result;
    if (row.state === 'generated' && (!object(result) || result.scope !== scope || result.ownerId !== row.request.ownerId
      || result.mode !== row.request.mode || !text(result.answer, 20000) || !text(result.nextAction, 6000))) invalid();
    return { id: row.id, roundNumber: row.roundNumber, state: row.state, message: row.request.message,
      answer: row.state === 'generated' ? result.answer : null, nextAction: row.state === 'generated' ? result.nextAction : null };
  });
  return { status: json.status, meeting: m, turns };
}

function createOfficeApi(client) {
  async function request(path, init = {}, maxBytes = 262144) {
    const response = await client.request(path, init);
    if (response.preview) throw fail('preview', 'preview', response.httpStatus);
    if (!object(response.json) || Buffer.byteLength(JSON.stringify(response.json)) > maxBytes) invalid();
    return response.json;
  }
  return {
    async inbox({ scope, cursor } = {}) {
      input(scopes.includes(scope));
      const params = new URLSearchParams({ scope, limit: '20' });
      if (cursor != null) {
        input(object(cursor) && Object.keys(cursor).length === 2 && uuid(cursor.id) && stamp(cursor.createdAt) !== null);
        params.set('cursor', Buffer.from(JSON.stringify(cursor)).toString('base64url'));
      }
      const json = await request(`/api/hub/office/inbox?${params}`, {}, 65536);
      if (json.status !== 'ready' || json.source !== 'live' || !Array.isArray(json.items) || json.items.length > 20 || typeof json.hasMore !== 'boolean') invalid();
      const items = json.items.map(row => summary(row, scope, true)), next = json.nextCursor;
      if (new Set(items.map(r => r.requestId)).size !== items.length || items.some((r, i) => (i > 0 && !older(r, items[i - 1])) || (cursor && !older(r, cursor)))) invalid();
      if (json.hasMore ? !items.length || !object(next) || Object.keys(next).length !== 2 || next.id !== items.at(-1).requestId || next.createdAt !== items.at(-1).createdAt : next !== null) invalid();
      return { items, hasMore: json.hasMore, nextCursor: next };
    },
    async receipt({ item } = {}) {
      input(object(item) && scopes.includes(item.scope));
      const selected = summary(item, item.scope, true);
      const json = await request(`/api/hub/office/requests/${selected.requestId}`);
      const current = summary(json, item.scope);
      if (!same(current, selected) || json.persistence?.persisted !== true) invalid();
      let body = null;
      if (current.state === 'generated' && !current.expired) {
        const r = json.result;
        if (!object(r) || r.version !== '2026-09-21.v1' || r.status !== 'generated' || json.resultRevision !== 1 || r.resultRevision !== 1
          || r.requestId !== selected.requestId || r.scope !== selected.scope || r.ownerId !== selected.ownerId || r.mode !== selected.mode
          || JSON.stringify(r.participants) !== JSON.stringify(selected.participants) || !['text', 'markdown', 'code'].includes(r.artifact?.kind)
          || !text(r.artifact.body, 24000)) invalid();
        body = r.artifact.body;
      }
      return { item: current, body };
    },
    async meetings({ scope, cursor } = {}) {
      input(scopes.includes(scope));
      const params = new URLSearchParams({ scope, limit: '20' });
      if (cursor != null) {
        input(typeof cursor === 'string' && cursor.length <= 600 && /^[A-Za-z0-9_-]+$/.test(cursor));
        params.set('cursor', cursor);
      }
      const json = await request(`/api/hub/office/meetings?${params}`);
      if (json.status !== 'ready' || !Array.isArray(json.meetings) || json.meetings.length > 20) invalid();
      const meetings = json.meetings.map(row => meeting(row, scope));
      if (new Set(meetings.map(m => m.meetingId)).size !== meetings.length) invalid();
      const next = json.nextCursor ?? null;
      if (next !== null) {
        if (typeof next !== 'string' || next.length > 600 || !/^[A-Za-z0-9_-]+$/.test(next) || !meetings.length) invalid();
        let point;
        try { point = JSON.parse(Buffer.from(next, 'base64url')); } catch { invalid(); }
        if (!object(point) || Object.keys(point).length !== 2 || point.meetingId !== meetings.at(-1).meetingId || point.updatedAt !== meetings.at(-1).updatedAt) invalid();
      }
      return { meetings, nextCursor: next, hasMore: next !== null };
    },
    async detail({ id, scope } = {}) {
      input(uuid(id) && scopes.includes(scope));
      return meetingDetail(await request(`/api/hub/office/meetings/${id}`), id, scope);
    },
    async create({ id, scope, title, ownerId } = {}) {
      input(uuid(id) && scopes.includes(scope) && text(title, 200) && owners.includes(ownerId));
      const detail = meetingDetail(await request('/api/hub/office/meetings', { method: 'POST',
        body: { meetingId: id, scope, title, ownerId, reviewers: [], mode: 'chat' } }), id, scope);
      if (detail.meeting.ownerId !== ownerId || detail.meeting.title !== title.trim() || detail.meeting.mode !== 'chat') invalid();
      return detail;
    },
    async send({ id, scope, requestId, revision, message } = {}) {
      input(uuid(id) && uuid(requestId) && scopes.includes(scope) && Number.isSafeInteger(revision) && revision > 0 && text(message, 6000));
      const detail = meetingDetail(await request(`/api/hub/office/meetings/${id}/turns`, { method: 'POST',
        body: { requestId, expectedRevision: revision, message, includeProjects: false } }), id, scope);
      if (!detail.turns.some(t => t.id === requestId && t.message === message.trim())) invalid();
      return detail;
    },
  };
}
module.exports = { createOfficeApi, summary, meeting, meetingDetail };
