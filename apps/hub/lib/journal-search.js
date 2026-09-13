import { JOURNAL_CONTEXT_TYPES, JOURNAL_NOTE_KINDS } from './journal.js';
import { isCanonicalUuid } from './uuid.js';

export const JOURNAL_SEARCH_DEFAULTS = Object.freeze({ q: '', dateFrom: '', dateTo: '', kind: '', contextType: '', contextId: '', used: 'all' });
const invalid = () => ({ ok: false, error: 'invalid-input', message: '검색어와 기간, 연결 조건을 확인해 주세요.' });
function dateBoundary(value, nextDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return null;
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) return null;
  return new Date(day.getTime() + (nextDay ? 24 : 0) * 3600000 - 9 * 3600000).toISOString();
}

export function normalizeJournalSearch(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const filters = {};
  for (const [key, fallback] of Object.entries(JOURNAL_SEARCH_DEFAULTS)) {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string') return invalid();
    filters[key] = key === 'q' ? value.trim() : value;
  }
  const { q, dateFrom, dateTo, kind, contextType, contextId, used } = filters;
  if (q.length > 200 || (kind && !JOURNAL_NOTE_KINDS.includes(kind)) || !['all', 'used', 'unused'].includes(used)
    || Boolean(contextType) !== Boolean(contextId) || (contextType && (!JOURNAL_CONTEXT_TYPES.includes(contextType) || !isCanonicalUuid(contextId)))) return invalid();
  filters.contextId = contextId.toLowerCase();
  const dateFromAt = dateFrom ? dateBoundary(dateFrom) : null;
  const dateToAt = dateTo ? dateBoundary(dateTo, true) : null;
  if ((dateFrom && !dateFromAt) || (dateTo && !dateToAt) || (dateFrom && dateTo && dateFrom > dateTo)) return invalid();
  const rawLimit = input.limit ?? 40;
  if (![3, 40, '3', '40'].includes(rawLimit)) return invalid();
  const cursor = input.cursor ?? '';
  if (typeof cursor !== 'string' || cursor.length > 2048) return invalid();
  return { ok: true, value: { filters, dateFromAt, dateToAt, limit: Number(rawLimit), cursor } };
}
