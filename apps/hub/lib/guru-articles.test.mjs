import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';
import { loadGuruArticle } from './guru-articles.js';

test('all reviewed cards have private authored Markdown articles', async () => {
  const cards = [...GURU_CARDS, ...LEGEND_CARDS];
  assert.equal(cards.length, 26);
  const filenames = (await readdir(new URL('../content/guru/', import.meta.url))).filter(name => name.endsWith('.md')).sort();
  assert.deepEqual(filenames, cards.map(card => `${card.id}.md`).sort());
  for (const card of cards) {
    const result = await loadGuruArticle(card.id);
    assert.equal(result.status, 'ok', card.id);
    assert.match(result.markdown, /^# [^\n]+\n/);
    assert.ok(result.markdown.length >= 450, card.id);
    assert.ok((result.markdown.match(/^## /gm) || []).length >= 3, card.id);
    assert.doesNotMatch(result.markdown, /https?:\/\/|<\/?[a-z][^>]*>/i, card.id);
  }
});

test('article reads reject unknown IDs before touching a path and distinguish a missing file', async () => {
  assert.deepEqual(await loadGuruArticle('../package.json'), { status: 'error', reason: 'unknown-card' });
  const root = await mkdtemp(join(tmpdir(), 'guru-empty-'));
  try {
    assert.deepEqual(await loadGuruArticle('sales-gap', { root }), { status: 'error', reason: 'article-unavailable' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
