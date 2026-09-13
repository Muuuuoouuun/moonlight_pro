export const MEMO_SEARCH_DEFAULTS = Object.freeze({ q: '', dateFrom: '', dateTo: '', kind: '', contextType: '', contextId: '', used: 'all' });
export const MEMO_CHANGED_EVENT = 'moonlight:memos-saved';
const path = '/dashboard/work/memos';
export function filtersFromParams(params) {
  return Object.fromEntries(Object.entries(MEMO_SEARCH_DEFAULTS).map(([key, fallback]) => [key, params.get(key) || fallback]));
}
export function memoSearchParams(filters) {
  const params = new URLSearchParams();
  for (const [key, fallback] of Object.entries(MEMO_SEARCH_DEFAULTS)) {
    if (filters[key] && filters[key] !== fallback) params.set(key, filters[key]);
  }
  return params;
}
export function memoListHref(params) {
  const query = memoSearchParams(filtersFromParams(params)).toString();
  return path + (query ? `?${query}` : '');
}
export function memoDocumentHref(params, document) {
  const query = memoSearchParams(filtersFromParams(params));
  for (const key of ['note', 'new', 'draft', 'from']) if (document[key]) query.set(key, document[key]);
  return path + (query.size ? `?${query}` : '');
}
export function memoPeriod(days, now = new Date()) {
  const koreanDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = new Date(`${koreanDay}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: koreanDay };
}
export function memoMatchSegments(value, query) {
  const text = String(value || ''), needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const lower = text.toLowerCase(), parts = []; let offset = 0, index;
  while ((index = lower.indexOf(needle, offset)) !== -1) {
    if (index > offset) parts.push({ text: text.slice(offset, index), match: false });
    parts.push({ text: text.slice(index, index + needle.length), match: true });
    offset = index + needle.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false });
  return parts;
}
