import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GURU_CARDS, LEGEND_CARDS } from '@com-moon/guru-guidance';

const CARD_IDS = new Set([...GURU_CARDS, ...LEGEND_CARDS].map(card => card.id));
const MAX_BYTES = 8 * 1024 * 1024;

function infographicRoot() {
  const cwd = process.cwd();
  const candidates = [join(cwd, 'content/guru/infographics'), join(cwd, 'apps/hub/content/guru/infographics')];
  return candidates.find(candidate => existsSync(candidate)) || candidates[0];
}

function isWebp(bytes) {
  return bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export async function loadGuruInfographic(id, { root = infographicRoot() } = {}) {
  if (!CARD_IDS.has(id)) return { status: 'error', reason: 'unknown-card' };
  try {
    const bytes = await readFile(join(root, `${id}.webp`));
    if (bytes.length > MAX_BYTES || !isWebp(bytes)) {
      return { status: 'error', reason: 'infographic-unavailable' };
    }
    return { status: 'ok', id, bytes };
  } catch {
    return { status: 'error', reason: 'infographic-unavailable' };
  }
}
