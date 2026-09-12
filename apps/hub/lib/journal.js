import { isCanonicalUuid } from './uuid.js';

export const JOURNAL_NOTE_KINDS = Object.freeze(['note', 'conversation', 'idea', 'learning', 'blocked', 'decision']);
export const JOURNAL_CONTEXT_TYPES = Object.freeze(['project', 'lead', 'account', 'brand']);
export const JOURNAL_CONTENT_CHANNELS = Object.freeze(['threads', 'x', 'blog', 'instagram', 'reels', 'youtube_shorts', 'email']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit, required = false) => typeof value === 'string' && value.length <= limit && (!required || Boolean(value.trim()));
const invalid = () => ({ ok: false, error: 'invalid-input', message: '메모 입력과 연결 대상을 확인해 주세요.' });

export function isJournalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || value.startsWith('0000-') || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function journalNoteHref(id) {
  return isCanonicalUuid(id) ? `/dashboard/work/memos?note=${id.toLowerCase()}` : null;
}

export function journalContextHref(type, id) {
  if (!JOURNAL_CONTEXT_TYPES.includes(type) || !isCanonicalUuid(id)) return null;
  const key = id.toLowerCase();
  if (type === 'project') return `/dashboard/work/projects?project=${key}`;
  if (type === 'brand') return `/dashboard/brands?b=${key}`;
  return `/dashboard/revenue/customers?customer=${type}%3A${key}`;
}

export function validateJournalInput(payload) {
  if (!object(payload) || !['save', 'create_task', 'create_content'].includes(payload.action)
    || !isCanonicalUuid(payload.requestId) || !isCanonicalUuid(payload.entryId)
    || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0
    || payload.expectedRevision >= Number.MAX_SAFE_INTEGER) return invalid();
  const common = { action: payload.action, requestId: payload.requestId.toLowerCase(), entryId: payload.entryId.toLowerCase(), expectedRevision: payload.expectedRevision };
  if (payload.action === 'save') {
    const { body, title, occurredAt, noteMeta, contexts } = payload;
    if (!text(body, 20000, true) || !text(title, 200) || !isJournalTimestamp(occurredAt)
      || !object(noteMeta) || !JOURNAL_NOTE_KINDS.includes(noteMeta.kind) || !text(noteMeta.enhancement, 4000)
      || !Array.isArray(contexts) || contexts.length > 20
      || contexts.some((context) => !object(context) || !JOURNAL_CONTEXT_TYPES.includes(context.type) || !isCanonicalUuid(context.id))) return invalid();
    const normalized = contexts.map(({ type, id }) => ({ type, id: id.toLowerCase() }));
    if (new Set(normalized.map(({ type, id }) => `${type}:${id}`)).size !== normalized.length) return invalid();
    return { ok: true, value: { ...common, body, title, occurredAt, noteMeta: { kind: noteMeta.kind, enhancement: noteMeta.enhancement }, contexts: normalized } };
  }
  const { selection, target } = payload;
  if (payload.expectedRevision < 1 || !object(selection) || !text(selection.prefix, 20000)
    || !text(selection.text, 3500, true) || !text(selection.suffix, 20000)
    || (selection.prefix + selection.text + selection.suffix).length > 20000
    || !object(target) || !text(target.title, 200, true)) return invalid();
  let normalizedTarget;
  if (payload.action === 'create_task') {
    if ((target.dueAt != null && !isJournalTimestamp(target.dueAt)) || (target.projectId != null && !isCanonicalUuid(target.projectId))) return invalid();
    normalizedTarget = { title: target.title, dueAt: target.dueAt ?? null, projectId: target.projectId?.toLowerCase() ?? null };
  } else {
    if ((target.brandId != null && !isCanonicalUuid(target.brandId)) || (target.channel !== undefined && !JOURNAL_CONTENT_CHANNELS.includes(target.channel))) return invalid();
    normalizedTarget = { title: target.title, brandId: target.brandId?.toLowerCase() ?? null, channel: target.channel ?? 'threads' };
  }
  return { ok: true, value: { ...common, selection: { prefix: selection.prefix, text: selection.text, suffix: selection.suffix }, target: normalizedTarget } };
}
