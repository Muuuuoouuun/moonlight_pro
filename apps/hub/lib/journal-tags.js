export const JOURNAL_TAG_LIMIT = 8;
export const JOURNAL_TAG_LENGTH = 32;

// Undefined keeps pre-tag commands byte-for-byte compatible for receipt replay.
// Null signals invalid input; never truncate a tag or silently drop excess tags.
export function normalizeJournalTags(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 64) return null;
  const tags = [], seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || item.length > 256) return null;
    const tag = item.normalize('NFC').trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if ([...tag].length > JOURNAL_TAG_LENGTH) return null;
    const key = tag.toLowerCase();
    if (!seen.has(key)) { seen.add(key); tags.push(tag); }
    if (tags.length > JOURNAL_TAG_LIMIT) return null;
  }
  return tags;
}
