import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./export-office-pet-catalog.mjs', import.meta.url));
const committed = new URL('../prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Models/OfficeRoleCatalog.generated.swift', import.meta.url);
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('Swift export is deterministic and --check rejects missing or stale output without changing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'office-pet-catalog-'));
  const output = join(directory, 'OfficeRoleCatalog.generated.swift');
  try {
    const missing = run('--check', '--output', output);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /stale|missing/i);
    const first = run('--output', output);
    assert.equal(first.status, 0, first.stderr);
    const content = await readFile(output, 'utf8');
    assert.match(content, /import Foundation/);
    assert.doesNotMatch(content, /OfficeAgent/);
    assert.equal(run('--output', output).status, 0);
    assert.equal(await readFile(output, 'utf8'), content);
    assert.equal(run('--check', '--output', output).status, 0);
    assert.equal(await readFile(committed, 'utf8'), content);
    assert.equal(run('--check').status, 0);
    const stale = content.replace('매출총괄', '오래된 직무');
    assert.notEqual(stale, content);
    await writeFile(output, stale);
    const check = run('--check', '--output', output);
    assert.equal(check.status, 1);
    assert.match(check.stderr, /stale/i);
    assert.equal(await readFile(output, 'utf8'), stale);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Swift literals escape quotes, interpolation, controls and line separators without losing Unicode', async () => {
  const { swiftStringLiteral } = await import('./export-office-pet-catalog.mjs').catch(error => {
    assert.fail(`Swift string escaping must be available without running the exporter: ${error.code}`);
  });
  assert.equal(swiftStringLiteral('이브이 🦊 "quote" \\(expression)\n\r\t\0\u0008\u001f\u007f\u2028\u2029'),
    '"이브이 🦊 \\"quote\\" \\\\(expression)\\n\\r\\t\\u{0}\\u{8}\\u{1f}\\u{7f}\\u{2028}\\u{2029}"');
  assert.throws(() => swiftStringLiteral('\ud800'), /Unicode|surrogate/i);
});
