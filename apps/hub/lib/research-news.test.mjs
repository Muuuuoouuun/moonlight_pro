import assert from 'node:assert/strict';
import { test } from 'node:test';

let module;
try { module = await import('./research-news.js'); } catch { /* red step */ }

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('fixed brand topics cover the operator priority areas without accepting arbitrary paid queries', () => {
  assert.ok(module);
  const plans = module.NEWS_SEARCH_TOPICS;
  assert.deepEqual(Object.keys(plans).sort(), ['22nomad', 'classmoon', 'politicofficer']);
  assert.ok(plans.politicofficer.some((topic) => topic.id === 'korea'));
  assert.ok(plans.politicofficer.some((topic) => topic.id === 'world'));
  assert.ok(plans.classmoon.some((topic) => topic.id === 'education-office'));
  assert.ok(plans.classmoon.some((topic) => topic.id === 'ebs'));
  assert.ok(plans['22nomad'].some((topic) => topic.id === 'ai-labs'));
  assert.ok(plans['22nomad'].some((topic) => topic.id === 'silicon-valley'));
  assert.equal(module.newsSearchPlan('classmoon', 'made-up', 'pd'), null);
  assert.equal(module.newsSearchPlan('made-up', 'ebs', 'pd'), null);
  assert.equal(module.newsSearchPlan('classmoon', 'ebs', 'py'), null);
});

test('one query, bounded results, no API key in the returned payload', async () => {
  assert.ok(module);
  let calls = 0;
  let requested;
  const fetchImpl = async (url, init) => {
    calls++;
    requested = { url: new URL(url), init };
    return response({ type: 'news', results: [
      { title: '  새 발표  ', url: 'https://example.com/story?utm_source=brave&id=7#section', description: '가'.repeat(600), page_age: '2026-09-24T04:00:00Z', profile: { name: 'Example' } },
      { title: '중복', url: 'https://example.com/story?id=7&utm_medium=referral' },
      { title: '다른 소식', url: 'https://other.example/story', description: '짧은 설명' },
      { title: '위험', url: 'javascript:alert(1)' },
    ] });
  };
  const result = await module.searchBraveNews({ brand: '22nomad', topic: 'ai-labs', freshness: 'pd', apiKey: 'private-key', fetchImpl });
  assert.equal(calls, 1);
  assert.equal(requested.url.origin, 'https://api.search.brave.com');
  assert.equal(requested.url.pathname, '/res/v1/news/search');
  assert.equal(requested.url.searchParams.get('count'), '10');
  assert.equal(requested.url.searchParams.get('freshness'), 'pd');
  assert.equal(requested.url.searchParams.get('search_lang'), 'en');
  assert.equal(requested.init.headers['X-Subscription-Token'], 'private-key');
  assert.equal(requested.init.cache, 'no-store');
  assert.equal(result.status, 'ok');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].url, 'https://example.com/story?id=7');
  assert.equal(result.results[0].source, 'Example');
  assert.ok(result.results[0].snippet.length <= 240);
  assert.equal(JSON.stringify(result).includes('private-key'), false);
  assert.equal(JSON.stringify(result).includes('가'.repeat(300)), false);
});

test('configuration, upstream throttling, and network failures stay distinct from zero results', async () => {
  assert.ok(module);
  const base = { brand: 'classmoon', topic: 'ebs', freshness: 'pw' };
  const missing = await module.searchBraveNews({ ...base, apiKey: '', fetchImpl: async () => { throw Error('must not call'); } });
  assert.equal(missing.status, 'preview');
  assert.equal(missing.reason, 'missing-api-key');
  assert.equal(missing.calls, 0);
  const throttled = await module.searchBraveNews({ ...base, apiKey: 'secret', fetchImpl: async () => response({}, 429) });
  assert.equal(throttled.status, 'error');
  assert.equal(throttled.reason, 'brave-rate-limited');
  assert.equal(throttled.calls, 1);
  const failed = await module.searchBraveNews({ ...base, apiKey: 'secret', fetchImpl: async () => { throw Error('secret leaked from request'); } });
  assert.equal(failed.status, 'error');
  assert.equal(failed.reason, 'brave-request-failed');
  assert.equal(JSON.stringify(failed).includes('secret'), false);
  const empty = await module.searchBraveNews({ ...base, apiKey: 'secret', fetchImpl: async () => response({ results: [] }) });
  assert.equal(empty.status, 'ok');
  assert.deepEqual(empty.results, []);
});
