import { createHash } from 'node:crypto';
import { isCanonicalUuid } from './uuid.js';

const REVIEW_ACTIONS = new Set(['defer', 'discard', 'restore', 'promote-idea', 'promote-draft']);
const ACCESS_LEVELS = new Set(['full-text', 'official-document', 'attachment', 'excerpt']);

function boundedText(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) return null;
  const result = value.trim();
  return required && !result ? null : result;
}

function publicUrl(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 2000) return null;
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      /^(?:127|10|192\.168|169\.254)\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || host === '[::1]') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch { return null; }
}

function normalizeBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !isCanonicalUuid(input.brandId)) return null;
  const title = boundedText(input.title, 180, true);
  const change = boundedText(input.change, 1000, true);
  const whyBrand = boundedText(input.whyBrand, 1000, true);
  const interpretation = boundedText(input.interpretation || '', 3000);
  const counterevidence = boundedText(input.counterevidence || '', 3000);
  const unknown = boundedText(input.unknown || '', 3000);
  const draft = boundedText(input.draft, 12000, true);
  if (!title || !change || !whyBrand || interpretation === null || counterevidence === null || unknown === null || !draft ||
    !Array.isArray(input.facts) || input.facts.length < 1 || input.facts.length > 12 ||
    !Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 8) return null;
  const facts = input.facts.map(fact => boundedText(fact, 1000, true));
  if (facts.some(fact => !fact)) return null;
  const sources = input.sources.map(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const url = publicUrl(source.url);
    const sourceTitle = boundedText(source.title, 240, true);
    const accessLevel = source.accessLevel;
    const locator = boundedText(source.locator || '', 500);
    if (!url || !sourceTitle || !ACCESS_LEVELS.has(accessLevel) || locator === null) return null;
    return { url, title: sourceTitle, accessLevel, locator };
  });
  if (sources.some(source => !source)) return null;
  const eventKey = createHash('sha256').update(JSON.stringify([input.brandId, title.toLowerCase(), sources[0].url])).digest('hex').slice(0, 40);
  return { brandId: input.brandId, eventKey, title, change, whyBrand, facts, interpretation,
    counterevidence, unknown, draft, sources, origin: 'operator-manual', verificationLevel: 'operator-submitted' };
}

export function normalizeResearchCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !isCanonicalUuid(input.requestId)) return null;
  if (input.action === 'create') {
    const brief = normalizeBrief(input.brief);
    return brief ? { action: 'create', requestId: input.requestId, brief } : null;
  }
  if (!REVIEW_ACTIONS.has(input.action) || !isCanonicalUuid(input.briefId) ||
    !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
    !Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 1) return null;
  return { action: input.action, requestId: input.requestId, briefId: input.briefId,
    expectedRevision: input.expectedRevision, expectedStateVersion: input.expectedStateVersion };
}
