import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchGuruArticle } from './guidance-detail-client.js';

test('article client requests the card-specific internal reader', async () => {
  let requested;
  const article = await fetchGuruArticle('sales-gap', async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ status: 'ok', id: 'sales-gap', markdown: '# 고객의 현재 상태\n\n본문' }) };
  });
  assert.equal(requested.url, '/api/hub/guidance-articles/sales-gap');
  assert.equal(requested.options.cache, 'no-store');
  assert.match(article.markdown, /^# 고객/);
});

test('HTTP 200 read-error envelope is an explicit error', async () => {
  await assert.rejects(
    fetchGuruArticle('sales-gap', async () => ({ ok: true, json: async () => ({ status: 'error', reason: 'article-unavailable' }) })),
    /글을 읽지 못했습니다/,
  );
});

test('a different card response or malformed markdown cannot appear in the reader', async () => {
  await assert.rejects(
    fetchGuruArticle('sales-gap', async () => ({ ok: true, json: async () => ({ status: 'ok', id: 'sales-other', markdown: '# 글' }) })),
  );
  await assert.rejects(
    fetchGuruArticle('sales-gap', async () => ({ ok: true, json: async () => ({ status: 'ok', id: 'sales-gap', markdown: '본문만' }) })),
  );
});
