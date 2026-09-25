import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import salesInfographics from '../content/guru/infographics-sales.json' with { type: 'json' };
import otherInfographics from '../content/guru/infographics-other.json' with { type: 'json' };
import { loadGuruInfographic } from './guru-infographic.js';

const webp = Buffer.from('RIFF\x0c\x00\x00\x00WEBPVP8 ', 'binary');

test('each reviewed summary has exactly one deployable infographic WebP', async () => {
  const root = new URL('../content/guru/infographics/', import.meta.url);
  const actual = (await readdir(root)).filter(name => name.endsWith('.webp')).sort();
  const expected = [...salesInfographics, ...otherInfographics].map(item => `${item.id}.webp`).sort();
  assert.deepEqual(actual, expected);
  for (const name of actual) {
    const bytes = await readFile(new URL(name, root));
    assert.ok(bytes.length > 12 && bytes.length <= 8 * 1024 * 1024, `${name}: image size`);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${name}: container`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${name}: format`);
  }
});

test('only a registered card ID can read its own infographic', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guru-infographic-'));
  try {
    await writeFile(join(root, 'sales-gap.webp'), webp);
    const result = await loadGuruInfographic('sales-gap', { root });
    assert.equal(result.status, 'ok');
    assert.equal(result.id, 'sales-gap');
    assert.deepEqual(result.bytes, webp);
    assert.deepEqual(await loadGuruInfographic('../package.json', { root }), { status: 'error', reason: 'unknown-card' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing, oversized and non-WebP infographic files give explicit error states', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guru-infographic-'));
  try {
    assert.deepEqual(await loadGuruInfographic('sales-gap', { root }), { status: 'error', reason: 'infographic-unavailable' });
    await writeFile(join(root, 'sales-gap.webp'), Buffer.from('<script>alert(1)</script>'));
    assert.deepEqual(await loadGuruInfographic('sales-gap', { root }), { status: 'error', reason: 'infographic-unavailable' });
    await writeFile(join(root, 'sales-gap.webp'), Buffer.concat([webp, Buffer.alloc(8 * 1024 * 1024)]));
    assert.deepEqual(await loadGuruInfographic('sales-gap', { root }), { status: 'error', reason: 'infographic-unavailable' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
