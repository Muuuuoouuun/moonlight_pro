import { NEWS_SEARCH_TOPICS, newsSearchPlan } from './research-news-topics.js';

export { NEWS_SEARCH_TOPICS, newsSearchPlan };

// Brave News is a discovery signal, not a verified source or a stored research brief.
// Keep results transient until the operator's Brave plan grants storage rights.
const BRAVE_NEWS_ENDPOINT = 'https://api.search.brave.com/res/v1/news/search';
const RESULT_LIMIT = 10;

function safeNewsUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch { return null; }
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizedResults(results) {
  const seen = new Set();
  const normalized = [];
  for (const result of Array.isArray(results) ? results : []) {
    const url = safeNewsUrl(result?.url);
    const title = cleanText(result?.title, 240);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const date = Date.parse(result.page_age || '');
    normalized.push({
      title,
      url,
      source: cleanText(result.profile?.name, 100) || new URL(url).hostname,
      snippet: cleanText(result.description, 240),
      publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
      breaking: result.breaking === true,
    });
    if (normalized.length >= RESULT_LIMIT) break;
  }
  return normalized;
}

export async function searchBraveNews({ brand, topic, freshness = 'pd', apiKey, fetchImpl = globalThis.fetch }) {
  const plan = newsSearchPlan(brand, topic, freshness);
  if (!plan) return { status: 'invalid-input', reason: 'invalid-news-topic', calls: 0 };
  if (!apiKey?.trim()) return { status: 'preview', reason: 'missing-api-key', calls: 0 };

  const url = new URL(BRAVE_NEWS_ENDPOINT);
  url.searchParams.set('q', plan.q);
  url.searchParams.set('country', plan.country);
  url.searchParams.set('search_lang', plan.searchLang);
  url.searchParams.set('freshness', plan.freshness);
  url.searchParams.set('count', String(RESULT_LIMIT));

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey.trim() },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { status: 'error', reason: 'brave-request-failed', calls: 1 };
  }
  if (response.status === 429) return { status: 'error', reason: 'brave-rate-limited', calls: 1 };
  if (response.status === 401 || response.status === 403) return { status: 'error', reason: 'brave-auth-failed', calls: 1 };
  if (!response.ok) return { status: 'error', reason: 'brave-upstream-failed', calls: 1 };

  try {
    const data = await response.json();
    if (!Array.isArray(data?.results)) return { status: 'error', reason: 'brave-invalid-response', calls: 1 };
    return {
      status: 'ok', source: 'brave-news', calls: 1, searchedAt: new Date().toISOString(),
      query: { brand, topic, label: plan.label, freshness, country: plan.country, searchLang: plan.searchLang },
      results: normalizedResults(data.results),
    };
  } catch {
    return { status: 'error', reason: 'brave-invalid-response', calls: 1 };
  }
}
