import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';

const CARD_IDS = new Set([...GURU_CARDS, ...LEGEND_CARDS].map(card => card.id));
const ARTICLE_MAX_CHARS = 20_000;

function articleRoot() {
  const cwd = process.cwd();
  const candidates = [join(cwd, 'content/guru'), join(cwd, 'apps/hub/content/guru')];
  return candidates.find(candidate => existsSync(candidate)) || candidates[0];
}

export async function loadGuruArticle(id, { root = articleRoot() } = {}) {
  if (!CARD_IDS.has(id)) return { status: 'error', reason: 'unknown-card' };
  try {
    const markdown = await readFile(join(root, `${id}.md`), 'utf8');
    if (!markdown.startsWith('# ') || markdown.length > ARTICLE_MAX_CHARS) {
      return { status: 'error', reason: 'article-unavailable' };
    }
    return { status: 'ok', id, markdown };
  } catch {
    return { status: 'error', reason: 'article-unavailable' };
  }
}
