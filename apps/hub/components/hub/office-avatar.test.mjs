import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');

test('Office avatar is a monogram tile of the first name letter, no image', async () => {
  const src = await read('./office-avatar.jsx');
  assert.ok(!/next\/image|<Image|office\/avatars|\.jpg/.test(src), 'no portrait image');
  assert.ok(src.includes('aria-hidden="true"'));
  assert.ok(src.includes('Array.from(p.name)[0]'));
  for (const { name } of OFFICE_ROSTER) assert.ok(Array.from(name)[0], `${name} needs an initial`);
});

test('Office avatar tile uses neutral tokens in three sizes', async () => {
  const css = await read('./office-avatar.module.css');
  assert.ok(/border:1px solid var\(--line-soft\)/.test(css));
  assert.ok(css.includes('var(--r-sm)') && css.includes('var(--fg)') && css.includes('var(--surface-3)'));
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i.test(css), 'tokens only');
  for (const cls of ['avatar', 'small', 'large']) assert.ok(new RegExp(`\\.${cls}\\b[^}]*width:\\d+px`).test(css), `${cls} size`);
  const sizes = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
  assert.equal(sizes.length, 3);
  assert.ok(sizes.every(s => s >= 10.5), 'font floor');
});
