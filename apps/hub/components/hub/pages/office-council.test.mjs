import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('./office-council.jsx', import.meta.url), 'utf8');

test('office-council page adheres to DESIGN.md rules', () => {
  // 1. Single <h2> heading per page
  const h2Matches = source.match(/<h2\b/g);
  assert.equal(h2Matches?.length, 1, 'Page must contain exactly one <h2> title');

  // 2. Export named OfficeCouncil component
  assert.match(source, /export function OfficeCouncil\b/);

  // 3. All 9 personas are represented
  const agents = [
    'eevee',
    'vaporeon',
    'jolteon',
    'flareon',
    'espeon',
    'umbreon',
    'leafeon',
    'glaceon',
    'sylveon',
  ];
  for (const a of agents) {
    assert.ok(source.includes(a), `Agent ${a} should be present in page`);
  }

  // 4. Perspective simulation indication
  assert.match(source, /관점 시뮬레이션/);

  // 5. No JS onMouseEnter / onMouseLeave
  assert.doesNotMatch(source, /onMouseEnter/);
  assert.doesNotMatch(source, /onMouseLeave/);

  // 6. No hardcoded hex color codes in inline styles (#xxx or #xxxxxx)
  // excluding comments
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  assert.doesNotMatch(stripped, /#[0-9a-fA-F]{3,8}\b/);
});
