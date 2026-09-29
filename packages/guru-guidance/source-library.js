// Read-only access to the verbatim originals behind the Guru and Legend cards.
//
// The data module is large (the full original documents), so the Hub imports this file
// lazily, only when a reader opens: import('@com-moon/guru-guidance/source-library').
// Nothing here generates advice, calls a service or writes anything.
import { SOURCE_DOCUMENTS, SOURCE_ENTRIES } from './source-library.generated.js';

export { SOURCE_DOCUMENTS, SOURCE_ENTRIES };

export const GURU_SOURCE_COLLECTIONS = Object.freeze(['sales', 'marketing', 'content']);
export const LEGEND_SOURCE_COLLECTIONS = Object.freeze(['legend-values', 'legend-framework']);
export const SOURCE_COLLECTIONS = Object.freeze([...GURU_SOURCE_COLLECTIONS, ...LEGEND_SOURCE_COLLECTIONS]);

const ENTRY_BY_ID = new Map(SOURCE_ENTRIES.map(entry => [entry.id, entry]));
const DOCUMENT_BY_KEY = new Map(SOURCE_DOCUMENTS.flatMap(doc => [[doc.path, doc], [doc.collection, doc]]));

export function getSourceEntry(id) {
  return ENTRY_BY_ID.get(id) ?? null;
}

// Accepts a document path ('docs/sales-guru-knowledge-base.md') or a collection ('sales').
export function getSourceDocument(pathOrCollection) {
  return DOCUMENT_BY_KEY.get(pathOrCollection) ?? null;
}

export function listSourceEntries({ collection, personId, legendId, kind } = {}) {
  return SOURCE_ENTRIES.filter(entry => (!collection || entry.collection === collection)
    && (!personId || entry.personId === personId)
    && (!legendId || entry.legendId === legendId)
    && (!kind || entry.kind === kind));
}

// The Guru person entry (sales, marketing or content original). null when the person has no
// chapter of their own — e.g. Dick Dunkel, whose MEDDIC section lives inside Aaron Ross's.
export function getPersonSource(personId) {
  if (!personId) return null;
  return SOURCE_ENTRIES.find(entry => entry.kind === 'person' && entry.personId === personId) ?? null;
}

// 'legend-buffett' (a LEGEND_CARDS id) → 'buffett'. Plain legend ids pass through.
export function legendIdFromCardId(id) {
  if (typeof id !== 'string' || !id) return null;
  return id.startsWith('legend-') ? id.slice('legend-'.length) : id;
}

// The 2026-09-12 long card (core nine only) first, then the 2026-09-21 micro-card.
export function getLegendSources(legendId) {
  const id = legendIdFromCardId(legendId);
  if (!id) return [];
  return LEGEND_SOURCE_COLLECTIONS.flatMap(collection => SOURCE_ENTRIES.filter(entry => entry.kind === 'person'
    && entry.collection === collection && entry.legendId === id));
}

// One row per (collection, person) in document order, including people who have no card.
// A Legend with both a long card and a micro-card appears once per collection.
export function listSourcePeople({ collection } = {}) {
  return SOURCE_ENTRIES
    .filter(entry => entry.kind === 'person' && (!collection || entry.collection === collection))
    .map(entry => ({
      id: entry.personId ?? entry.legendId,
      kind: entry.personId ? 'guru' : 'legend',
      ...(entry.personId ? { personId: entry.personId } : { legendId: entry.legendId }),
      name: entry.name,
      collection: entry.collection,
      entryId: entry.id,
      charCount: entry.charCount,
    }));
}

// Heading comparison ignores emphasis markers, emoji, punctuation and case: "기법 4:
// **Qualification — MEDDIC 프레임워크**" matches "Qualification — MEDDIC 프레임워크".
export function normalizeHeadingText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

// A card section often reads "Person · sub-section" or "Method — detail"; the last part is
// the most specific name of the heading it points to.
function lastSegment(section) {
  const parts = String(section ?? '').split(/\s+[·—–-]\s+/).map(normalizeHeadingText).filter(part => part.length >= 2);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

const STRONG_METHODS = ['exact', 'contains', 'segment'];

function headingMatches(method, heading, target, segment) {
  const text = normalizeHeadingText(heading.text);
  if (!text) return false;
  if (method === 'exact') return text === target;
  if (method === 'contains') return target.length >= 2 && text.includes(target);
  if (method === 'segment') return Boolean(segment) && text.includes(segment);
  const tokens = (segment ?? target).split(' ').filter(token => token.length >= 2);
  return tokens.length >= 2 && tokens.every(token => text.includes(token));
}

// Best heading for a card's `source.section` across `entries`. Strong methods (exact,
// contains, the specific last segment) are tried before 'tokens', which only matches when
// every word of the section appears in one heading — that result is flagged approximate.
export function findSourceHeading(entries, section, { allowApproximate = true } = {}) {
  const target = normalizeHeadingText(section);
  if (!target || !Array.isArray(entries)) return null;
  const segment = lastSegment(section);
  const methods = allowApproximate ? [...STRONG_METHODS, 'tokens'] : STRONG_METHODS;
  for (const method of methods) {
    for (const entry of entries) {
      for (const heading of entry?.headings ?? []) {
        if (headingMatches(method, heading, target, segment)) {
          return { entry, heading, method, approximate: method === 'tokens' };
        }
      }
    }
  }
  return null;
}

function isLegendCard(card) {
  return card.kind === 'legend' || (typeof card.id === 'string' && card.id.startsWith('legend-'));
}

// Maps a GURU_CARDS / LEGEND_CARDS card to the original text behind it.
//   Guru:   the person's own entry, plus the heading that best matches card.source.section.
//           A person without a chapter (Dick Dunkel) resolves to the entry that holds the
//           section in the card's document; `hosted` is then true.
//   Legend: every entry of the legend, resolved by card id (never by source.path).
// Returns { kind, entry, entries, heading, method, approximate, hosted } or null.
export function resolveCardSource(card) {
  if (!card || typeof card !== 'object') return null;
  const section = card.source?.section;
  if (isLegendCard(card)) {
    const legendId = legendIdFromCardId(card.id);
    const entries = getLegendSources(legendId);
    if (!entries.length) return null;
    return { kind: 'legend', legendId, entry: entries[0], entries, heading: null, method: null, approximate: false, hosted: false };
  }
  const own = getPersonSource(card.personId);
  if (own) {
    const found = findSourceHeading([own], section);
    return {
      kind: 'guru', entry: own, entries: [own],
      heading: found?.heading ?? null, method: found?.method ?? null, approximate: found ? found.approximate : true, hosted: false,
    };
  }
  const document = getSourceDocument(card.source?.path);
  const pool = SOURCE_ENTRIES.filter(entry => GURU_SOURCE_COLLECTIONS.includes(entry.collection)
    && (!document || entry.collection === document.collection));
  const found = findSourceHeading(pool, section, { allowApproximate: false });
  if (!found) return null;
  return {
    kind: 'guru', entry: found.entry, entries: [found.entry],
    heading: found.heading, method: found.method, approximate: false, hosted: true,
  };
}
